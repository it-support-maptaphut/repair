"use strict";

// ผูกการแจ้งเตือนกับ visitor_id (บัญชีผู้ใช้) แทน IP — เปลี่ยนเครือข่ายแล้วยังได้รับแจ้งเตือน
const clients = new Map();
const lastEvents = new Map();
const HEARTBEAT_MS = 25000;
const RESEND_WINDOW_MS = 10 * 60 * 1000;

let seq = 0;

function writeEvent(res, id, payload) {
  try {
    if (res.writableEnded || (res.socket && res.socket.destroyed)) return;
    res.write("id: " + id + "\n");
    res.write("data: " + JSON.stringify(payload) + "\n\n");
  } catch (e) {}
}

function pushToVisitor(visitorId, payload) {
  if (!visitorId) return;
  const key = String(visitorId);
  const id = ++seq;
  lastEvents.set(key, { id, payload, at: Date.now() });
  const set = clients.get(key);
  if (set) {
    set.forEach((res) => writeEvent(res, id, payload));
  }
  console.log("[notify] push -> visitor " + key + " (" + (payload ? payload.type : "") + ")");
}

function handleStream(req, res, visitorId) {
  const key = String(visitorId || "");
  if (!key) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, message: "กรุณาเข้าสู่ระบบก่อนรับแจ้งเตือน" }));
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write("retry: 3000\n\n");

  if (!clients.has(key)) clients.set(key, new Set());
  const set = clients.get(key);
  set.add(res);

  const le = lastEvents.get(key);
  if (le && Date.now() - le.at < RESEND_WINDOW_MS) {
    writeEvent(res, le.id, le.payload);
  }

  const hb = setInterval(function () {
    writeEvent(res, ++seq, { type: "ping" });
  }, HEARTBEAT_MS);

  req.on("close", function () {
    clearInterval(hb);
    set.delete(res);
    if (set.size === 0) clients.delete(key);
  });
}

module.exports = { handleStream, pushToVisitor };
