/* ระบบแจ้งซ่อม IT — เพิ่ม "start" และ system tray (นาฬิกา) ลงแถบล่าง
   ให้ดูเหมือน Taskbar ของ Windows XP.  ใช้ร่วมกับ bottom-nav.js            */
(function () {
  "use strict";

  var NET_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="2" y="14" width="6" height="6"/><rect x="9" y="9" width="6" height="11"/>' +
    '<rect x="16" y="4" width="6" height="16"/></svg>';

  var VOL_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M16 9a4 4 0 0 1 0 6"/>' +
    '<path d="M19 6a8 8 0 0 1 0 12"/></svg>';

  var FLAG_ICON =
    '<svg class="xp-flag" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M3 6c3-1.4 6-1.4 9 0v6c-3-1.4-6-1.4-9 0z" fill="#f65314"/>' +
    '<path d="M12 6c3-1.4 6-1.4 9 0v6c-3-1.4-6-1.4-9 0z" fill="#7cbb00"/>' +
    '<path d="M3 12c3-1.4 6-1.4 9 0v6c-3-1.4-6-1.4-9 0z" fill="#00a1f1"/>' +
    '<path d="M12 12c3-1.4 6-1.4 9 0v6c-3-1.4-6-1.4-9 0z" fill="#ffbb00"/></svg>';

  var Q_ICON =
    '<svg class="xp-confirm-ico" viewBox="0 0 32 32" aria-hidden="true">' +
    '<circle cx="16" cy="16" r="14" fill="#fff" stroke="#0a52c8" stroke-width="1.6"/>' +
    '<text x="16" y="23" text-anchor="middle" font-family="Tahoma, sans-serif" ' +
    'font-size="21" font-weight="700" fill="#0a52c8">?</text></svg>';

  var HOME_URL = "index.html";
  var confirmGate = null;

  function buildConfirm() {
    var gate = document.createElement("div");
    gate.className = "xp-confirm-gate";
    gate.hidden = true;
    gate.innerHTML =
      '<div class="xp-confirm-win" role="alertdialog" aria-modal="true">' +
        '<div class="xp-confirm-bar">' +
          '<span class="xp-confirm-title">ยืนยัน</span>' +
          '<button type="button" class="xp-confirm-x" aria-label="ปิด">&#10005;</button>' +
        '</div>' +
        '<div class="xp-confirm-body">' +
          Q_ICON +
          '<p class="xp-confirm-text">ต้องการกลับไปหน้าแรกหรือไม่?</p>' +
        '</div>' +
        '<div class="xp-confirm-actions">' +
          '<button type="button" class="xp-confirm-btn" data-ok>ตกลง</button>' +
          '<button type="button" class="xp-confirm-btn" data-cancel>ยกเลิก</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(gate);

    function go() { window.location.href = HOME_URL; }
    function close() { gate.hidden = true; }

    gate.querySelector("[data-ok]").addEventListener("click", go);
    gate.querySelector("[data-cancel]").addEventListener("click", close);
    gate.querySelector(".xp-confirm-x").addEventListener("click", close);
    gate.addEventListener("click", function (e) { if (e.target === gate) close(); });
    document.addEventListener("keydown", function (e) {
      if (gate.hidden) return;
      if (e.key === "Escape") close();
      else if (e.key === "Enter") go();
    });
    return gate;
  }

  function confirmHome() {
    if (!confirmGate) confirmGate = buildConfirm();
    confirmGate.hidden = false;
    var ok = confirmGate.querySelector("[data-ok]");
    if (ok) ok.focus();
  }

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function decorate(bar) {
    if (!bar || bar.querySelector(".xp-start")) return true;

    var start = document.createElement("button");
    start.type = "button";
    start.className = "xp-start";
    start.setAttribute("aria-label", "start");
    start.innerHTML = FLAG_ICON + "<span>start</span>";
    start.addEventListener("click", confirmHome);
    bar.insertBefore(start, bar.firstChild);

    var tray = document.createElement("div");
    tray.className = "xp-tray";
    tray.innerHTML = NET_ICON + VOL_ICON + '<span class="xp-clock"></span>';
    bar.appendChild(tray);

    var clock = tray.querySelector(".xp-clock");
    function tick() {
      var d = new Date();
      clock.textContent = pad(d.getHours()) + ":" + pad(d.getMinutes());
    }
    tick();
    setInterval(tick, 15000);
    return true;
  }

  function init() {
    if (decorate(document.getElementById("bottomNav"))) return;

    var tries = 0;
    var obs = new MutationObserver(function () {
      if (decorate(document.getElementById("bottomNav"))) obs.disconnect();
      else if (++tries > 60) obs.disconnect();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
