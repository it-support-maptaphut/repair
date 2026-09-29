/* ระบบแจ้งซ่อม IT — เกตติ้งยืนยันตัวตน/สมัครบัญชี/เข้าสู่ระบบ (เชื่อมโยงทุกหน้า)
   ขั้นตอน: ชื่อ+ตำแหน่ง  ->  ตั้ง user/password  ->  เข้าใช้งาน
   ระบบจำผู้ใช้ด้วยบัญชี (vst_token) ไม่ผูกกับ IP เดิม จึงเปลี่ยนเน็ต/เปลี่ยนเครื่องแล้วเข้าได้ */
(function () {
  "use strict";

  var cache = null;
  var gate = null;
  var els = {};
  var busy = false;
  var onAuthed = [];
  var current = { step: "1", mode: "register" };

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

  // ---------- สถานะบัญชีของเครื่องนี้ ----------
  function check(force) {
    if (cache && !force) return Promise.resolve(cache);
    return api("/api/visitors/me").then(function (r) {
      if (!r.ok || !r.d || !r.d.ok) throw new Error("net");
      cache = {
        registered: !!r.d.registered,
        authed: !!r.d.authed,
        needsCredentials: !!r.d.needsCredentials,
        visitor: r.d.visitor || null
      };
      return cache;
    });
  }

  function reset() { cache = null; }

  function fireAuthed(state) {
    onAuthed.forEach(function (fn) {
      try { fn(state); } catch (e) {}
    });
  }

  // ---------- สร้างเกตติ้ง ----------
  function build() {
    if (gate && gate.parentNode) return;
    gate = document.createElement("div");
    gate.id = "verifyGate";
    gate.className = "vg-gate hidden";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.innerHTML =
      '<div class="vg-box">' +
        '<div class="vg-head">' +
          '<div class="vg-logo"><img class="vg-logo-img" src="logo-ticket/logo-wan.jpg" alt=""></div>' +
          '<h2 class="vg-title" id="vgTitle">ยืนยันตัวตน</h2>' +
          '<p class="vg-sub" id="vgSub">ขอทราบว่าคุณคือใครในบริษัท<br>ระบบจะจำไว้เพื่อความปลอดภัย</p>' +
        "</div>" +

        '<div class="vg-modes" role="tablist" aria-label="โหมด">' +
          '<button type="button" class="vg-mode is-active" data-mode="register" role="tab" aria-selected="true">สมัครบัญชี</button>' +
          '<button type="button" class="vg-mode" data-mode="login" role="tab" aria-selected="false">เข้าสู่ระบบ</button>' +
        "</div>" +

        // ---- ขั้นที่ 1: ชื่อ + ตำแหน่ง ----
        '<div class="vg-pane" data-pane="step1">' +
          '<div class="vg-steps"><span class="vg-dot is-on"></span><span class="vg-dot"></span></div>' +
          '<div class="vg-fields">' +
            '<label for="vgName" class="vg-label">ชื่อ <span class="vg-req">*</span></label>' +
            '<input type="text" id="vgName" class="vg-input" maxlength="60" autocomplete="given-name">' +
            '<label for="vgPosition" class="vg-label">ตำแหน่ง <span class="vg-req">*</span></label>' +
            '<input type="text" id="vgPosition" class="vg-input" maxlength="120" autocomplete="organization-title">' +
          "</div>" +
          '<button id="vgNext" class="vg-btn" type="button">ถัดไป</button>' +
        "</div>" +

        // ---- ขั้นที่ 2: ตั้ง user/password ----
        '<div class="vg-pane hidden" data-pane="step2">' +
          '<div class="vg-steps"><span class="vg-dot"></span><span class="vg-dot is-on"></span></div>' +
          '<div class="vg-summary" id="vgSummary"></div>' +
          '<button type="button" class="vg-link" id="vgEditName">แก้ไขชื่อ-ตำแหน่ง</button>' +
          '<div class="vg-fields">' +
            '<label for="vgUsername" class="vg-label">ชื่อผู้ใช้ <span class="vg-req">*</span></label>' +
            '<input type="text" id="vgUsername" class="vg-input" maxlength="30" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false">' +
            '<label for="vgPassword" class="vg-label">รหัสผ่าน <span class="vg-req">*</span></label>' +
            '<div class="vg-wrap">' +
              '<input type="password" id="vgPassword" class="vg-input" maxlength="128" autocomplete="new-password">' +
              '<button type="button" class="vg-eye" data-eye="vgPassword" aria-label="แสดงรหัสผ่าน"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button>' +
            "</div>" +
            '<label for="vgPassword2" class="vg-label">ยืนยันรหัสผ่าน <span class="vg-req">*</span></label>' +
            '<div class="vg-wrap">' +
              '<input type="password" id="vgPassword2" class="vg-input" maxlength="128" autocomplete="new-password">' +
              '<button type="button" class="vg-eye" data-eye="vgPassword2" aria-label="แสดงรหัสผ่าน"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button>' +
            "</div>" +
          "</div>" +
          '<button id="vgFinish" class="vg-btn" type="button">ตั้งบัญชีแล้วเข้าใช้งาน</button>' +
        "</div>" +

        // ---- เข้าสู่ระบบ ----
        '<div class="vg-pane hidden" data-pane="login">' +
          '<div class="vg-fields">' +
            '<label for="vgLoginUser" class="vg-label">ชื่อผู้ใช้</label>' +
            '<input type="text" id="vgLoginUser" class="vg-input" maxlength="30" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false">' +
            '<label for="vgLoginPass" class="vg-label">รหัสผ่าน</label>' +
            '<div class="vg-wrap">' +
              '<input type="password" id="vgLoginPass" class="vg-input" maxlength="128" autocomplete="current-password">' +
              '<button type="button" class="vg-eye" data-eye="vgLoginPass" aria-label="แสดงรหัสผ่าน"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button>' +
            "</div>" +
          "</div>" +
          '<button id="vgLoginBtn" class="vg-btn" type="button">เข้าสู่ระบบ</button>' +
        "</div>" +

        '<p id="vgErr" class="vg-err hidden"></p>' +
      "</div>";
    document.body.appendChild(gate);

    els.title = document.getElementById("vgTitle");
    els.sub = document.getElementById("vgSub");
    els.name = document.getElementById("vgName");
    els.position = document.getElementById("vgPosition");
    els.next = document.getElementById("vgNext");
    els.username = document.getElementById("vgUsername");
    els.password = document.getElementById("vgPassword");
    els.password2 = document.getElementById("vgPassword2");
    els.finish = document.getElementById("vgFinish");
    els.editName = document.getElementById("vgEditName");
    els.summary = document.getElementById("vgSummary");
    els.loginUser = document.getElementById("vgLoginUser");
    els.loginPass = document.getElementById("vgLoginPass");
    els.loginBtn = document.getElementById("vgLoginBtn");
    els.err = document.getElementById("vgErr");

    gate.querySelectorAll(".vg-mode").forEach(function (b) {
      b.addEventListener("click", function () {
        setMode(b.getAttribute("data-mode"));
      });
    });
    gate.querySelectorAll(".vg-eye").forEach(function (b) {
      b.addEventListener("click", function () {
        var input = document.getElementById(b.getAttribute("data-eye"));
        if (!input) return;
        var show = input.type === "password";
        input.type = show ? "text" : "password";
        b.classList.toggle("is-on", show);
      });
    });
    [els.name, els.position, els.username, els.password, els.password2, els.loginUser, els.loginPass].forEach(function (el) {
      el.addEventListener("input", function () { el.classList.remove("invalid"); hideErr(); });
    });
    els.next.addEventListener("click", step1Submit);
    els.finish.addEventListener("click", step2Submit);
    els.loginBtn.addEventListener("click", loginSubmit);
    els.editName.addEventListener("click", function () {
      showPane("step1");
      els.name.focus();
    });
    [els.name, els.position].forEach(function (el) {
      el.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); step1Submit(); } });
    });
    [els.username, els.password, els.password2].forEach(function (el) {
      el.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); step2Submit(); } });
    });
    [els.loginUser, els.loginPass].forEach(function (el) {
      el.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); loginSubmit(); } });
    });
    gate.addEventListener("click", function (e) {
      if (e.target === gate) return; // ต้องผ่านขั้นตอน ไม่ปิดด้วยการแตะพื้นหลัง
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && gate && !gate.classList.contains("hidden")) close();
    });
  }

  // ---------- การแสดงผล ----------
  function showPane(name) {
    current.step = name;
    gate.querySelectorAll(".vg-pane").forEach(function (p) {
      p.classList.toggle("hidden", p.getAttribute("data-pane") !== name);
    });
  }

  function setMode(mode) {
    current.mode = mode;
    gate.querySelectorAll(".vg-mode").forEach(function (b) {
      var on = b.getAttribute("data-mode") === mode;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (mode === "login") {
      els.title.textContent = "เข้าสู่ระบบ";
      els.sub.innerHTML = "ใช้ชื่อผู้ใช้และรหัสผ่านเดิมของคุณ<br>เปลี่ยนเครื่องหรือเปลี่ยนเน็ตก็เข้าได้เหมือนเดิม";
      showPane("login");
    } else {
      els.title.textContent = "สมัครใช้งานระบบ";
      els.sub.innerHTML = "กรอกข้อมูล 2 ขั้นตอน แล้วเข้าใช้งานได้ทันที<br>ระบบจะจำบัญชีนี้ไว้ทุกเครื่องที่คุณใช้";
      showPane("step1");
    }
    hideErr();
  }

  function showErr(msg) {
    if (!els.err) { toast(msg); return; }
    els.err.textContent = msg;
    els.err.classList.remove("hidden");
  }

  function hideErr() {
    if (els.err) els.err.classList.add("hidden");
  }

  function markInvalid(el) {
    if (!el) return;
    el.classList.add("invalid");
    el.focus();
  }

  function lock(btn, on) {
    busy = on;
    [els.next, els.finish, els.loginBtn].forEach(function (b) { if (b) b.disabled = on; });
  }

  function open(opts) {
    build();
    var o = opts || {};
    hideErr();
    els.password.value = "";
    els.password2.value = "";
    if (o.username) els.username.value = o.username;

    if (o.mode === "login") {
      setMode("login");
    } else {
      setMode("register");
      var v = (o.state && o.state.visitor) || (cache && cache.visitor) || null;
      if (v) {
        els.name.value = v.name || "";
        els.position.value = v.position || "";
      }
      // ผู้ใช้เก่าที่ยังไม่ได้ตั้งรหัสผ่าน → เริ่มที่ขั้นที่ 2 (ประวัติเดิมยังอยู่)
      if (o.step === "2" || (o.state && o.state.registered && o.state.needsCredentials) || (cache && cache.registered && cache.needsCredentials)) {
        updateSummary();
        showPane("step2");
        setTimeout(function () { els.username.focus(); }, 80);
        gate.classList.remove("hidden");
        return;
      }
    }
    gate.classList.remove("hidden");
    var focusEl = current.step === "login" ? els.loginUser : els.name;
    setTimeout(function () { focusEl.focus(); }, 80);
  }

  function updateSummary() {
    var v = (cache && cache.visitor) || null;
    var name = (els.name.value || "").trim();
    var pos = (els.position.value || "").trim();
    if (v) { name = v.name || name; pos = v.position || pos; }
    if (!els.summary) return;
    els.summary.innerHTML =
      '<span class="vg-sum-k">ชื่อ</span><span class="vg-sum-v">' + escapeHtml(name || "-") + "</span>" +
      '<span class="vg-sum-k">ตำแหน่ง</span><span class="vg-sum-v">' + escapeHtml(pos || "-") + "</span>";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }

  function close() {
    if (gate) gate.classList.add("hidden");
  }

  // ---------- ขั้นที่ 1 ----------
  function step1Submit() {
    if (busy) return;
    var name = els.name.value.trim();
    var position = els.position.value.trim();
    if (!name) { markInvalid(els.name); showErr("กรุณากรอกชื่อ"); return; }
    if (!position) { markInvalid(els.position); showErr("กรุณากรอกตำแหน่ง"); return; }
    lock(els.next, true);
    api("/api/visitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, position: position })
    }).then(function (r) {
      lock(null, false);
      if (!r.ok) { showErr(r.d.message || "บันทึกไม่สำเร็จ กรุณาลองใหม่"); return; }
      cache = { registered: true, authed: false, needsCredentials: true, visitor: r.d.visitor || null };
      updateSummary();
      showPane("step2");
      hideErr();
      setTimeout(function () { els.username.focus(); }, 80);
    }).catch(function () {
      lock(null, false);
      showErr("เครือข่ายขัดข้อง กรุณาลองใหม่");
    });
  }

  // ---------- ขั้นที่ 2 ----------
  function step2Submit() {
    if (busy) return;
    var username = els.username.value.trim().toLowerCase();
    var password = els.password.value;
    var password2 = els.password2.value;
    if (!username) { markInvalid(els.username); showErr("กรุณากรอกชื่อผู้ใช้"); return; }
    if (!/^[a-z0-9][a-z0-9._-]{3,29}$/.test(username)) {
      markInvalid(els.username);
      showErr("ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ความยาว 4-30 ตัวอักษร");
      return;
    }
    if (!password) { markInvalid(els.password); showErr("กรุณากรอกรหัสผ่าน"); return; }
    if (password.length < 6) { markInvalid(els.password); showErr("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"); return; }
    if (/\s/.test(password)) { markInvalid(els.password); showErr("รหัสผ่านห้ามมีช่องว่าง"); return; }
    if (password !== password2) { markInvalid(els.password2); showErr("รหัสผ่านทั้งสองช่องไม่ตรงกัน"); return; }

    lock(els.finish, true);
    api("/api/visitors/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username, password: password, confirmPassword: password2 })
    }).then(function (r) {
      lock(null, false);
      if (!r.ok) {
        if (r.status === 409) markInvalid(els.username);
        showErr(r.d.message || "ตั้งบัญชีไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      cache = { registered: true, authed: true, needsCredentials: false, visitor: r.d.visitor || null };
      close();
      toast("ตั้งบัญชีสำเร็จ — เข้าใช้งานได้แล้ว");
      fireAuthed(cache);
    }).catch(function () {
      lock(null, false);
      showErr("เครือข่ายขัดข้อง กรุณาลองใหม่");
    });
  }

  // ---------- เข้าสู่ระบบ ----------
  function loginSubmit() {
    if (busy) return;
    var username = els.loginUser.value.trim().toLowerCase();
    var password = els.loginPass.value;
    if (!username) { markInvalid(els.loginUser); showErr("กรุณากรอกชื่อผู้ใช้"); return; }
    if (!password) { markInvalid(els.loginPass); showErr("กรุณากรอกรหัสผ่าน"); return; }
    lock(els.loginBtn, true);
    api("/api/auth/visitor-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username, password: password })
    }).then(function (r) {
      lock(null, false);
      if (!r.ok) {
        markInvalid(els.loginPass);
        showErr(r.d.message || "เข้าสู่ระบบไม่สำเร็จ");
        return;
      }
      cache = { registered: true, authed: true, needsCredentials: false, visitor: r.d.visitor || null };
      close();
      toast("เข้าสู่ระบบแล้ว ยินดีต้อนรับ " + ((cache.visitor && cache.visitor.name) || ""));
      fireAuthed(cache);
    }).catch(function () {
      lock(null, false);
      showErr("เครือข่ายขัดข้อง กรุณาลองใหม่");
    });
  }

  // ---------- เรียกใช้จากหน้าอื่น ----------
  function requireAuth(reason) {
    return check().then(function (st) {
      if (st.authed) return st;
      open({
        mode: st.registered && !st.needsCredentials ? "login" : "register",
        step: st.registered && st.needsCredentials ? "2" : "1",
        state: st
      });
      var e = new Error("ยังไม่ได้เข้าสู่ระบบ");
      e.reason = reason || "auth";
      e.state = st;
      throw e;
    });
  }

  function logout() {
    return api("/api/auth/visitor-logout", { method: "POST" }).then(function () {
      reset();
      close();
    });
  }

  window.WanGate = {
    check: check,
    refresh: function () { reset(); return check(true); },
    state: function () { return cache; },
    open: open,
    close: close,
    requireAuth: requireAuth,
    logout: logout,
    onAuthed: function (fn) { if (typeof fn === "function") onAuthed.push(fn); }
  };

  // ---------- อุ่นแคชสถานะบัญชีให้หน้าอื่นได้ทันที ----------
  function warm() { check().catch(function () {}); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", warm);
  } else {
    warm();
  }
})();
