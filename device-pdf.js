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
  claim: "กำลังส่งเคลม",
  repairing: "กำลังส่งซ่อม",
  repair: "อยู่ระหว่างซ่อมบำรุง",
  done: "เสร็จแล้ว",
  ok: "ปกติ"
};

function padDate(s) {
  if (!s) return "-";
  const d = new Date(s + (s.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d)) return s;
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
}

function wrapContainer(doc, fn) {
  const yStart = doc.y;
  fn();
  return { height: doc.y - yStart };
}

// สร้าง PDF เอกสารโน้ตอุปกรณ์ (จัดหน้าแบบทางการ ขาวดำ ฟอนต์ Sarabun)
function buildDeviceEntryPdf(entry, options) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 56, left: 60, right: 60 },
    info: {
      Title: "โน้ตอุปกรณ์ " + (entry.entry_no || ""),
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
  const M = 60;
  const contentW = W - M * 2;
  const BLACK = "#1c1c1c";

  // ---- หัวเรื่อง (TEXT หัวเรื่อง) ----
  doc.font(FONT_BOLD).fontSize(24).fillColor(BLACK).text("ใบรับแจ้งอุปกรณ์ชำรุด / ส่งเคลม", { align: "center" });
  doc.moveDown(0.4);
  doc.moveTo(M + 40, doc.y).lineTo(W - M - 40, doc.y).lineWidth(1.4).strokeColor(BLACK).stroke();
  doc.moveDown(0.8);

  // ---- ตารางรายละเอียดหลัก ----
  const rows = [
    ["ประเภท / หมวดอุปกรณ์", entry.category || "-"],
    ["รุ่นสินค้า (Model)", entry.model || "-"],
    ["เลขประกัน / รหัสเคลม", entry.warranty_no || "-"],
    ["วันที่หมดประกัน", entry.warranty_expire_date ? padDate(entry.warranty_expire_date) : "-"],
    ["บริษัทที่เคลม", entry.claim_company || "-"],
    ["สถานะ", STATUS_LABEL[entry.status] || entry.status || "-"],
    ["วันที่พัง", padDate(entry.broken_date)],
    ["วันที่ส่งเคลม", padDate(entry.claim_date)],
    ["รหัสทรัพย์สินของบริษัท", entry.asset_code || "-"]
  ];

  const cellPad = 8;
  let rowH = 26;
  const labelW = 150;

  const drawRow = (label, value, isLast) => {
    const y = doc.y;
    const x0 = M;
    const x1 = M + labelW;
    const x2 = W - M;
    // label cell
    doc.font(FONT_BOLD).fontSize(12).fillColor(BLACK);
    doc.text(label, x0 + cellPad, y + 6, { width: labelW - cellPad * 2, lineBreak: false });
    doc.text(value, x1 + cellPad, y + 6, { width: (x2 - x1) - cellPad * 2, lineBreak: false });
    // box border
    doc.rect(x0, y, labelW, rowH).stroke();
    doc.rect(x1, y, x2 - x1, rowH).stroke();
    doc.y = y + rowH;
  };

  rows.forEach((r, i) => drawRow(r[0], r[1], i === rows.length - 1));
  doc.moveDown(0.8);

  // ---- หมายเหตุ ----
  if (entry.notes) {
    doc.font(FONT_BOLD).fontSize(13).text("หมายเหตุ");
    doc.moveDown(0.3);
    doc.font(FONT_REGULAR).fontSize(11).text(entry.notes, M, doc.y, { width: contentW, lineBreak: true });
    doc.moveDown(0.8);
  }

  // ---- ส่วนท้าย (ยึดท้ายหน้าหลักเสมอ, ต้องไม่เกินขอบล่างของหน้า) ----
  const footerTop = doc.page.height - 70;
  doc.font(FONT_REGULAR).fontSize(9).fillColor("#777").text(
    "เอกสารนี้สร้างโดยอัตโนมัติจากระบบแจ้งซ่อม IT  •  " + new Date().toLocaleString("th-TH", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    M,
    footerTop,
    { width: contentW, align: "center", lineBreak: false }
  );
  doc.moveTo(M, footerTop + 14).lineTo(W - M, footerTop + 14).lineWidth(0.6).strokeColor("#bbb").stroke();
  doc.y = footerTop;

  doc.end();
  return { stream: done, filename: (entry.entry_no || "device") + ".pdf" };
}

module.exports = { buildDeviceEntryPdf, hasFonts };