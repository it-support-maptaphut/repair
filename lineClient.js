const { messagingApi, middleware } = require("@line/bot-sdk");
const config = require("./config");

const tokenReady =
  config.CHANNEL_ACCESS_TOKEN && !String(config.CHANNEL_ACCESS_TOKEN).toLowerCase().startsWith("x");
const secretReady =
  config.CHANNEL_SECRET && !String(config.CHANNEL_SECRET).toLowerCase().startsWith("x");
const adminReady =
  config.ADMIN_LINE_ID &&
  String(config.ADMIN_LINE_ID).startsWith("U") &&
  !String(config.ADMIN_LINE_ID).toLowerCase().includes("placeholder");

const client = tokenReady
  ? new messagingApi.MessagingApiClient({ channelAccessToken: config.CHANNEL_ACCESS_TOKEN })
  : null;

function canPush() {
  return client && adminReady;
}

function asRecord(obj) {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) obj[k] = "";
  return obj;
}

async function notifyAdminTicket({ ticketNo, device, symptom, location, urls, name, phone }) {
  if (!canPush()) {
    console.log(`[Line] ข้าม push แอดมิน (ยังไม่ได้ตั้งค่า); งาน ${ticketNo} ถูกบันทึกในฐานข้อมูล`);
    return;
  }
  const time = new Date().toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  const text = [
    "งานซ่อมใหม่",
    "หมายเลข: " + ticketNo,
    "หมวด: " + device,
    "อาการ: " + symptom,
    "สถานที่: " + location,
    "ผู้แจ้ง: " + (name || "-"),
    "โทร: " + (phone || "-"),
    "เวลา: " + time
  ].join("\n");

  const messages = [{ type: "text", text }];
  (urls || []).forEach((u) =>
    messages.push({ type: "image", originalContentUrl: u, previewImageUrl: u })
  );

  for (let i = 0; i < messages.length; i += 5) {
    await client.pushMessage({
      to: config.ADMIN_LINE_ID,
      messages: asRecordArray(messages.slice(i, i + 5))
    });
  }
}

function asRecordArray(list) {
  return list.map(asRecord);
}

async function pushTextToAdmin(text) {
  if (!canPush()) return;
  await client.pushMessage({
    to: config.ADMIN_LINE_ID,
    messages: [{ type: "text", text }]
  });
}

async function reply(replyToken, message) {
  if (!client) return;
  await client.replyMessage({ replyToken, messages: asRecordArray(Array.isArray(message) ? message : [message]) });
}

async function getProfile(userId) {
  if (!client) return { displayName: "" };
  const p = await client.getProfile(userId);
  return p || { displayName: "" };
}

async function pushToUser(userId, text) {
  if (!client || !userId) return;
  await client
    .pushMessage({ to: userId, messages: asRecordArray([{ type: "text", text }]) })
    .catch((err) => console.warn("[Line] push ถึงผู้แจ้งไม่สำเร็จ:", err.message));
}

async function notifyStatus({ ticketNo, status, reporterLineId }) {
  const text =
    status === "working"
      ? "อัปเดตงานหมายเลข " + ticketNo + "\nฝ่าย IT SUPPORT ทราบแล้ว กำลังไปดำเนินการครับ"
      : status === "done"
      ? "อัปเดตงานหมายเลข " + ticketNo + "\nงานเสร็จสิ้นแล้วครับ ขอบคุณที่แจ้งซ่อม"
      : "อัปเดตงาน " + ticketNo + "\nสถานะ: ได้รับแจ้งแจ้งเรียบร้อย";

  if (reporterLineId && client) {
    await pushToUser(reporterLineId, text);
    return;
  }
  console.log(`[Line] ข้าม push กลับผู้แจ้ง (ไม่มี Line ID); งาน ${ticketNo} -> ${status}`);
}

module.exports = {
  client,
  middleware: secretReady ? middleware({ channelSecret: config.CHANNEL_SECRET }) : null,
  canPush,
  notifyAdminTicket,
  pushTextToAdmin,
  pushToUser,
  notifyStatus,
  reply,
  getProfile
};