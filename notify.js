"use strict";

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

function pushToIp(ip, payload) {
  if (!ip) return;
  const id = ++seq;
  lastEvents.set(ip, { id, payload, at: Date.now() });
  const set = clients.get(ip);
  if (set) {
    set.forEach((res) => writeEvent(res, id, payload));
  }
  console.log("[notify] push -> " + ip + " (" + (payload ? payload.type : "") + ")");
}

function handleStream(req, res, ip) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write("retry: 3000\n\n");

  if (!clients.has(ip)) clients.set(ip, new Set());
  const set = clients.get(ip);
  set.add(res);

  const le = lastEvents.get(ip);
  if (le && Date.now() - le.at < RESEND_WINDOW_MS) {
    writeEvent(res, le.id, le.payload);
  }

  const hb = setInterval(function () {
    writeEvent(res, ++seq, { type: "ping" });
  }, HEARTBEAT_MS);

  req.on("close", function () {
    clearInterval(hb);
    set.delete(res);
    if (set.size === 0) clients.delete(ip);
  });
}

module.exports = { handleStream, pushToIp };