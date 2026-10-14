(function () {
  "use strict";
  var splash = document.getElementById("splash");
  if (!splash) return;

  var MIN = 700;
  var MAX = 8000;
  var RELOAD_AFTER = 15000;
  var AUTH_WAIT_MAX = 6000;
  var start = Date.now();
  var fired = false;
  var reloadKey = "splashReloadCount";
  var sub = splash.querySelector(".splash-sub");

  function resetReloadCount() {
    try { sessionStorage.removeItem(reloadKey); } catch (e) {}
  }

  function authReady() {
    var p = window.__authReady;
    if (p && typeof p.then === "function") return p;
    return Promise.resolve();
  }

  function done() {
    if (fired) return;
    fired = true;
    resetReloadCount();
    var remain = Math.max(0, MIN - (Date.now() - start));
    // รอให้ระบบตัดสินใจเรื่องการยืนยันตัวตนเสร็จก่อน (มีเพดานเวลา กันค้าง)
    // เพื่อไม่ให้หน้าแจ้งซ่อมแวบขึ้นมาก่อนที่เกตติ้งเข้าสู่ระบบจะแสดง
    var waitAuth = Promise.race([
      authReady().catch(function () {}),
      new Promise(function (res) { setTimeout(res, AUTH_WAIT_MAX); })
    ]);
    Promise.all([
      new Promise(function (res) { setTimeout(res, remain); }),
      waitAuth
    ]).then(hide);
  }

  function hide() {
    splash.classList.add("splash-done");
    setTimeout(function () {
      if (splash.parentNode) splash.parentNode.removeChild(splash);
    }, 600);
  }

  function whenFontsReady() {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(done).catch(done);
    } else {
      done();
    }
  }

  if (document.readyState === "complete") {
    whenFontsReady();
  } else {
    window.addEventListener("load", whenFontsReady);
  }

  setTimeout(done, MAX);

  // โหลดเกิน 15 วิ → รีเฟรชเว็บเอง (กันหน้าแฮงค์บน Vercel)
  var reloads = 0;
  try { reloads = parseInt(sessionStorage.getItem(reloadKey) || "0", 10) || 0; } catch (e) {}
  setTimeout(function () {
    if (fired) return;
    if (reloads < 2) {
      try { sessionStorage.setItem(reloadKey, String(reloads + 1)); } catch (e) {}
      if (sub) sub.textContent = "การโหลดช้ากว่าปกติ กำลังรีเฟรชให้อัตโนมัติ...";
      setTimeout(function () { location.reload(); }, 1200);
    } else {
      done();
    }
  }, RELOAD_AFTER);
})();