const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const FONT_REGULAR = path.join(__dirname, "fonts", "Sarabun-Regular.ttf");
const FONT_BOLD = path.join(__dirname, "fonts", "Sarabun-Bold.ttf");
const FONT_SEMIBOLD = path.join(__dirname, "fonts", "Sarabun-SemiBold.ttf");

const BLACK = "#141414";
const GREEN = "#0e6b3a";
const GREY = "#77767b";
const LG_FLOOR = 5;
const JOURNAL_MARKER = "__JOURNAL__";

function isJournal(note) {
  return String(note.info_extra || "").indexOf(JOURNAL_MARKER) === 0;
}

function cleanInfo(note) {
  const v = String(note.info_extra || "");
  if (v.indexOf(JOURNAL_MARKER) === 0) return v.slice(JOURNAL_MARKER.length).replace(/^\n+/, "").trim();
  return v.trim();
}

function hasFonts() {
  return [FONT_REGULAR, FONT_BOLD, FONT_SEMIBOLD].every(function (f) {
    try {
      return fs.statSync(f).size > 0;
    } catch (e) {
      return false;
    }
  });
}

function fmtNow() {
  return new Date().toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function parseSteps(note) {
  try {
    const s = JSON.parse(note.steps_json || "[]");
    return Array.isArray(s) ? s.map(function (x) { return String(x); }) : [];
  } catch (e) {
    return [];
  }
}

// สร้าง PDF 1 หน้าเสมอ (ถ้าเนื้อหายาว ให้ย่อ scale ไล่ลงเพื่อให้จบในหน้าเดียว)
// ใช้การวางแบบกล่องเรียงตามแนวตั้ง โดยเว้นระยะห่างระหว่างกล่อง/บรรทัดอย่างพอเหมาอ่านชัด
function build(note, scale) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 60, left: 52, right: 52 },
    info: { Title: "บันทึกโน้ตงาน", Author: "ระบบแจ้งซ่อม IT" }
  });
  const chunks = [];
  doc.on("data", function (c) { chunks.push(c); });
  const stream = new Promise(function (resolve, reject) {
    doc.on("end", function () { resolve(Buffer.concat(chunks)); });
    doc.on("error", reject);
  });
  let pages = 1;
  doc.on("pageAdded", function () { pages++; });

  const W = doc.page.width;
  const H = doc.page.height;
  const M = 52;
  const contentW = W - M * 2;
  const LG = Math.max(3, Math.round(5 * scale));
  const padX = Math.round(9 * scale);
  const padY = Math.round(8 * scale);
  const boxGap = Math.round(12 * scale);
  const footerTop = H - 70;
  let overflow = false;

  // ---- หัวเรื่อง ----
  doc.font(FONT_BOLD).fontSize(19 * scale).fillColor(BLACK).text("บันทึกโน้ตงาน", { align: "center" });
  doc.moveDown(0.9);

  // ---- ขั้นตอน ----
  const steps = parseSteps(note);
  doc.font(FONT_BOLD).fontSize(13 * scale).fillColor(BLACK).text(
    "ขั้นตอนการทำงาน / การเคลม" + (steps.length ? "  (" + steps.length + " ขั้นตอน)" : "")
  );
  doc.moveDown(0.7);

  if (steps.length) {
    steps.forEach(function (text, i) {
      const y0 = doc.y;
      doc.moveDown(0.35);
      doc.font(FONT_BOLD).fontSize(12.5 * scale).fillColor(GREEN).text("ขั้นตอนที่ " + (i + 1), M + padX, y0 + Math.round(6 * scale), { lineBreak: false });
      doc.font(FONT_REGULAR).fontSize(12 * scale).fillColor(BLACK).text(String(text || "").trim() || "-", M + padX, y0 + Math.round(26 * scale), { width: contentW - padX * 2, lineGap: LG });
      const yEnd = doc.y + Math.round(7 * scale);
      doc.rect(M, y0, contentW, yEnd - y0).stroke();
      doc.y = yEnd + boxGap;
    });
    doc.moveDown(0.2);
  } else {
    doc.font(FONT_REGULAR).fontSize(11.5 * scale).fillColor(GREY).text("-", M, doc.y, { lineGap: LG });
    doc.moveDown(0.5);
  }

  // ---- ข้อมูลเสริม ----
  doc.moveDown(0.4);
  doc.font(FONT_BOLD).fontSize(13 * scale).fillColor(BLACK).text("ข้อมูลเสริม");
  doc.moveDown(0.7);
  const info = String(note.info_extra || "").trim();
  if (info) {
    const yInfo = doc.y;
    doc.font(FONT_REGULAR).fontSize(11.5 * scale).fillColor(BLACK).text(info, M + padX, yInfo + Math.round(6 * scale), { width: contentW - padX * 2, lineGap: LG });
    const yInfoEnd = doc.y + Math.round(6 * scale);
    doc.rect(M, yInfo, contentW, yInfoEnd - yInfo).stroke();
    doc.y = yInfoEnd + boxGap;
    doc.moveDown(0.2);
  } else {
    doc.font(FONT_REGULAR).fontSize(11.5 * scale).fillColor(GREY).text("-", M, doc.y, { lineGap: LG });
    doc.moveDown(0.5);
  }

  // ---- ตรวจว่าเนื้อหาอยู่ในกรอบ 1 หน้าไหม ----
  overflow = doc.y > footerTop - 28;

  // ---- ส่วนท้าย (วาดเฉพาะเมื่อจบในหน้าเดียว ไม่ทับกัน) ----
  if (!overflow && pages <= 1) {
    doc.font(FONT_REGULAR).fontSize(9 * scale).fillColor(GREY).text(
      "เอกสารนี้สร้างโดยอัตโนมัติจากระบบแจ้งซ่อม IT  •  " + fmtNow(),
      M,
      footerTop,
      { width: contentW, align: "center", lineBreak: false }
    );
  }
  doc.y = footerTop;

  doc.end();
  return { stream: stream, pages: pages, overflow: overflow, scale: scale };
}

