/* ระบบแจ้งซ่อม IT — เกตติ้งยืนยันตัวตน (เชื่อมโยงทุกหน้า)
   กรอกชื่อ + ตำแหน่ง  ->  เข้าใช้งานได้ทันที (ไม่บังคับอะไร)
   ระบบจำเครื่องนี้ด้วยคุกกี้ (1 ปี) เปิดใหม่/รีเฟรชแล้วไม่ต้องกรอกซ้ำ
   มีลิงก์เล็ก ๆ ให้ใส่ Key Pass สำหรับใครที่อยากกลับเข้าบัญชีเดิมจากเครื่องอื่น */
(function () {
  "use strict";

  var cache = null;
  var gate = null;
  var els = {};
  var busy = false;
  var canClose = false; // ปิดเกตติ้งได้เฉพาะตอนผู้ใช้ยืนยันตัวตนแล้ว (สลับบัญชี)
  var onAuthed = [];
  var current = { pane: "step1" };

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
        '<button type="button" class="vg-close hidden" id="vgClose" aria-label="ปิด">&#215;</button>' +
        '<div class="vg-head">' +
          '<div class="vg-logo"><img class="vg-logo-img" src="logo-ticket/logo-wan.png" alt=""></div>' +
          '<h2 class="vg-title">ขอทราบว่าคุณคือใคร</h2>' +
          '<p class="vg-sub" id="vgSub">กรอกชื่อและตำแหน่ง แล้วเข้าใช้งานได้ทันที<br>ไม่ต้องสมัคร ไม่ต้องตั้งรหัสผ่าน</p>' +
        "</div>" +

        // ---- กรอกชื่อ + ตำแหน่ง ----
        '<div class="vg-pane" data-pane="step1">' +
          '<div class="vg-fields">' +
            '<label for="vgName" class="vg-label">ชื่อ <span class="vg-req">*</span></label>' +
            '<input type="text" id="vgName" class="vg-input" maxlength="60" autocomplete="given-name">' +
            '<label for="vgPosition" class="vg-label">ตำแหน่ง <span class="vg-req">*</span></label>' +
            '<input type="text" id="vgPosition" class="vg-input" maxlength="120" autocomplete="organization-title">' +
            '<label for="vgBranch" class="vg-label">ประจำสาขา <span class="vg-req">*</span></label>' +
            '<div class="vg-select">' +
              '<select id="vgBranch" class="vg-input vg-select-input is-placeholder">' +
                '<option value="">เลือกสาขาที่คุณประจำอยู่</option>' +
                '<option value="ร้านวรรณสาขา 1 (ขนส่งเก่าระยอง)">ร้านวรรณสาขา 1 (ขนส่งเก่าระยอง)</option>' +
                '<option value="ร้านวรรณสาขา 3 (ไกล้ รพ. กรุงเทพระยอง)">ร้านวรรณสาขา 3 (ไกล้ รพ. กรุงเทพระยอง)</option>' +
                '<option value="ร้านวรรณสาขา 4 (มาบตาพุด ระยอง)">ร้านวรรณสาขา 4 (มาบตาพุด ระยอง)</option>' +
                '<option value="ร้านวรรณสาขา 5 (บ้านฉาง ระยอง)">ร้านวรรณสาขา 5 (บ้านฉาง ระยอง)</option>' +
              "</select>" +
              '<span class="vg-select-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></span>' +
              '<span class="vg-select-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>' +
            "</div>" +
          "</div>" +
          '<button id="vgNext" class="vg-btn" type="button">เข้าใช้งาน</button>' +
          '<button type="button" class="vg-link" id="vgToLogin">อยากใช้งานในชื่อเดิม? ใส่ Key Pass เพื่อกลับเข้าบัญชีเดิม</button>' +
        "</div>" +

        // ---- กรอก Key Pass เดิม (เปิดผ่านลิงก์เล็ก ๆ เท่านั้น) ----
        '<div class="vg-pane hidden" data-pane="login">' +
          '<div class="vg-fields">' +
            '<label for="vgKpInput" class="vg-label">Key Pass <span class="vg-req">*</span></label>' +
            '<input type="text" id="vgKpInput" class="vg-input vg-input-kp" maxlength="8" inputmode="text" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="A B C D E">' +
          "</div>" +
          '<button id="vgLoginBtn" class="vg-btn" type="button">กลับเข้าบัญชีเดิม</button>' +
          '<button type="button" class="vg-link" id="vgBackStep1">ย้อนกลับไปกรอกชื่อ-ตำแหน่ง</button>' +
        "</div>" +

        '<p id="vgErr" class="vg-err hidden"></p>' +
      "</div>";
    document.body.appendChild(gate);

    els.sub = document.getElementById("vgSub");
    els.name = document.getElementById("vgName");
    els.position = document.getElementById("vgPosition");
    els.branch = document.getElementById("vgBranch");
    els.next = document.getElementById("vgNext");
    els.toLogin = document.getElementById("vgToLogin");
    els.kpInput = document.getElementById("vgKpInput");
    els.loginBtn = document.getElementById("vgLoginBtn");
    els.backStep1 = document.getElementById("vgBackStep1");
    els.err = document.getElementById("vgErr");
    els.close = document.getElementById("vgClose");

    els.close.addEventListener("click", close);
    els.backStep1.addEventListener("click", function () {
      hideErr();
      showPane("step1");
      setTimeout(function () { els.name.focus(); }, 80);
    });
    // กดพื้นหลังนอกกล่องก็ปิดได้เหมือนกัน
    gate.addEventListener("click", function (e) { if (e.target === gate) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && gate && !gate.classList.contains("hidden")) close();
    });

    [els.name, els.position, els.kpInput].forEach(function (el) {
      el.addEventListener("input", function () { el.classList.remove("invalid"); hideErr(); });
    });
    if (els.branch) {
      var syncBranch = function () {
        els.branch.classList.toggle("is-placeholder", !els.branch.value);
      };
      syncBranch();
      els.branch.addEventListener("change", function () {
        els.branch.classList.remove("invalid");
        hideErr();
        syncBranch();
      });
    }
    // Key Pass พิมพ์เป็นตัวใหญ่เสมอ และตัดช่องว่างออกให้อัตโนมัติ
    els.kpInput.addEventListener("input", function () {
      var pos = els.kpInput.selectionStart;
      var cleaned = els.kpInput.value.toUpperCase().replace(/[^A-HJKMNP-Z2-9]/g, "");
      if (cleaned !== els.kpInput.value) {
        els.kpInput.value = cleaned;
        try { els.kpInput.setSelectionRange(pos - 1, pos - 1); } catch (e) {}
      }
    });
    els.next.addEventListener("click", step1Submit);
    els.loginBtn.addEventListener("click", keypassLogin);
    els.toLogin.addEventListener("click", function () {
      showPane("login");
      setTimeout(function () { els.kpInput.focus(); }, 80);
    });
    [els.name, els.position, els.kpInput].forEach(function (el) {
      el.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (current.pane === "login") keypassLogin();
        else step1Submit();
      });
    });
  }

  // ---------- การแสดงผล ----------
  function showPane(name) {
    current.pane = name;
    gate.querySelectorAll(".vg-pane").forEach(function (p) {
      p.classList.toggle("hidden", p.getAttribute("data-pane") !== name);
    });
    if (name === "login") {
      els.sub.innerHTML = "กรอก Key Pass 5 ตัวที่คุณบันทึกไว้<br>เพื่อกลับเข้าบัญชีเดิมจากเครื่องอื่น";
    } else {
      els.sub.innerHTML = "กรอกชื่อและตำแหน่ง แล้วเข้าใช้งานได้ทันที<br>ไม่ต้องสมัคร ไม่ต้องตั้งรหัสผ่าน";
    }
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

  function lock(on) {
    busy = on;
    [els.next, els.loginBtn].forEach(function (b) { if (b) b.disabled = on; });
  }

  function open(opts) {
    build();
    var o = opts || {};
    hideErr();
    els.kpInput.value = "";
    // ปุ่มปิดมีเฉพาะตอน "สลับบัญชีด้วย Key Pass" จากหน้าตั้งค่าเท่านั้น
    // (ตอนอื่นผู้ใช้ยังไม่ได้ยืนยันตัวตน ถ้าปิดได้เกตติ้งจะเด้งกลับมาเรื่อย -> สับสน)
    canClose = !!o.allowClose;
    els.close.classList.toggle("hidden", !canClose);
    // รู้จัก user บนเครื่องนี้แล้วแต่ session หมดอายุ → เสนอหน้าใส่ Key Pass (ไม่บังคับ)
    var known = (o.state && o.state.visitor) || (cache && cache.visitor) || null;
    if (o.pane === "login" || known) {
      showPane("login");
    } else {
      showPane("step1");
    }
    gate.classList.remove("hidden");
    var focusEl = current.pane === "login" ? els.kpInput : els.name;
    setTimeout(function () { if (focusEl) focusEl.focus(); }, 80);
  }

  // ปิดเกตติ้งได้เฉพาะตอนผู้ใช้ยืนยันตัวตนแล้ว (สลับบัญชี) — ถ้ายังไม่ได้ยืนยันห้ามปิด ไม่งั้นเกตติ้งจะเด้งกลับมาเรื่อย
  function close() {
    if (!canClose) return;
    hideGate();
  }

  function hideGate() {
    if (gate) gate.classList.add("hidden");
  }

  // ---------- กรอกชื่อ + ตำแหน่ง แล้วเข้าใช้งานทันที ----------
  function step1Submit() {
    if (busy) return;
    var name = els.name.value.trim();
    var position = els.position.value.trim();
    var branch = els.branch ? els.branch.value.trim() : "";
    if (!name) { markInvalid(els.name); showErr("กรุณากรอกชื่อ"); return; }
    if (!position) { markInvalid(els.position); showErr("กรุณากรอกตำแหน่ง"); return; }
    if (!branch) { markInvalid(els.branch); showErr("กรุณาเลือกสาขา"); return; }
    lock(true);
    api("/api/visitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, position: position, branch: branch })
    }).then(function (r) {
      lock(false);
      if (!r.ok) { showErr(r.d.message || "บันทึกไม่สำเร็จ กรุณาลองใหม่"); return; }
      cache = { registered: true, authed: true, visitor: r.d.visitor || null };
      hideGate();
      fireAuthed(cache);
    }).catch(function () {
      lock(false);
      showErr("เครือข่ายขัดข้อง กรุณาลองใหม่");
    });
  }

  // ---------- กรอก Key Pass เดิม ----------
  function keypassLogin() {
    if (busy) return;
    var keypass = els.kpInput.value.trim().toUpperCase();
    if (!keypass) { markInvalid(els.kpInput); showErr("กรุณากรอก Key Pass"); return; }
    lock(true);
    api("/api/visitors/keypass-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keypass: keypass })
    }).then(function (r) {
      lock(false);
      if (!r.ok) {
        markInvalid(els.kpInput);
        showErr(r.d.message || "กลับเข้าบัญชีเดิมไม่สำเร็จ");
        return;
      }
      var before = cache && cache.visitor ? cache.visitor.name : "";
      var afterName = (r.d.visitor && r.d.visitor.name) || "";
      cache = { registered: true, authed: true, visitor: r.d.visitor || null };
      hideGate();
      toast(before && before !== afterName
        ? "สลับไปใช้บัญชี " + afterName + " แล้ว"
        : "ยินดีต้อนรับ " + afterName);
      fireAuthed(cache);
    }).catch(function () {
      lock(false);
      showErr("เครือข่ายขัดข้อง กรุณาลองใหม่");
    });
  }

  // ---------- เรียกใช้จากหน้าอื่น ----------
  function requireAuth(reason) {
    return check().then(function (st) {
      if (st.authed) return st;
      open({ state: st });
      var e = new Error("ยังไม่ได้ยืนยันตัวตน");
      e.reason = reason || "auth";
      e.state = st;
      throw e;
    });
  }

  function logout() {
    return api("/api/auth/visitor-logout", { method: "POST" }).then(function () {
      reset();
      canClose = true;
      hideGate();
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

  // ---------- เปิดเกตติ้งอัตโนมัติเมื่อยังไม่ได้ยืนยันตัวตน ----------
  function warm() {
    check().then(function (st) {
      if (!st.authed) open({ state: st });
    }).catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", warm);
  } else {
    warm();
  }
})();
