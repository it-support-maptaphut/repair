/* ปุ่ม "เข้าสู่ระบบด้วย LINE" ในเกตติ้ง (ทำงานคู่กับ verify.js + /auth/line/*)
   - โหลด /api/config ว่าเปิดใช้ LINE Login หรือยัง
   - แทรกปุ่มเข้ากับช่อง #vgLineSlot ที่ verify.js สร้างไว้
   - พาไป /auth/line/login (redirect ไป LINE แล้วกลับมาที่ /auth/line/callback) */
(function () {
  "use strict";

  var LINE_ICON =
    '<span class="vg-line-ic" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="currentColor">' +
        '<path d="M12 2C6.48 2 2 5.64 2 10.14c0 4.02 3.58 7.39 8.42 8.03.33.07.78.22.89.5.1.25.07.65.03.9l-.14.86c-.05.26-.21 1.02.89.56 1.1-.46 5.94-3.5 8.1-5.99 1.5-1.63 2.21-3.29 2.21-4.86C22.4 5.64 17.52 2 12 2zM8.4 12.9H6.7a.5.5 0 0 1-.5-.5V9a.5.5 0 0 1 1 0v2.9h1.2a.5.5 0 0 1 0 1zm1.9-.5a.5.5 0 0 1-1 0V9a.5.5 0 0 1 1 0v3.4zm4.2 0a.5.5 0 0 1-.9.3l-1.7-2.26v1.96a.5.5 0 0 1-1 0V9a.5.5 0 0 1 .9-.3l1.7 2.26V9a.5.5 0 0 1 1 0v3.4zm3.3-.7a.5.5 0 0 1 0 1h-1.8a.5.5 0 0 1-.5-.5V9a.5.5 0 0 1 .5-.5h1.8a.5.5 0 0 1 0 1h-1.3v.7h1.3a.5.5 0 0 1 0 1h-1.3v.7h1.3z"/>' +
      "</svg>" +
    "</span>";

  var enabled = false;
  var injected = false;

  function state() {
    return (window.WanGate && window.WanGate.state && window.WanGate.state()) || null;
  }

  function inject(slot) {
    if (!slot || injected) return;
    var gate = document.getElementById("verifyGate");
    if (gate && gate.getAttribute("data-mode") === "profile") return; // กำลังกรอกข้อมูลหลังล็อกอิน LINE
    var st = state();
    if (st && st.authed) return; // ผู้ใช้ยืนยันตัวตนแล้ว ไม่ต้องแสดงปุ่ม
    injected = true;
    var wrap = document.createElement("div");
    wrap.className = "vg-line-wrap";
    if (enabled) {
      wrap.innerHTML = '<button type="button" class="vg-line-btn" id="vgLineBtn">' +
        LINE_ICON + "<span>เข้าสู่ระบบด้วย LINE</span></button>";
      var btn = wrap.querySelector("#vgLineBtn");
      btn.addEventListener("click", function () {
        var next = window.location.pathname + window.location.search;
        window.location.href = "/auth/line/login?next=" + encodeURIComponent(next);
      });
    } else {
      wrap.innerHTML = '<p class="vg-line-off">ระบบเข้าสู่ระบบด้วย LINE ยังไม่เปิดใช้งาน กรุณาติดต่อฝ่าย IT</p>';
    }
    slot.appendChild(wrap);
    if (slot.parentElement) slot.parentElement.classList.add("vg-has-line");
  }

  function scan() {
    if (!enabled) return;
    var slot = document.getElementById("vgLineSlot");
    if (slot && !injected) inject(slot);
  }

  function errorText(code) {
    if (code === "disabled") return "ระบบยังไม่เปิดใช้งานเข้าสู่ระบบด้วย LINE";
    if (code === "denied") return "ยกเลิกการเข้าสู่ระบบด้วย LINE";
    return "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ (" + code + ") กรุณาลองใหม่อีกครั้ง";
  }

  // แจ้งเตือนผลลัพธ์ที่แนบมากับ URL หลัง redirect กลับจาก LINE
  function handleQuery() {
    var q = new URLSearchParams(window.location.search);
    var error = q.get("line_error");
    var done = q.get("line");
    if (!error && !done) return;
    var msg = "";
    if (error) msg = errorText(error);
    else if (done) msg = "";
    q.delete("line_error");
    q.delete("line");
    var rest = q.toString();
    try {
      history.replaceState(null, "", window.location.pathname + (rest ? "?" + rest : "") + window.location.hash);
    } catch (e) {}
    if (msg) {
      setTimeout(function () {
        if (window.showToast) window.showToast(msg);
      }, 500);
    }
  }

  function watch() {
    var obs = new MutationObserver(function () {
      var slot = document.getElementById("vgLineSlot");
      if (slot) inject(slot);
      if (injected) obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // เผื่อเกตติ้งถูกสร้างไว้ก่อนสคริปต์นี้ทำงาน
    var slot = document.getElementById("vgLineSlot");
    if (slot) inject(slot);
  }

  function init() {
    handleQuery();
    fetch("/api/config", { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        enabled = !!(cfg && cfg.lineLogin && cfg.lineLogin.enabled);
        watch();
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
