(function () {
  "use strict";
  var splash = document.getElementById("splash");
  if (!splash) return;

  var MIN = 700;
  var MAX = 8000;
  var start = Date.now();
  var fired = false;

  function done() {
    if (fired) return;
    fired = true;
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
})();