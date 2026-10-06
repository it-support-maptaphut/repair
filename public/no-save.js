/* บล็อกเบราว์เซอร์ไม่ให้สำรอง/เติมรหัสผ่านอัตโนมัติทุกหน้าในระบบ Admin
   ใช้ร่วมกันทุกหน้า: ใส่ <script src="/no-save.js"></script> */
(function () {
  "use strict";

  /* ---------- 1) ปิดการสำรอง/เติมอัตโนมัติของเบราว์เซอร์ + ตัวช่วยจำรหัสผ่าน ---------- */
  var VENDOR = ["data-lpignore", "data-1p-ignore", "data-bwignore", "data-form-type"];

  function harden(el) {
    if (!el) return;
    el.setAttribute("autocomplete", "off");
    el.setAttribute("autocapitalize", "none");
    el.setAttribute("autocorrect", "off");
    el.setAttribute("spellcheck", "false");
    el.setAttribute("data-lpignore", "true");
    el.setAttribute("data-1p-ignore", "true");
    el.setAttribute("data-bwignore", "true");
    el.setAttribute("data-form-type", "other");
  }

  /* ---------- 2) ฟอร์มที่ครอบช่องรหัสผ่าน ---------- */
  function hardenForms() {
    var forms = document.querySelectorAll("form");
    for (var i = 0; i < forms.length; i++) {
      var f = forms[i];
      if (f.hasAttribute("data-nosave-decoy")) continue;
      f.setAttribute("autocomplete", "off");
    }
  }

  /* ---------- 3) ล้างค่าที่เบราว์เซอร์เติมให้อัตโนมัติ ---------- */
  /* เบราว์เซอร์หลายตัว (Chrome/Edge/Safari) ฝืน autocomplete="off" ได้
     วิธีกันที่เชื่อถือที่สุด: ถ้าช่องไหนมีค่าอยู่แต่ผู้ใช้ยังไม่เคยพิม -> ถือว่าเบราว์เซอร์เติมให้ ล้างทิ้ง
     หมายเหตุ: ใช้ event "input" เป็นตัวบอกว่าผู้ใช้พิมเอง ไม่ใช่ "focus"
     เพราะหลายหน้ามี autofocus ถ้าใช้ focus จะถูกเข้าใจผิดว่าผู้ใช้เติมค่าเอง */
  function fields() {
    return document.querySelectorAll('input[type="password"], input[autocomplete="username"], input[id$="GateUser"]');
  }

  function wipeAutoFilled() {
    var list = fields();
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.dataset.nsTyped !== "1" && el.value) el.value = "";
    }
  }

  function trackTyping() {
    var list = fields();
    for (var i = 0; i < list.length; i++) {
      (function (el) {
        el.addEventListener("input", function () { el.dataset.nsTyped = "1"; });
      })(list[i]);
    }
  }

  /* ---------- 4) กันลาก/วางรหัสผ่าน ---------- */
  function blockDrop() {
    var list = fields();
    for (var i = 0; i < list.length; i++) {
      (function (el) {
        el.addEventListener("dragover", function (e) { e.preventDefault(); });
        el.addEventListener("drop", function (e) { e.preventDefault(); });
      })(list[i]);
    }
  }

  /* ---------- 5) ช่องรหัสผ่านที่ถูกสร้างด้วย JS ( popup ) ---------- */
  /* หน้า Admin สร้าง dialog ยืนยันตัวตนหลังหน้าโหลดเสร็จ
     ต้องคอยดู DOM แล้วปิดการบันทึกให้ช่องใหม่ทันที ไม่ใช่รอรีเฟรชหน้า */
  var seen = new WeakSet();

  function protectNew(el) {
    if (!el || seen.has(el)) return;
    seen.add(el);
    harden(el);
    el.addEventListener("input", function () { el.dataset.nsTyped = "1"; });
    el.addEventListener("dragover", function (e) { e.preventDefault(); });
    el.addEventListener("drop", function (e) { e.preventDefault(); });
    if (el.value && el.dataset.nsTyped !== "1") el.value = "";
  }

  function watchNewFields() {
    var list = fields();
    for (var i = 0; i < list.length; i++) protectNew(list[i]);

    if (window.MutationObserver) {
      var mo = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var added = records[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (n.nodeType !== 1) continue;
            if (n.matches && n.matches('input[type="password"]')) protectNew(n);
            if (n.querySelectorAll) {
              var inner = n.querySelectorAll('input[type="password"], input[autocomplete="username"]');
              for (var k = 0; k < inner.length; k++) protectNew(inner[k]);
            }
          }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  /* ---------- รัน ---------- */
  function init() {
    var pw = document.querySelectorAll('input[type="password"]');
    for (var i = 0; i < pw.length; i++) harden(pw[i]);

    var gateUser = document.getElementById("dbGateUser");
    if (gateUser) harden(gateUser);

    hardenForms();
    trackTyping();
    blockDrop();
    watchNewFields();
    wipeAutoFilled();

    /* ทันทีตอนโหลด, ตอนกลับจากประวัติ (bfcache), ตอนกลับมามองหน้าจอ */
    window.addEventListener("pageshow", wipeAutoFilled);
    window.addEventListener("load", wipeAutoFilled);
    window.addEventListener("focus", wipeAutoFilled);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) wipeAutoFilled();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();