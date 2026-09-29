/* ระบบแจ้งซ่อม IT — หน้าตั้งค่าผู้ใช้ (เปิดจากแท็บล่าง) เชื่อมโยงทุกหน้า */
(function () {
  "use strict";

  var VERSION_FALLBACK = "1.0.1 (TEST)";
  var gate = null;
  var els = {};
  var saving = false;

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
        "</div>" +

        '<form class="settings-fields" id="settingsForm" autocomplete="off">' +
          '<label for="setName" class="settings-label">ชื่อ</label>' +
          '<input type="text" id="setName" class="settings-input" maxlength="60" autocomplete="given-name">' +
          '<label for="setPosition" class="settings-label">ตำแหน่ง</label>' +
          '<input type="text" id="setPosition" class="settings-input" maxlength="120" autocomplete="organization-title">' +
          '<button id="settingsSave" class="settings-btn-save" type="submit">บันทึกชื่อ-ตำแหน่ง</button>' +
          '<p id="settingsErr" class="settings-err hidden"></p>' +
        "</form>" +

        '<div class="settings-section">ข้อมูลเข้าสู่ระบบ</div>' +
        '<div class="settings-rows">' +
          '<div class="settings-row"><span class="sr-k">ชื่อผู้ใช้</span>' +
            '<span class="sr-v"><code class="sr-code" id="srUser">-</code>' +
            '<button type="button" class="sr-copy" data-copy="srUser" aria-label="คัดลอกชื่อผู้ใช้">คัดลอก</button></span></div>' +
          '<div class="settings-row"><span class="sr-k">รหัสผ่าน</span>' +
            '<span class="sr-v"><code class="sr-code" id="srPass">••••••</code>' +
            '<button type="button" class="sr-copy" id="srReveal" aria-label="แสดงรหัสผ่าน">แสดง</button>' +
            '<button type="button" class="sr-copy" data-copy="srPass" aria-label="คัดลอกรหัสผ่าน">คัดลอก</button></span></div>' +
        "</div>" +
        '<p class="settings-note" id="settingsPassNote"></p>' +

        '<div class="settings-actions">' +
          '<button type="button" class="settings-btn-ghost" id="settingsChangePass">เปลี่ยนรหัสผ่าน</button>' +
          '<button type="button" class="settings-btn-danger" id="settingsLogout">ออกจากระบบ</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(gate);

    els.box = gate.querySelector(".settings-box");
    els.ver = document.getElementById("settingsVer");
    els.name = document.getElementById("srName");
    els.position = document.getElementById("srPosition");
    els.form = document.getElementById("settingsForm");
    els.nameInput = document.getElementById("setName");
    els.posInput = document.getElementById("setPosition");
    els.save = document.getElementById("settingsSave");
    els.err = document.getElementById("settingsErr");
    els.user = document.getElementById("srUser");
    els.pass = document.getElementById("srPass");
    els.reveal = document.getElementById("srReveal");
    els.passNote = document.getElementById("settingsPassNote");
    els.changePass = document.getElementById("settingsChangePass");
    els.logout = document.getElementById("settingsLogout");

    gate.querySelector(".settings-close").addEventListener("click", close);
    gate.addEventListener("click", function (e) { if (e.target === gate) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !gate.classList.contains("hidden")) close();
    });
    els.form.addEventListener("submit", function (e) { e.preventDefault(); save(); });
    [els.nameInput, els.posInput].forEach(function (el) {
      el.addEventListener("input", function () { el.classList.remove("invalid"); hideErr(); });
    });
    gate.querySelectorAll("[data-copy]").forEach(function (b) {
      b.addEventListener("click", function () { copyText(b.getAttribute("data-copy")); });
    });
    els.reveal.addEventListener("click", function () {
      els.pass.textContent = els.pass.textContent === "••••••" ? (els.pass.getAttribute("data-plain") || "") : "••••••";
      els.reveal.textContent = els.pass.textContent === "••••••" ? "แสดง" : "ซ่อน";
    });
    els.changePass.addEventListener("click", openChangePassword);
    els.logout.addEventListener("click", doLogout);

    loadVersion();
  }

  function loadVersion() {
    api("/api/config").then(function (r) {
      if (r.ok && r.d && r.d.versionLabel) els.ver.textContent = r.d.versionLabel;
    }).catch(function () {});
  }

  function hideErr() { if (els.err) els.err.classList.add("hidden"); }
  function showErr(msg) {
    if (!els.err) { toast(msg); return; }
    els.err.textContent = msg;
    els.err.classList.remove("hidden");
  }

  function open() {
    build();
    hideErr();
    els.pass.textContent = "••••••";
    els.pass.removeAttribute("data-plain");
    els.reveal.textContent = "แสดง";
    els.passNote.textContent = "";
    gate.classList.remove("hidden");

    // ยังไม่เข้าสู่ระบบ → ส่งไปหน้าสมัคร/เข้าสู่ระบบก่อน
    if (window.WanGate && window.WanGate.check) {
      window.WanGate.check().then(function (st) {
        if (!st.authed) {
          close();
          window.WanGate.open({
            mode: st.registered && !st.needsCredentials ? "login" : "register",
            step: st.registered && st.needsCredentials ? "2" : "1",
            state: st
          });
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
    els.nameInput.value = visitor.name || "";
    els.posInput.value = visitor.position || "";
    els.user.textContent = visitor.username || "-";
    loadCredential();
  }

  function loadCredential() {
    api("/api/visitors/me/credential").then(function (r) {
      if (!r.ok || !r.d || !r.d.ok) {
        els.pass.textContent = "-";
        els.passNote.textContent = "ยังไม่ได้ตั้งชื่อผู้ใช้และรหัสผ่าน";
        els.reveal.style.display = "none";
        return;
      }
      var c = r.d.credential || {};
      els.user.textContent = c.username || "-";
      els.reveal.style.display = "";
      if (c.password) {
        els.pass.setAttribute("data-plain", c.password);
        els.pass.textContent = "••••••";
        els.passNote.textContent = "กด “แสดง” เพื่อดูรหัสผ่าน (รหัสผ่านนี้ใช้เข้าสู่ระบบได้ทุกเครื่อง)";
      } else {
        els.pass.removeAttribute("data-plain");
        els.pass.textContent = "••••••";
        els.passNote.textContent = "ไม่สามารถแสดงรหัสผ่านเดิมได้ กรุณากด “เปลี่ยนรหัสผ่าน” เพื่อตั้งใหม่";
      }
    }).catch(function () {
      els.pass.textContent = "-";
    });
  }

  function copyText(targetId) {
    var el = document.getElementById(targetId);
    if (!el) return;
    var val = el.getAttribute("data-plain") || el.textContent || "";
    if (el.id === "srPass" && !el.getAttribute("data-plain")) {
      toast("กดปุ่ม “แสดง” ก่อนคัดลอกรหัสผ่าน");
      return;
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(val).then(function () { toast("คัดลอกแล้ว"); })
        .catch(function () { fallbackCopy(val); });
    } else {
      fallbackCopy(val);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    toast(ok ? "คัดลอกแล้ว" : "คัดลอกไม่สำเร็จ กรุณาเลือกข้อความเอง");
  }

  function save() {
    if (saving) return;
    var name = els.nameInput.value.trim();
    var position = els.posInput.value.trim();
    if (!name) { els.nameInput.classList.add("invalid"); els.nameInput.focus(); showErr("กรุณากรอกชื่อ"); return; }
    if (!position) { els.posInput.classList.add("invalid"); els.posInput.focus(); showErr("กรุณากรอกตำแหน่ง"); return; }
    saving = true;
    els.save.disabled = true;
    api("/api/visitors/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, position: position })
    }).then(function (r) {
      saving = false;
      els.save.disabled = false;
      if (!r.ok) { showErr(r.d.message || "บันทึกไม่สำเร็จ กรุณาลองใหม่"); return; }
      fill(r.d.visitor);
      toast("บันทึกข้อมูลเรียบร้อย");
    }).catch(function () {
      saving = false;
      els.save.disabled = false;
      showErr("เครือข่ายขัดข้อง กรุณาลองใหม่");
    });
  }

  // ---------- เปลี่ยนรหัสผ่าน ----------
  function openChangePassword() {
    close();
    var mask = document.createElement("div");
    mask.className = "settings-gate";
    mask.innerHTML =
      '<div class="settings-box">' +
        '<div class="settings-top">' +
          '<div class="settings-head">' +
            '<h2 class="settings-title">เปลี่ยนรหัสผ่าน</h2>' +
            '<p class="settings-sub">กรอกรหัสผ่านเดิมเพื่อยืนยันตัวตน แล้วตั้งรหัสผ่านใหม่</p>' +
          "</div>" +
          '<button type="button" class="settings-close" aria-label="ปิด">&#215;</button>' +
        "</div>" +
        '<div class="settings-fields">' +
          '<label class="settings-label" for="cpOld">รหัสผ่านเดิม</label>' +
          '<input type="password" id="cpOld" class="settings-input" maxlength="128" autocomplete="current-password">' +
          '<label class="settings-label" for="cpNew">รหัสผ่านใหม่</label>' +
          '<input type="password" id="cpNew" class="settings-input" maxlength="128" autocomplete="new-password" placeholder="อย่างน้อย 6 ตัวอักษร">' +
          '<label class="settings-label" for="cpNew2">ยืนยันรหัสผ่านใหม่</label>' +
          '<input type="password" id="cpNew2" class="settings-input" maxlength="128" autocomplete="new-password">' +
        "</div>" +
        '<button id="cpSave" class="settings-btn-save" type="button">บันทึกรหัสผ่านใหม่</button>' +
        '<p id="cpErr" class="settings-err hidden"></p>' +
      "</div>";
    document.body.appendChild(mask);
    var oldEl = document.getElementById("cpOld");
    var newEl = document.getElementById("cpNew");
    var new2El = document.getElementById("cpNew2");
    var errEl = document.getElementById("cpErr");
    var saveBtn = document.getElementById("cpSave");
    function close2() { mask.classList.add("hidden"); document.body.removeChild(mask); }
    mask.querySelector(".settings-close").addEventListener("click", close2);
    mask.addEventListener("click", function (e) { if (e.target === mask) close2(); });
    setTimeout(function () { oldEl.focus(); }, 60);

    saveBtn.addEventListener("click", function () {
      var oldP = oldEl.value;
      var newP = newEl.value;
      var new2 = new2El.value;
      if (!oldP) { oldEl.classList.add("invalid"); errEl.textContent = "กรอกรหัสผ่านเดิม"; errEl.classList.remove("hidden"); return; }
      if (!newP || newP.length < 6) { newEl.classList.add("invalid"); errEl.textContent = "รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร"; errEl.classList.remove("hidden"); return; }
      if (/\s/.test(newP)) { newEl.classList.add("invalid"); errEl.textContent = "รหัสผ่านห้ามมีช่องว่าง"; errEl.classList.remove("hidden"); return; }
      if (newP !== new2) { new2El.classList.add("invalid"); errEl.textContent = "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน"; errEl.classList.remove("hidden"); return; }
      saveBtn.disabled = true;
      api("/api/visitors/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: oldP, newPassword: newP })
      }).then(function (r) {
        saveBtn.disabled = false;
        if (!r.ok) { errEl.textContent = r.d.message || "เปลี่ยนรหัสผ่านไม่สำเร็จ"; errEl.classList.remove("hidden"); return; }
        close2();
        toast("เปลี่ยนรหัสผ่านเรียบร้อย");
        loadCredential();
        open();
      }).catch(function () {
        saveBtn.disabled = false;
        errEl.textContent = "เครือข่ายขัดข้อง กรุณาลองใหม่";
        errEl.classList.remove("hidden");
      });
    });
  }

  // ---------- ออกจากระบบ ----------
  function doLogout() {
    if (!window.confirm("ออกจากระบบหรือไม่?\nถ้าใช้เครื่องนี้ร่วมกับคนอื่น ควรออกทุกครั้งหลังใช้งานเสร็จ")) return;
    api("/api/auth/visitor-logout", { method: "POST" }).then(function () {
      close();
      if (window.__repairNotify) window.__repairNotify.stop();
      if (window.WanGate && window.WanGate.refresh) window.WanGate.refresh();
      window.location.href = "ticket.html";
    }).catch(function () {
      window.location.href = "ticket.html";
    });
  }

  window.openSettings = open;
})();
