/* เกตติ้งเข้าสู่ระบบด้วย LINE (ทำงานคู่กับ line-login.js + /auth/line/*)
   ขั้นที่ 1: แสดงปุ่ม "เข้าสู่ระบบด้วย LINE" อย่างเดียว
   ขั้นที่ 2: หลัง LINE ส่งกลับ -> ให้กรอกชื่อ / ตำแหน่ง / ประจำสาขา แล้วกด "สมัคร" -> เข้าใช้งาน */
(function () {
  "use strict";

  var cache = null;
  var gate = null;
  var els = {};
  var busy = false;
  var canClose = false;
  var onAuthed = [];
  var current = { pane: "line" };

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
          '<h2 class="vg-title" id="vgTitle">เข้าสู่ระบบ</h2>' +
          '<p class="vg-sub" id="vgSub">เข้าสู่ระบบด้วย LINE เพื่อแจ้งซ่อมและติดตามสถานะ</p>' +
        "</div>" +

        // ---- ขั้นที่ 1: ปุ่มเข้าสู่ระบบด้วย LINE เท่านั้น ----
        '<div class="vg-pane" data-pane="line">' +
          // line-login.js เป็นตัวเติมปุ่มเข้ามาในช่องนี้
          '<div class="vg-line-slot" id="vgLineSlot"></div>' +
        "</div>" +

        // ---- ขั้นที่ 2: กรอกชื่อ / ตำแหน่ง / ประจำสาขา หลังล็อกอิน LINE ----
        '<div class="vg-pane hidden" data-pane="profile">' +
          '<div class="vg-fields">' +
            '<label for="vgName" class="vg-label">ชื่อ <span class="vg-req">*</span></label>' +
            '<input type="text" id="vgName" class="vg-input" maxlength="60" autocomplete="name">' +
            '<label for="vgPosition" class="vg-label">ตำแหน่ง <span class="vg-req">*</span></label>' +
            '<input type="text" id="vgPosition" class="vg-input" maxlength="120" autocomplete="organization-title">' +
            '<label for="vgBranchTrigger" class="vg-label">ประจำสาขา <span class="vg-req">*</span></label>' +
            '<div class="vg-select" id="vgBranchWrap">' +
              '<select id="vgBranch" class="vg-hidden-select is-placeholder" tabindex="-1" aria-hidden="true">' +
                '<option value="">เลือกสาขาที่คุณประจำอยู่</option>' +
                '<option value="ร้านวรรณสาขา 1 (ขนส่งเก่าระยอง)">ร้านวรรณสาขา 1 (ขนส่งเก่าระยอง)</option>' +
                '<option value="ร้านวรรณสาขา 3 (ไกล้ รพ. กรุงเทพระยอง)">ร้านวรรณสาขา 3 (ไกล้ รพ. กรุงเทพระยอง)</option>' +
                '<option value="ร้านวรรณสาขา 4 (มาบตาพุด ระยอง)">ร้านวรรณสาขา 4 (มาบตาพุด ระยอง)</option>' +
                '<option value="ร้านวรรณสาขา 5 (บ้านฉาง ระยอง)">ร้านวรรณสาขา 5 (บ้านฉาง ระยอง)</option>' +
              "</select>" +
              '<button type="button" id="vgBranchTrigger" class="vg-trigger is-placeholder" aria-haspopup="listbox" aria-expanded="false" aria-controls="vgBranchList">เลือกสาขาที่คุณประจำอยู่</button>' +
              '<span class="vg-select-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></span>' +
              '<span class="vg-select-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>' +
              '<ul class="vg-dropdown hidden" id="vgBranchList" role="listbox" aria-label="ประจำสาขา">' +
                '<li role="option" data-val="ร้านวรรณสาขา 1 (ขนส่งเก่าระยอง)"><span class="vg-opt-txt">ร้านวรรณสาขา 1 (ขนส่งเก่าระยอง)</span><svg class="vg-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></li>' +
                '<li role="option" data-val="ร้านวรรณสาขา 3 (ไกล้ รพ. กรุงเทพระยอง)"><span class="vg-opt-txt">ร้านวรรณสาขา 3 (ไกล้ รพ. กรุงเทพระยอง)</span><svg class="vg-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></li>' +
                '<li role="option" data-val="ร้านวรรณสาขา 4 (มาบตาพุด ระยอง)"><span class="vg-opt-txt">ร้านวรรณสาขา 4 (มาบตาพุด ระยอง)</span><svg class="vg-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></li>' +
                '<li role="option" data-val="ร้านวรรณสาขา 5 (บ้านฉาง ระยอง)"><span class="vg-opt-txt">ร้านวรรณสาขา 5 (บ้านฉาง ระยอง)</span><svg class="vg-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></li>' +
              "</ul>" +
            "</div>" +
          "</div>" +
          '<button id="vgNext" class="vg-btn" type="button">สมัคร</button>' +
        "</div>" +

        '<p id="vgErr" class="vg-err hidden"></p>' +
      "</div>";
    document.body.appendChild(gate);

    els.title = document.getElementById("vgTitle");
    els.sub = document.getElementById("vgSub");
    els.name = document.getElementById("vgName");
    els.position = document.getElementById("vgPosition");
    els.branch = document.getElementById("vgBranch");
    els.next = document.getElementById("vgNext");
    els.err = document.getElementById("vgErr");
    els.close = document.getElementById("vgClose");

    els.close.addEventListener("click", close);
    // กดพื้นหลังนอกกล่องก็ปิดได้เหมือนกัน
    gate.addEventListener("click", function (e) { if (e.target === gate) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && gate && !gate.classList.contains("hidden")) close();
    });

    [els.name, els.position].forEach(function (el) {
      el.addEventListener("input", function () { el.classList.remove("invalid"); hideErr(); });
    });

    // ---- dropdown เลือกสาขา (กำหนดเอง กัน picker ดีฟอลต์ iOS) ----
    if (els.branch) {
      var wrap = document.getElementById("vgBranchWrap");
      var trigger = document.getElementById("vgBranchTrigger");
      var list = document.getElementById("vgBranchList");
      var options = list ? list.querySelectorAll("[role='option']") : [];
      var activeIdx = -1;

      var syncBranch = function () {
        var val = els.branch.value;
        if (trigger) {
          trigger.textContent = val ? val : "เลือกสาขาที่คุณประจำอยู่";
          trigger.classList.toggle("is-placeholder", !val);
          trigger.setAttribute("aria-expanded", list && !list.classList.contains("hidden") ? "true" : "false");
        }
        for (var i = 0; i < options.length; i++) {
          var sel = options[i].getAttribute("data-val") === val;
          options[i].classList.toggle("is-selected", sel);
          options[i].setAttribute("aria-selected", sel ? "true" : "false");
        }
      };

      var closeList = function () {
        if (!list) return;
        list.classList.add("hidden");
        if (wrap) wrap.classList.remove("is-open");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
      };

      var highlight = function (i) {
        for (var k = 0; k < options.length; k++) options[k].classList.toggle("is-active", k === i);
        if (options[i] && options[i].scrollIntoView) {
          try { options[i].scrollIntoView({ block: "nearest" }); } catch (e) { options[i].scrollIntoView(true); }
        }
      };

      var setBranch = function (val) {
        els.branch.value = val;
        els.branch.classList.remove("invalid");
        if (trigger) trigger.classList.remove("invalid");
        hideErr();
        syncBranch();
        closeList();
      };

      var openList = function () {
        if (!list || !list.classList.contains("hidden")) return;
        list.classList.remove("hidden");
        if (wrap) wrap.classList.add("is-open");
        if (trigger) trigger.setAttribute("aria-expanded", "true");
        activeIdx = -1;
        for (var i = 0; i < options.length; i++) {
          if (options[i].classList.contains("is-selected")) { activeIdx = i; break; }
        }
        highlight(activeIdx);
      };

      if (trigger) {
        trigger.addEventListener("click", function (e) {
          e.preventDefault();
          if (list && !list.classList.contains("hidden")) closeList(); else openList();
        });
        trigger.addEventListener("keydown", function (e) {
          if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === " " || e.key === "Enter") {
            e.preventDefault();
            openList();
          } else if (e.key === "Escape") {
            closeList();
          }
        });
      }

      for (var oi = 0; oi < options.length; oi++) {
        (function (li) {
          li.addEventListener("mousedown", function (e) { e.preventDefault(); });
          li.addEventListener("click", function () {
            setBranch(li.getAttribute("data-val"));
            if (trigger) trigger.focus();
          });
        })(options[oi]);
      }

      if (list) {
        list.addEventListener("keydown", function (e) {
          if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(options.length - 1, activeIdx + 1); highlight(activeIdx); }
          else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(0, activeIdx - 1); highlight(activeIdx); }
          else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (options[activeIdx]) setBranch(options[activeIdx].getAttribute("data-val"));
            if (trigger) trigger.focus();
          } else if (e.key === "Escape") { e.preventDefault(); closeList(); if (trigger) trigger.focus(); }
        });
      }

      document.addEventListener("click", function (e) {
        if (wrap && !wrap.contains(e.target) && list && !list.classList.contains("hidden")) closeList();
      });

      syncBranch();
    }

    els.next.addEventListener("click", profileSubmit);
    [els.name, els.position].forEach(function (el) {
      el.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        profileSubmit();
      });
    });
  }

  // ---------- การแสดงผล ----------
  function showPane(name) {
    current.pane = name;
    gate.querySelectorAll(".vg-pane").forEach(function (p) {
      p.classList.toggle("hidden", p.getAttribute("data-pane") !== name);
    });
    if (name === "profile") {
      els.title.textContent = "สมัครใช้งาน";
      els.sub.innerHTML = "เข้าสู่ระบบด้วย LINE เรียบร้อย<br>กรอกชื่อ / ตำแหน่ง / ประจำสาขา แล้วกดสมัครเพื่อเข้าใช้งาน";
    } else {
      els.title.textContent = "เข้าสู่ระบบ";
      els.sub.textContent = "เข้าสู่ระบบด้วย LINE เพื่อแจ้งซ่อมและติดตามสถานะ";
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
    if (els.next) els.next.disabled = on;
  }

  function open(opts) {
    build();
    var o = opts || {};
    hideErr();
    gate.removeAttribute("data-mode");
    els.next.textContent = "สมัคร";
    // ปุ่มปิดมีเฉพาะตอนสลับบัญชี (ปกติปิดไม่ได้ ไม่งั้นเกตติ้งเด้งกลับมาเรื่อย)
    canClose = !!o.allowClose;
    els.close.classList.toggle("hidden", !canClose);
    showPane("line");
    gate.classList.remove("hidden");
  }

  // ---------- หลังล็อกอิน LINE: กรอกชื่อ / ตำแหน่ง / ประจำสาขา ----------
  function openProfileCompletion(visitor) {
    build();
    hideErr();
    canClose = false;
    els.close.classList.add("hidden");
    els.next.textContent = "สมัคร";
    els.name.value = (visitor && visitor.name) || (visitor && visitor.lineName) || "";
    els.position.value = "";
    if (els.branch) els.branch.value = "";
    var trigger = document.getElementById("vgBranchTrigger");
    if (trigger) {
      trigger.textContent = "เลือกสาขาที่คุณประจำอยู่";
      trigger.classList.add("is-placeholder");
    }
    showPane("profile");
    gate.setAttribute("data-mode", "profile");
    gate.classList.remove("hidden");
    setTimeout(function () {
      if (els.name.value) els.position.focus(); else els.name.focus();
    }, 80);
  }

  // ปิดเกตติ้งได้เฉพาะตอนสลับบัญชี — ถ้ายังไม่ได้ยืนยันห้ามปิด ไม่งั้นเกตติ้งจะเด้งกลับมาเรื่อย
  function close() {
    if (!canClose) return;
    hideGate();
  }

  function hideGate() {
    if (gate) gate.classList.add("hidden");
  }

  // ---------- กด "สมัคร" → บันทึกข้อมูลแล้วเข้าใช้งาน ----------
  function profileSubmit() {
    if (busy) return;
    var name = els.name.value.trim();
    var position = els.position.value.trim();
    var branch = els.branch ? els.branch.value.trim() : "";
    if (!name) { markInvalid(els.name); showErr("กรุณากรอกชื่อ"); return; }
    if (!position) { markInvalid(els.position); showErr("กรุณากรอกตำแหน่ง"); return; }
    if (!branch) { markInvalid(document.getElementById("vgBranchTrigger") || els.branch); showErr("กรุณาเลือกสาขา"); return; }
    lock(true);
    api("/api/visitors/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, position: position, branch: branch })
    }).then(function (r) {
      lock(false);
      if (!r.ok) { showErr(r.d.message || "สมัครไม่สำเร็จ กรุณาลองใหม่"); return; }
      cache = { registered: true, authed: true, visitor: r.d.visitor || null };
      gate.removeAttribute("data-mode");
      hideGate();
      toast("ยินดีต้อนรับ " + (name || ""));
      fireAuthed(cache);
    }).catch(function () {
      lock(false);
      showErr("เครือข่ายขัดข้อง กรุณาลองใหม่");
    });
  }

  // ---------- เรียกใช้จากหน้าอื่น ----------
  function requireAuth(reason) {
    return check().then(function (st) {
      if (st.authed && !(st.visitor && st.visitor.needsProfile)) return st;
      if (st.authed && st.visitor && st.visitor.needsProfile) {
        openProfileCompletion(st.visitor);
      } else {
        open({ state: st });
      }
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
    openProfileCompletion: openProfileCompletion,
    close: close,
    requireAuth: requireAuth,
    logout: logout,
    onAuthed: function (fn) { if (typeof fn === "function") onAuthed.push(fn); }
  };

  // ---------- เปิดเกตติ้งอัตโนมัติเมื่อยังไม่ได้ยืนยันตัวตน ----------
  function warm() {
    check().then(function (st) {
      if (!st.authed) {
        open({ state: st });
      } else if (st.visitor && st.visitor.needsProfile) {
        // มาจาก LINE แล้วยังกรอกข้อมูลไม่ครบ -> ให้กรอกแล้วสมัคร
        openProfileCompletion(st.visitor);
      }
    }).catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", warm);
  } else {
    warm();
  }
})();
