const express = require("express");
const multer = require("multer");
const path = require("path");
const fsSync = require("fs");
const crypto = require("crypto");

const config = require("./config");
const db = require("./db-adapter");
const cloud = require("./cloudinary");
const notif = require("./notify");
const devicePdf = require("./device-pdf");
const workNotePdf = require("./work-note-pdf");
const ticketPdf = require("./ticket-pdf");
const riPdf = require("./repair-intake-pdf");

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

// ======================================================
// ระบบล็อกอินหน้า Admin (server-side, HttpOnly cookie)
// ======================================================

app.use(express.json());

const ADMIN_USER = config.ADMIN_USER || "admin";
const ADMIN_PASS = config.ADMIN_PASS;
const ADMIN_SECRET = config.ADMIN_SECRET;
const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000; // 8 ชม.
const APP_VERSION = config.APP_VERSION || "1.0.2";
const APP_VERSION_LABEL = config.APP_VERSION_LABEL || "V" + APP_VERSION;

// ---------- PASSWORD NOTE: เข้ารหัส AES-256-GCM + PIN ยืนยันตัวตน ----------
// บังคับให้ตั้งค่าใน .env — ไม่มีค่าเริ่มต้นที่ฝังในโค้ด (เคยเป็นช่องโหว่: ใครก็อ่านซอร์สได้)
const PN_PIN = String(config.PASSWORD_NOTE_PIN || "");
const PN_PASS = String(config.PASSWORD_NOTE_PASS || "");
if (!PN_PIN || !PN_PASS) {
  console.warn("[security] ยังไม่ได้ตั้ง PASSWORD_NOTE_PIN / PASSWORD_NOTE_PASS ใน .env — ระบบบันทึกรหัสผ่านจะปิดใช้งาน");
}
const PN_FALLBACK_KEY = crypto
  .createHash("sha256")
  .update(String(ADMIN_SECRET) + ":password_note_master_v1")
  .digest();

const PN_KEY = (function () {
  const raw = String(config.PASSWORD_NOTE_KEY || "");
  if (!raw) return PN_FALLBACK_KEY;
  let k = null;
  try { k = Buffer.from(raw, "base64"); } catch (e) { k = null; }
  // AES-256-GCM ต้องการ key ยาว 32 ไบต์พอดี
  if (k && k.length === 32) return k;
  console.warn("[security] PASSWORD_NOTE_KEY ไม่ใช่ Base64 ของ key 32 ไบต์ — จะใช้คีย์สำรองจาก ADMIN_SECRET แทน (ข้อมูลเดิมจะถอดได้)");
  return PN_FALLBACK_KEY;
})();

// ลองถอดด้วยคีย์หลักก่อน ถ้าไม่ได้ลองคีย์สำรอง (ข้อมูลเก่าอาจถูกบันทึกด้วยคีย์อีกแบบ)
const PN_KEYS = PN_KEY.equals(PN_FALLBACK_KEY) ? [PN_KEY] : [PN_KEY, PN_FALLBACK_KEY];

function pnEncrypt(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", PN_KEY, iv);
  const pt = Buffer.from(JSON.stringify(obj), "utf8");
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".");
}

function pnDecryptWith(blob, key) {
  const parts = String(blob || "").split(".");
  if (parts.length !== 3) throw new Error("ข้อมูลเข้ารหัสไม่ถูกต้อง");
  const [ivB, tagB, ctB] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB, "base64")),
    decipher.final()
  ]);
  return JSON.parse(pt.toString("utf8"));
}

function pnDecrypt(blob) {
  let lastErr = null;
  for (const key of PN_KEYS) {
    try {
      return pnDecryptWith(blob, key);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("ถอดรหัสไม่สำเร็จ");
}

function pnPinMatches(input) {
  const a = crypto.createHash("sha256").update(String(input || "")).digest();
  const b = crypto.createHash("sha256").update(PN_PIN).digest();
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

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
  res.append("Set-Cookie", "admin_token=" + encodeURIComponent(token) + "; HttpOnly; Path=/; Max-Age=28800; SameSite=Lax");
}

function clearAdminCookie(res) {
  res.append("Set-Cookie", "admin_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
}

function isAdminAuthed(req) {
  return !!verifyAdminToken(parseCookies(req).admin_token);
}

// ---------- ล็อกอินพนักงาน (system_users จากตั้งค่าสิทธิ์ฯ) ----------
const USER_SESSION_TTL = 8 * 60 * 60 * 1000; // 8 ชม.

function signUserToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", ADMIN_SECRET).update(body).digest("base64url");
  return body + "." + sig;
}

function verifyUserToken(token) {
  if (!token) return null;
  try {
    const [bodyB64, sig] = String(token).split(".");
    if (!bodyB64 || !sig) return null;
    const expect = crypto.createHmac("sha256", ADMIN_SECRET).update(bodyB64).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(bodyB64, "base64url").toString("utf8"));
    if (!payload || payload.e !== "user" || !payload.u || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function isUserAuthed(req) {
  const payload = verifyUserToken(parseCookies(req).su_token);
  return payload ? payload.u : null;
}

function setUserCookie(res, token) {
  res.append("Set-Cookie", "su_token=" + encodeURIComponent(token) + "; HttpOnly; Path=/; Max-Age=28800; SameSite=Lax");
}

function clearUserCookie(res) {
  res.append("Set-Cookie", "su_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
}

// ดึงข้อมูลพนักงานจาก DB (สิทธิ์สดเสมอ ไม่เคยฝังใน token)
async function loadSuUser(username) {
  if (!username) return null;
  const cred = await db.getAdapter().getSystemUserAuth(username);
  if (!cred || !cred.password_hash) return null;
  return { username: username, permissions: Array.isArray(cred.permissions) ? cred.permissions : [] };
}

// ---------- บัญชีผู้ใช้หน้าเว็บ (external_visitors) ----------
// ทุกการเข้าสู่ระบบผูกกับ visitor_id เท่านั้น ไม่ผูกกับ IP เดิมหรือเครื่อง
// ---------- Key Pass (แทนรหัสผ่าน) ----------
// ตัวอักษร A-Z ไม่รวม I L O (สับสนกับ 1 และ 0) + ตัวเลข 2-9  = 31 ตัว
// 5 ตัว => 31^5 = 28,629,151 แบว (ผนวก rate limit จึงเดาไม่ทันในเวลาจริง)
const KEYPASS_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const KEYPASS_LEN = 5;
const KEYPASS_PEPPER = String(config.VISITOR_KEYPASS_PEPPER || "");
const KEYPASS_RE = /^[A-HJ-KM-NP-Z2-9]{5}$/;

function newKeypass() {
  const bytes = crypto.randomBytes(KEYPASS_LEN * 2);
  let out = "";
  for (let i = 0; out.length < KEYPASS_LEN; i++) {
    out += KEYPASS_ALPHABET[bytes[i % bytes.length] % KEYPASS_ALPHABET.length];
  }
  return out;
}

// ชั้นที่ 1: HMAC แบบ deterministic ใช้ทำ unique index ค้นหา O(1)
// ชั้นที่ 2: scrypt ใช้ยืนยันซ้ำ (ช้าโดยตั้งใจ) — ขโมย DB ได้ก็ต้องผ่านทั้งสองชั้น
function keypassLookup(keypass) {
  return crypto.createHmac("sha256", KEYPASS_PEPPER).update(String(keypass)).digest("hex");
}

function keypassHash(keypass) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(keypass), salt, 32).toString("hex");
  return "scrypt$" + salt + "$" + hash;
}

function keypassVerify(keypass, stored) {
  try {
    const parts = String(stored || "").split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const hash = crypto.scryptSync(String(keypass), parts[1], 32).toString("hex");
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(parts[2], "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (err) {
    return false;
  }
}

// ---------- ชั้นที่ 3: ให้ผู้ใช้ "ดู/คัดลอก Key Pass ของตัวเอง" ในหน้า Settings ----------
// ระบบยังไม่เก็บ Key Pass ต้นฉบับ — เก็บเฉพาะเวอร์ชันเข้ารหัส AES-256-GCM (keypass_enc)
// ผูกกับ VISITOR_KEYPASS_ENC_KEY จึงแม้ DB รั่ว/สำรองออกไปก็อ่านไม่ได้ถ้าไม่มีคีย์นี้บนเซิร์ฟเวอร์
const KP_ENC_KEY = (function () {
  const raw = String(config.VISITOR_KEYPASS_ENC_KEY || "");
  return raw ? crypto.createHash("sha256").update(raw).digest() : null;
})();

function keypassEncrypt(keypass) {
  if (!KP_ENC_KEY) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KP_ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(String(keypass), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return "e." + iv.toString("base64") + "." + tag.toString("base64") + "." + ct.toString("base64");
}

function keypassDecrypt(blob) {
  try {
    const parts = String(blob || "").split(".");
    if (parts.length !== 4 || parts[0] !== "e") return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", KP_ENC_KEY, Buffer.from(parts[1], "base64"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64")), decipher.final()]).toString("utf8");
  } catch (err) {
    return null;
  }
}

function normalizeKeypass(raw) {
  return String(raw == null ? "" : raw).trim().toUpperCase().replace(/\s+/g, "");
}

function validateKeypass(raw) {
  const k = normalizeKeypass(raw);
  if (!k) return { ok: false, message: "กรุณากรอก Key Pass" };
  if (!KEYPASS_RE.test(k)) {
    return { ok: false, message: "Key Pass ต้องเป็นตัวอักษร/ตัวเลข 5 ตัว (ไม่ใช่ I L O และ 0 1)" };
  }
  return { ok: true, keypass: k };
}

function keypassReady() {
  return !!KEYPASS_PEPPER;
}

function keypassEncReady() {
  return !!KP_ENC_KEY;
}

// สุ่ม Key Pass ใหม่ให้ visitor (เก็บ hash + รุ่นเข้ารหัสแบบอ่านกลับได้สำหรับหน้า Settings)
async function issueKeypass(adapter, visitorId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const keypass = newKeypass();
    const lookup = keypassLookup(keypass);
    const taken = await adapter.findVisitorByKeypassLookup(lookup);
    if (taken && String(taken.id) !== String(visitorId)) continue;
    await adapter.setVisitorKeypass(visitorId, {
      lookup,
      hash: keypassHash(keypass),
      enc: keypassEncrypt(keypass)
    });
    return keypass;
  }
  throw new Error("ออก Key Pass ไม่สำเร็จ กรุณาลองใหม่");
}

