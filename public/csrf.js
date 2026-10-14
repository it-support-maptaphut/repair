/* CSRF double-submit: เติม header x-csrf-token ให้ทุก request ที่เปลี่ยนข้อมูล
   ทำงานคู่กับ cookie csrf_token ที่เซิร์ฟเวอร์ออกให้ตอนล็อกอิน */
(function () {
  "use strict";

  function readCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.*+?^${}()|[\]\\])/g, "\\$1") + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }

  function isMutation(method) {
    var m = String(method || "GET").toUpperCase();
    return m !== "GET" && m !== "HEAD" && m !== "OPTIONS";
  }

  if (window.fetch) {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      init = init || {};
      var method = init.method || (input && input.method) || "GET";
      if (isMutation(method)) {
        var token = readCookie("csrf_token");
        if (token) {
          try {
            var headers = new Headers(init.headers || (input && input.headers) || {});
            if (!headers.has("x-csrf-token")) headers.set("x-csrf-token", token);
            init.headers = headers;
          } catch (e) {}
        }
      }
      return origFetch.call(this, input, init);
    };
  }

  if (window.XMLHttpRequest) {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method) {
      this.__csrfMethod = method;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      try {
        if (isMutation(this.__csrfMethod)) {
          var token = readCookie("csrf_token");
          if (token) this.setRequestHeader("x-csrf-token", token);
        }
      } catch (e) {}
      return origSend.apply(this, arguments);
    };
  }
})();
