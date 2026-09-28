const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const FONT_REGULAR = path.join(__dirname, "fonts", "Sarabun-Regular.ttf");
const FONT_BOLD = path.join(__dirname, "fonts", "Sarabun-Bold.ttf");
const FONT_SEMIBOLD = path.join(__dirname, "fonts", "Sarabun-SemiBold.ttf");

const hasFonts = () =>
  [FONT_REGULAR, FONT_BOLD, FONT_SEMIBOLD].every((f) => {
    try {
      return fs.statSync(f).size > 0;
    } catch (e) {
      return false;
    }
  });

const STATUS_LABEL = {
  new: "งานใหม่",
  working: "กำลังดำเนินการ",
  done: "เสร็จสิ้น"
};

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

function thaiLongDate(d, withTime) {
  if (!(d instanceof Date) || isNaN(d)) return "-";
  let out = String(d.getDate()) + " " + THAI_MONTHS[d.getMonth()] + " " + String(d.getFullYear() + 543);
  if (withTime) {
    const pad = (n) => String(n).padStart(2, "0");
    out += " เวลา " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + " น.";
  }
  return out;
}

function thaiTime(d) {
  if (!(d instanceof Date) || isNaN(d)) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  return pad(d.getHours()) + ":" + pad(d.getMinutes()) + " น.";
}

function parseLoc(loc) {
  if (!loc) return { branch: "-", position: "-" };
  const i = String(loc).indexOf(" · ");
  if (i > -1) return { branch: String(loc).slice(0, i), position: String(loc).slice(i + 3) };
  return { branch: String(loc), position: "-" };
}