// ---------- rate limit แบบ in-memory ----------
// กันเดา Key Pass และกันยิงใบแจ้งซ่อมถี่ ๆ (Key Pass 5 ตัวสั้นมาก ต้องล็อก)
const RL_BUCKETS = new Map();
function rateLimit(bucket, max, windowMs) {
  return function (req, res, next) {
    const key = bucket + "|" + clientIp(req);
    const now = Date.now();
    const hit = RL_BUCKETS.get(key);
    if (!hit || now > hit.reset) {
      RL_BUCKETS.set(key, { count: 1, reset: now + windowMs });
      if (RL_BUCKETS.size > 5000) {
        for (const [k, v] of RL_BUCKETS) if (now > v.reset) RL_BUCKETS.delete(k);
      }
      return next();
    }
    hit.count++;
    if (hit.count > max) {
      const secs = Math.max(1, Math.ceil((hit.reset - now) / 1000));
      res.set("Retry-After", String(secs));
      return res.status(429).json({
        ok: false,
        message: "พยายามบ่อยเกินไป กรุณารอ " + Math.ceil(secs / 60) + " นาทีแล้วลองใหม่อีกครั้ง"
      });
    }
    return next();
  };
}

const VISITOR_SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 วัน
const VISITOR_COOKIE_MAXAGE = 30 * 24 * 60 * 60;      // วินาที
const VISITOR_TOKEN_TTL = 365 * 24 * 60 * 60;        // cookie จำเบราว์เซอร์ 1 ปี
const VISITOR_IP_FALLBACK_HOURS = 12;                 // ใช้ IP ช่วยระบุตัวตนได้เฉพาะของเก่าในช่วงนี้

function signVisitorToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", ADMIN_SECRET).update(body).digest("base64url");
  return body + "." + sig;
}

