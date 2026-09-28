/* ระบบแจ้งซ่อม IT — ตั้งค่าชื่อ / ตำแหน่ง ของผู้ใช้ (เชื่อมโยงทุกหน้า) */
(function () {
  "use strict";

  var GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  var gateEl = null, boxEl = null, nameInput = null, posInput = null;
  var saveBtn = null, errEl = null, closeBtn = null, saving = false;

  function getBar() {
    return document.getElementById("visitorBar");
  }

  function setBarText(name, position) {
    var bar = getBar();
    var txt = document.getElementById("visitorBarText");
    if (bar && txt) {
      txt.textContent = (name || "") + (position ? " · " + position : "");
      bar.classList.remove("hidden");
    }
  }

  function toast(msg) {
    if (window.showToast) { window.showToast(msg); return; }
    if (window.alert) { try { window.alert(msg); } catch (e) {} }
  }

  function buildModal() {
    if (gateEl && gateEl.parentNode) return;
    gateEl = document.createElement("div");
    gateEl.id = "settingsGate";
    gateEl.className = "settings-gate hidden";
    gateEl.setAttribute("role", "dialog");
    gateEl.setAttribute("aria-modal", "true");
    gateEl.innerHTML =
      '<div class="settings-box">' +
        '<button type="button" class="settings-close" aria-label="ปิด">&#215;</button>' +
        '<h2 class="settings-title">ตั้งค่าชื่อผู้ใช้</h2>' +
        '<p class="settings-sub">แก้ไขชื่อและตำแหน่งของคุณ<br>ระบบจะใช้ข้อมูลนี้ในการแจ้งซ่อมครั้งถัดไป</p>' +
        '<div class="settings-fields">' +
          '<label for="setName" class="settings-label">ชื่อ</label>' +
          '<input type="text" id="setName" class="settings-input" maxlength="60" autocomplete="given-name">' +
          '<label for="setPosition" class="settings-label">ตำแหน่ง</label>' +
          '<input type="text" id="setPosition" class="settings-input" maxlength="120" autocomplete="organization-title">' +
        "</div>" +
        '<button id="settingsSave" class="settings-btn-save" type="button">บันทึก</button>' +
        '<p id="settingsErr" class="settings-err hidden"></p>' +
      "</div>";
    document.body.appendChild(gateEl);

    boxEl = gateEl.querySelector(".settings-box");
    nameInput = document.getElementById("setName");
    posInput = document.getElementById("setPosition");
    saveBtn = document.getElementById("settingsSave");
    errEl = document.getElementById("settingsErr");
    closeBtn = gateEl.querySelector(".settings-close");

    closeBtn.addEventListener("click", closeModal);
    saveBtn.addEventListener("click", save);
    nameInput.addEventListener("input", function () { nameInput.classList.remove("invalid"); });
    posInput.addEventListener("input", function () { posInput.classList.remove("invalid"); });
    gateEl.addEventListener("click", function (e) {
      if (e.target === gateEl) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !gateEl.classList.contains("hidden")) closeModal();
    });
  }

  function openSettings() {
    buildModal();
    errEl.classList.add("hidden");
    fetch("/api/visitors/me", { method: "GET", credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok || !d.registered || !d.visitor) {
          toast("กรุณายืนยันตัวตนก่อน แล้วค่อยตั้งค่า");
          return;
        }
        nameInput.value = d.visitor.name || "";
        posInput.value = d.visitor.position || "";
        gateEl.classList.remove("hidden");
        setTimeout(function () { nameInput.focus(); }, 80);
      })
      .catch(function () {
        toast("เชื่อมต่อไม่ได้ กรุณาลองใหม่");
      });
  }

  function closeModal() {
    if (gateEl) gateEl.classList.add("hidden");
  }

  function save() {
    if (saving) return;
    var name = nameInput.value.trim();
    var position = posInput.value.trim();
    if (!name) {
      nameInput.classList.add("invalid");
      nameInput.focus();
      toast("กรุณากรอกชื่อ");
      return;
    }
    if (!position) {
      posInput.classList.add("invalid");
      posInput.focus();
      toast("กรุณากรอกตำแหน่ง");
      return;
    }
    saving = true;
    saveBtn.disabled = true;
    fetch("/api/visitors/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, position: position }),
      credentials: "same-origin"
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        saving = false;
        saveBtn.disabled = false;
        if (!res.ok) {
          errEl.textContent = res.d.message || "บันทึกไม่สำเร็จ กรุณาลองใหม่";
          errEl.classList.remove("hidden");
          return;
        }
        setBarText(res.d.visitor.name, res.d.visitor.position);
        closeModal();
        toast("บันทึกข้อมูลเรียบร้อย");
      })
      .catch(function () {
        saving = false;
        saveBtn.disabled = false;
        errEl.textContent = "เครือข่ายขัดข้อง กรุณาลองใหม่";
        errEl.classList.remove("hidden");
      });
  }

  function wireGear() {
    var nav = document.querySelector(".navbar-inner");
    var existing = document.querySelector(".settings-btn");
    if (existing) {
      existing.addEventListener("click", openSettings);
      return;
    }
    if (!nav) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "settings-btn";
    btn.setAttribute("aria-label", "ตั้งค่าชื่อและตำแหน่ง");
    btn.title = "ตั้งค่า";
    btn.innerHTML = GEAR_SVG;
    btn.addEventListener("click", openSettings);
    nav.appendChild(btn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireGear);
  } else {
    wireGear();
  }
})();