// ---------- ฟอร์มจดบันทึก : ไม่มีกรอบ เรียงเป็นตัวอักษร (ไทยสาระบัญ) ----------
function buildJournal(note, scale) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 60, left: 52, right: 52 },
    info: { Title: "บันทึกโน้ตงาน", Author: "ระบบแจ้งซ่อม IT" }
  });
  const chunks = [];
  doc.on("data", function (c) { chunks.push(c); });
  const stream = new Promise(function (resolve, reject) {
    doc.on("end", function () { resolve(Buffer.concat(chunks)); });
    doc.on("error", reject);
  });
  let pages = 1;
  doc.on("pageAdded", function () { pages++; });

  const M = 52;
  const contentW = doc.page.width - M * 2;
  const footerTop = doc.page.height - 70;
  const LG = Math.max(2, Math.round(4 * scale));

  // ---- หัวเรื่อง ขนาด 16 (ไม่มีกรอบ) ----
  const title = String(note.title || "").trim() || "บันทึกโน้ตงาน";
  doc.font(FONT_BOLD).fontSize(16 * scale).fillColor(BLACK).text(title, { align: "center" });
  doc.moveDown(1.1);

  // ---- เนื้อหาเรียงเป็นตัวอักษร ขนาด 12 (ไม่มีกล่อง) ----
  const steps = parseSteps(note);
  doc.font(FONT_REGULAR).fontSize(12 * scale).fillColor(BLACK);
  if (steps.length) {
    steps.forEach(function (text, i) {
      if (i > 0) doc.moveDown(0.9);
      doc.text(String(text || "").trim() || "-", M, doc.y, { width: contentW, lineGap: LG });
    });
  } else {
    doc.text("-", M, doc.y, { lineGap: LG });
  }
  doc.moveDown(0.9);

  // ---- ข้อมูลเสริม (ไม่มีกรอบ) ----
  const info = cleanInfo(note);
  if (info) {
    doc.moveDown(0.4);
    doc.font(FONT_BOLD).fontSize(12 * scale).fillColor(BLACK).text("ข้อมูลเสริม", { lineGap: LG });
    doc.moveDown(0.5);
    doc.font(FONT_REGULAR).fontSize(12 * scale).fillColor(BLACK).text(info, M, doc.y, { width: contentW, lineGap: LG });
  }

  let overflow = doc.y > footerTop - 28;
  if (!overflow && pages <= 1) {
    doc.font(FONT_REGULAR).fontSize(9 * scale).fillColor(GREY).text(
      "เอกสารนี้สร้างโดยอัตโนมัติจากระบบแจ้งซ่อม IT  •  " + fmtNow(),
      M,
      footerTop,
      { width: contentW, align: "center", lineBreak: false }
    );
  }
  doc.y = footerTop;

  doc.end();
  return { stream: stream, pages: pages, overflow: overflow, scale: scale };
}

// ลองย่อ scale ไล่จาก 1 ลงไป (ครั้งละ 0.05) จนเนื้อหาจบใน 1 หน้า แต่ไม่ย่อต่ำกว่า 0.85
async function buildWorkNotePdf(note) {
  const filename = "work-note-" + note.id + ".pdf";
  const buildOne = isJournal(note) ? buildJournal : build;
  let scale = 1;
  for (let i = 0; i < 8; i++) {
    const attempt = buildOne(note, scale);
    const overflow = attempt.overflow;
    const pages = attempt.pages;
    const buffer = await attempt.stream;
    if (!overflow && pages <= 1) {
      return { buffer: buffer, filename: filename, scale: scale };
    }
    scale -= 0.05;
    if (scale < 0.85) break;
  }
  const attempt = buildOne(note, Math.max(scale, 0.85));
  const buffer = await attempt.stream;
  return { buffer: buffer, filename: filename, scale: Math.max(scale, 0.85) };
}

module.exports = { hasFonts: hasFonts, buildWorkNotePdf: buildWorkNotePdf };
