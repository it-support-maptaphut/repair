/* ล็อกการซูมหน้าจอ — ใช้กับทุกหน้าของระบบ (admin + หน้าผู้ใช้)
   กันครบทั้ง: pinch (2 นิ้ว), double-tap, ctrl+wheel บน trackpad, ctrl +/-
   iOS Safari ไม่สนใจ user-scalable=no ตั้งแต่ iOS 10 จึงต้องล็อกด้วย JS เพิ่ม */
(function () {
  "use strict";
  if (window.__noZoomLocked) return;
  window.__noZoomLocked = true;

  // 1) บังคับ meta viewport (Safari บางเวอร์ชันลบค่าทิ้งเองตอน resize)
  function lockViewport() {
    var m = document.querySelector('meta[name="viewport"]');
    if (!m) {
      m = document.createElement("meta");
      m.setAttribute("name", "viewport");
      document.head.appendChild(m);
    }
    var set = {};
    String(m.getAttribute("content") || "").split(",").forEach(function (p) {
      var i = p.indexOf("=");
      if (i > 0) set[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    });
    set["width"] = set["width"] || "device-width";
    set["initial-scale"] = set["initial-scale"] || "1";
    set["maximum-scale"] = "1";
    set["minimum-scale"] = "1";
    set["user-scalable"] = "no";
    m.setAttribute(
      "content",
      Object.keys(set).map(function (k) { return k + "=" + set[k]; }).join(", ")
    );
  }
  lockViewport();
  window.addEventListener("resize", lockViewport);
  window.addEventListener("orientationchange", function () { setTimeout(lockViewport, 200); });

  // 2) touch-action: manipulation = เลิก delay 300ms และเลิก double-tap zoom
  if (!document.getElementById("no-zoom-style")) {
    var st = document.createElement("style");
    st.id = "no-zoom-style";
    st.textContent =
      "html,body,body *{touch-action:manipulation !important;}" +
      "html,body{overscroll-behavior-y:none;}";
    document.head.appendChild(st);
  }

  var stop = function (e) { e.preventDefault(); };

  // 3) pinch บน iOS/macOS (gesture* event)
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (n) {
    document.addEventListener(n, stop, { passive: false });
  });

  // 4) pinch ด้วยสองนิ้วบน Android/Windows
  document.addEventListener("touchmove", function (e) {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  // 5) pinch บน trackpad คอมพิวเตอร์ (ctrl + wheel)
  document.addEventListener("wheel", function (e) {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  }, { passive: false });

  // 6) คีย์ลัดซูม ctrl + / ctrl - / ctrl 0
  document.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    var k = String(e.key || "");
    if (k === "+" || k === "=" || k === "-" || k === "0" || k === "Add" || k === "Subtract") e.preventDefault();
  }, { passive: false });

  // 7) ไม่กันการเลือก/คัดลอกข้อความ — ผู้ใช้ต้องคัดลอก Key Pass และรายละเอียดงานได้
})();
