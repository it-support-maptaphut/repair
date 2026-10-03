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

        '<div class="settings-section">Key Pass</div>' +
        '<div class="settings-rows">' +
          '<div class="settings-row"><span class="sr-k">Key Pass</span>' +
            '<span class="sr-v"><code class="sr-code" id="srKeypass">•••••</code></span></div>' +
        "</div>" +
        '<p class="settings-note" id="settingsKpNote">ใช้กลับเข้าบัญชีเดิมจากเครื่องอื่น</p>' +
        '<div class="settings-kp-actions">' +
          '<button type="button" class="sr-copy" id="kpReveal">แสดง Key Pass</button>' +
          '<button type="button" class="sr-copy" id="kpCopy">คัดลอก</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(gate);

    els.box = gate.querySelector(".settings-box");
    els.ver = document.getElementById("settingsVer");
    els.name = document.getElementById("srName");
    els.position = document.getElementById("srPosition");
    els.branch = document.getElementById("srBranch");
    els.keypass = document.getElementById("srKeypass");
    els.kpNote = document.getElementById("settingsKpNote");
    els.kpReveal = document.getElementById("kpReveal");
    els.kpCopy = document.getElementById("kpCopy");

    gate.querySelector(".settings-close").addEventListener("click", close);
    gate.addEventListener("click", function (e) { if (e.target === gate) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !gate.classList.contains("hidden")) close();
    });
    els.kpReveal.addEventListener("click", toggleReveal);
    els.kpCopy.addEventListener("click", copyKeypass);

    // เมื่อกรอก Key Pass สำเร็จ (หรือเปลี่ยนผู้ใช้) จากเกตติ้ง → อัปเดตหน้าตั้งค่าตามบัญชีใหม่ทันที
    if (window.WanGate && window.WanGate.onAuthed) {
      window.WanGate.onAuthed(function (st) {
        kpValue = null;
        kpRevealed = false;
        if (els.keypass) els.keypass.textContent = "•••••";
        if (els.kpReveal) els.kpReveal.textContent = "แสดง Key Pass";
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
    els.keypass.textContent = "•••••";
    kpValue = null;
    kpRevealed = false;
    gate.classList.remove("hidden");

    // ยังไม่ได้ยืนยันตัวตน → ส่งไปหน้ากรอกชื่อ-ตำแหน่ง/Key Pass ก่อน
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

    if (visitor.hasKeypass) {
      els.keypass.textContent = "•••••";
      els.kpNote.textContent = "ใช้กลับเข้าบัญชีเดิมจากเครื่องอื่น — กด \"แสดง Key Pass\" เพื่อดู";
      els.kpReveal.disabled = false;
      els.kpCopy.disabled = false;
    } else {
      els.keypass.textContent = "ยังไม่มี";
      els.kpNote.textContent = "ยังไม่มี Key Pass โปรดติดต่อฝ่าย IT";
      els.kpReveal.disabled = true;
      els.kpCopy.disabled = true;
    }
  }

  // ---------- ดู / คัดลอก Key Pass ของตัวเอง ----------
  var kpValue = null;
  var kpRevealed = false;

  function loadKeypass() {
    if (kpValue) return Promise.resolve(kpValue);
    return api("/api/visitors/me/keypass", { method: "GET" }).then(function (r) {
      if (!r.ok) throw new Error(r.d.message || "ดู Key Pass ไม่สำเร็จ");
      kpValue = r.d.keypass || "";
      return kpValue;
    });
  }

  function toggleReveal() {
    if (kpRevealed) {
      els.keypass.textContent = "•••••";
      els.kpReveal.textContent = "แสดง Key Pass";
      kpRevealed = false;
      return;
    }
    loadKeypass().then(function (kp) {
      els.keypass.textContent = kp;
      els.kpReveal.textContent = "ซ่อน Key Pass";
      els.kpNote.textContent = "นี่คือ Key Pass ของคุณ — ใช้เข้าบัญชีเดิมจากเครื่องอื่น ควรเก็บไว้ในที่ลับของคุณ";
      kpRevealed = true;
    }).catch(function (err) {
      els.kpNote.textContent = err.message;
    });
  }

  function copyKeypass() {
    loadKeypass().then(function (kp) {
      if (!kp) throw new Error("ยังไม่มี Key Pass");
      function done() {
        els.keypass.textContent = kp;
        els.kpReveal.textContent = "ซ่อน Key Pass";
        kpRevealed = true;
        toast("คัดลอก Key Pass แล้ว");
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(kp).then(done).catch(function () { fallbackCopyText(kp); done(); });
      } else {
        fallbackCopyText(kp);
        done();
      }
    }).catch(function (err) {
      els.kpNote.textContent = err.message;
    });
  }

  function fallbackCopyText(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }

  window.openSettings = open;
})();
