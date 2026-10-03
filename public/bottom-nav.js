/* ระบบแจ้งซ่อม IT — แถบเมนูด้านล่าง (แทนเมนูด้านบน) เชื่อมโยงทุกหน้า */
(function () {
  "use strict";

  var TABS = [
    {
      key: "ticket",
      href: "ticket.html",
      label: "แจ้งซ่อม",
      match: ["ticket.html", "/", "/ticket"],
      icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'
    },
    {
      key: "history",
      href: "my-tickets.html",
      label: "ประวัติ",
      match: ["my-tickets.html"],
      icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'
    },
    {
      key: "contact",
      href: "contact.html",
      label: "ติดต่อ",
      match: ["contact.html"],
      icon: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.6 2.81.72A2 2 0 0 1 22 16.92z"/>'
    },
    {
      key: "settings",
      href: "#settings",
      label: "ตั้งค่า",
      action: "openSettings",
      icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
    }
  ];

  function currentKey() {
    var path = String(window.location.pathname || "").toLowerCase();
    var file = path.substring(path.lastIndexOf("/") + 1);
    for (var i = 0; i < TABS.length; i++) {
      if (TABS[i].match.indexOf(file) !== -1) return TABS[i].key;
    }
    if (!file || file === "index.html") return "ticket";
    return "";
  }

  function build() {
    if (!document.body) return;
    if (!document.body.classList.contains("app-nav")) return;
    if (document.getElementById("bottomNav")) return;

    var active = currentKey();
    var bar = document.createElement("nav");
    bar.id = "bottomNav";
    bar.className = "bottom-nav";
    bar.setAttribute("aria-label", "เมนูหลัก");

    TABS.forEach(function (tab) {
      var on = tab.key === active;
      var el = document.createElement("a");
      el.className = "bn-tab" + (on ? " is-active" : "");
      el.setAttribute("href", tab.href);
      el.setAttribute("data-bn", tab.key);
      if (on) el.setAttribute("aria-current", "page");
      el.innerHTML =
        '<span class="bn-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + tab.icon + "</svg></span>" +
        '<span class="bn-label">' + tab.label + "</span>";
      if (tab.action) {
        el.addEventListener("click", function (e) {
          e.preventDefault();
          openSettings();
        });
      }
      bar.appendChild(el);
    });

    document.body.appendChild(bar);
    document.body.classList.add("has-bottom-nav");
  }

  function openSettings() {
    if (window.openSettings) { window.openSettings(); return; }
    if (window.WanGate && window.WanGate.open) {
      window.WanGate.check().then(function (st) {
        if (st.authed) return;
        window.WanGate.open({ state: st });
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
