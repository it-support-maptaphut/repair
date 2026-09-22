(function () {
  "use strict";
  if (window.__repairNotifyLoaded) return;
  window.__repairNotifyLoaded = true;

  var shown = new Set();
  try {
    JSON.parse(localStorage.getItem("wan_notify_shown") || "[]").forEach(function (id) { shown.add(id); });
  } catch (e) {}

  function remember(id) {
    if (!id) return;
    shown.add(id);
    try {
      localStorage.setItem("wan_notify_shown", JSON.stringify(Array.from(shown).slice(-30)));
    } catch (e) {}
  }

  var STYLE =
    "@keyframes wanNotifyFade{from{opacity:0}to{opacity:1}}" +
    "@keyframes wanNotifyCardPop{from{opacity:0;transform:scale(.86) translateY(16px)}to{opacity:1;transform:scale(1) translateY(0)}}" +
    "@keyframes wanNotifyRoll{0%{transform:translateX(-52px) translateY(122px) rotate(0deg)}50%{transform:translateX(250px) translateY(122px) rotate(360deg)}100%{transform:translateX(552px) translateY(122px) rotate(720deg)}}" +
    "@keyframes wanNotifyRollX{0%{transform:translateX(-52px) translateY(168px)}50%{transform:translateX(250px) translateY(168px)}100%{transform:translateX(552px) translateY(168px)}}" +
    "@keyframes wanNotifySpin{to{transform:rotate(360deg)}}" +
    "@keyframes wanNotifyPuff{0%{opacity:0;transform:translate(0,0) scale(.4)}15%{opacity:.9}100%{opacity:0;transform:translate(-64px,-28px) scale(1.7)}}" +
    ".notify-pop{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(4,18,10,.55);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);animation:wanNotifyFade .25s ease both}" +
    ".notify-card{position:relative;background:#fff;border-radius:0;max-width:420px;width:100%;padding:22px 18px 18px;text-align:center;box-shadow:0 22px 60px rgba(0,0,0,.38);animation:wanNotifyCardPop .38s cubic-bezier(.22,1,.36,1) both}" +
    ".notify-close{position:absolute;top:10px;right:12px;width:36px;height:36px;border:none;background:#f1f5f2;color:#5b6b5f;font-size:22px;line-height:1;cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:.18s;font-family:inherit}" +
    ".notify-close:hover{background:#e2ece6;color:#0e6b3a;transform:rotate(90deg) scale(1.06)}" +
    ".notify-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:0;background:#e2f7eb;color:#15803d;font-size:12.5px;font-weight:700;letter-spacing:.2px}" +
    ".notify-title{margin:12px 0 2px;font-size:20px;font-weight:800;color:#0e6b3a;line-height:1.3}" +
    ".notify-tno{font-size:12px;color:#8a97a0;margin-bottom:6px}" +
    ".notify-bike{position:relative;margin:2px auto 2px;max-width:340px;padding:0 6px}" +
    ".notify-bike-svg{width:320px;max-width:100%;height:auto;display:block;margin:0 auto}" +
    ".notify-bike .notify-roll{animation:wanNotifyRoll 4s linear infinite;transform-origin:0 0}" +
    ".notify-bike .notify-shadow{animation:wanNotifyRollX 4s linear infinite}" +
    ".notify-bike .notify-puff{animation:wanNotifyPuff 1s ease-out infinite}" +
    ".notify-bike .notify-puff.d2{animation-delay:.35s}" +
    ".notify-bike .notify-puff.d3{animation-delay:.7s}" +
    ".notify-bike .notify-ground{stroke:#e7eaf0;stroke-width:3;stroke-linecap:round}" +
    ".notify-bike .notify-puff{fill:none;stroke:#cfd6df;stroke-width:3}" +
    ".notify-bike .notify-tire{fill:#232b38}" +
    ".notify-bike .notify-tread{fill:none;stroke:#3b4656;stroke-width:2.5}" +
    ".notify-bike .notify-rim{fill:none;stroke:#5b6b7e;stroke-width:4}" +
    ".notify-bike .notify-spokes{stroke:#5b6b7e;stroke-width:2.5;stroke-linecap:round}" +
    ".notify-bike .notify-hub{fill:#8fa0b5}" +
    ".notify-bike .notify-panel{fill:#fff;stroke:#06c755;stroke-width:4}" +
    ".notify-bike .notify-it-txt{font:900 18px/1 Arial,sans-serif;fill:#0e6b3a;letter-spacing:1px}" +
    ".notify-bike .notify-shadow-el{fill:rgba(0,0,0,.13)}" +
    ".notify-sub{font-size:14.5px;color:#5b6b5f;line-height:1.55;margin:8px 0 16px}" +
    ".notify-btn{width:100%;padding:13px;border:none;border-radius:0;background:#06c755;color:#fff;font-size:16px;font-weight:700;font-family:inherit;cursor:pointer;transition:.2s}" +
    ".notify-btn:hover{background:#05ae4a;transform:translateY(-1px);box-shadow:0 8px 18px rgba(6,199,85,.3)}" +
    "@media(max-width:380px){.notify-card{padding:18px 14px 16px}.notify-bike-svg{width:210px}.notify-title{font-size:17px}}";

  var pop = null;

  function injectStyle() {
    if (document.getElementById("wan-notify-style")) return;
    var s = document.createElement("style");
    s.id = "wan-notify-style";
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function closePopup() {
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    pop = null;
  }

  var BIKE_SVG =
    '<svg class="notify-bike-svg" viewBox="0 0 520 220" role="img" aria-label="ล้อ IT กลิ้ง">' +
    '<line class="notify-ground" x1="6" y1="170" x2="514" y2="170"/>' +
    '<g class="notify-bike">' +
    '<g class="notify-roll">' +
    '<circle class="notify-tire" cx="0" cy="0" r="48"/>' +
    '<circle class="notify-tread" cx="0" cy="0" r="43"/>' +
    '<circle class="notify-rim" cx="0" cy="0" r="34"/>' +
    '<path class="notify-spokes" d="M0 -34 L0 34 M-34 0 L34 0 M-24 -24 L24 24 M24 -24 L-24 24"/>' +
    '<circle class="notify-hub" cx="0" cy="0" r="7"/>' +
    '<circle class="notify-panel" cx="0" cy="0" r="25"/>' +
    '<text class="notify-it-txt" x="0" y="7" text-anchor="middle">IT</text>' +
    "</g>" +
    '<g class="notify-shadow">' +
    '<ellipse class="notify-shadow-el" cx="0" cy="0" rx="46" ry="8"/>' +
    '<circle class="notify-puff" cx="-58" cy="-24" r="6"/>' +
    '<circle class="notify-puff d2" cx="-40" cy="-18" r="7"/>' +
    "</g>" +
    "</g>" +
    "</svg>";

  function showApproved(payload) {
    var id = payload && (payload.id !== undefined ? payload.id : payload.at);
    if (id !== undefined && id !== null && shown.has(String(id))) return;
    if (id !== undefined && id !== null) remember(String(id));

    injectStyle();
    closePopup();

    var overlay = document.createElement("div");
    overlay.className = "notify-pop";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "IT SUPPORT รับทราบแล้ว");

    overlay.innerHTML =
      '<div class="notify-card">' +
      '<button class="notify-close" type="button" aria-label="ปิด">&times;</button>' +
      '<div class="notify-badge">IT SUPPORT</div>' +
      '<div class="notify-title">รับทราบคำขอแล้ว &bull; กำลังดำเนินการ</div>' +
      (payload && payload.ticketNo ? '<div class="notify-tno">รหัสแจ้งซ่อม ' + payload.ticketNo + "</div>" : "") +
      '<div class="notify-bike">' + BIKE_SVG + "</div>" +
      '<button class="notify-btn" type="button">ปิด</button>' +
      "</div>";

    overlay.querySelector(".notify-close").addEventListener("click", closePopup);
    overlay.querySelector(".notify-btn").addEventListener("click", closePopup);
    document.body.appendChild(overlay);
    pop = overlay;
  }

  function showAccepted(payload) {
    var id = payload && (payload.id !== undefined ? payload.id : payload.at);
    if (id !== undefined && id !== null && shown.has(String(id))) return;
    if (id !== undefined && id !== null) remember(String(id));

    injectStyle();
    closePopup();

    var overlay = document.createElement("div");
    overlay.className = "notify-pop";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "IT SUPPORT รับเรื่องแล้ว");

    overlay.innerHTML =
      '<div class="notify-card">' +
      '<button class="notify-close" type="button" aria-label="ปิด">&times;</button>' +
      '<div class="notify-badge">IT SUPPORT</div>' +
      '<div class="notify-title">รับเรื่องแล้ว &bull; กำลังตรวจสอบ</div>' +
      (payload && payload.ticketNo ? '<div class="notify-tno">รหัสแจ้งซ่อม ' + payload.ticketNo + "</div>" : "") +
      '<p class="notify-sub">ทีม IT ได้รับใบแจ้งซ่อมของคุณแล้ว<br/>โปรดรอการติดต่อกลับจากทีมงาน</p>' +
      '<button class="notify-btn" type="button">ตกลง</button>' +
      "</div>";

    overlay.querySelector(".notify-close").addEventListener("click", closePopup);
    overlay.querySelector(".notify-btn").addEventListener("click", closePopup);
    document.body.appendChild(overlay);
    pop = overlay;
  }

  if (window.EventSource) {
    var es = new EventSource("/api/notify/stream");
    es.onmessage = function (ev) {
      var d;
      try {
        d = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      if (!d) return;
      if (ev.lastEventId) d.id = ev.lastEventId;
      if (d.type === "approved") showApproved(d);
      else if (d.type === "accepted") showAccepted(d);
    };
  }
})();