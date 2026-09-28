(function () {
  "use strict";
  var splash = document.getElementById("splash");
  if (!splash) return;

  var MIN = 700;
  var MAX = 8000;
  var RELOAD_AFTER = 15000;
  var start = Date.now();
  var fired = false;
  var reloadKey = "splashReloadCount";
  var sub = splash.querySelector(".splash-sub");

  function resetReloadCount() {
    try { sessionStorage.removeItem(reloadKey); } catch (e) {}
  }

  function done() {
    if (fired) return;
    fired = true;
    resetReloadCount();
    var remain = Math.max(0, MIN - (Date.now() - start));
    setTimeout(hide, remain);
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