function verifyVisitorToken(token) {
  if (!token) return null;
  try {
    const [bodyB64, sig] = String(token).split(".");
    if (!bodyB64 || !sig) return null;
    const expect = crypto.createHmac("sha256", ADMIN_SECRET).update(bodyB64).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(bodyB64, "base64url").toString("utf8"));
    if (!payload || payload.e !== "visitor" || !payload.v || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function cookieFlags(req) {
  return "Path=/; SameSite=Lax" + (isHttps(req) ? "; Secure" : "");
}

function isHttps(req) {
  if (req && req.secure) return true;
  if (req && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https") return true;
  return false;
}

// ใช้ res.append เสมอ: res.set("Set-Cookie", ...) สองครั้งใน response เดียวจะทับกัน
function setVisitorSessionCookie(req, res, visitorId) {
  const token = signVisitorToken({ e: "visitor", v: visitorId, exp: Date.now() + VISITOR_SESSION_TTL });
  res.append("Set-Cookie", "vst_token=" + encodeURIComponent(token) + "; HttpOnly; Max-Age=" + VISITOR_SESSION_TTL / 1000 + "; " + cookieFlags(req));
}

function clearVisitorSessionCookie(req, res) {
  res.append("Set-Cookie", "vst_token=; HttpOnly; Max-Age=0; " + cookieFlags(req));
}

function setVisitorTokenCookie(req, res, token) {
  res.append("Set-Cookie", "visitor_token=" + encodeURIComponent(token) + "; HttpOnly; Max-Age=" + VISITOR_TOKEN_TTL + "; " + cookieFlags(req));
}

function clearVisitorTokenCookie(req, res) {
  res.append("Set-Cookie", "visitor_token=; HttpOnly; Max-Age=0; " + cookieFlags(req));
}

function setVisitorCookie(req, res, token) {
  setVisitorTokenCookie(req, res, token);
}

// เปิดดูข้อมูลบัญชี (ไม่ส่ง token/ip/Key Pass กลับไปที่เบราว์เซอร์)
function publicVisitor(v) {
  if (!v) return null;
  return {
    id: v.id,
    name: v.name || "",
    position: v.position || "",
    branch: v.branch || "",
    hasKeypass: !!v.keypass_at
  };
}

// กัน API ทั้งหมดในหมวด /api/admin/* (login ไม่มีในหมวดนี้)
// admin → เข้าได้ทั้งหมด / พนักงาน (system_users) → ต้องมีสิทธิ์ตรงตามเมนู
app.use("/api/admin", async (req, res, next) => {
  if (req.path.startsWith("/login")) return next();
  if (isAdminAuthed(req)) return next();
  const username = isUserAuthed(req);
  if (username) {
    try {
      const su = await loadSuUser(username);
      if (su) {
        req.suUser = su;
        return next();
      }
    } catch (err) {
      console.error("[auth] โหลดสิทธิ์พนักงานไม่สำเร็จ:", err.message);
    }
    return res.status(401).json({ ok: false, message: "บัญชีนี้ไม่มีสิทธิ์ใช้งานแล้ว" });
  }
  return res.status(401).json({ ok: false, message: "กรุณาเข้าสู่ระบบก่อนใช้งาน" });
});

// ตรวจสิทธิ์ตาม API ที่พนักงานเรียก (admin ข้ามขั้นนี้)
app.use("/api/admin", (req, res, next) => {
  if (!req.suUser) return next();
  const perms = req.suUser.permissions || [];
  const path = req.path; // เช่น "/tickets", "/device-entries/5/pdf" (เทียบกับ mount /api/admin)
  const has = (...keys) => keys.some((k) => perms.indexOf(k) !== -1);

  if (/^\/system-users/.test(path)) return has("settings") ? next() : deny();
  if (/^\/repair-notes\b/.test(path)) return has("repairNotes") ? next() : deny();
  if (/^\/work-notes\b/.test(path)) return has("workNotes") ? next() : deny();
  if (/^\/drive-notes\b/.test(path)) return has("driveNotes") ? next() : deny();
  if (/^\/driver-catalog\b/.test(path)) return has("driveNotes") ? next() : deny();
  if (/^\/driver-brand-links\b/.test(path)) return has("driveNotes") ? next() : deny();
  if (/^\/travel-/.test(path)) return has("travelExpense") ? next() : deny();
  if (/^\/field-work/.test(path)) return has("fieldWork") ? next() : deny();
  if (/^\/repair-intakes/.test(path)) return has("repairIntake") ? next() : deny();
  if (/^\/maintenance/.test(path)) return has("maintenance") ? next() : deny();
  if (/^\/visitors/.test(path)) return has("visitors") ? next() : deny();
  if (/^\/users(\/|$)/.test(path)) return has("devices") ? next() : deny();
  if (/^\/device-categories/.test(path)) return has("devices", "deviceNotes", "repairIntake") ? next() : deny();
  if (/^\/device-options/.test(path)) return has("devices", "deviceNotes") ? next() : deny();
  if (/^\/spec-search/.test(path)) return has("devices", "deviceNotes") ? next() : deny();
  if (/^\/upload-device-photo/.test(path)) return has("devices", "deviceNotes", "repairIntake") ? next() : deny();
  if (/^\/device-entries/.test(path)) {
    if (req.method === "GET") return has("devices", "deviceNotes", "warranty") ? next() : deny();
    return has("devices", "deviceNotes") ? next() : deny();
  }
  if (/^\/tickets\/.+/.test(path)) return has("tickets") ? next() : deny();
  // "fieldWork" ต้องอ่านรายการแจ้งซ่อมได้ (อ่านอย่างเดียว) เพื่อไปดึงข้อมูลมาใช้ในระบบบันทึกปฏิบัติงานนอกสถานที่
  if (/^\/tickets$/.test(path)) return has("tickets", "analytics", "worklog", "fieldWork") ? next() : deny();
  if (/^\/inbox\/.+/.test(path)) return has("tickets") ? next() : deny();
  if (/^\/inbox$/.test(path)) return has("tickets", "analytics", "worklog") ? next() : deny();

  // ส่วนที่เหลือ (migrate, db-*, ฯลฯ) อนุญาตเฉพาะ admin
  return deny();

  function deny() {
    return res.status(403).json({ ok: false, message: "ไม่มีสิทธิ์เข้าถึงส่วนนี้" });
  }
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

app.post("/api/auth/user-login", async (req, res) => {
  try {
    const username = String(((req.body || {}).username || "")).trim();
    const password = String(((req.body || {}).password || ""));
    if (!username || !password) {
      return res.status(400).json({ ok: false, message: "กรอกชื่อผู้ใช้และรหัสผ่าน" });
    }
    const cred = await db.getAdapter().getSystemUserAuth(username);
    if (!cred || !verifyPassword(password, cred.password_hash || "")) {
      return res.status(401).json({ ok: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }
    const token = signUserToken({ e: "user", u: username, exp: Date.now() + USER_SESSION_TTL });
    setUserCookie(res, token);
    res.json({
      ok: true,
      user: { username: username, permissions: Array.isArray(cred.permissions) ? cred.permissions : [] }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/auth/user-logout", (req, res) => {
  clearUserCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/user-me", async (req, res) => {
  const username = isUserAuthed(req);
  if (!username) return res.json({ ok: true, authed: false, user: null });
  try {
    const su = await loadSuUser(username);
    if (!su) return res.json({ ok: true, authed: false, user: null });
    res.json({ ok: true, authed: true, user: su });
  } catch (err) {
    console.error(err);
    res.json({ ok: true, authed: false, user: null });
  }
});

// สถานะระบบสำหรับ sidebar: ใครล็อกอิน, จำนวนผู้ใช้งาน, ใช้วัด Ping
app.get("/api/auth/status", async (req, res) => {
  const isAdmin = isAdminAuthed(req);
  const userName = isAdmin ? "admin" : isUserAuthed(req);
  const out = { ok: true, authed: !!userName, username: userName || null, role: isAdmin ? "admin" : (userName ? "user" : null), users: null, visitors: null };
  try {
    const adapter = db.getAdapter();
    if (adapter && adapter.ready) {
      const su = await adapter.listSystemUsers();
      out.users = Array.isArray(su) ? su.length : null;
      if (typeof adapter.listVisitors === "function") {
        const vs = await adapter.listVisitors({ limit: 2000 });
        out.visitors = Array.isArray(vs) ? vs.length : null;
      }
    }
  } catch (err) {
    console.warn("[status] นับผู้ใช้ไม่สำเร็จ:", err.message);
  }
  res.json(out);
});

// เปิดหน้า /admin.html ได้เฉพาะผู้ที่ Authed แล้ว (admin หรือ พนักงานที่มีสิทธิ์)
// วางก่อน express.static เพื่อไม่ให้ static serve admin.html ข้าม gate
async function serveAdminPage(req, res, next) {
  if (isAdminAuthed(req)) return next();
  const username = isUserAuthed(req);
  if (username) {
    try {
      const su = await loadSuUser(username);
      if (su) return next();
    } catch (err) {
      console.error("[auth] ตรวจสิทธิ์หน้า admin ไม่สำเร็จ:", err.message);
    }
  }
  return res.redirect("/admin-login.html");
}

app.get("/admin", serveAdminPage, (req, res) => res.redirect("/admin.html"));
app.get("/admin.html", serveAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.get("/admin-mobile.html", serveAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-mobile.html"));
});
app.get("/admin-db", serveAdminPage, (req, res) => res.redirect("/admin-db.html"));
app.get("/travel-print.html", serveAdminPage, (req, res) => {
res.sendFile(path.join(__dirname, "public", "travel-print.html"));
});
app.get("/admin-db.html", serveAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-db.html"));
});

app.use(express.json());
app.use(function (req, res, next) {
  // หน้า login: ห้ามแคชไว้ทุกกรณี เพื่อไม่ให้รหัสผ่าน/ฟอร์มค้างในแคชเบราว์เซอร์
  const noStore = ["/admin", "/admin.html", "/admin-mobile.html", "/admin-db", "/admin-db.html",
                   "/admin-login", "/admin-login.html"];
  if (noStore.includes(req.path)) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Clear-Site-Data", '"cache", "formData", "passwords"', { onlyIfCached: true });
  }
  next();
});
app.use(express.static(path.join(__dirname, "public")));
app.use("/fonts", express.static(path.join(__dirname, "fonts")));
app.get("/", (req, res) => res.redirect("/ticket.html"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 12 }
});

app.post("/api/tickets", rateLimit("ticket", 20, 60 * 60 * 1000), upload.fields([{ name: "photos", maxCount: 12 }, { name: "audio", maxCount: 1 }]), async (req, res) => {
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
    const sourceRaw = String(body.source || "external").trim();
    const source = sourceRaw === "internal" ? "internal" : "external";
    // ใบแจ้งจากภายนอกถูกบังคับ status/ผู้รับผิดชอบ/วันเวลาเป็นค่าเริ่มต้นเสมอ
    // (ผู้ใช้ทั่วไปห้ามส่ง status=done หรือแต่งชื่อคนซ่อมเอง — ป้องกัน mass assignment)
    const isStaffCaller = isAdminAuthed(req) || isUserAuthed(req);
    let status = "new";
    let effHandlerName = "";
    let effStatusDate = null;
    let effStatusTime = "";
    if (source === "internal" || isStaffCaller) {
      const statusValue = String(body.status || "new").trim();
      status = ["new", "working", "done"].includes(statusValue) ? statusValue : "new";
      effHandlerName = handlerName;
      effStatusDate = statusDate;
      effStatusTime = statusTime;
    }
    // ใบแจ้งภายในเข้าระบบทันที / ใบแจ้งจากภายนอกจะรอ IT กด "ตอบรับ" ก่อนถึงจะเข้าระบบบันทึกรายการ
    const acceptedAt = source === "internal" ? new Date().toISOString() : null;

    if (!symptom || !location) {
      return res.status(400).json({ ok: false, message: "ข้อมูลไม่ครบ" });
    }
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }

    // ใบแจ้งจากภายนอกต้องมี session ผู้ใช้ (ได้จากกรอกชื่อ+ตำแหน่ง หรือกรอก Key Pass)
    // ใบแจ้งภายในต้องเป็นผู้ดูแลระบบ/พนักงานเท่านั้น — ห้ามแอบส่ง source:"internal" จากหน้าเว็บสาธารณะ
    let visitor = null;
    if (source === "internal") {
      if (!isStaffCaller) {
        return res.status(403).json({ ok: false, message: "ใบแจ้งภายในต้องเข้าสู่ระบบฝ่าย IT ก่อน" });
      }
    } else {
      visitor = await requireVisitorSession(req);
      if (!visitor) {
        return res.status(401).json({ ok: false, needsIdentity: true, message: "กรุณากรอกชื่อและตำแหน่งก่อนแจ้งซ่อม" });
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
      effHandlerName,
      effStatusDate,
      effStatusTime,
      source,
      acceptedAt,
      audioUrl,
      visitorId: (visitor && visitor.id) || null
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

// ผูกกับบัญชีผู้ใช้ (visitor_id) — เปลี่ยนเครือข่ายแล้วยังได้รับแจ้งเตือน
app.get("/api/notify/stream", async (req, res) => {
  try {
    const visitor = await requireVisitorSession(req);
    if (!visitor) {
      return notif.handleStream(req, res, null);
    }
    notif.handleStream(req, res, visitor.id);
  } catch (err) {
    console.warn("[notify] เปิดสตรีมไม่สำเร็จ:", err.message);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
    }
  }
});

app.get("/api/config", (req, res) => {
  res.json({
    maxPhotos: 3,
    version: APP_VERSION,
    versionLabel: APP_VERSION_LABEL
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
      const owner = await db.getAdapter().getTicketOwner(ticketNo);
      if (owner && owner.visitor_id) {
        notif.pushToVisitor(owner.visitor_id, {
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


// ---------- ระบบบัญชีผู้ใช้งานภายนอก ----------
// ลำดับการระบุตัวตน: session (vst_token) → cookie เครื่อง → เลขเครื่อง → IP (เฉพาะผู้ใช้เก่าที่ยังไม่ได้ตั้งรหัสผ่าน)
// IP ไม่มีอำนาจผูกตัวตนอีกต่อไป เปลี่ยนเครือข่ายหรือเปลี่ยนเครื่องแล้วใช้ user/password เข้าได้
async function resolveVisitor(req, opts) {
  const options = opts || {};
  const adapter = db.getAdapter();
  if (!adapter.ready) return null;

  const allowIp = options.allowIpFallback !== false;
  const token = parseCookies(req).visitor_token || "";
  const ip = clientIp(req);
  const deviceId = String(req.headers["x-device-id"] || "").trim().slice(0, 200) || null;

  // 1) session ที่ล็อกอินไว้ — เป็นแหล่งความจริงเดียว (ไม่แตะ ip/device_id เด็ดขาด)
  const session = verifyVisitorToken(parseCookies(req).vst_token);
  if (session) {
    const row = await adapter.getVisitorById(session.v);
    if (row) {
      row.matchedBy = "session";
      return row;
    }
  }

  // 2-4) cookie / เลขเครื่อง / IP
  const row = await adapter.findVisitor({
    ip,
    token,
    deviceId,
    allowIpFallback: allowIp,
    ipFallbackHours: VISITOR_IP_FALLBACK_HOURS
  });
  if (row) row.matchedBy = token && String(row.token) === token ? "token" : (deviceId && row.device_id === deviceId ? "device" : "ip");
  return row;
}

// ผู้ใช้ที่ "เข้าสู่ระบบแล้ว" = มี session ที่ยังใช้ได้ (ไม่ผูกกับ IP/เครื่อง)
async function requireVisitorSession(req) {
  const session = verifyVisitorToken(parseCookies(req).vst_token);
  if (!session) return null;
  const adapter = db.getAdapter();
  if (!adapter.ready) return null;
  const row = await adapter.getVisitorById(session.v);
  if (!row) return null;
  row.matchedBy = "session";
  return row;
}

// GET /api/visitors/me — สถานะบัญชีของผู้ใช้บนเครื่องนี้
app.get("/api/visitors/me", async (req, res) => {
  try {
    const visitor = await resolveVisitor(req);
    if (!visitor) {
      clearVisitorSessionCookie(req, res);
      return res.json({ ok: true, registered: false, authed: false, visitor: null });
    }
    // รู้จักด้วย cookie/เลขเครื่อง (token เก่า 1 ปี) แต่ session สั้นหมดอายุแล้ว → ต่ออายุ session ให้ตรงกับ token ยาว
    if (visitor.matchedBy === "token" || visitor.matchedBy === "device") {
      setVisitorSessionCookie(req, res, visitor.id);
    }
    res.json({
      ok: true,
      registered: true,
      authed: true,
      visitor: publicVisitor(visitor)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// GET /api/visitors/me/keypass — ดู Key Pass ของตัวเองในหน้า Settings (ผู้ใช้เก่าที่ยังไม่มี keypass_enc จะดูไม่ได้ ต้องให้แอดมินออกใหม่)
app.get("/api/visitors/me/keypass", async (req, res) => {
  try {
    const visitor = await requireVisitorSession(req);
    if (!visitor) return res.status(401).json({ ok: false, message: "ยังไม่ได้ยืนยันตัวตน" });
    const keypass = keypassDecrypt(visitor.keypass_enc);
    if (!keypass) {
      return res.status(404).json({ ok: false, message: "Key Pass นี้ถูกออกก่อนเพิ่มระบบดูด้วยตัวเอง กรุณาติดต่อฝ่าย IT เพื่อออกใหม่" });
    }
    res.json({ ok: true, keypass: keypass });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// PATCH /api/visitors/me — แก้ชื่อ / ตำแหน่ง (Key Pass แก้ไขไม่ได้)
app.patch("/api/visitors/me", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const visitor = await requireVisitorSession(req);
    if (!visitor) {
      return res.status(401).json({ ok: false, message: "กรุณากรอกชื่อและตำแหน่งก่อนแก้ไขข้อมูลผู้ใช้" });
    }
    const body = req.body || {};

    const patch = {};
    if (body.name !== undefined) {
      patch.name = String(body.name).trim();
      if (!patch.name) return res.status(400).json({ ok: false, message: "กรุณากรอกชื่อ" });
    }
    if (body.position !== undefined) {
      patch.position = String(body.position).trim();
      if (!patch.position) return res.status(400).json({ ok: false, message: "กรุณากรอกตำแหน่ง" });
    }
    if (body.branch !== undefined) {
      patch.branch = String(body.branch).trim();
      if (!patch.branch) return res.status(400).json({ ok: false, message: "กรุณาเลือกสาขา" });
      if (patch.branch.length > 120) return res.status(400).json({ ok: false, message: "ชื่อสาขายาวเกินไป (สูงสุด 120 ตัวอักษร)" });
    }
    if (Object.keys(patch).length) await adapter.updateVisitor(visitor.id, patch);

    const fresh = await adapter.getVisitorById(visitor.id);
    res.json({ ok: true, visitor: publicVisitor(fresh) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// POST /api/visitors — เข้าใช้งาน: กรอกชื่อ + ตำแหน่ง แล้วระบบออก Key Pass ให้ 1 ครั้ง
app.post("/api/visitors", rateLimit("visitor", 10, 60 * 60 * 1000), async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    if (!keypassReady()) {
      return res.status(503).json({ ok: false, message: "ยังไม่ได้ตั้งค่า VISITOR_KEYPASS_PEPPER ใน .env (ต้องรีสตาร์ตเซิร์ฟเวอร์หลังแก้)" });
    }
    if (!keypassEncReady()) {
      return res.status(503).json({ ok: false, message: "ยังไม่ได้ตั้งค่า VISITOR_KEYPASS_ENC_KEY ใน .env (ต้องรีสตาร์ตเซิร์ฟเวอร์หลังแก้)" });
    }
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const position = String(body.position || "").trim();
    const branch = String(body.branch || "").trim();
    if (!name) return res.status(400).json({ ok: false, message: "กรุณากรอกชื่อ" });
    if (!position) return res.status(400).json({ ok: false, message: "กรุณากรอกตำแหน่ง" });
    if (!branch) return res.status(400).json({ ok: false, message: "กรุณาเลือกสาขา" });
    if (name.length > 60) return res.status(400).json({ ok: false, message: "ชื่อยาวเกินไป (สูงสุด 60 ตัวอักษร)" });
    if (position.length > 120) return res.status(400).json({ ok: false, message: "ตำแหน่งยาวเกินไป (สูงสุด 120 ตัวอักษร)" });
    if (branch.length > 120) return res.status(400).json({ ok: false, message: "ชื่อสาขายาวเกินไป (สูงสุด 120 ตัวอักษร)" });
    const ip = clientIp(req);
    const deviceId = String(body.device_id || req.headers["x-device-id"] || "").trim().slice(0, 200);
    const token = crypto.randomBytes(24).toString("hex");
    const visitor = await adapter.createVisitor({ name, position, branch, ip, token, deviceId });
    setVisitorCookie(req, res, token);
    setVisitorSessionCookie(req, res, visitor.id);
    // เก็บ hash + รุ่นเข้ารหัส (keypass_enc) ไว้ให้ผู้ใช้ดูเองในหน้า Settings
    const keypass = await issueKeypass(adapter, visitor.id);
    const fresh = await adapter.getVisitorById(visitor.id);
    res.json({ ok: true, keypass: keypass, visitor: publicVisitor(fresh || visitor) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: (err && err.message) || "server error" });
  }
});

// POST /api/visitors/keypass-login — กลับมาใช้ user เดิมบนเครื่องใหม่ด้วย Key Pass 5 ตัว
app.post("/api/visitors/keypass-login", rateLimit("kp", 5, 15 * 60 * 1000), async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    if (!keypassReady()) {
      return res.status(503).json({ ok: false, message: "ยังไม่ได้ตั้งค่า VISITOR_KEYPASS_PEPPER ใน .env" });
    }
    const k = validateKeypass((req.body || {}).keypass);
    if (!k.ok) return res.status(400).json({ ok: false, message: k.message });

    const row = await adapter.findVisitorByKeypassLookup(keypassLookup(k.keypass));
    // เทียบ scrypt เสมอ แม้ไม่เจอแถว เพื่อไม่ให้เวลาตอบบอกว่า Key Pass นี้มีอยู่จริงหรือไม่
    const ok = keypassVerify(k.keypass, row ? row.keypass_hash : keypassHash(k.keypass));
    if (!row || !ok) {
      return res.status(401).json({ ok: false, message: "ไม่พบ Key Pass นี้ หรือกรอกไม่ถูกต้อง" });
    }

    // ผูกเบราว์เซอร์นี้เข้ากับบัญชี Key Pass นี้ทันที (สลับ cookie/session มาเป็นของบัญชีใหม่)
    // => ถ้าเครื่องนี้จำบัญชีอื่นอยู่ด้วยคุกกี้เดิม คุกกี้จะถูกเขียนแทนด้วยของบัญชีนี้ จึง "สลับบัญชี" ได้จริง
    const deviceId = String(req.headers["x-device-id"] || "").trim().slice(0, 200);
    const patch = { last_seen_at: new Date().toISOString() };
    if (deviceId && !row.device_id) patch.device_id = deviceId;
    let token = row.token || "";
    if (!token) {
      token = crypto.randomBytes(24).toString("hex");
      patch.token = token;
    }
    await adapter.updateVisitor(row.id, patch);
    setVisitorTokenCookie(req, res, token);
    setVisitorSessionCookie(req, res, row.id);

    const fresh = (await adapter.getVisitorById(row.id)) || row;
    res.json({ ok: true, authed: true, visitor: publicVisitor(fresh) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// POST /api/auth/visitor-logout — ออกจากระบบ (ล้างทุกคุกกี้ผู้ใช้)
app.post("/api/auth/visitor-logout", (req, res) => {
  clearVisitorSessionCookie(req, res);
  clearVisitorTokenCookie(req, res);
  res.json({ ok: true });
});

// GET /api/admin/visitors — รายการผู้ใช้ภายนอกทั้งหมด
app.get("/api/admin/visitors", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const rows = await adapter.listVisitors();
    // ไม่ส่งข้อมูลลับ (Key Pass / โทเคน) ไปที่หน้าจอหลังบ้าน
    const visitors = rows.map(function (v) {
      return {
        id: v.id,
        name: v.name || "",
        position: v.position || "",
        branch: v.branch || "",
        ip: v.ip || "",
        ticket_count: v.ticket_count || 0,
        last_seen_at: v.last_seen_at,
        created_at: v.created_at,
        hasKeypass: !!v.keypass_at,
        keypass_at: v.keypass_at || null
      };
    });
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

// PATCH /api/admin/visitors/:id — แก้ชื่อ / ตำแหน่ง (Key Pass แก้ไขไม่ได้ ต้องออกใหม่เท่านั้น)
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
    if (body.branch !== undefined) patch.branch = String(body.branch).trim();
    if (!Object.keys(patch).length) {
      return res.status(400).json({ ok: false, message: "ไม่มีข้อมูลให้แก้ไข" });
    }
    const visitor = await adapter.updateVisitor(id, patch);
    if (!visitor) return res.status(404).json({ ok: false, message: "ไม่พบผู้ใช้นี้" });
    res.json({ ok: true, visitor: publicVisitor(visitor) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// POST /api/admin/visitors/:id/issue-keypass — แอดมินออก Key Pass ใหม่ให้ผู้ใช้ (คืนค่าเป็นข้อความ 1 ครั้ง)
app.post("/api/admin/visitors/:id/issue-keypass", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    if (!keypassReady()) {
      return res.status(503).json({ ok: false, message: "ยังไม่ได้ตั้งค่า VISITOR_KEYPASS_PEPPER ใน .env" });
    }
    if (!keypassEncReady()) {
      return res.status(503).json({ ok: false, message: "ยังไม่ได้ตั้งค่า VISITOR_KEYPASS_ENC_KEY ใน .env" });
    }
    const id = Number(req.params.id);
    const row = await adapter.getVisitorById(id);
    if (!row) return res.status(404).json({ ok: false, message: "ไม่พบผู้ใช้นี้" });
    const keypass = await issueKeypass(adapter, id);
    res.json({
      ok: true,
      id,
      keypass,
      name: row.name || "",
      message: "ออก Key Pass ใหม่ให้ " + (row.name || "ผู้ใช้") + " แล้ว (ส่งต่อให้ผู้ใช้ทันที ระบบจะไม่แสดงซ้ำ)"
    });
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

// ---------- PDF ใบแจ้งซ่อม (อย่างเป็นทางการ / Sarabun) ----------
app.get("/api/admin/tickets/:ticketNo/pdf", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const ticketNo = String(req.params.ticketNo || "").trim();
    if (!ticketNo) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    if (!ticketPdf.hasFonts()) return res.status(500).json({ ok: false, message: "หายังพบไฟล์ฟอนต์ Sarabun (โฟลเดอร์ fonts/)" });
    const tickets = await adapter.listTickets();
    const row = (tickets || []).filter(function (t) { return String(t.ticket_no) === String(ticketNo); })[0];
    if (!row) return res.status(404).json({ ok: false, message: "ไม่พบใบแจ้งซ่อม " + ticketNo });
    const { stream, filename } = ticketPdf.buildTicketPdf(row);
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

// ---------- ระบบเก็บไดร์ฟเวอร์ (Drive Notes — กลุ่มระบบโน้ต) ----------
app.get("/api/admin/drive-notes", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const notes = await adapter.listDriveNotes();
    res.json({ ok: true, notes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/drive-notes", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const title = String((req.body || {}).title || "").trim();
    if (!title) return res.status(400).json({ ok: false, message: "กรอกหัวเรื่องก่อน" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const steps = Array.isArray((req.body || {}).steps)
      ? (req.body.steps || []).map(function (s) { return String(s).trim(); }).filter(function (s) { return s; })
      : [];
    const id = await adapter.createDriveNote({
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

app.put("/api/admin/drive-notes/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const body = req.body || {};
    const patch = {};
    if (body.title != null) {
      patch.title = String(body.title).trim();
      if (!patch.title) return res.status(400).json({ ok: false, message: "กรอกหัวเรื่องก่อน" });
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
    await adapter.updateDriveNote(id, patch);
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.delete("/api/admin/drive-notes/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const data = await adapter.deleteDriveNote(id);
    if (!data || !data.length) return res.status(404).json({ ok: false, message: "ไม่พบรายการนี้" });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ---------- ดาวน์โหลดไดร์ฟเวอร์ (Driver Catalog) ----------
app.get("/api/admin/driver-catalog", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const items = await adapter.listDriverCatalog();
    res.json({ ok: true, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/driver-catalog", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const body = req.body || {};
    const deviceType = String(body.device_type || "printer").trim();
    const brand = String(body.brand || "").trim();
    const model = String(body.model || "").trim();
    if (!brand || !model) return res.status(400).json({ ok: false, message: "กรอกยี่ห้อและรุ่นให้ครบ" });
    const id = await adapter.createDriverCatalog({
      deviceType,
      brand,
      model,
      sourceUrl: String(body.source_url || "").trim(),
      notes: String(body.notes || "").trim()
    });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.delete("/api/admin/driver-catalog/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const data = await adapter.deleteDriverCatalog(id);
    if (!data || !data.length) return res.status(404).json({ ok: false, message: "ไม่พบรายการนี้" });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ---------- ลิงก์ดาวน์โหลดต่อยี่ห้อ (Driver Brand Links) ----------
app.get("/api/admin/driver-brand-links", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const items = await adapter.listDriverBrandLinks();
    res.json({ ok: true, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.put("/api/admin/driver-brand-links/:brand", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const brand = String(req.params.brand || "").trim();
    if (!brand) return res.status(400).json({ ok: false, message: "ระบุยี่ห้อก่อน" });
    const supportUrl = String((req.body || {}).support_url || "").trim();
    const row = await adapter.putDriverBrandLink(brand, supportUrl);
    res.json({ ok: true, brand, support_url: row.support_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ---------- ระบบบันทึกเบิกค่าเดินทาง (Travel Expense) ----------
const TRAVEL_VEHICLES = ["motorcycle", "car"];

// หมายเหตุ: ใช้ ?? ไม่ใช่ || เพราะอัตรา 0 บาท/กม. เป็นค่าที่ตั้งใจได้ ไม่ควรถูกแทนด้วยค่าเริ่มต้น
function travelRate(vehicle, settings) {
  const n = vehicle === "car" ? settings.travel_rate_car_resolved : settings.travel_rate_moto_resolved;
  const num = Number(n);
  return n == null || n === "" || !isFinite(num) || num < 0 ? (vehicle === "car" ? 5 : 3) : num;
}

// คำนวณยอดฝั่ง server (ไม่เชื่อค่าที่ client ส่งมาเรื่องยอดเงิน)
function normalizeTrips(input, settings) {
  const list = Array.isArray(input) ? input : [];
  const out = [];
  let totalKm = 0;
  let totalAmount = 0;
  list.forEach(function (t) {
    const row = t && typeof t === "object" ? t : {};
    const vehicle = TRAVEL_VEHICLES.indexOf(String(row.vehicle || "").toLowerCase()) >= 0
      ? String(row.vehicle).toLowerCase()
      : "motorcycle";
    const km = Math.max(0, Math.round((Number(row.km) || 0) * 100) / 100);
    const rate = travelRate(vehicle, settings);
    const amount = Math.round(km * rate * 100) / 100;
    totalKm += km;
    totalAmount += amount;
    out.push({
      date: String(row.date || "").slice(0, 10),
      purpose: String(row.purpose || "").trim().slice(0, 300),
      km: km,
      vehicle: vehicle,
      rate: rate,
      amount: amount
    });
  });
  return { trips: out, totalKm: Math.round(totalKm * 100) / 100, totalAmount: Math.round(totalAmount * 100) / 100 };
}

// สถานะใบเบิกที่ระบบรับได้ (ต้องตรงกับ normalizeTravelStatus ใน db-adapter / supabase)
const TRAVEL_STATUS_LIST = ["กำลังดำเนินการ", "รอดำเนินการ", "เสร็จสิ้น"];

function travelClaimPayload(body, settings) {
  const b = body || {};
  const calc = normalizeTrips(b.trips, settings);
  return {
    claimerVisitorId: b.claimerVisitorId == null || b.claimerVisitorId === "" ? null : Number(b.claimerVisitorId),
    claimerName: String(b.claimerName || "").trim().slice(0, 150),
    claimDate: String(b.claimDate || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
    position: String(b.position || "").trim().slice(0, 150),
    bankName: String(b.bankName || "").trim().slice(0, 150),
    bankAccount: String(b.bankAccount || "").trim().slice(0, 100),
    accountName: String(b.accountName || "").trim().slice(0, 150),
    trips: calc.trips,
    totalKm: calc.totalKm,
    totalAmount: calc.totalAmount,
    note: String(b.note || "").trim().slice(0, 500),
    status: TRAVEL_STATUS_LIST.indexOf(String(b.status || "").trim()) >= 0
      ? String(b.status).trim()
      : "รอดำเนินการ"
  };
}

app.get("/api/admin/travel-settings", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const settings = await adapter.getTravelSettings();
    settings.travel_rate_moto_resolved = settings.fuel_rate_motorcycle;
    settings.travel_rate_car_resolved = settings.fuel_rate_car;
    res.json({ ok: true, settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.put("/api/admin/travel-settings", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const body = req.body || {};
    const patch = {};
    if (body.fuel_rate_motorcycle != null) {
      const n = Number(body.fuel_rate_motorcycle);
      patch.fuel_rate_motorcycle = String(isFinite(n) && n >= 0 ? n : 0);
    }
    if (body.fuel_rate_car != null) {
      const n = Number(body.fuel_rate_car);
      patch.fuel_rate_car = String(isFinite(n) && n >= 0 ? n : 0);
    }
    ["travel_company", "travel_bank_name", "travel_account_name", "travel_bank_account",
      "travel_claimer_name", "travel_claimer_position",
      "travel_approver_name", "travel_approver_title", "travel_checker_name", "travel_checker_title",
      "travel_checker2_name", "travel_checker2_title"]
      .forEach(function (k) {
        if (body[k] != null) patch[k] = String(body[k]).trim().slice(0, 200);
      });
    // คอลัมน์รถที่จะแสดงในตาราง: รับเฉพาะ "moto" / "car" เท่านั้น
    // ถ้าไม่ได้ติ๊กอะไรเลย ให้ยึดค่าเดิมไว้ (ไม่บังคับ) เพื่อไม่ให้ตารางว่างเปล่า
    if (body.travel_vehicle_columns != null) {
      const cols = String(body.travel_vehicle_columns)
        .split(",")
        .map(function (x) { return x.trim().toLowerCase(); })
        .filter(function (x) { return x === "moto" || x === "car"; });
      if (cols.length) {
        const seen = [];
        cols.forEach(function (x) { if (seen.indexOf(x) < 0) seen.push(x); });
        patch.travel_vehicle_columns = seen.join(",");
      }
    }
    if (!Object.keys(patch).length) return res.status(400).json({ ok: false, message: "ไม่มีข้อมูลให้บันทึก" });
    const settings = await adapter.saveTravelSettings(patch);
    settings.travel_rate_moto_resolved = settings.fuel_rate_motorcycle;
    settings.travel_rate_car_resolved = settings.fuel_rate_car;
    res.json({ ok: true, settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// รายชื่อผู้เบิก (ส่งเฉพาะ id/ชื่อ/ตำแหน่ง ไม่เปิดเผยข้อมูลอื่นของผู้ใช้ภายนอก)
app.get("/api/admin/travel-claimers", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const list = await adapter.listVisitors(1000);
    const claimers = (list || []).map(function (v) {
      return { id: v.id, name: v.name || "", position: v.position || "" };
    });
    res.json({ ok: true, claimers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.get("/api/admin/travel-claims", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const claims = await adapter.listTravelClaims();
    res.json({ ok: true, claims });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.get("/api/admin/travel-claims/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const claim = await adapter.getTravelClaim(id);
    if (!claim) return res.status(404).json({ ok: false, message: "ไม่พบใบเบิกค่าเดินทาง" });
    res.json({ ok: true, claim });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/travel-claims", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const settings = await adapter.getTravelSettings();
    settings.travel_rate_moto_resolved = settings.fuel_rate_motorcycle;
    settings.travel_rate_car_resolved = settings.fuel_rate_car;
    const payload = travelClaimPayload(req.body, settings);
    if (!payload.claimerName) return res.status(400).json({ ok: false, message: "กรอกชื่อผู้เบิกก่อน" });
    if (!payload.trips.length) return res.status(400).json({ ok: false, message: "เพิ่มรายการเดินทางอย่างน้อย 1 รายการ" });
    const claim = await adapter.createTravelClaim(payload);
    res.json({ ok: true, claim });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.put("/api/admin/travel-claims/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const settings = await adapter.getTravelSettings();
    settings.travel_rate_moto_resolved = settings.fuel_rate_motorcycle;
    settings.travel_rate_car_resolved = settings.fuel_rate_car;
    const payload = travelClaimPayload(req.body, settings);
    if (!payload.claimerName) return res.status(400).json({ ok: false, message: "กรอกชื่อผู้เบิกก่อน" });
    if (!payload.trips.length) return res.status(400).json({ ok: false, message: "เพิ่มรายการเดินทางอย่างน้อย 1 รายการ" });
    const claim = await adapter.updateTravelClaim(id, payload);
    if (!claim) return res.status(404).json({ ok: false, message: "ไม่พบใบเบิกค่าเดินทาง" });
    res.json({ ok: true, claim });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.delete("/api/admin/travel-claims/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const data = await adapter.deleteTravelClaim(id);
    if (!data || !data.length) return res.status(404).json({ ok: false, message: "ไม่พบใบเบิกค่าเดินทาง" });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ---------- บันทึกปฏิบัติงานนอกสถานที่ (Field Work) ----------
// ฟิลด์เวลา 4 ช่อง + ไฟล์แนบ: รับได้ทั้งแบบ JSON และ multipart (FormData)
const FIELD_WORK_TIME_KEYS = ["depart_branch_time", "arrive_site_time", "depart_site_time", "arrive_branch_time"];

function fieldWorkPayload(req) {
  const body = req.body || {};
  const attachments = [];
  if (Array.isArray(body.attachments)) {
    body.attachments.forEach((f) => {
      if (f && f.url) attachments.push({ name: String(f.name || "ไฟล์แนบ"), url: String(f.url) });
    });
  } else if (typeof body.attachments === "string" && body.attachments.trim()) {
    try {
      const parsed = JSON.parse(body.attachments);
      if (Array.isArray(parsed)) return fieldWorkPayloadWithAttachments(req, parsed);
    } catch (e) { /* ไม่ใช่ JSON → ไม่มีไฟล์แนบเดิม */ }
  }
  return fieldWorkPayloadWithAttachments(req, attachments);
}

function fieldWorkPayloadWithAttachments(req, attachments) {
  const body = req.body || {};
  const out = {
    ticketId: body.ticketId == null || body.ticketId === "" ? null : body.ticketId,
    ticketNo: body.ticketNo || "",
    sourceMode: body.sourceMode === "ticket" ? "ticket" : "manual",
    workDate: body.workDate || "",
    workTime: body.workTime || "",
    location: body.location || "",
    detail: body.detail || "",
    recorderName: body.recorderName || "",
    note: body.note || "",
    attachments
  };
  FIELD_WORK_TIME_KEYS.forEach((k) => { out[k] = body[k] || null; });
  return out;
}

// อัปโหลดไฟล์แนบหลักฐาน → คืนรายการ { name, url }
async function uploadFieldWorkFiles(files) {
  const out = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const safeName = String(f.originalname || "ไฟล์แนบ").replace(/[\\/:*?"<>|\r\n]/g, "_").slice(0, 120);
    const name = `fw-${Date.now()}-${i + 1}`;
    const up = await cloud.uploadDocument(f.buffer, name, f.mimetype);
    if (up && up.secure_url) out.push({ name: safeName, url: up.secure_url });
  }
  return out;
}

app.get("/api/admin/field-work", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const logs = await adapter.listFieldWorkLogs();
    res.json({ ok: true, logs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.get("/api/admin/field-work/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const log = await adapter.getFieldWorkLog(id);
    if (!log) return res.status(404).json({ ok: false, message: "ไม่พบรายการบันทึกปฏิบัติงานนอกสถานที่" });
    res.json({ ok: true, log });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/field-work", upload.array("files", 10), async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const payload = fieldWorkPayload(req);
    const files = req.files || [];
    if (files.length) {
      const uploaded = await uploadFieldWorkFiles(files);
      // ไฟล์เดิมที่เคยบันทึกไว้ (แก้ไข) + ไฟล์ใหม่
      payload.attachments = payload.attachments.concat(uploaded);
    }
    if (!payload.location) return res.status(400).json({ ok: false, message: "กรอกสถานที่ออกปฏิบัติงาน" });
    if (!payload.workDate) return res.status(400).json({ ok: false, message: "กรอกวันที่ทำงาน" });
    if (payload.sourceMode === "ticket" && !payload.ticketNo) {
      return res.status(400).json({ ok: false, message: "เลือกใบแจ้งซ่อมที่ต้องการดึงข้อมูล" });
    }
    const log = await adapter.createFieldWorkLog(payload);
    res.json({ ok: true, log });
  } catch (err) {
    console.error(err);
    const msg = /field_work_logs/.test(err.message || "")
      ? "ยังไม่ได้สร้างตาราง field_work_logs (รัน supabase-fieldwork.sql)"
      : "server error";
    res.status(500).json({ ok: false, message: msg });
  }
});

app.put("/api/admin/field-work/:id", upload.array("files", 10), async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const payload = fieldWorkPayload(req);
    const files = req.files || [];
    if (files.length) {
      const uploaded = await uploadFieldWorkFiles(files);
      payload.attachments = payload.attachments.concat(uploaded);
    }
    if (!payload.location) return res.status(400).json({ ok: false, message: "กรอกสถานที่ออกปฏิบัติงาน" });
    if (!payload.workDate) return res.status(400).json({ ok: false, message: "กรอกวันที่ทำงาน" });
    if (payload.sourceMode === "ticket" && !payload.ticketNo) {
      return res.status(400).json({ ok: false, message: "เลือกใบแจ้งซ่อมที่ต้องการดึงข้อมูล" });
    }
    const log = await adapter.updateFieldWorkLog(id, payload);
    if (!log) return res.status(404).json({ ok: false, message: "ไม่พบรายการบันทึกปฏิบัติงานนอกสถานที่" });
    res.json({ ok: true, log });
  } catch (err) {
    console.error(err);
    const msg = /field_work_logs/.test(err.message || "")
      ? "ยังไม่ได้สร้างตาราง field_work_logs (รัน supabase-fieldwork.sql)"
      : "server error";
    res.status(500).json({ ok: false, message: msg });
  }
});

app.delete("/api/admin/field-work/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const data = await adapter.deleteFieldWorkLog(id);
    if (!data || !data.length) return res.status(404).json({ ok: false, message: "ไม่พบรายการบันทึกปฏิบัติงานนอกสถานที่" });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ---------- ระบบบันทึกอุปกรณ์ที่นำมาซ่อม (Repair Intake) ----------
function repairIntakePayload(req) {
  const body = req.body || {};
  return {
    deviceType: String(body.device_type != null ? body.device_type : body.deviceType || "").trim(),
    model: String(body.model || "").trim(),
    branch: String(body.branch || "").trim(),
    photoUrl: String(body.photo_url != null ? body.photo_url : body.photoUrl || "").trim(),
    symptomPhotoUrl: String(body.symptom_photo_url != null ? body.symptom_photo_url : body.symptomPhotoUrl || "").trim(),
    detail: String(body.detail || "").trim(),
    status: String(body.status || "").trim()
  };
}

function repairIntakeValidate(payload) {
  if (!payload.deviceType) return "เลือกประเภทอุปกรณ์";
  if (!payload.model) return "กรอกชื่อรุ่น";
  return null;
}

app.get("/api/admin/repair-intakes", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const items = await adapter.listRepairIntakes();
    res.json({ ok: true, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.get("/api/admin/repair-intakes/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const item = await adapter.getRepairIntake(id);
    if (!item) return res.status(404).json({ ok: false, message: "ไม่พบรายการบันทึกอุปกรณ์ที่นำมาซ่อม" });
    res.json({ ok: true, item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// PDF อุปกรณ์ที่นำมาซ่อม (สร้างจาก Chrome headless — ไม่มีหัว/ท้ายกระดาษของเบราว์เซอร์)
app.get("/api/admin/repair-intakes/:id/pdf", async (req, res) => {
  const fail = function (status, msg) {
    if ((req.headers.accept || "").includes("text/html")) {
      res.status(status).type("html").send(
        '<!DOCTYPE html><html lang="th"><meta charset="utf-8"><title>PDF อุปกรณ์ที่ซ่อม</title>' +
        '<body style="font-family:sans-serif;text-align:center;padding:40px">' +
        "<h3>" + String(msg).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</h3>" +
        '<p><a href="/repair-intake-print.html?id=' + encodeURIComponent(req.params.id) + '">เปิดหน้าพิมพ์แทน</a></p>' +
        "</body></html>"
      );
    } else {
      res.status(status).json({ ok: false, message: msg });
    }
  };
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return fail(400, "รหัสไม่ถูกต้อง");
    if (!adapter.ready) return fail(500, "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env");
    // ถ้าไม่มี Chrome (เช่น รันบน Vercel/serverless) ให้พาไปหน้าพิมพ์ของเบราว์เซอร์แทน
    if (!riPdf.hasChrome()) return res.redirect("/repair-intake-print.html?id=" + encodeURIComponent(req.params.id));
    const item = await adapter.getRepairIntake(id);
    if (!item) return fail(404, "ไม่พบรายการบันทึกอุปกรณ์ที่นำมาซ่อม");
    const buffer = await riPdf.buildRepairIntakePdf(item);
    const filename = (item.intake_no || "repair-intake-" + id) + ".pdf";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="' + filename + '"');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    if (/chrome-not-found/.test(err.message || "")) return res.redirect("/repair-intake-print.html?id=" + encodeURIComponent(req.params.id));
    fail(500, "server error");
  }
});

app.post("/api/admin/repair-intakes", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const payload = repairIntakePayload(req);
    const invalid = repairIntakeValidate(payload);
    if (invalid) return res.status(400).json({ ok: false, message: invalid });
    payload.intakeNo = await adapter.genRepairIntakeNo();
    const item = await adapter.createRepairIntake(payload);
    res.json({ ok: true, item });
  } catch (err) {
    console.error(err);
    const msg = /repair_intakes/.test(err.message || "")
      ? "ยังไม่ได้สร้างตาราง repair_intakes (รัน supabase-repair-intake.sql)"
      : "server error";
    res.status(500).json({ ok: false, message: msg });
  }
});

app.put("/api/admin/repair-intakes/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const payload = repairIntakePayload(req);
    const invalid = repairIntakeValidate(payload);
    if (invalid) return res.status(400).json({ ok: false, message: invalid });
    const body = req.body || {};
    const sentNo = String(body.intake_no != null ? body.intake_no : body.intakeNo || "").trim();
    const existing = await adapter.getRepairIntake(id);
    if (!existing) return res.status(404).json({ ok: false, message: "ไม่พบรายการบันทึกอุปกรณ์ที่นำมาซ่อม" });
    payload.intakeNo = sentNo || String(existing.intake_no || "");
    const item = await adapter.updateRepairIntake(id, payload);
    if (!item) return res.status(404).json({ ok: false, message: "ไม่พบรายการบันทึกอุปกรณ์ที่นำมาซ่อม" });
    res.json({ ok: true, item });
  } catch (err) {
    console.error(err);
    const msg = /repair_intakes/.test(err.message || "")
      ? "ยังไม่ได้สร้างตาราง repair_intakes (รัน supabase-repair-intake.sql)"
      : "server error";
    res.status(500).json({ ok: false, message: msg });
  }
});

app.delete("/api/admin/repair-intakes/:id", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const data = await adapter.deleteRepairIntake(id);
    if (!data || !data.length) return res.status(404).json({ ok: false, message: "ไม่พบรายการบันทึกอุปกรณ์ที่นำมาซ่อม" });
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

// ---------- PASSWORD NOTE (เฉพาะ USER admin เท่านั้น) ----------
function requireAdminAuth(req, res, next) {
  if (isAdminAuthed(req)) return next();
  return res.status(401).json({ ok: false, message: "เฉพาะผู้ดูแลระบบ (USER admin) เท่านั้น" });
}

app.get("/api/admin/password-notes", requireAdminAuth, async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const rows = await adapter.listPasswordNotes({ limit: 500, includeSecret: false });
    res.json({ ok: true, notes: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || "server error" });
  }
});

app.post("/api/admin/password-notes", requireAdminAuth, async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const title = String((req.body || {}).title || "").trim();
    const username = String((req.body || {}).username || "").trim();
    const password = String((req.body || {}).password || "");
    if (!title) return res.status(400).json({ ok: false, message: "กรอกชื่อรหัสผ่านก่อน" });
    if (!username) return res.status(400).json({ ok: false, message: "กรอก username ก่อน" });
    if (!password) return res.status(400).json({ ok: false, message: "กรอกรหัสผ่านก่อน" });
    if (title.length > 200 || username.length > 300 || password.length > 500) {
      return res.status(400).json({ ok: false, message: "ข้อมูลยาวเกินไป" });
    }
    const encJson = pnEncrypt({ u: username, p: password });
    const id = await adapter.createPasswordNote({ title, encJson });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || "server error" });
  }
});

app.post("/api/admin/password-notes/reveal", requireAdminAuth, async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    // ผู้ใช้เข้าระบบ Admin ผ่าน session แล้ว (requireAdminAuth) จึงไม่ต้องขอ PIN ซ้ำ
    const rows = await adapter.listPasswordNotes({ limit: 500, includeSecret: true });
    const out = rows.map((r) => {
      try {
        const d = pnDecrypt(r.enc_json);
        return { id: r.id, title: r.title, username: d.u, password: d.p, created_at: r.created_at };
      } catch (e) {
        console.warn("[security] ถอดรหัสไม่สำเร็จ (รายการ " + r.id + "): " + e.message);
        return {
          id: r.id,
          title: r.title,
          username: "",
          password: "",
          created_at: r.created_at,
          error: "ถอดรหัสไม่สำเร็จ — อาจถูกบันทึกด้วยคีย์เดิม"
        };
      }
    });
    res.json({ ok: true, notes: out });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || "server error" });
  }
});

app.post("/api/admin/password-notes/verify", requireAdminAuth, (req, res) => {
  const pass = String(((req.body || {}).pass || ""));
  if (!pass) {
    return res.status(400).json({ ok: false, message: "กรอกรหัสผ่านก่อน" });
  }
  const h1 = crypto.createHash("sha256").update(String(pass)).digest();
  const h2 = crypto.createHash("sha256").update(PN_PASS).digest();
  if (h1.length !== h2.length || !crypto.timingSafeEqual(h1, h2)) {
    return res.status(401).json({ ok: false, message: "รหัสผ่านไม่ถูกต้อง" });
  }
  res.json({ ok: true });
});

app.delete("/api/admin/password-notes/:id", requireAdminAuth, async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "รหัสไม่ถูกต้อง" });
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const data = await adapter.deletePasswordNote(id);
    if (!data || !data.length) return res.status(404).json({ ok: false, message: "ไม่พบบันทึกรหัสผ่านนี้" });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ---------- ตั้งค่าสิทธิ์การเข้าใช้งานระบบ (System Users) ----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return "scrypt$" + salt + "$" + hash;
}

function verifyPassword(password, stored) {
  try {
    const parts = String(stored || "").split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const hash = crypto.scryptSync(String(password), parts[1], 64).toString("hex");
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(parts[2], "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (err) {
    return false;
  }
}

const SYSTEM_PERMISSION_KEYS = [
  "repairNotes", "tickets", "devices", "visitors", "deviceNotes",
  "maintenance", "workNotes", "warranty", "analytics", "worklog", "settings",
  "travelExpense", "driveNotes"
];

function sanitizePermissions(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  raw.forEach((p) => {
    const key = String(p).trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  });
  return out;
}

app.get("/api/admin/system-users", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const users = await adapter.listSystemUsers();
    res.json({ ok: true, users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/admin/system-users", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const body = req.body || {};
    const username = String(body.username || "").trim().replace(/\s+/g, "");
    const password = String(body.password || "");
    if (!username) return res.status(400).json({ ok: false, message: "กรอกชื่อผู้ใช้ก่อน" });
    if (username.length > 50) return res.status(400).json({ ok: false, message: "ชื่อผู้ใช้ยาวเกินไป (สูงสุด 50 ตัว)" });
    if (!password) return res.status(400).json({ ok: false, message: "กรอกรหัสผ่านก่อน" });
    if (password.length < 4) return res.status(400).json({ ok: false, message: "รหัสผ่านสั้นเกินไป (อย่างน้อย 4 ตัว)" });
    const permissions = sanitizePermissions(body.permissions);
    const user = await adapter.createSystemUser({
      username,
      password_hash: hashPassword(password),
      permissions,
      note: String(body.note || "").trim()
    });
    res.json({ ok: true, user });
  } catch (err) {
    console.error(err);
    if ((err && err.code === "23505") || /duplicate key|already exists/i.test(String(err && err.message))) {
      return res.status(409).json({ ok: false, message: "ชื่อผู้ใช้นี้มีอยู่แล้วในระบบ" });
    }
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.put("/api/admin/system-users/:username", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const username = String(req.params.username || "").trim();
    if (!username) return res.status(400).json({ ok: false, message: "ชื่อผู้ใช้ไม่ถูกต้อง" });
    const body = req.body || {};
    const patch = {};
    if (body.password != null && body.password !== "") {
      const password = String(body.password);
      if (password.length < 4) return res.status(400).json({ ok: false, message: "รหัสผ่านสั้นเกินไป (อย่างน้อย 4 ตัว)" });
      patch.password_hash = hashPassword(password);
    }
    if (body.permissions != null) {
      patch.permissions = JSON.stringify(sanitizePermissions(body.permissions));
    }
    if (body.note != null) {
      patch.note = String(body.note).trim();
    }
    patch.updated_at = new Date().toISOString();
    if (Object.keys(patch).length <= 1) return res.status(400).json({ ok: false, message: "ไม่มีข้อมูลให้แก้ไข" });
    const user = await adapter.updateSystemUser(username, patch);
    if (!user) return res.status(404).json({ ok: false, message: "ไม่พบผู้ใช้งานนี้" });
    res.json({ ok: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.delete("/api/admin/system-users/:username", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    const username = String(req.params.username || "").trim();
    if (!username) return res.status(400).json({ ok: false, message: "ชื่อผู้ใช้ไม่ถูกต้อง" });
    const data = await adapter.deleteSystemUser(username);
    if (!data || !data.length) return res.status(404).json({ ok: false, message: "ไม่พบผู้ใช้งานนี้" });
    res.json({ ok: true, username });
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


// GET /api/tickets/mine — ประวัติการแจ้งซ่อมของฉัน (ผู้ใช้ภายนอก) อ่านอย่างเดียว
// ดูได้เฉพาะงานของตัวเอง (ผูก visitor_id) ไม่มีปุ่มแก้ไข/ลบ
app.get("/api/tickets/mine", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const visitor = await requireVisitorSession(req);
    if (!visitor) {
      return res.status(401).json({
        ok: false,
        needsIdentity: true,
        registered: !!(await resolveVisitor(req)),
        message: "กรุณากรอกชื่อและตำแหน่ง หรือใช้ Key Pass ก่อนดูประวัติ"
      });
    }
    const reporterName = (visitor.name + (visitor.position ? (" · " + visitor.position) : "")).trim();
    let tickets = await adapter.listMyTickets(visitor.id, reporterName);
    if (tickets && tickets.length) {
      const ids = tickets.map((t) => t.id).filter(Boolean);
      let photoRows = [];
      if (ids.length) {
        if (adapter.mode === "supabase") {
          const { data } = await adapter.supabase
            .from("ticket_photos")
            .select("ticket_id, cloud_url")
            .in("ticket_id", ids)
            .order("sort_order", { ascending: true });
          photoRows = data || [];
        } else {
          const r = await adapter.pool.query(
            `SELECT ticket_id, cloud_url FROM ticket_photos WHERE ticket_id = ANY($1) ORDER BY sort_order ASC`,
            [ids]
          );
          photoRows = r.rows;
        }
      }
      const byTicket = {};
      photoRows.forEach((p) => {
        (byTicket[p.ticket_id] = byTicket[p.ticket_id] || []).push(p.cloud_url);
      });
      tickets = tickets.map((t) => ({ ...t, photos: byTicket[t.id] || [] }));
    }
    res.json({
      ok: true,
      visitor: publicVisitor(visitor),
      tickets
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.get("/api/tickets/:ticketNo/status", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const ticketNo = String(req.params.ticketNo || "").trim();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    // ต้องเป็นเจ้าของใบแจ้งซ่อม (หรือฝ่าย IT) — ห้ามเปิดดูของคนอื่นโดยเดาหมายเลข
    if (!isAdminAuthed(req) && !isUserAuthed(req)) {
      const visitor = await requireVisitorSession(req);
      if (!visitor) {
        return res.status(401).json({ ok: false, message: "กรุณาเข้าสู่ระบบก่อนดูสถานะงาน" });
      }
      const owner = await adapter.getTicketOwner(ticketNo);
      if (!owner || String(owner.visitor_id || "") !== String(visitor.id)) {
        return res.status(404).json({ ok: false, message: "ไม่พบงาน " + ticketNo });
      }
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

// พนักงานต้องมีสิทธิ์ "tickets" ถึงจะแก้สถานะ/ปิดงาน/ลบใบแจ้งซ่อมได้ (admin เข้าได้ทุกอัน)
async function suOrAdminTicketPerm(req, res, next) {
  if (isAdminAuthed(req)) return next();
  const username = isUserAuthed(req);
  if (username) {
    try {
      const su = await loadSuUser(username);
      if (su && (su.permissions || []).indexOf("tickets") !== -1) {
        req.suUser = su;
        return next();
      }
    } catch (err) {
      console.error("[auth] ตรวจสิทธิ์ใบแจ้งซ่อมไม่สำเร็จ:", err.message);
    }
  }
  return res.status(403).json({ ok: false, message: "ไม่มีสิทธิ์ดำเนินการในส่วนนี้" });
}

app.put("/api/tickets/:ticketNo", suOrAdminTicketPerm, async (req, res) => {
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

app.delete("/api/tickets/:ticketNo", suOrAdminTicketPerm, async (req, res) => {
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

app.post("/api/tickets/:ticketNo/status", suOrAdminTicketPerm, async (req, res) => {
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
        const owner = await db.getAdapter().getTicketOwner(data.ticket_no);
        if (owner && owner.visitor_id) {
          notif.pushToVisitor(owner.visitor_id, {
            type: "approved",
            ticketNo: data.ticket_no,
            at: data.approved_at || approvedAt
          });
        }
      } catch (e) {
        console.warn("[notify] ส่งแจ้งเตือนไม่สำเร็จ:", e.message);
      }
    }

    res.json({ ok: true, ticketNo, status: data.status, pdfUrl: data.pdf_url || "" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.post("/api/tickets/:ticketNo/finish", suOrAdminTicketPerm, upload.array("photos", 3), async (req, res) => {
  try {
    const adapter = db.getAdapter();
    const ticketNo = String(req.params.ticketNo || "").trim();
    if (!adapter.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่าฐานข้อมูลใน .env" });
    }
    const finishedAtRaw = String((req.body || {}).finished_at || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(finishedAtRaw)) {
      return res.status(400).json({ ok: false, message: "ระบุวันที่และเวลาที่เสร็จสิ้นให้ครบ" });
    }
    const statusDate = finishedAtRaw.slice(0, 10);
    const statusTime = finishedAtRaw.slice(11, 16);

    const files = (req.files || []).filter(Boolean);
    if (files.length > 3) {
      return res.status(400).json({ ok: false, message: "แนบภาพได้ไม่เกิน 3 รูป" });
    }

    const patch = {
      status: "done",
      status_date: statusDate,
      status_time: statusTime,
      approved_at: new Date().toISOString()
    };

    let data;
    if (adapter.mode === "supabase") {
      const { data: result, error } = await adapter.supabase
        .from("tickets")
        .update(patch)
        .eq("ticket_no", ticketNo)
        .select("*, ticket_photos(id, cloud_url)")
        .single();
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

    const urls = [];
    for (let i = 0; i < files.length; i++) {
      const up = await cloud.uploadImage(files[i].buffer, `${ticketNo}-d${i + 1}`, files[i].mimetype);
      if (up && up.secure_url) urls.push(up.secure_url);
    }
    if (urls.length) await adapter.addPhotos(data.id, urls);

    res.json({ ok: true, ticketNo, status: "done", statusDate, statusTime });
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
// ---------- ตั้งค่าฐานข้อมูล (หน้า admin-db.html) ----------
// ============================================================

// เขียน/แก้ค่าใน .env (กันดักค่าเดิมซ้ำ)
function envUpsertSync(values) {
  const envPath = path.join(__dirname, ".env");
  let text = fsSync.existsSync(envPath) ? fsSync.readFileSync(envPath, "utf8") : "";
  for (const key of Object.keys(values)) {
    const re = new RegExp("^" + key + "=.*$", "m");
    const line = key + "=" + String(values[key]);
    if (re.test(text)) {
      text = text.replace(re, line);
    } else {
      text = (text.endsWith("\n") || text === "" ? text : text + "\n") + line + "\n";
    }
  }
  fsSync.writeFileSync(envPath, text, "utf8");
}

// อ่านสถานะ + ค่าปัจจุบันของทั้ง Supabase และ PGSQL
app.get("/api/admin/db-config", async (req, res) => {
  try {
    const adapter = db.getAdapter();

    const supa = {
      url: config.SUPABASE_URL || "",
      secretKey: config.SUPABASE_SECRET_KEY || "",
      serviceRoleKey: config.SUPABASE_SERVICE_ROLE_KEY || "",
      connected: false,
      message: "ยังไม่ได้ตั้งค่า Supabase ใน .env",
    };
    if (adapter.ready) {
      const t = await adapter.testConnection();
      supa.connected = !!t.ok;
      supa.message = t.message || "";
    }

    const pg = {
      configured: migrate.hasPgConfig(),
      host: config.PG_HOST || "",
      port: String(config.PG_PORT || "5432"),
      database: config.PG_DATABASE || "",
      user: config.PG_USER || "",
      password: config.PG_PASSWORD || "",
      ssl: String(config.PG_SSL) === "true",
      connected: false,
      message: "ยังไม่ได้ตั้งค่า PGSQL (กดแก้ไขฐานข้อมูลเพื่อตั้ง)",
      tableCount: 0,
      tables: [],
    };

    if (pg.configured) {
      const { Pool } = require("pg");
      const pool = new Pool({ ...migrate.getPgOptionsFromConfig(), connectionTimeoutMillis: 6000, max: 2 });
      try {
        await pool.query("SELECT 1");
        pg.connected = true;
        pg.message = "เชื่อมต่อ PostgreSQL สำเร็จ";
        const tables = await migrate.listPgTables(pool);
        pg.tables = tables;
        pg.tableCount = tables.length;
      } catch (e) {
        pg.connected = false;
        pg.message = "เชื่อมต่อ PostgreSQL ล้มเหลว: " + e.message;
      } finally {
        await pool.end().catch(() => {});
      }
    }

    res.json({ ok: true, supabase: supa, pg, lastSync: migrate.getLastSync() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ยืนยันรหัสผ่านก่อนแก้ไข (รหัส wan2024* = PASSWORD_NOTE_PASS)
app.post("/api/admin/db-config/verify-pass", async (req, res) => {
  try {
    const pass = String((req.body || {}).password || "");
    if (pass === config.PASSWORD_NOTE_PASS) {
      return res.json({ ok: true, message: "รหัสผ่านถูกต้อง" });
    }
    return res.json({ ok: false, message: "รหัสผ่านไม่ถูกต้อง" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ยืนยันตัวบุคคลสำหรับเข้าหน้าระบบฐานข้อมูล (admin / wan2024)
app.post("/api/admin/db-config/verify-admin", async (req, res) => {
  try {
    const user = String(((req.body || {}).user || "")).trim();
    const pass = String((req.body || {}).pass || "");
    if (user === config.ADMIN_USER && pass === config.ADMIN_PASS) {
      return res.json({ ok: true, message: "ยืนยันตัวตนสำเร็จ" });
    }
    return res.json({ ok: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// บันทึกค่าฐานข้อมูล PGSQL (ต้องรหัสผ่านถูกก่อน) -> ทดสอบจริง -> เขียน .env
app.post("/api/admin/db-config/save-pg", async (req, res) => {
  try {
    const body = req.body || {};
    if (String(body.password || "") !== config.PASSWORD_NOTE_PASS) {
      return res.status(403).json({ ok: false, message: "รหัสผ่านไม่ถูกต้อง" });
    }

    const host = String(body.host || "").trim();
    const database = String(body.database || "").trim();
    const user = String(body.user || "").trim();
    const pgpass = String(body.pgpass || "");
    const port = String(body.port || "5432").trim();
    const ssl = body.ssl === true || body.ssl === "true";

    if (!host || !database || !user) {
      return res.status(400).json({ ok: false, message: "กรุณาระบุ Host, Database และ User" });
    }

    const { Pool } = require("pg");
    const pool = new Pool({
      host,
      port: Number(port) || 5432,
      database,
      user,
      password: pgpass,
      ssl: ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 6000,
      max: 2,
    });

    let tables = [];
    let tableCount = 0;
    try {
      await pool.query("SELECT 1");
      tables = await migrate.listPgTables(pool);
      tableCount = tables.length;
    } catch (e) {
      await pool.end().catch(() => {});
      return res.json({ ok: false, message: "ไม่สามารถเชื่อมต่อได้: " + e.message });
    }
    await pool.end().catch(() => {});

    const updates = {
      PG_HOST: host,
      PG_PORT: String(Number(port) || 5432),
      PG_DATABASE: database,
      PG_USER: user,
      PG_PASSWORD: pgpass,
      PG_SSL: ssl ? "true" : "false",
    };

    let persisted = true;
    try {
      envUpsertSync(updates);
      config.PG_HOST = updates.PG_HOST;
      config.PG_PORT = updates.PG_PORT;
      config.PG_DATABASE = updates.PG_DATABASE;
      config.PG_USER = updates.PG_USER;
      config.PG_PASSWORD = updates.PG_PASSWORD;
      config.PG_SSL = updates.PG_SSL;
    } catch (e) {
      persisted = false;
    }

    res.json({
      ok: true,
      persisted,
      message: "เชื่อมต่อฐานข้อมูลได้ถูกต้อง" + (persisted ? "" : " (แต่โฮสต์นี้บันทึกถาวรลง .env ไม่ได้)"),
      tableCount,
      tables,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// ถ่ายโอนข้อมูล Supabase → PGSQL (ใช้ค่าที่บันทึกไว้)
app.post("/api/admin/db-sync/start", async (req, res) => {
  try {
    const adapter = db.getAdapter();
    if (adapter.mode !== "supabase" || !adapter.ready) {
      return res.status(400).json({ ok: false, message: "ต้องเชื่อมต่อ Supabase ก่อนถึงจะถ่ายโอนได้" });
    }
    if (!migrate.hasPgConfig()) {
      return res.status(400).json({ ok: false, message: "ยังไม่ได้ตั้งค่า PGSQL (กดบันทึกก่อน)" });
    }
    const jobId = migrate.runSyncFromConfig();
    res.json({ ok: true, jobId, message: "เริ่มถ่ายโอนข้อมูลแล้ว" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

// สถานะการถ่ายโอนรอบล่าสุด
app.get("/api/admin/db-sync/status", async (req, res) => {
  try {
    res.json({ ok: true, lastSync: migrate.getLastSync() });
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
    // เปิดคอม/เปิดเซิร์ฟเวอร์ -> ถ้ามี PGSQL ตั้งไว้ ให้ถ่ายข้อมูลมาให้อัตโนมัติ
    try {
      if (migrate.hasPgConfig() && db.getAdapter().ready) {
        const jobId = migrate.runSyncFromConfig();
        console.log(`[auto-sync] เริ่มถ่ายโอนข้อมูล Supabase → PostgreSQL (job=${jobId})`);
      }
    } catch (err) {
      console.error("[auto-sync] เกิดข้อผิดพลาด:", err.message);
    }
  });
}