// สร้าง PDF ใบแจ้งซ่อม (แบบฟอร์มราชการ แบบตารางเส้นบาง ฟอนต์ Sarabun)
function buildTicketPdf(ticket) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 60, bottom: 64, left: 75, right: 55 },
    info: {
      Title: "ใบแจ้งซ่อม " + (ticket.ticket_no || ""),
      Author: "ระบบแจ้งซ่อม IT"
    }
  });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const W = doc.page.width;
  const M = doc.page.margins.left;
  const rightM = doc.page.margins.right;
  const contentW = W - M - rightM;
  const BLACK = "#111";

  // ---- หัวเอกสาร ----
  doc.font(FONT_SEMIBOLD).fontSize(20).fillColor(BLACK).text("ระบบแจ้งซ่อม IT", { align: "center" });
  doc.moveDown(0.2);
  const headLineY = doc.y;
  doc.moveTo(M + 30, headLineY).lineTo(W - rightM - 30, headLineY).lineWidth(1).strokeColor(BLACK).stroke();
  doc.moveDown(0.5);
  doc.font(FONT_BOLD).fontSize(18).fillColor(BLACK).text("ใบแจ้งซ่อม", { align: "center" });
  doc.moveDown(0.3);

  // หัวกระดาษ: เลขที่ / วันที่ / เวลา (ข้อความปกติ ไม่หนา เว้นระยะห่างชัดเจน)
  const noText = "เลขที่ : " + (ticket.ticket_no || "-");
  const dateText = "วันที่ : " + thaiLongDate(new Date(ticket.created_at), false);
  const timeText = "เวลา : " + thaiTime(new Date(ticket.created_at));
  doc.font(FONT_REGULAR).fontSize(11).fillColor(BLACK);
  const segGap = 32;
  let segX = M;
  let segY = doc.y;
  [noText, dateText, timeText].forEach(function (seg) {
    const w = doc.widthOfString(seg);
    if (segX !== M && segX + w > W - rightM) {
      segY += 18;
      segX = M;
    }
    doc.text(seg, segX, segY, { lineBreak: false });
    segX += w + segGap;
  });
  doc.y = segY + 18;
  doc.moveDown(0.6);

  // ---- ข้อมูลสำหรับตาราง ----
  const loc = parseLoc(ticket.location);
  const place = [loc.branch, loc.position].filter(Boolean).join(" · ") || "-";
  const rows = [
    ["หมวด / อุปกรณ์", ticket.device || "-"],
    ["สถานะงาน", STATUS_LABEL[ticket.status] || ticket.status || "-"],
    ["วันที่แจ้ง", thaiLongDate(new Date(ticket.created_at), true)],
    ["สถานที่", place],
    ["ผู้แจ้ง", ticket.reporter_name || "-"],
    ["โทรศัพท์", ticket.reporter_phone || "-"],
    ["บัญชี Line", ticket.reporter_line_id || "-"],
    ["ผู้รับผิดชอบ", ticket.handler_name || "-"],
    ["รายละเอียด", ticket.symptom || "-"]
  ];

  // ---- ตารางเส้นบาง ----
  const labelW = 110;
  const cellPad = 7;
  const valueW = contentW - labelW;
  const tableBottomLimit = doc.page.height - 96;
  let y = doc.y;
  let segTop = y;
  let segRows = [];
  const fontSize = 11;

  function drawSubRow(label, value, rowH) {
    segRows.push({ y: y, h: rowH });
    doc.font(FONT_BOLD).fontSize(fontSize).fillColor(BLACK);
    doc.text(label, M + cellPad, y + cellPad, { width: labelW - cellPad * 2, lineBreak: false });
    doc.font(FONT_REGULAR).fontSize(fontSize).fillColor(BLACK);
    doc.text(value, M + labelW + cellPad, y + cellPad, { width: valueW - cellPad * 2 });
    y += rowH;
  }

  function closeSegment() {
    if (!segRows.length) return;
    const lastY = segRows[segRows.length - 1].y + segRows[segRows.length - 1].h;
    doc.save();
    doc.lineWidth(0.6).strokeColor("#333");
    doc.rect(M, segTop, contentW, lastY - segTop).stroke();
    doc.moveTo(M + labelW, segTop).lineTo(M + labelW, lastY).stroke();
    for (const r of segRows) {
      if (r.y > segTop) {
        doc.moveTo(M, r.y).lineTo(W - rightM, r.y).stroke();
      }
    }
    doc.restore();
  }

  function fitTextToHeight(text, maxH) {
    doc.font(FONT_REGULAR).fontSize(fontSize);
    if (doc.heightOfString(text, { width: valueW - cellPad * 2 }) <= maxH) return text;
    let lo = 1, hi = text.length, best = 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const h = doc.heightOfString(text.slice(0, mid), { width: valueW - cellPad * 2 });
      if (h <= maxH) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return text.slice(0, best);
  }

  function emitRow(label, rawValue) {
    let value = String(rawValue == null ? "" : rawValue);
    let first = true;
    let guard = 0;
    while (true) {
      if (guard++ > 80) break;
      const avail = tableBottomLimit - y;
      if (avail < 26) {
        closeSegment();
        doc.addPage();
        y = doc.page.margins.top;
        segTop = y;
      }
      doc.font(FONT_BOLD).fontSize(fontSize);
      const labelH = first ? doc.heightOfString(label, { width: labelW - cellPad * 2 }) : 12;
      doc.font(FONT_REGULAR).fontSize(fontSize);
      const valueH = doc.heightOfString(value, { width: valueW - cellPad * 2 });
      const rowH = Math.max(labelH, valueH) + cellPad * 2;
      if (rowH <= tableBottomLimit - y || !first || value.length <= 1) {
        drawSubRow(first ? label : "", value, rowH);
        first = false;
        break;
      }
      // ข้อความยาวเกินพื้นที่เหลือหน้า -> ตัดเป็นท่อนให้พอดีหน้า
      const maxTextH = Math.max(12, tableBottomLimit - y - cellPad * 2 - Math.max(labelH, 12));
      const chunk = fitTextToHeight(value, maxTextH);
      if (!chunk || chunk.length >= value.length) {
        drawSubRow(first ? label : "", value, rowH);
        first = false;
        break;
      }
      drawSubRow(first ? label : "", chunk, Math.max(24, doc.heightOfString(chunk, { width: valueW - cellPad * 2 }) + cellPad * 2));
      first = false;
      value = value.slice(chunk.length);
      if (!value.trim()) break;
    }
  }

  rows.forEach((r) => emitRow(r[0], r[1]));
  closeSegment();

  // ---- ท้ายเอกสาร ----
  const footerTop = doc.page.height - 70;
  doc.font(FONT_REGULAR).fontSize(9).fillColor("#777").text(
    "เอกสารนี้สร้างโดยอัตโนมัติจากระบบแจ้งซ่อม IT  •  " + thaiLongDate(new Date(), true),
    M,
    footerTop,
    { width: contentW, align: "center", lineBreak: false }
  );
  doc.moveTo(M, footerTop + 14).lineTo(W - rightM, footerTop + 14).lineWidth(0.6).strokeColor("#bbb").stroke();

  doc.end();
  return { stream: done, filename: (ticket.ticket_no || "ticket") + ".pdf" };
}

module.exports = { buildTicketPdf, hasFonts, thaiLongDate };