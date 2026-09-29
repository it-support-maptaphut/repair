(function () {
  "use strict";

  var bar = document.createElement("div");
  bar.className = "top-loader";
  bar.innerHTML = '<div class="top-loader-fill"></div><div class="top-loader-chip"><span class="top-loader-spin"></span><span class="top-loader-text">กำลังโหลด...</span></div>';
  document.documentElement.appendChild(bar);

  var chip = bar.querySelector(".top-loader-chip");
  var text = bar.querySelector(".top-loader-text");

  var count = 0;
  var shownAt = 0;
  var hideTimer = null;
  var MIN_MS = 350;
  var MAX_MS = 9000;

  function render() {
    bar.classList.toggle("on", count > 0);
  }

  function show(label) {
    if (label) text.textContent = label;
    count++;
    if (!shownAt) shownAt = performance.now();
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    render();
  }

  function hide() {
    if (count > 0) count--;
    if (count > 0) return;
    if (hideTimer) return;
    var wait = Math.max(0, MIN_MS - (performance.now() - shownAt));
    hideTimer = setTimeout(function () {
      hideTimer = null;
      shownAt = 0;
      text.textContent = "กำลังโหลด...";
      render();
    }, wait);
  }

  function safety() {
    if (count > 0) {
      if (performance.now() - shownAt > MAX_MS) {
        count = 0;
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        shownAt = 0;
        text.textContent = "กำลังโหลด...";
        render();
      }
      setTimeout(safety, 500);
    }
  }
  setTimeout(safety, MAX_MS);

  window.__loading = {
    show: show,
    hide: hide,
    busy: function () { return count > 0; }
  };

  var origFetch = window.fetch;
  if (origFetch) {
    // เลขเครื่อง: เก็บไว้ใน localStorage เพื่อยืนยันตัวตนแม้เปลี่ยนเน็ต (กันล็อกอินซ้ำ)
    var DEVICE_KEY = "wan_device_uid";
    function deviceUid() {
      try {
        var v = localStorage.getItem(DEVICE_KEY);
        if (!v) {
          v = "dev-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
          localStorage.setItem(DEVICE_KEY, v);
        }
        return v;
      } catch (e) { return ""; }
    }
    window.WanDeviceUid = deviceUid;

    function isSameOrigin(url) {
      if (/^\//.test(url)) return true;
      try { return String(url).indexOf(location.origin) === 0; } catch (e) { return false; }
    }

    window.fetch = function (input, init) {
      var uid = deviceUid();
      if (uid && isSameOrigin(typeof input === "string" ? input : (input && input.url) || "")) {
        init = init || {};
        var headers = init.headers || {};
        if (typeof Headers !== "undefined" && headers instanceof Headers) {
          headers = new Headers(headers);
          headers.set("X-Device-Id", uid);
        } else if (Array.isArray(headers)) {
          headers = headers.slice();
          headers.push(["X-Device-Id", uid]);
        } else {
          headers = Object.assign({}, headers, { "X-Device-Id": uid });
        }
        init.headers = headers;
      }
      show();
      return origFetch.call(this, input, init).then(function (r) {
        hide();
        return r;
      }, function (e) {
        hide();
        throw e;
      });
    };
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var a = t.closest("a[href]");
    if (!a || !a.href) return;
    var to = a.href.split("#")[0];
    var from = location.href.split("#")[0];
    if (to === from) return;
    show("กำลังเปิดหน้า...");
  }, true);
})();