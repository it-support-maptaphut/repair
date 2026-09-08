const zlib = require("zlib");

// ควบแน่นข้อมูลใบแจ้งซ่อมทั้งหมด (ข้อมูล + รูปภาพ) ให้เป็นไฟล์ gzip ไฟล์เดียว
// เพื่อเก็บรักษาข้อมูลถาวรขนาดเล็กที่สุด
async function buildArchiveBuffer(ticketRow) {
  const photos = [];
  for (let i = 0; i < (ticketRow.ticket_photos || []).length; i++) {
    const p = ticketRow.ticket_photos[i];
    if (!p || !p.cloud_url || !/^https?:/.test(p.cloud_url)) continue;
    try {
      const res = await fetch(p.cloud_url, { redirect: "follow" });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      photos.push({
        name: String(p.cloud_url.split("/").pop() || "photo-" + (i + 1)),
        mime: res.headers.get("content-type") || "image/jpeg",
        data: buf.toString("base64")
      });
    } catch (err) {
      console.warn("[Archive] ดึงภาพ " + p.cloud_url + " ไม่สำเร็จ: " + err.message);
    }
  }

  const payload = {
    meta: {
      ticket_no: ticketRow.ticket_no,
      device: ticketRow.device,
      symptom: ticketRow.symptom,
      location: ticketRow.location,
      reporter_name: ticketRow.reporter_name || "",
      reporter_phone: ticketRow.reporter_phone || "",
      reporter_line_id: ticketRow.reporter_line_id || "",
      status: ticketRow.status || "done",
      created_at: ticketRow.created_at,
      archived_at: new Date().toISOString()
    },
    photos
  };

  const buffer = zlib.gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), { level: 9 });
  return { buffer, photoCount: photos.length };
}

function decompress(buffer) {
  return JSON.parse(zlib.gunzipSync(buffer).toString("utf8"));
}

module.exports = { buildArchiveBuffer, decompress };