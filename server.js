const express = require("express");
const multer = require("multer");
const path = require("path");
const fsSync = require("fs");
const crypto = require("crypto");

const config = require("./config");
const db = require("./db-adapter");
const cloud = require("./cloudinary");
const archive = require("./archive");
const notif = require("./notify");
const devicePdf = require("./device-pdf");
const workNotePdf = require("./work-note-pdf");

const app = express();

app.set("trust proxy", true);

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const first = String(xff).split(",")[0].trim();
    if (first) return first;
  }
  return (req.socket && req.socket.remoteAddress) || "";
}

// ---------- cookie (ไม่ใช้ library — แปลง header เอง) ----------
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  String(raw).split(";").forEach(function (pair) {
    const i = pair.indexOf("=");
    if (i < 0) return;
    const k = pair.slice(0, i).trim();
    const v = pair.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function setVisitorCookie(res, token) {
  res.set("Set-Cookie", "visitor_token=" + encodeURIComponent(token) + "; Path=/; Max-Age=31536000; SameSite=Lax");
}

// ======================================================
// ระบบล็อกอินหน้า Admin (server-side, HttpOnly cookie)
// ======================================================

app.use(express.json());

const ADMIN_USER = config.ADMIN_USER || "admin";
const ADMIN_PASS = config.ADMIN_PASS;
const ADMIN_SECRET = config.ADMIN_SECRET;
const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000; // 8 ชม.

function signAdminToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", ADMIN_SECRET).update(body).digest("base64url");
  return body + "." + sig;
}

function verifyAdminToken(token) {
  if (!token) return null;
  try {
    const [bodyB64, sig] = String(token).split(".");
    if (!bodyB64 || !sig) return null;
    const expect = crypto.createHmac("sha256", ADMIN_SECRET).update(bodyB64).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(bodyB64, "base64url").toString("utf8"));
    if (!payload || payload.e !== "admin" || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function setAdminCookie(res, token) {
  res.set("Set-Cookie", "admin_token=" + encodeURIComponent(token) + "; HttpOnly; Path=/; Max-Age=28800; SameSite=Lax");
}

function clearAdminCookie(res) {
  res.set("Set-Cookie", "admin_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
}

function isAdminAuthed(req) {
  return !!verifyAdminToken(parseCookies(req).admin_token);
}

// กัน API ทั้งหมดในหมวด /api/admin/* (login ไม่มีในหมวดนี้)
app.use("/api/admin", (req, res, next) => {
  if (req.path.startsWith("/login")) return next();
  if (isAdminAuthed(req)) return next();
  return res.status(401).json({ ok: false, message: "กรุณาเข้าสู่ระบบก่อนใช้งาน" });
});

app.post("/api/auth/login", (req, res) => {
  const user = String(((req.body || {}).user || "")).trim();
  const pass = String(((req.body || {}).pass || ""));
  if (!user || !pass) {
    return res.status(400).json({ ok: false, message: "กรอกชื่อผู้ใช้และรหัสผ่าน" });
  }
  if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
    return res.status(401).json({ ok: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
  }
  const token = signAdminToken({ e: "admin", exp: Date.now() + ADMIN_SESSION_TTL });
  setAdminCookie(res, token);
  res.json({ ok: true, user: ADMIN_USER });
});

app.post("/api/auth/logout", (req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const authed = isAdminAuthed(req);
  res.json({ ok: true, authed: authed, user: authed ? "admin" : null });
});

// เปิดหน้า /admin.html ได้เฉพาะผู้ที่ Authed แล้ว (ไม่เช่นนั้นไปหน้า login)
// วางก่อน express.static เพื่อไม่ให้ static serve admin.html ข้าม gate
function serveAdminPage(req, res, next) {
  if (isAdminAuthed(req)) return next();
  return res.redirect("/admin-login.html");
}

app.get("/admin", serveAdminPage, (req, res) => res.redirect("/admin.html"));
app.get("/admin.html", serveAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.get("/admin-mobile.html", serveAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-mobile.html"));
});

app.use(express.json());
app.use(function (req, res, next) {
  if (req.path === "/admin" || req.path === "/admin.html" || req.path === "/admin-mobile.html") {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.redirect("/ticket.html"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 12 }
});

app.post("/api/tickets", upload.fields([{ name: "photos", maxCount: 12 }, { name: "audio", maxCount: 1 }]), async (req, res) => {
  try {
    const body = req.body || {};
    const device = String(body.device || "").trim();
    const symptom = String(body.symptom || "").trim();
    const location = String(body.location || "").trim();
    const name = String(body.reporter_name || "").trim();
    const phone = String(body.reporter_phone || "").trim();
    const reporterLineId = String(body.reporter_line_id || "").trim();
    const handlerName = String(body.handler_name || "").trim();
    const statusDateRaw = String(body.status_date || "").trim();
    const statusDate = /^\d{4}-\d{2}-\d{2}$/.test(statusDateRaw) ? statusDateRaw : null;
    const statusTime = String(body.status_time || "").trim();
    const statusValue = String(body.status || "new").trim();
    const status = ["new", "working", "done"].includes(statusValue) ? statusValue : "new";
    const sourceRaw = String(body.source || "external").trim();
    const source = sourceRaw === "internal" ? "internal" : "external";
    // ใบแจ้งภายในเข้าระบบทันที / ใบแจ้งจากภายนอกจะรอ IT กด "ตอบรับ" ก่อนถึงจะเข้าระบบบันทึกรายการ
    const acceptedAt = source === "internal" ? new Date().toISOString() : null;

    if (!symptom || !location) {
      return res.status(400).json({ ok: false, message: "ข้อมูลไม่ครบ" });
    }
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }

    // ใบแจ้งจากภายนอกต้องยืนยันตัวตนก่อน (ผ่านระบบจดจำผู้ใช้งานภายนอก)
    let visitor = null;
    if (source !== "internal") {
      visitor = await resolveVisitor(req);
      if (!visitor) {
        return res.status(403).json({ ok: false, message: "ยังไม่ได้ยืนยันตัวตน กรุณากรอกชื่อและตำแหน่งก่อนแจ้งซ่อม" });
      }
    }

    const ticketNo = await adapter.genTicketNo(device);

    const photos = (req.files && req.files.photos) || [];
    const zoneCount = parseInt(String(body.zone_count || "0"), 10) || 0;
    const fileCount = photos.length;
    const problemCount = Math.max(0, fileCount - zoneCount);
    const urls = [];
    for (let i = 0; i < fileCount; i++) {
      const isZone = i >= problemCount;
      const label = isZone ? `z${i - problemCount + 1}` : `${i + 1}`;
      const up = await cloud.uploadImage(photos[i].buffer, `${ticketNo}-${label}`, photos[i].mimetype);
      if (up && up.secure_url) urls.push(up.secure_url);
    }
    if (fileCount && !cloud.ok) {
      console.warn("[Cloudinary] ยังไม่ได้ตั้งค่า ใช้ Supabase Storage แทน (ถ้าอัปโหลดสำเร็จ)");
    }

    let audioUrl = "";
    const audioFile = (req.files && req.files.audio && req.files.audio[0]) || null;
    if (audioFile) {
      const up = await cloud.uploadAudio(audioFile.buffer, `${ticketNo}-audio`, audioFile.mimetype);
      if (up && up.secure_url) audioUrl = up.secure_url;
    }

    const ticketId = await adapter.createTicket({
      ticketNo,
      device,
      symptom,
      location,
      reporterName: (visitor && (visitor.name + (visitor.position ? (" · " + visitor.position) : ""))) || name,
      reporterPhone: phone,
      reporterLineId,
      status,
      handlerName,
      statusDate,
      statusTime,
      source,
      acceptedAt,
      audioUrl
    });
    await adapter.addPhotos(ticketId, urls);
    await adapter.recordDevice({ ip: clientIp(req), ticketNo });
    if (visitor && visitor.id) await adapter.bumpVisitorTicket(visitor.id);

    if (source === "internal") {
      try {
        const noteId = await adapter.createRepairNote({
          ticketNo,
          category: "ภายใน",
          content: symptom
        });
        console.log(`[repair-notes] สร้างบันทึกภายในอัตโนมัติ ${ticketNo} (id=${noteId})`);
      } catch (e) {
        console.warn("[repair-notes] สร้างบันทึกภายในอัตโนมัติไม่สำเร็จ:", e.message);
      }
    }

    res.json({ ok: true, ticketNo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.get("/api/notify/stream", (req, res) => {
  notif.handleStream(req, res, clientIp(req));
});

app.get("/api/config", (req, res) => {
  res.json({
    maxPhotos: 3
  });
});

app.get("/api/admin/tickets", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const tickets = await adapter.listTickets();
    res.json({ ok: true, tickets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ---------- กล่องข้อความจากผู้แจ้งภายนอก (รอ IT กด "ตอบรับ") ----------
app.get("/api/admin/inbox", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const inbox = await adapter.listInbox();
    res.json({ ok: true, count: inbox.length, inbox });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/inbox/:ticketNo/accept", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const ticketNo = String(req.params.ticketNo || "").trim();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const row = await adapter.acceptTicket(ticketNo);
    if (!row) {
      return res.status(404).json({ ok: false, message: "ไม่พบรายการรอตอบรับ (หรือตอบรับไปแล้ว)" });
    }
    try {
      let dev;
      if (adapter.mode === "supabase") {
        dev = await adapter.supabase
          .from("user_devices")
          .select("ip")
          .eq("last_ticket_no", ticketNo)
          .maybeSingle();
      } else {
        const result = await adapter.pool.query(
          `SELECT ip FROM user_devices WHERE last_ticket_no = $1`,
          [ticketNo]
        );
        dev = { data: result.rows[0] };
      }
      if (dev && dev.data && dev.data.ip) {
        notif.pushToIp(dev.data.ip, {
          type: "accepted",
          ticketNo,
          at: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn("[notify] ส่งแจ้งเตือน 'ตอบรับ' ไม่สำเร็จ:", e.message);
    }
    res.json({ ok: true, ticketNo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.get("/api/admin/users", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const users = await adapter.listDevices();
    res.json({ ok: true, users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/users", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const ip = String((req.body || {}).ip || "").trim();
    const name = String((req.body || {}).name || "").trim();
    if (!ip) return res.status(400).json({ ok: false, message: "กรอก IP Address" });
    if (!name) return res.status(400).json({ ok: false, message: "กรอกชื่อผู้ใช้ / เครื่อง" });
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const user = await adapter.createDevice({ ip, name });
    res.json({ ok: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.put("/api/admin/users/:ip", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const ip = String(req.params.ip || "").trim();
    const name = String((req.body || {}).name || "").trim();
    if (!ip) return res.status(400).json({ ok: false, message: "ไม่มีรหัส IP" });
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    await adapter.setDeviceName(ip, name);
    res.json({ ok: true, ip, name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.delete("/api/admin/users/:ip", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const ip = String(req.params.ip || "").trim();
    if (!ip) return res.status(400).json({ ok: false, message: "ไม่มีรหัส IP" });
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const data = await adapter.removeDevice(ip);
    if (!data || !data.length) {
      return res.status(404).json({ ok: false, message: "ไม่พบผู้ใช้นี้" });
    }
    res.json({ ok: true, ip });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});


// ---------- ระบบจดจำผู้ใช้งานภายนอก (ยืนยันตัวตนเบื้องต้น) ----------

// ตรวจว่า visitor นี้ผ่านแล้วหรือยัง (cookie token หรือ IP ก็ได้)
async function resolveVisitor(req) {
  const adapter = db.getAdapter();
  if (!adapter.ready) return null;
  const token = parseCookies(req).visitor_token || "";
  const ip = clientIp(req);
  return adapter.findVisitor({ ip, token });
}

// GET /api/visitors/me — เช็กตัวเองว่าผ่านแล้วหรือยัง
app.get("/api/visitors/me", async (req, res) => {
  try {
    const visitor = await resolveVisitor(req);
    if (!visitor) return res.json({ ok: true, registered: false });
    res.json({ ok: true, registered: true, visitor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// POST /api/visitors — ลงทะเบียนครั้งแรก (ชื่อ + ตำแหน่ง)
app.post("/api/visitors", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const position = String(body.position || "").trim();
    if (!name) return res.status(400).json({ ok: false, message: "กรุณากรอกชื่อ" });
    if (!position) return res.status(400).json({ ok: false, message: "กรุณากรอกตำแหน่ง" });
    const ip = clientIp(req);
    const token = crypto.randomBytes(24).toString("hex");
    const visitor = await adapter.createVisitor({ name, position, ip, token });
    setVisitorCookie(res, token);
    res.json({ ok: true, visitor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// GET /api/admin/visitors — รายการผู้ใช้ภายนอกทั้งหมด
app.get("/api/admin/visitors", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const visitors = await adapter.listVisitors();
    res.json({ ok: true, visitors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// GET /api/admin/visitors/:id/ips — ประวัติ IP ของผู้ใช้คนนี้
app.get("/api/admin/visitors/:id/ips", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const ips = await adapter.listVisitorIps(Number(req.params.id));
    res.json({ ok: true, ips });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// PATCH /api/admin/visitors/:id — แก้ชื่อ / ตำแหน่ง
app.patch("/api/admin/visitors/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const id = Number(req.params.id);
    const body = req.body || {};
    const patch = {};
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.position !== undefined) patch.position = String(body.position).trim();
    if (!Object.keys(patch).length) {
      return res.status(400).json({ ok: false, message: "ไม่มีข้อมูลที่แก้" });
    }
    const visitor = await adapter.updateVisitor(id, patch);
    if (!visitor) return res.status(404).json({ ok: false, message: "ไม่พบผู้ใช้นี้" });
    res.json({ ok: true, visitor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// DELETE /api/admin/visitors/:id — ลบผู้ใช้ (เช่น IP แยกคนออกไปแล้ว)
app.delete("/api/admin/visitors/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const id = Number(req.params.id);
    const data = await adapter.removeVisitor(id);
    if (!data || !data.length) {
      return res.status(404).json({ ok: false, message: "ไม่พบผู้ใช้นี้" });
    }
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});


// ---------- โน้ตอุปกรณ์ (Device Notebook) ----------
app.post("/api/admin/upload-device-photo", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: "ไม่มีไฟล์รูป" });
    const name = "dev-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
    const up = await cloud.uploadImage(req.file.buffer, name, req.file.mimetype);
    if (!up || !up.secure_url) return res.status(500).json({ ok: false, message: "อัปโหลดรูปไม่สำเร็จ" });
    res.json({ ok: true, url: up.secure_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.get("/api/admin/device-categories", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const cats = await adapter.listDeviceCategories();
    res.json({ ok: true, categories: cats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/device-categories", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const name = String((req.body || {}).name || "").trim();
    if (!name) return res.status(400).json({ ok: false, message: "กรอกชื่อหมวด" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const cat = await adapter.addDeviceCategory(name);
    res.json({ ok: true, category: cat });
  } catch (err) {
    console.error(err);
    const msg = (err.message || "").includes("duplicate") ? "หมวดนี้มีอยู่แล้ว" : "server error";
    res.status(500).json({ ok: false, message: msg });
  }
});

// ---------- คลังอุปกรณ์สำหรับ wizard แจ้งซ่อมภายใน ----------
app.get("/api/admin/device-options", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const options = await adapter.listDeviceOptions();
    res.json({ ok: true, options });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/device-options", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const category = String(body.category || "Hardware").trim();
    if (!name) return res.status(400).json({ ok: false, message: "กรอกชื่ออุปกรณ์" });
    if (!["Hardware", "Software", "Disk"].includes(category)) return res.status(400).json({ ok: false, message: "หมวดไม่ถูกต้อง" });
    const option = await adapter.addDeviceOption({ category, name, iconUrl: body.icon_url, sortOrder: Number(body.sort_order) });
    res.json({ ok: true, option });
  } catch (err) {
    console.error(err);
    const msg = (err.message || "").includes("duplicate") ? "อุปกรณ์นี้มีอยู่แล้วในหมวดนี้" : "server error";
    res.status(500).json({ ok: false, message: msg });
  }
});

app.put("/api/admin/device-options/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const body = req.body || {};
    if (body.name !== undefined && !String(body.name).trim()) return res.status(400).json({ ok: false, message: "กรอกชื่ออุปกรณ์" });
    if (body.category !== undefined && !["Hardware", "Software", "Disk"].includes(String(body.category))) return res.status(400).json({ ok: false, message: "หมวดไม่ถูกต้อง" });
    const option = await adapter.updateDeviceOption(id, {
      category: body.category !== undefined ? String(body.category) : undefined,
      name: body.name !== undefined ? String(body.name) : undefined,
      iconUrl: body.icon_url !== undefined ? String(body.icon_url) : undefined,
      sortOrder: body.sort_order !== undefined ? Number(body.sort_order) : undefined
    });
    if (!option) return res.status(404).json({ ok: false, message: "ไม่พบอุปกรณ์นี้" });
    res.json({ ok: true, option });
  } catch (err) {
    console.error(err);
    const msg = (err.message || "").includes("duplicate") ? "อุปกรณ์นี้มีอยู่แล้วในหมวดนี้" : "server error";
    res.status(500).json({ ok: false, message: msg });
  }
});

app.delete("/api/admin/device-options/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const data = await adapter.deleteDeviceOption(id);
    if (!data || !data.length) return res.status(404).json({ ok: false, message: "ไม่พบอุปกรณ์นี้" });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.get("/api/admin/device-entries", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const entries = await adapter.listDeviceEntries();
    res.json({ ok: true, entries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/device-entries", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const model = String((req.body || {}).model || "").trim();
    if (!model) return res.status(400).json({ ok: false, message: "กรอกรุ่นสินค้า" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const entryNo = await adapter.genDeviceNo();
    const id = await adapter.createDeviceEntry({
      entryNo,
      category: String((req.body || {}).category || "").trim(),
      model,
      specJson: String((req.body || {}).spec_json || ""),
      specSource: String((req.body || {}).spec_source || "manual").trim(),
      specUrl: String((req.body || {}).spec_url || ""),
      warrantyNo: String((req.body || {}).warranty_no || ""),
      claimCompany: String((req.body || {}).claim_company || ""),
      warrantyExpireDate: String((req.body || {}).warranty_expire_date || ""),
      status: String((req.body || {}).status || "claim").trim(),
      brokenDate: String((req.body || {}).broken_date || "").trim() || null,
      claimDate: String((req.body || {}).claim_date || "").trim() || null,
      assetCode: String((req.body || {}).asset_code || ""),
      branch: String((req.body || {}).branch || "").trim(),
      position: String((req.body || {}).position || "").trim(),
      notes: String((req.body || {}).notes || "")
    });
    res.json({ ok: true, id, entry_no: entryNo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.put("/api/admin/device-entries/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const body = req.body || {};
    const patch = {};
    ["category","model","spec_json","spec_source","spec_url","warranty_no","claim_company","status","asset_code","branch","position","notes"].forEach(function (k) {
      if (body[k] != null) patch[k] = String(body[k]).trim();
    });
    if (body.warranty_expire_date != null) patch.warranty_expire_date = String(body.warranty_expire_date).trim() || null;
    if (body.broken_date != null) patch.broken_date = String(body.broken_date).trim() || null;
    if (body.claim_date != null) patch.claim_date = String(body.claim_date).trim() || null;
    patch.updated_at = new Date().toISOString();
    if (!Object.keys(patch).length) return res.status(400).json({ ok: false, message: "ไม่มีข้อมูลให้แก้ไข" });
    await adapter.updateDeviceEntry(id, patch);
    res.json({ ok: true, id, ...patch });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.delete("/api/admin/device-entries/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const data = await adapter.deleteDeviceEntry(id);
    if (!data || !data.length) return res.status(404).json({ ok: false, message: "ไม่พบรายการนี้" });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/device-entries/:id/photos", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const urls = Array.isArray((req.body || {}).cloud_urls) ? req.body.cloud_urls : [];
    if (!urls.length) return res.status(400).json({ ok: false, message: "ไม่มีรูป" });
    await adapter.addEntryPhotos(id, urls);
    res.json({ ok: true, count: urls.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ---------- Maintenance อุปกรณ์ขององค์กร (ซิงก์กับระบบข้อมูลอุปกรณ์) ----------
app.get("/api/admin/maintenance", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const rows = await adapter.listDeviceMaintenance();
    res.json({ ok: true, count: rows.length, entries: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.get("/api/admin/maintenance/:entryId/logs", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.entryId);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const logs = await adapter.listMaintenanceChecks(id);
    res.json({ ok: true, count: logs.length, logs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.delete("/api/admin/maintenance/log/:logId", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const logId = Number(req.params.logId);
    if (!Number.isFinite(logId)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const data = await adapter.deleteMaintenanceCheck(logId);
    if (!data || !data.length) return res.status(404).json({ ok: false, message: "ไม่พบประวัติการตรวจสอบนี้" });
    res.json({ ok: true, id: logId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/maintenance/:entryId/check", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.entryId);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const body = req.body || {};
    const checkedDate = String(body.checked_date || "").trim();
    const status = String(body.status || "").trim();
    const notes = String(body.notes || "").trim();
    if (!checkedDate) return res.status(400).json({ ok: false, message: "กรุณาเลือกวันที่ตรวจสอบ" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedDate)) return res.status(400).json({ ok: false, message: "รูปแบบวันที่ไม่ถูกต้อง" });
    if (!status) return res.status(400).json({ ok: false, message: "กรุณาเลือกสถานะ" });
    const logId = await adapter.createMaintenanceCheck({ entryId: id, checkedDate, status, notes });
    res.json({ ok: true, log_id: logId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ---------- PDF โน้ตอุปกรณ์ (อย่างเป็นทางการ / Sarabun) ----------
app.get("/api/admin/device-entries/:id/pdf", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    if (!devicePdf.hasFonts()) return res.status(500).json({ ok: false, message: "หายังพบไฟล์ฟอนต์ Sarabun (โฟลเดอร์ fonts/)" });
    const entries = await adapter.listDeviceEntries();
    const row = entries.filter(function (e) { return String(e.id) === String(id); })[0];
    if (!row) return res.status(404).json({ ok: false, message: "ไม่พบโน้ตอุปกรณ์" });
    const { stream, filename } = devicePdf.buildDeviceEntryPdf(row);
    const buffer = await stream;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="' + filename + '"');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ---------- โน๊ตงาน (Work Notes) ----------
app.get("/api/admin/work-notes", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const notes = await adapter.listWorkNotes();
    res.json({ ok: true, notes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/work-notes", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const title = String((req.body || {}).title || "").trim();
    if (!title) return res.status(400).json({ ok: false, message: "กรอกหัวเรื่องโน้ตงานก่อน" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const steps = Array.isArray((req.body || {}).steps)
      ? (req.body.steps || []).map(function (s) { return String(s).trim(); }).filter(function (s) { return s; })
      : [];
    const id = await adapter.createWorkNote({
      title,
      stepsJson: JSON.stringify(steps),
      infoExtra: String((req.body || {}).info_extra || "").trim()
    });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.put("/api/admin/work-notes/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const body = req.body || {};
    const patch = {};
    if (body.title != null) {
      patch.title = String(body.title).trim();
      if (!patch.title) return res.status(400).json({ ok: false, message: "กรอกหัวเรื่องโน้ตงานก่อน" });
    }
    if (body.info_extra != null) patch.info_extra = String(body.info_extra).trim();
    if (body.steps != null) {
      const steps = Array.isArray(body.steps)
        ? (body.steps || []).map(function (s) { return String(s).trim(); }).filter(function (s) { return s; })
        : [];
      patch.steps_json = JSON.stringify(steps);
    }
    patch.updated_at = new Date().toISOString();
    if (!Object.keys(patch).length) return res.status(400).json({ ok: false, message: "ไม่มีข้อมูลให้แก้ไข" });
    await adapter.updateWorkNote(id, patch);
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.delete("/api/admin/work-notes/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const data = await adapter.deleteWorkNote(id);
    if (!data || !data.length) return res.status(404).json({ ok: false, message: "ไม่พบโน้ตงานนี้" });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ---------- โน๊ตแจ้งซ่อม (Repair Notes) ----------
app.get("/api/admin/repair-notes", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const notes = await adapter.listRepairNotes();
    res.json({ ok: true, notes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/repair-notes", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const ticketNo = String((req.body || {}).ticket_no || "").trim();
    const content = String((req.body || {}).content || "").trim();
    if (!ticketNo) return res.status(400).json({ ok: false, message: "กรอกเลขใบแจ้งซ่อมก่อน" });
    if (!content) return res.status(400).json({ ok: false, message: "กรอกเนื้อหาโน้ตก่อน" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const id = await adapter.createRepairNote({
      ticketNo,
      category: String((req.body || {}).category || "").trim(),
      content
    });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.put("/api/admin/repair-notes/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const body = req.body || {};
    const patch = {};
    if (body.ticket_no != null) patch.ticket_no = String(body.ticket_no).trim();
    if (body.category != null) patch.category = String(body.category).trim();
    if (body.content != null) {
      patch.content = String(body.content).trim();
      if (!patch.content) return res.status(400).json({ ok: false, message: "กรอกเนื้อหาโน้ตก่อน" });
    }
    patch.updated_at = new Date().toISOString();
    if (!Object.keys(patch).length) return res.status(400).json({ ok: false, message: "ไม่มีข้อมูลให้แก้ไข" });
    await adapter.updateRepairNote(id, patch);
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.delete("/api/admin/repair-notes/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const data = await adapter.deleteRepairNote(id);
    if (!data || !data.length) return res.status(404).json({ ok: false, message: "ไม่พบโน้ตแจ้งซ่อมนี้" });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ---------- API ทดสอบการเชื่อมต่อฐานข้อมูล ----------
app.get("/api/admin/db-test", async (req, res) => {
  const host = String(req.query.host || "").trim();
  const port = Number(req.query.port || "0") || 0;

  // Validate inputs
  if (!host) {
    return res.json({ ok: false, message: "ไม่เจอ IP" });
  }
  if (port === 0) {
    return res.json({ ok: false, message: "ไม่เจอ port ที่ตั้ง" });
  }

  // Test PostgreSQL connection (legacy GET for old UI)
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }

    const result = await adapter.testConnection();
    return res.json(result);
  } catch (err) {
    console.error("[db-test] Error:", err.message);
    return res.json({ ok: false, message: "เกิดข้อผิดพลาด: " + err.message });
  }
});

app.post("/api/admin/db-test", async (req, res) => {
  try {
    const { mode, host, port, database, user, password, ssl } = req.body || {};
    
    if (mode === "supabase") {
      const adapter = db.getAdapter();
      if (adapter.mode !== "supabase") {
        // Create temporary supabase adapter for testing
        const tempAdapter = db.createSupabaseAdapter();
        const result = await tempAdapter.testConnection();
        return res.json(result);
      }
      const result = await adapter.testConnection();
      return res.json(result);
    } else if (mode === "postgres") {
      if (!host || !database || !user) {
        return res.json({ ok: false, message: "กรุณาระบุ Host, Database, และ Username" });
      }
      
      // Create temporary postgres adapter for testing
      const { Pool } = require("pg");
      const testPool = new Pool({
        host,
        port: port || 5432,
        database,
        user,
        password: password || "",
        ssl: ssl ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 5000,
      });
      
      try {
        const result = await testPool.query(`SELECT 1 as test`);
        await testPool.end();
        if (result.rows[0]?.test === 1) {
          return res.json({ ok: true, message: `เชื่อมต่อ PostgreSQL สำเร็จ (${host}:${port || 5432}/${database})` });
        }
        return res.json({ ok: false, message: "ทดสอบการเชื่อมต่อไม่สำเร็จ" });
      } catch (e) {
        await testPool.end().catch(() => {});
        return res.json({ ok: false, message: "เชื่อมต่อ PostgreSQL ล้มเหลว: " + e.message });
      }
    } else {
      return res.json({ ok: false, message: "โหมดไม่ถูกต้อง" });
    }
  } catch (err) {
    console.error("[db-test] Error:", err.message);
    return res.json({ ok: false, message: "เกิดข้อผิดพลาด: " + err.message });
  }
});

// ---------- PDF โน๊ตงาน (A4 หน้าเดียว / Sarabun) ----------
app.get("/api/admin/work-notes/:id/pdf", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    if (!workNotePdf.hasFonts()) return res.status(500).json({ ok: false, message: "หายังพบไฟล์ฟอนต์ Sarabun (โฟลเดอร์ fonts/)" });
    const row = await adapter.getWorkNote(id);
    if (!row) return res.status(404).json({ ok: false, message: "ไม่พบโน้ตงาน" });
    const { buffer, filename } = await workNotePdf.buildWorkNotePdf(row);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="' + filename + '"');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ---------- DuckDuckGo (สเปคอุปกรณ์) ----------
async function duckduckgoInstant(q) {
  const url = "https://api.duckduckgo.com/?q=" + encodeURIComponent(q) + "&format=json&no_html=1&skip_disambig=1";
  const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; DeviceNotebook/1.0)" } });
  const json = await resp.json();
  const answer = json.Answer || json.Abstract || json.Definition || "";
  const abstract = json.AbstractText || "";
  const source = json.AbstractSource || "";
  const firstTopic = (json.RelatedTopics || []).find(function (t) { return t.Text; });
  const link = json.AbstractURL || (firstTopic ? firstTopic.FirstURL : "") || "";
  const topics = (json.RelatedTopics || []).filter(function (t) { return t.Text && t.Text.length > 20; }).slice(0, 3).map(function (t) {
    return { title: t.Text.split(" - ")[0] || "", snippet: t.Text, url: t.FirstURL || "" };
  });
  return { answer, abstract, source, link, results: topics };
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&#0*(\d+);/g, function (m, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

async function duckduckgoHtml(q) {
  const url = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q + " specifications");
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36" }
  });
  const html = await resp.text();
  const results = [];
  const reResult = /<div class="result[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/g;
  let m;
  let count = 0;
  while ((m = reResult.exec(html)) !== null && count < 6) {
    const block = m[0];
    const linkM = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    const snipM = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (linkM) {
      let href = linkM[1];
      const idx = href.indexOf("uddg=");
      if (idx !== -1) {
        href = decodeURIComponent(href.slice(idx + 5).split("&")[0]);
      }
      const title = decodeEntities(linkM[2].replace(/<[^>]+>/g, ""));
      const snippet = snipM ? decodeEntities(snipM[1].replace(/<[^>]+>/g, "")) : "";
      results.push({ title, snippet: snippet || title, url: href });
      count++;
    }
  }
  const combined = results.map(function (r) { return r.snippet; }).join(" ").slice(0, 800);
  const abstract = combined || (results[0] ? results[0].snippet : "");
  return { answer: "", abstract, source: "DuckDuckGo", link: results[0] ? results[0].url : "", results };
}

app.get("/api/admin/spec-search", async (req, res) => {
  try {
    const q = String((req.query || {}).q || "").trim();
    if (!q) return res.json({ ok: true, answer: "", abstract: "", url: "", results: [] });
    let out = await duckduckgoInstant(q);
    if (!out.answer && !out.abstract && !out.results.length) {
      out = await duckduckgoHtml(q);
    }
    res.json({ ok: true, ...out });
  } catch (err) {
    console.error(err);
    res.json({ ok: true, answer: "", abstract: "", url: "", results: [] });
  }
});


app.get("/status", (req, res) => res.redirect("/status.html"));

app.get("/api/tickets/:ticketNo/status", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const ticketNo = String(req.params.ticketNo || "").trim();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    
    if (adapter.mode === "supabase") {
      const { data, error } = await adapter.supabase
        .from("tickets")
        .select("ticket_no,device,symptom,location,reporter_name,reporter_phone,status,approved_at,created_at,pdf_url")
        .eq("ticket_no", ticketNo)
        .single();
      if (error && /approved_at/.test(error.message)) {
        const retry = await adapter.supabase
          .from("tickets")
          .select("ticket_no,device,symptom,location,reporter_name,reporter_phone,status,created_at,pdf_url")
          .eq("ticket_no", ticketNo)
          .single();
        if (retry.error || !retry.data) {
          return res.status(404).json({ ok: false, message: "ไม่พบงาน " + ticketNo });
        }
        return res.json({ ok: true, ticket: retry.data });
      }
      if (error || !data) {
        return res.status(404).json({ ok: false, message: "ไม่พบงาน " + ticketNo });
      }
      res.json({ ok: true, ticket: data });
    } else {
      const result = await adapter.pool.query(
        `SELECT ticket_no,device,symptom,location,reporter_name,reporter_phone,status,approved_at,created_at,pdf_url FROM tickets WHERE ticket_no = $1`,
        [ticketNo]
      );
      if (!result.rows[0]) {
        return res.status(404).json({ ok: false, message: "ไม่พบงาน " + ticketNo });
      }
      res.json({ ok: true, ticket: result.rows[0] });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.put("/api/tickets/:ticketNo", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const ticketNo = String(req.params.ticketNo || "").trim();
    const body = req.body || {};
    const patch = {};
    if (body.device !== undefined) patch.device = String(body.device).trim();
    if (body.symptom !== undefined) patch.symptom = String(body.symptom).trim();
    if (body.location !== undefined) patch.location = String(body.location).trim();
    if (body.reporter_name !== undefined) patch.reporter_name = String(body.reporter_name).trim();
    if (body.reporter_phone !== undefined) patch.reporter_phone = String(body.reporter_phone).trim();
    if (body.reporter_line_id !== undefined) patch.reporter_line_id = String(body.reporter_line_id).trim();
    if (body.status !== undefined) patch.status = String(body.status).trim();
    if (body.status_date !== undefined) patch.status_date = String(body.status_date).trim() || null;
    if (body.status_time !== undefined) patch.status_time = String(body.status_time).trim() || "";
    if (body.handler_name !== undefined) patch.handler_name = String(body.handler_name).trim();
    if (body.source !== undefined) patch.source = String(body.source).trim();
    if (body.pdf_url !== undefined) patch.pdf_url = String(body.pdf_url).trim();
    if (body.created_at !== undefined) patch.created_at = String(body.created_at).trim() || null;
    if (!Object.keys(patch).length) {
      return res.status(400).json({ ok: false, message: "ไม่มีข้อมูลที่ต้องการแก้ไข" });
    }
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    
    if (adapter.mode === "supabase") {
      const { data, error } = await adapter.supabase
        .from("tickets")
        .update(patch)
        .eq("ticket_no", ticketNo)
        .select()
        .single();
      if (error || !data) {
        return res.status(404).json({ ok: false, message: "ไม่พบงาน " + ticketNo });
      }
      res.json({ ok: true, ticket: data });
    } else {
      const keys = Object.keys(patch);
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      const values = keys.map(k => patch[k]);
      values.push(ticketNo);
      const result = await adapter.pool.query(
        `UPDATE tickets SET ${setClause} WHERE ticket_no = $${keys.length + 1} RETURNING *`,
        values
      );
      if (!result.rows[0]) {
        return res.status(404).json({ ok: false, message: "ไม่พบงาน " + ticketNo });
      }
      res.json({ ok: true, ticket: result.rows[0] });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.delete("/api/tickets/:ticketNo", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const ticketNo = String(req.params.ticketNo || "").trim();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    
    if (adapter.mode === "supabase") {
      const { data, error } = await adapter.supabase
        .from("tickets")
        .delete()
        .eq("ticket_no", ticketNo)
        .select("id");
      if (error || !data || !data.length) {
        return res.status(404).json({ ok: false, message: "ไม่พบงาน " + ticketNo });
      }
    } else {
      const result = await adapter.pool.query(
        `DELETE FROM tickets WHERE ticket_no = $1 RETURNING id`,
        [ticketNo]
      );
      if (!result.rows || !result.rows.length) {
        return res.status(404).json({ ok: false, message: "ไม่พบงาน " + ticketNo });
      }
    }
res.json({ ok: true, ticketNo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/tickets/:ticketNo/status", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const ticketNo = String(req.params.ticketNo || "").trim();
    const status = String((req.body || {}).status || "").trim();
    if (!["new", "working", "done"].includes(status)) {
      return res.status(400).json({ ok: false, message: "สถานะไม่ถูกต้อง" });
    }
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const patch = { status };
    const approvedAt = new Date().toISOString();
    if (status === "working") patch.approved_at = approvedAt;
    
    let data;
    if (adapter.mode === "supabase") {
      let { data: result, error } = await adapter.supabase
        .from("tickets")
        .update(patch)
        .eq("ticket_no", ticketNo)
        .select("*, ticket_photos(id, cloud_url)")
        .single();
      if (error && status === "working" && /approved_at/.test(error.message)) {
        patch.approved_at = undefined;
        const retry = await adapter.supabase
          .from("tickets")
          .update({ status })
          .eq("ticket_no", ticketNo)
          .select("*, ticket_photos(id, cloud_url)")
          .single();
        result = retry.data;
        error = retry.error;
      }
      if (error || !result) {
        return res.status(404).json({ ok: false, message: "ไม่พบงาน " + ticketNo });
      }
      data = result;
    } else {
      const keys = Object.keys(patch);
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      const values = keys.map(k => patch[k]);
      values.push(ticketNo);
      const result = await adapter.pool.query(
        `UPDATE tickets SET ${setClause} WHERE ticket_no = $${keys.length + 1} RETURNING *`,
        values
      );
      if (!result.rows[0]) {
        return res.status(404).json({ ok: false, message: "ไม่พบงาน " + ticketNo });
      }
      data = result.rows[0];
    }
    
    if (status === "working") {
      try {
        let dev;
        if (adapter.mode === "supabase") {
          dev = await adapter.supabase
            .from("user_devices")
            .select("ip")
            .eq("last_ticket_no", data.ticket_no)
            .maybeSingle();
        } else {
          const result = await adapter.pool.query(
            `SELECT ip FROM user_devices WHERE last_ticket_no = $1`,
            [data.ticket_no]
          );
          dev = { data: result.rows[0] };
        }
        if (dev && dev.data && dev.data.ip) {
          notif.pushToIp(dev.data.ip, {
            type: "approved",
            ticketNo: data.ticket_no,
            at: data.approved_at || approvedAt
          });
        }
      } catch (e) {
        console.warn("[notify] ส่งแจ้งเตือนไม่สำเร็จ:", e.message);
      }
    }

    if (status === "done") {
      try {
        const { buffer } = await archive.buildArchiveBuffer(data);
        await adapter.updateArchive(ticketNo, buffer.toString("base64"), buffer.length);
        console.log(`[Archive] งาน ${ticketNo} จัดเก็บแล้ว (บีบอัด ${buffer.length} bytes)`);
      } catch (err) {
        console.warn("[Archive] ข้ามจัดเก็บ (ยังไม่ได้รัน SQL เพิ่มคอลัมน์ archive): " + err.message);
      }
    }

    res.json({ ok: true, ticketNo, status: data.status, pdfUrl: data.pdf_url || "" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.get("/api/tickets/:ticketNo/archive", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const ticketNo = String(req.params.ticketNo || "").trim();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    let data;
    if (adapter.mode === "supabase") {
      const { data: result, error } = await adapter.supabase
        .from("tickets")
        .select("ticket_no, archive_base64, archive_size")
        .eq("ticket_no", ticketNo)
        .single();
      if (error || !result || !result.archive_base64) {
        return res.status(404).json({ ok: false, message: "ยังไม่มีข้อมูลบีบอัดสำหรับงานนี้" });
      }
      data = result;
    } else {
      const result = await adapter.pool.query(
        `SELECT ticket_no, archive_base64, archive_size FROM tickets WHERE ticket_no = $1`,
        [ticketNo]
      );
      if (!result.rows[0] || !result.rows[0].archive_base64) {
        return res.status(404).json({ ok: false, message: "ยังไม่มีข้อมูลบีบอัดสำหรับงานนี้" });
      }
      data = result.rows[0];
    }
res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="${ticketNo}-archive.gz"`);
    res.send(Buffer.from(data.archive_base64, "base64"));
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ---------- Database Switch API ----------
app.get("/api/admin/db-status", async (req, res) => {
  try {
    const mode = db.getCurrentMode();
    const adapter = db.getAdapter();
    res.json({ ok: true, mode, ready: adapter.ready });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/db-switch", async (req, res) => {
  try {
    const { mode, host, port, database, user, password, ssl } = req.body || {};
    if (!mode || !["supabase", "postgres"].includes(mode)) {
      return res.status(400).json({ ok: false, message: "โหมดไม่ถูกต้อง" });
    }
    const result = await db.switchDatabase(mode, { host, port, database, user, password, ssl });
    if (result.ok) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ---------- Data Migration ----------
const migrate = require("./db-migrate");

app.post("/api/admin/migrate/start", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (adapter.mode !== "supabase") {
      return res.status(400).json({ ok: false, message: "ต้องอยู่ในโหมด Supabase ก่อนถึงจะโอนย้ายได้" });
    }
    if (!adapter.ready) {
      return res.status(400).json({ ok: false, message: "Supabase ยังไม่พร้อม" });
    }
    
    const { host, port, database, user, password, ssl, continueOnError } = req.body || {};
    if (!host || !database || !user) {
      return res.status(400).json({ ok: false, message: "กรุณาระบุ PostgreSQL connection details" });
    }
    
    const pgOptions = { host, port, database, user, password, ssl };
    const jobId = migrate.createMigrationJob(pgOptions);
    const job = migrate.getJobStatus(jobId);
    if (job) job.continueOnError = continueOnError !== false;
    
    res.json({ ok: true, jobId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.get("/api/admin/migrate/status/:jobId", async (req, res) => {
  try {
    const job = migrate.getJobStatus(req.params.jobId);
    if (!job) {
      return res.status(404).json({ ok: false, message: "ไม่พบ job นี้" });
    }
    res.json({ ok: true, job: {
      id: job.id,
      status: job.status,
      currentTable: job.currentTable,
      progress: job.progress,
      tableResults: job.tableResults,
      verification: job.verification,
      totalRows: job.totalRows,
      duration: job.duration,
      error: job.error,
      logs: job.logs.slice(-100), // last 100 logs
    }});
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/migrate/cancel/:jobId", async (req, res) => {
  try {
    migrate.cancelJob(req.params.jobId);
    res.json({ ok: true, message: "ส่งสัญญาณยกเลิกแล้ว" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/migrate/verify", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (adapter.mode !== "postgres") {
      return res.status(400).json({ ok: false, message: "ต้องอยู่ในโหมด PostgreSQL" });
    }
    
    const { host, port, database, user, password, ssl } = req.body || {};
    if (!host || !database || !user) {
      return res.status(400).json({ ok: false, message: "กรุณาระบุ PostgreSQL connection details" });
    }
    
    const { createClient } = require("@supabase/supabase-js");
    const { Pool } = require("pg");
    
    const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_SECRET_KEY);
    const pgPool = new Pool({
      host, port: port || 5432, database, user, password: password || "",
      ssl: ssl ? { rejectUnauthorized: false } : false,
    });
    
    const results = {};
    let allMatch = true;
    
    for (const table of migrate.TABLE_ORDER) {
      const { count: srcCount } = await supabase.from(table).select("*", { count: "exact", head: true });
      const { rows } = await pgPool.query(`SELECT COUNT(*) FROM "${table}"`);
      const dstCount = parseInt(rows[0].count);
      const match = srcCount === dstCount;
      if (!match) allMatch = false;
      results[table] = { source: srcCount, target: dstCount, match };
    }
    
    await pgPool.end();
    res.json({ ok: true, allMatch, tables: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ============================================================

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(config.PORT, () => {
    console.log(`Server เริ่มที่ http://localhost:${config.PORT}`);
  });
}
