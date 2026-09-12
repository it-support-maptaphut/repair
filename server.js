const express = require("express");
const multer = require("multer");
const path = require("path");

const config = require("./config");
const supab = require("./supabase");
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

app.use(express.json());
app.use(function (req, res, next) {
  if (req.path === "/admin" || req.path === "/admin.html") {
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

app.post("/api/tickets", upload.array("photos", 12), async (req, res) => {
  try {
    const body = req.body || {};
    const device = String(body.device || "").trim();
    const symptom = String(body.symptom || "").trim();
    const location = String(body.location || "").trim();
    const name = String(body.reporter_name || "").trim();
    const phone = String(body.reporter_phone || "").trim();
    const reporterLineId = String(body.reporter_line_id || "").trim();

    if (!device || !symptom || !location) {
      return res.status(400).json({ ok: false, message: "ข้อมูลไม่ครบ" });
    }
    if (!supab.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    }

    const ticketNo = await supab.genTicketNo(device);

    const zoneCount = parseInt(String(body.zone_count || "0"), 10) || 0;
    const files = req.files || [];
    const fileCount = files.length;
    const problemCount = Math.max(0, fileCount - zoneCount);
    const urls = [];
    for (let i = 0; i < fileCount; i++) {
      const isZone = i >= problemCount;
      const label = isZone ? `z${i - problemCount + 1}` : `${i + 1}`;
      const up = await cloud.uploadImage(files[i].buffer, `${ticketNo}-${label}`, files[i].mimetype);
      if (up && up.secure_url) urls.push(up.secure_url);
    }
    if (files.length && !cloud.ok) {
      console.warn("[Cloudinary] ยังไม่ได้ตั้งค่า ใช้ Supabase Storage แทน (ถ้าอัปโหลดสำเร็จ)");
    }

    const ticketId = await supab.createTicket({
      ticketNo,
      device,
      symptom,
      location,
      reporterName: name,
      reporterPhone: phone,
      reporterLineId
    });
    await supab.addPhotos(ticketId, urls);
    await supab.recordDevice({ ip: clientIp(req), ticketNo });

    res.json({ ok: true, ticketNo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.get("/admin", (req, res) => res.redirect("/admin2.html"));

app.get("/api/notify/stream", (req, res) => {
  notif.handleStream(req, res, clientIp(req));
});

app.get("/api/config", (req, res) => {
  res.json({
    maxPhotos: 10
  });
});

app.get("/api/admin/tickets", async (req, res) => {
  try {
    if (!supab.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    }
    const tickets = await supab.listTickets();
    res.json({ ok: true, tickets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.get("/api/admin/users", async (req, res) => {
  try {
    if (!supab.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    }
    const users = await supab.listDevices();
    res.json({ ok: true, users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.put("/api/admin/users/:ip", async (req, res) => {
  try {
    const ip = String(req.params.ip || "").trim();
    const name = String((req.body || {}).name || "").trim();
    if (!ip) return res.status(400).json({ ok: false, message: "ไม่มีรหัส IP" });
    if (!supab.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    }
    await supab.setDeviceName(ip, name);
    res.json({ ok: true, ip, name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.delete("/api/admin/users/:ip", async (req, res) => {
  try {
    const ip = String(req.params.ip || "").trim();
    if (!ip) return res.status(400).json({ ok: false, message: "ไม่มีรหัส IP" });
    if (!supab.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    }
    const data = await supab.removeDevice(ip);
    if (!data || !data.length) {
      return res.status(404).json({ ok: false, message: "ไม่พบผู้ใช้นี้" });
    }
    res.json({ ok: true, ip });
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
    if (!supab.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    const cats = await supab.listDeviceCategories();
    res.json({ ok: true, categories: cats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/device-categories", async (req, res) => {
  try {
    const name = String((req.body || {}).name || "").trim();
    if (!name) return res.status(400).json({ ok: false, message: "กรอกชื่อหมวด" });
    if (!supab.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    const cat = await supab.addDeviceCategory(name);
    res.json({ ok: true, category: cat });
  } catch (err) {
    console.error(err);
    const msg = (err.message || "").includes("duplicate") ? "หมวดนี้มีอยู่แล้ว" : "server error";
    res.status(500).json({ ok: false, message: msg });
  }
});

app.get("/api/admin/device-entries", async (req, res) => {
  try {
    if (!supab.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    const entries = await supab.listDeviceEntries();
    res.json({ ok: true, entries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/device-entries", async (req, res) => {
  try {
    const model = String((req.body || {}).model || "").trim();
    if (!model) return res.status(400).json({ ok: false, message: "กรอกรุ่นสินค้า" });
    if (!supab.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    const entryNo = await supab.genDeviceNo();
    const id = await supab.createDeviceEntry({
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
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!supab.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    const body = req.body || {};
    const patch = {};
    ["category","model","spec_json","spec_source","spec_url","warranty_no","claim_company","status","asset_code","notes"].forEach(function (k) {
      if (body[k] != null) patch[k] = String(body[k]).trim();
    });
    if (body.warranty_expire_date != null) patch.warranty_expire_date = String(body.warranty_expire_date).trim() || null;
    if (body.broken_date != null) patch.broken_date = String(body.broken_date).trim() || null;
    if (body.claim_date != null) patch.claim_date = String(body.claim_date).trim() || null;
    patch.updated_at = new Date().toISOString();
    if (!Object.keys(patch).length) return res.status(400).json({ ok: false, message: "ไม่มีข้อมูลให้แก้ไข" });
    await supab.updateDeviceEntry(id, patch);
    res.json({ ok: true, id, ...patch });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.delete("/api/admin/device-entries/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!supab.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    const data = await supab.deleteDeviceEntry(id);
    if (!data || !data.length) return res.status(404).json({ ok: false, message: "ไม่พบรายการนี้" });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/device-entries/:id/photos", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!supab.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    const urls = Array.isArray((req.body || {}).cloud_urls) ? req.body.cloud_urls : [];
    if (!urls.length) return res.status(400).json({ ok: false, message: "ไม่มีรูป" });
    await supab.addEntryPhotos(id, urls);
    res.json({ ok: true, count: urls.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ---------- PDF โน้ตอุปกรณ์ (อย่างเป็นทางการ / Sarabun) ----------
app.get("/api/admin/device-entries/:id/pdf", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!supab.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    if (!devicePdf.hasFonts()) return res.status(500).json({ ok: false, message: "หายังพบไฟล์ฟอนต์ Sarabun (โฟลเดอร์ fonts/)" });
    const entries = await supab.listDeviceEntries();
    const row = entries.filter(function (e) { return e.id === id; })[0];
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
    if (!supab.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    const notes = await supab.listWorkNotes();
    res.json({ ok: true, notes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/work-notes", async (req, res) => {
  try {
    const title = String((req.body || {}).title || "").trim();
    if (!title) return res.status(400).json({ ok: false, message: "กรอกหัวเรื่องโน้ตงานก่อน" });
    if (!supab.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    const steps = Array.isArray((req.body || {}).steps)
      ? (req.body.steps || []).map(function (s) { return String(s).trim(); }).filter(function (s) { return s; })
      : [];
    const id = await supab.createWorkNote({
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
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!supab.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
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
    await supab.updateWorkNote(id, patch);
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.delete("/api/admin/work-notes/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!supab.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    const data = await supab.deleteWorkNote(id);
    if (!data || !data.length) return res.status(404).json({ ok: false, message: "ไม่พบโน้ตงานนี้" });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ---------- PDF โน๊ตงาน (A4 หน้าเดียว / Sarabun) ----------
app.get("/api/admin/work-notes/:id/pdf", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!supab.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    if (!workNotePdf.hasFonts()) return res.status(500).json({ ok: false, message: "หายังพบไฟล์ฟอนต์ Sarabun (โฟลเดอร์ fonts/)" });
    const row = await supab.getWorkNote(id);
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
    const ticketNo = String(req.params.ticketNo || "").trim();
    if (!supab.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    }
    const { data, error } = await supab.supabase
      .from("tickets")
      .select("ticket_no,device,symptom,location,reporter_name,reporter_phone,status,approved_at,created_at,pdf_url")
      .eq("ticket_no", ticketNo)
      .single();
    if (error && /approved_at/.test(error.message)) {
      const retry = await supab.supabase
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.put("/api/tickets/:ticketNo", async (req, res) => {
  try {
    const ticketNo = String(req.params.ticketNo || "").trim();
    const body = req.body || {};
    const patch = {};
    if (body.device !== undefined) patch.device = String(body.device).trim();
    if (body.symptom !== undefined) patch.symptom = String(body.symptom).trim();
    if (body.location !== undefined) patch.location = String(body.location).trim();
    if (body.reporter_name !== undefined) patch.reporter_name = String(body.reporter_name).trim();
    if (body.reporter_phone !== undefined) patch.reporter_phone = String(body.reporter_phone).trim();
    if (body.pdf_url !== undefined) patch.pdf_url = String(body.pdf_url).trim();
    if (!Object.keys(patch).length) {
      return res.status(400).json({ ok: false, message: "ไม่มีข้อมูลที่ต้องการแก้ไข" });
    }
    if (!supab.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    }
    const { data, error } = await supab.supabase
      .from("tickets")
      .update(patch)
      .eq("ticket_no", ticketNo)
      .select()
      .single();
    if (error || !data) {
      return res.status(404).json({ ok: false, message: "ไม่พบงาน " + ticketNo });
    }
    res.json({ ok: true, ticket: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.delete("/api/tickets/:ticketNo", async (req, res) => {
  try {
    const ticketNo = String(req.params.ticketNo || "").trim();
    if (!supab.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    }
    const { data, error } = await supab.supabase
      .from("tickets")
      .delete()
      .eq("ticket_no", ticketNo)
      .select("id");
    if (error || !data || !data.length) {
      return res.status(404).json({ ok: false, message: "ไม่พบงาน " + ticketNo });
    }
    res.json({ ok: true, ticketNo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/tickets/:ticketNo/status", async (req, res) => {
  try {
    const ticketNo = String(req.params.ticketNo || "").trim();
    const status = String((req.body || {}).status || "").trim();
    if (!["new", "working", "done"].includes(status)) {
      return res.status(400).json({ ok: false, message: "สถานะไม่ถูกต้อง" });
    }
    if (!supab.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    }
    const patch = { status };
    const approvedAt = new Date().toISOString();
    if (status === "working") patch.approved_at = approvedAt;
    let { data, error } = await supab.supabase
      .from("tickets")
      .update(patch)
      .eq("ticket_no", ticketNo)
      .select("*, ticket_photos(id, cloud_url)")
      .single();
    if (error && status === "working" && /approved_at/.test(error.message)) {
      patch.approved_at = undefined;
      const retry = await supab.supabase
        .from("tickets")
        .update({ status })
        .eq("ticket_no", ticketNo)
        .select("*, ticket_photos(id, cloud_url)")
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (error || !data) {
      return res.status(404).json({ ok: false, message: "ไม่พบงาน " + ticketNo });
    }
    if (status === "working") {
      try {
        const dev = await supab.supabase
          .from("user_devices")
          .select("ip")
          .eq("last_ticket_no", data.ticket_no)
          .maybeSingle();
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
        await supab.updateArchive(ticketNo, buffer.toString("base64"), buffer.length);
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
    const ticketNo = String(req.params.ticketNo || "").trim();
    if (!supab.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    }
    const { data, error } = await supab.supabase
      .from("tickets")
      .select("ticket_no, archive_base64, archive_size")
      .eq("ticket_no", ticketNo)
      .single();
    if (error || !data || !data.archive_base64) {
      return res.status(404).json({ ok: false, message: "ยังไม่มีข้อมูลบีบอัดสำหรับงานนี้" });
    }
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="${ticketNo}-archive.gz"`);
    res.send(Buffer.from(data.archive_base64, "base64"));
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
