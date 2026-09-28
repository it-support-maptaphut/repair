/* ระบบแจ้งซ่อม IT — เสียง + อนิเมชันกดปุ่ม + ตัวอักษรค่อย ๆ เข้า + ป้องกันซูม
   ใช้: <script src="touch-fx.js"></script>            (ครบทุกฟีเจอร์)
       <script src="touch-fx.js" data-fx="zoom"></script>  (เฉพาะบล็อกซูม) */
(function () {
  "use strict";

  var tag = document.currentScript ||
    (function () { var sc = document.scripts; return sc[sc.length - 1]; })();
  var fx = (tag && tag.getAttribute && tag.getAttribute("data-fx")) || "all";
  var useZoom = fx === "all" || fx.indexOf("zoom") > -1;
  var useButtons = fx === "all" || fx.indexOf("buttons") > -1;
  var useType = fx === "all" || fx.indexOf("type") > -1;

  function prevent(e) { e.preventDefault(); }

  // ---------- บล็อกการซูม ไม่ว่าด้วยวิธีใด ----------
  if (useZoom) {
    document.addEventListener("gesturestart", prevent);
    document.addEventListener("gesturechange", prevent);
    document.addEventListener("gestureend", prevent);
    document.addEventListener("dblclick", prevent);
    document.addEventListener("wheel", function (e) {
      if (e.ctrlKey) e.preventDefault();
    }, { passive: false });
    document.addEventListener("touchmove", function (e) {
      if (e.touches && e.touches.length > 1) e.preventDefault();
    }, { passive: false });
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && /^[+\-=0]$/.test(e.key)) e.preventDefault();
    });
  }

  // ---------- เสียง (Web Audio) ----------
  var actx = null;

  function ac() {
    try {
      if (!actx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        actx = new AC();
      }
      if (actx.state === "suspended") actx.resume();
      return actx;
    } catch (err) { return null; }
  }

  function tone(freq, t, vol, type) {
    var ctx = ac();
    if (!ctx) return;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    var now = ctx.currentTime;
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + t + 0.02);
  }

  window.__sounds = {
    click: function () { tone(1250, 0.07, 0.09, "square"); },
    tap: function () { tone(1450, 0.05, 0.05); },
    success: function () {
      tone(880, 0.35, 0.12);
      setTimeout(function () { tone(1320, 0.45, 0.12); }, 140);
    },
    error: function () { tone(220, 0.22, 0.12, "sawtooth"); }
  };

  // ---------- กดปุ่ม : อนิเมชัน + เสียง ----------
  if (useButtons) {
    var SEL = "button, a, [role=button], .nav-link, .mic-btn, .cat-tab, .loc-option, .support-row, .mt-card, [data-press]";

    function targetFor(ev) {
      var t = ev.target;
      if (!t || !t.closest) return null;
      return t.closest(SEL);
    }

    document.addEventListener("pointerdown", function (e) {
      var t = targetFor(e);
      if (!t) return;
      t.classList.add("tk-press");
      window.__sounds.click();
    }, true);

    function release(e) {
      var t = targetFor(e);
      if (t) t.classList.remove("tk-press");
    }
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
  }

  // ---------- พิมพ์ : ตัวอักษรค่อย ๆ เข้าอย่างสมูท ----------
  if (useType) {
    document.addEventListener("input", function (e) {
      var t = e.target;
      if (!t || (t.tagName !== "INPUT" && t.tagName !== "TEXTAREA")) return;
      if (t.type === "checkbox" || t.type === "radio" || t.type === "submit" || t.type === "button") return;
      t.classList.remove("tk-typein");
      void t.offsetWidth;
      t.classList.add("tk-typein");
    }, true);
  }
})();