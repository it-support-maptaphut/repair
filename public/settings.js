/* ระบบแจ้งซ่อม IT — หน้าตั้งค่าผู้ใช้ (เปิดจากแท็บล่าง) เชื่อมโยงทุกหน้า */
(function () {
  "use strict";

  var VERSION_FALLBACK = "V1.0.2";
  var gate = null;
  var els = {};

  var LINE_ICON =
    '<span class="settings-line-ic" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="currentColor">' +
        '<path d="M12 2C6.48 2 2 5.64 2 10.14c0 4.02 3.58 7.39 8.42 8.03.33.07.78.22.89.5.1.25.07.65.03.9l-.14.86c-.05.26-.21 1.02.89.56 1.1-.46 5.94-3.5 8.1-5.99 1.5-1.63 2.21-3.29 2.21-4.86C22.4 5.64 17.52 2 12 2zM8.4 12.9H6.7a.5.5 0 0 1-.5-.5V9a.5.5 0 0 1 1 0v2.9h1.2a.5.5 0 0 1 0 1zm1.9-.5a.5.5 0 0 1-1 0V9a.5.5 0 0 1 1 0v3.4zm4.2 0a.5.5 0 0 1-.9.3l-1.7-2.26v1.96a.5.5 0 0 1-1 0V9a.5.5 0 0 1 .9-.3l1.7 2.26V9a.5.5 0 0 1 1 0v3.4zm3.3-.7a.5.5 0 0 1 0 1h-1.8a.5.5 0 0 1-.5-.5V9a.5.5 0 0 1 .5-.5h1.8a.5.5 0 0 1 0 1h-1.3v.7h1.3a.5.5 0 0 1 0 1h-1.3v.7h1.3z"/>' +
      "</svg>" +
    "</span>";

  function api(path, opts) {
    var o = opts || {};
    o.credentials = "same-origin";
    return fetch(path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        return { ok: r.ok, status: r.status, d: d || {} };
      });
    });
  }

  function initial(name) {
    var s = String(name || "").trim();
    return s ? s.charAt(0).toUpperCase() : "?";
  }

  function renderAvatar(el, url, name) {
    if (!el) return;
    els.avatar_url = url || "";
    els.avatarName = name || "";
    els.avatar.innerHTML = "";
    if (url) {
      var img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      img.onerror = function () { els.avatar.innerHTML = ""; els.avatar.textContent = initial(name); };
      els.avatar.appendChild(img);
    } else {
      els.avatar.textContent = initial(name);
    }
  }

  function build() {
    if (gate && gate.parentNode) return;
    gate = document.createElement("div");
    gate.id = "settingsGate";
    gate.className = "settings-gate hidden";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.innerHTML =
      '<div class="settings-box">' +
        '<div class="settings-top">' +
          '<div class="settings-head">' +
            '<h2 class="settings-title">ตั้งค่าผู้ใช้</h2>' +
            '<p class="settings-ver" id="settingsVer">' + VERSION_FALLBACK + "</p>" +
          "</div>" +
          '<button type="button" class="settings-close" aria-label="ปิด">&#215;</button>' +
        "</div>" +
        '<div class="settings-profile">' +
          '<span class="settings-avatar" id="srAvatar" aria-hidden="true"></span>' +
        "</div>" +
        '<div class="settings-rows">' +
          '<div class="settings-row"><span class="sr-k">ชื่อ</span><span class="sr-v" id="srName">-</span></div>' +
          '<div class="settings-row"><span class="sr-k">ตำแหน่ง</span><span class="sr-v" id="srPosition">-</span></div>' +
          '<div class="settings-row"><span class="sr-k">ประจำสาขา</span><span class="sr-v" id="srBranch">-</span></div>' +
        "</div>" +
        '<div class="settings-line" id="srLineSection" hidden>' +
          '<p class="settings-section">การเชื่อมต่อ</p>' +
          '<div class="settings-rows">' +
            '<div class="settings-row"><span class="sr-k">การเชื่อมต่อ</span><span class="sr-v sr-line-status">' + LINE_ICON + "<span>ไลน์</span></span></div>" +
            '<div class="settings-row"><span class="sr-k">ชื่อในไลน์</span><span class="sr-v" id="srLineName">-</span></div>' +
          "</div>" +
        "</div>" +
        '<div class="settings-oa" id="srOaSection" hidden>' +
          '<p class="settings-section">เพิ่มเพื่อน LINE OA</p>' +
          '<div class="settings-qr">' +
            '<img class="settings-qr-img" id="srOaQr" alt="QR เพิ่มเพื่อน LINE OA" />' +
            '<p class="settings-qr-cap">สแกนด้วยแอป LINE เพื่อเพิ่มเพื่อน OA และรับแจ้งเตือน</p>' +
          "</div>" +
        "</div>" +
        '<div class="settings-actions">' +
          '<button type="button" class="settings-btn-danger" id="settingsLogout">ออกจากระบบ</button>' +
        "</div>" +
      "</div>";

    els.ver = gate.querySelector("#settingsVer");
    els.avatar = gate.querySelector("#srAvatar");
    els.name = gate.querySelector("#srName");
    els.position = gate.querySelector("#srPosition");
    els.branch = gate.querySelector("#srBranch");
    els.lineSection = gate.querySelector("#srLineSection");
    els.lineName = gate.querySelector("#srLineName");
    els.logoutBtn = gate.querySelector("#settingsLogout");
    els.oaSection = gate.querySelector("#srOaSection");
    els.oaQr = gate.querySelector("#srOaQr");

    gate.querySelector(".settings-close").addEventListener("click", close);
    els.logoutBtn.addEventListener("click", doLogout);
    document.body.appendChild(gate);

    loadVersion();
    return Promise.resolve();
  }

  function doLogout() {
    if (window.confirm && !window.confirm("ต้องการออกจากระบบใช่หรือไม่?")) return;
    var done = function () { window.location.reload(); };
    if (window.WanGate && window.WanGate.logout) {
      window.WanGate.logout().then(done).catch(done);
      return;
    }
    fetch("/api/auth/visitor-logout", { method: "POST", credentials: "same-origin" })
      .then(done).catch(done);
  }

  function loadVersion() {
    api("/api/config").then(function (r) {
      if (!r.ok || !r.d) return;
      if (r.d.versionLabel) els.ver.textContent = r.d.versionLabel;
      var oa = r.d.lineOa || {};
      if (els.oaSection) {
        if (oa.enabled) {
          els.oaSection.hidden = false;
          els.oaQr.src = "/api/line-oa-qr.png?size=240";
        } else {
          els.oaSection.hidden = true;
        }
      }
    }).catch(function () {});
  }

  function open() {
    build();
    gate.classList.remove("hidden");

    if (window.WanGate && window.WanGate.check) {
      window.WanGate.check().then(function (st) {
        if (!st.authed) {
          close();
          window.WanGate.open({ state: st });
          return;
        }
        fill(st.visitor);
      }).catch(function () { close(); });
    }
  }

  function close() {
    if (gate) gate.classList.add("hidden");
  }

  function fill(visitor) {
    els.name.textContent = visitor.name || "-";
    els.position.textContent = visitor.position || "-";
    if (els.branch) els.branch.textContent = visitor.branch || "-";

    var hasLine = !!visitor.hasLine;
    if (els.lineSection) els.lineSection.hidden = !hasLine;
    els.lineName.textContent = visitor.lineName || "-";

    renderAvatar(els.avatar, visitor.linePictureUrl, visitor.lineName || visitor.name || "");
  }

  window.openSettings = open;
})();
