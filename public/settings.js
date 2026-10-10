/* ระบบแจ้งซ่อม IT — หน้าตั้งค่าผู้ใช้ (เปิดจากแท็บล่าง) เชื่อมโยงทุกหน้า */
(function () {
  "use strict";

  var VERSION_FALLBACK = "V1.0.2";
  var gate = null;
  var els = {};

  function toast(msg) {
    if (window.showToast) { window.showToast(msg); return; }
    if (window.alert) { try { window.alert(msg); } catch (e) {} }
  }

  function api(path, opts) {
    var o = opts || {};
    o.credentials = "same-origin";
    return fetch(path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        return { ok: r.ok, status: r.status, d: d || {} };
      });
    });
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

        '<div class="settings-rows">' +
          '<div class="settings-row"><span class="sr-k">ชื่อ</span><span class="sr-v" id="srName">-</span></div>' +
          '<div class="settings-row"><span class="sr-k">ตำแหน่ง</span><span class="sr-v" id="srPosition">-</span></div>' +
          '<div class="settings-row"><span class="sr-k">ประจำสาขา</span><span class="sr-v" id="srBranch">-</span></div>' +
        "</div>" +
      "</div>";
    document.body.appendChild(gate);

    els.ver = document.getElementById("settingsVer");
    els.name = document.getElementById("srName");
    els.position = document.getElementById("srPosition");
    els.branch = document.getElementById("srBranch");

    gate.querySelector(".settings-close").addEventListener("click", close);
    gate.addEventListener("click", function (e) { if (e.target === gate) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !gate.classList.contains("hidden")) close();
    });

    // เมื่อเปลี่ยนผู้ใช้จากเกตติ้ง → อัปเดตหน้าตั้งค่าตามบัญชีใหม่ทันที
    if (window.WanGate && window.WanGate.onAuthed) {
      window.WanGate.onAuthed(function (st) {
        if (st && st.visitor) fill(st.visitor);
      });
    }

    loadVersion();
  }

  function loadVersion() {
    api("/api/config").then(function (r) {
      if (r.ok && r.d && r.d.versionLabel) els.ver.textContent = r.d.versionLabel;
    }).catch(function () {});
  }

  function open() {
    build();
    gate.classList.remove("hidden");

    // ยังไม่ได้ยืนยันตัวตน → เปิดเกตติ้งล็อกอินด้วย LINE ก่อน
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
    if (!visitor) return;
    els.name.textContent = visitor.name || "-";
    els.position.textContent = visitor.position || "-";
    if (els.branch) els.branch.textContent = visitor.branch || "-";
  }

  window.openSettings = open;
})();
