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

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function decorate(bar) {
    if (!bar || bar.querySelector(".xp-start")) return true;

    var start = document.createElement("button");
    start.type = "button";
    start.className = "xp-start";
    start.setAttribute("aria-label", "start");
    start.innerHTML = FLAG_ICON + "<span>start</span>";
    start.addEventListener("click", function () {
      if (window.openSettings) { window.openSettings(); return; }
      if (window.WanGate && window.WanGate.open) window.WanGate.open();
    });
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
