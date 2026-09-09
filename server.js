const express = require("express");
const multer = require("multer");
const path = require("path");

const config = require("./config");
const supab = require("./supabase");
const cloud = require("./cloudinary");
const line = require("./lineClient");
const archive = require("./archive");

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
    const reporterLineId = String(body.reporter_line_id || req.query.uid || "").trim();

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

    await line.notifyAdminTicket({ ticketNo, device, symptom, location, urls, name, phone });
    await line.notifyUserSubmitted({ ticketNo, reporterLineId });

    res.json({ ok: true, ticketNo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "server error" });
  }
});

app.get("/admin", (req, res) => res.redirect("/admin.html"));

app.get("/api/config", (req, res) => {
  res.json({
    liffId: config.LIFF_ID || "",
    lineOaUrl: config.LINE_OA_URL || "https://line.me/",
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

app.get("/api/user/tickets", async (req, res) => {
  try {
    const uid = String(req.query.uid || "").trim();
    if (!uid) {
      return res.status(400).json({ ok: false, message: "ไม่มีรหัสผู้ใช้" });
    }
    if (!supab.ready) {
      return res.status(500).json({ ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" });
    }
    const { data, error } = await supab.supabase
      .from("tickets")
      .select("ticket_no,device,symptom,location,status,approved_at,created_at,pdf_url")
      .eq("reporter_line_id", uid)
      .order("id", { ascending: false })
      .limit(50);
    if (error && /approved_at/.test(error.message)) {
      const retry = await supab.supabase
        .from("tickets")
        .select("ticket_no,device,symptom,location,status,created_at,pdf_url")
        .eq("reporter_line_id", uid)
        .order("id", { ascending: false })
        .limit(50);
      if (retry.error) throw retry.error;
      return res.json({ ok: true, tickets: retry.data || [] });
    }
    if (error) throw error;
    res.json({ ok: true, tickets: data || [] });
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
    await line.notifyStatus({
      ticketNo,
      status,
      reporterLineId: data.reporter_line_id || "",
      approvedAt: status === "done" ? data.approved_at || approvedAt : data.approved_at || null
    });

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

if (line.middleware) {
  app.post("/webhook", line.middleware, (req, res) => {
    res.sendStatus(200);
    const events = (req.body && req.body.events) || [];
    Promise.all(
      events.map(async (ev) => {
        if (ev.type === "message" && ev.message.type === "text") {
          const uid = (ev.source && ev.source.userId) || "";
          let name = "";
          if (uid) {
            try {
              const p = await line.getProfile(uid);
              name = p.displayName || "";
            } catch (e) {}
          }
          const prefix = name ? `[ผู้ใช้ ${name}] ` : "";
          await line.pushTextToAdmin(prefix + ev.message.text);
          await line.reply(ev.replyToken, {
            type: "text",
            text: "ส่งข้อความถึงทีม IT แล้ว เดี๋ยวจะติดต่อกลับเร็ว ๆ นี้ครับ"
          });
        }
      })
    ).catch((err) => console.error("[webhook]", err));
  });
} else {
  console.log("[webhook] ข้ามตั้งค่า (Channel Secret ยังไม่พร้อม)");
}

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(config.PORT, () => {
    console.log(`Server เริ่มที่ http://localhost:${config.PORT}`);
  });
}