/* เกตติ้งเข้าสู่ระบบด้วย LINE / Key Pass (ทำงานคู่กับ line-login.js + /auth/line/*)
   ขั้นที่ 1: เลือกวิธีเข้าใช้งาน (LINE / ทางเร่งด่วน / Key Pass — กดแล้วเด้ง popup ให้กรอกรหัส)
   ขั้นที่ 2: กรอกชื่อ / ตำแหน่ง / ประจำสาขา แล้วกดสมัคร / เข้าใช้งาน
   ขั้นที่ 3: (ทางเร่งด่วน) แสดง Key Pass ให้เก็บไว้ แล้วเข้าใช้งาน */
(function () {
  "use strict";

  var cache = null;
  var gate = null;
  var els = {};
  var busy = false;
  var canClose = false;
  var onAuthed = [];
  var current = { pane: "line", quick: false };

  // สัญญาณว่า "ตัดสินใจเรื่องการยืนยันตัวตนเสร็จแล้ว" ให้ splash.js รอ ก่อนซ่อนหน้าโหลด
  var readyResolve = null;
  window.__authReady = new Promise(function (resolve) { readyResolve = resolve; });
  function signalReady() {
    if (readyResolve) { var r = readyResolve; readyResolve = null; r(); }
  }

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
    // ภาพประดับ: กระถางต้นไม้ (เวกเตอร์) สำหรับฝั่งซ้ายของการ์ด
    var PLANT =
      '<svg class="vg-plant" viewBox="0 0 120 150" aria-hidden="true">' +
        '<path d="M60 116 C60 84 60 60 60 34" stroke="#0e6b46" stroke-width="2.6" stroke-linecap="round" opacity="0.5"/>' +
        '<ellipse cx="40" cy="66" rx="17" ry="9" transform="rotate(-32 40 66)" fill="#3fae7d" opacity="0.75"/>' +
        '<ellipse cx="80" cy="58" rx="17" ry="9" transform="rotate(30 80 58)" fill="#3fae7d" opacity="0.75"/>' +
        '<ellipse cx="46" cy="42" rx="15" ry="8" transform="rotate(-42 46 42)" fill="#54c08c" opacity="0.8"/>' +
        '<ellipse cx="76" cy="36" rx="15" ry="8" transform="rotate(42 76 36)" fill="#54c08c" opacity="0.8"/>' +
        '<ellipse cx="60" cy="26" rx="12" ry="7.5" fill="#66cf9b" opacity="0.85"/>' +
        '<path d="M34 112 h52 l-5 30 a7 7 0 0 1 -7 6 H46 a7 7 0 0 1 -7 -6 Z" fill="#ffffff" opacity="0.9"/>' +
        '<rect x="29" y="104" width="62" height="12" rx="6" fill="#ffffff"/>' +
      "</svg>";
    // ฉากประดับ (wallpaper): คอมตั้งโต๊ะ + จอแสดงชื่อระบบ (กะพริบ) + UPS และสายไฟ
    var SCENE =
      '<svg class="vg-desk-svg" viewBox="0 0 480 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' +
        '<defs>' +
          '<radialGradient id="vgLampGlow" cx="120" cy="144" r="180" gradientUnits="userSpaceOnUse">' +
            '<stop offset="0" stop-color="#ffe9a8" stop-opacity="0.6"/>' +
            '<stop offset="0.5" stop-color="#ffe9a8" stop-opacity="0.22"/>' +
            '<stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/>' +
          '</radialGradient>' +
        '</defs>' +
        '<rect x="0" y="252" width="480" height="48" fill="#05122e" opacity="0.45"/>' +
        '<rect x="58" y="238" width="16" height="62" fill="#0a1c3f" opacity="0.85"/>' +
        '<rect x="406" y="238" width="16" height="62" fill="#0a1c3f" opacity="0.85"/>' +
        '<rect x="30" y="240" width="420" height="7" fill="#081733" opacity="0.9"/>' +
        '<rect x="30" y="228" width="420" height="14" rx="3" fill="#0d2350" opacity="0.92"/>' +
        '<rect x="30" y="228" width="420" height="4" rx="2" fill="#3f79d6" opacity="0.5"/>' +
        '<rect x="198" y="208" width="84" height="8" rx="4" fill="#0d2350" opacity="0.9"/>' +
        '<rect x="228" y="184" width="24" height="26" fill="#0d2350" opacity="0.9"/>' +
        '<rect x="146" y="62" width="188" height="132" rx="12" fill="#0d2350" opacity="0.95"/>' +
        '<rect x="146" y="62" width="188" height="132" rx="12" fill="none" stroke="#3f79d6" stroke-width="2" opacity="0.45"/>' +
        '<rect x="158" y="74" width="164" height="108" rx="6" fill="#04101f"/>' +
        '<g class="vg-screen-on" fill="#9fe9ff" font-family="Segoe UI, Tahoma, sans-serif" text-anchor="middle">' +
          '<rect class="vg-scan" x="158" y="74" width="164" height="4" fill="#cfeaff" opacity="0.12"/>' +
          '<text x="240" y="102" font-size="13" font-weight="700">\u0e23\u0e30\u0e1a\u0e1a\u0e41\u0e08\u0e49\u0e07\u0e0b\u0e48\u0e2d\u0e21</text>' +
          '<text x="240" y="120" font-size="13" font-weight="700">\u0e02\u0e2d\u0e07\u0e23\u0e49\u0e32\u0e19\u0e27\u0e23\u0e23\u0e13</text>' +
          '<text x="240" y="138" font-size="13" font-weight="700">\u0e2a\u0e32\u0e02\u0e32\u0e21\u0e32\u0e1a\u0e15\u0e32\u0e1e\u0e38\u0e15</text>' +
          '<text x="240" y="160" font-size="11" opacity="0.85">(\u0e44\u0e2d\u0e17\u0e35\u0e0b\u0e31\u0e1e\u0e1e\u0e2d\u0e23\u0e4c\u0e15)</text>' +
        '</g>' +
        '<rect x="348" y="122" width="92" height="110" rx="8" fill="#0d2350" opacity="0.95"/>' +
        '<rect x="348" y="122" width="92" height="110" rx="8" fill="none" stroke="#3f79d6" stroke-width="2" opacity="0.4"/>' +
        '<rect x="364" y="140" width="60" height="9" rx="2" fill="#04101f"/>' +
        '<rect x="364" y="154" width="60" height="9" rx="2" fill="#04101f"/>' +
        '<rect x="364" y="168" width="60" height="9" rx="2" fill="#04101f"/>' +
        '<circle class="vg-led" cx="378" cy="200" r="5" fill="#6cf07a"/>' +
        '<circle cx="394" cy="200" r="5" fill="#ff5a5a" opacity="0.7"/>' +
        '<rect x="150" y="216" width="150" height="11" rx="3" fill="#0a1c3f" opacity="0.9"/>' +
        '<g stroke="#3f79d6" stroke-width="1" opacity="0.35">' +
          '<line x1="164" y1="219" x2="164" y2="224"/><line x1="184" y1="219" x2="184" y2="224"/><line x1="204" y1="219" x2="204" y2="224"/><line x1="224" y1="219" x2="224" y2="224"/><line x1="244" y1="219" x2="244" y2="224"/><line x1="264" y1="219" x2="264" y2="224"/><line x1="284" y1="219" x2="284" y2="224"/>' +
        '</g>' +
        '<ellipse cx="326" cy="222" rx="9" ry="6" fill="#0a1c3f" opacity="0.9"/>' +
        '<rect x="204" y="262" width="104" height="32" rx="5" fill="#0d2350" opacity="0.95"/>' +
        '<rect x="204" y="262" width="104" height="32" rx="5" fill="none" stroke="#3f79d6" stroke-width="2" opacity="0.4"/>' +
        '<rect x="214" y="270" width="44" height="6" rx="2" fill="#04101f"/>' +
        '<rect x="214" y="280" width="44" height="6" rx="2" fill="#04101f"/>' +
        '<circle class="vg-led" cx="290" cy="272" r="4" fill="#6cf07a"/>' +
        '<circle cx="290" cy="284" r="4" fill="#ff5a5a" opacity="0.55"/>' +
        '<path d="M240 216 C240 248 236 256 236 262" fill="none" stroke="#cfe0ff" stroke-width="3" stroke-linecap="round" opacity="0.4"/>' +
        '<path d="M308 284 C352 286 400 288 430 286" fill="none" stroke="#cfe0ff" stroke-width="3" stroke-linecap="round" opacity="0.4"/>' +
        '<rect x="428" y="272" width="24" height="26" rx="3" fill="#0a1c3f" opacity="0.9"/>' +
        '<circle cx="435" cy="280" r="2" fill="#3f79d6" opacity="0.7"/>' +
        '<circle cx="445" cy="280" r="2" fill="#3f79d6" opacity="0.7"/>' +
        '<circle cx="440" cy="289" r="2" fill="#3f79d6" opacity="0.7"/>' +
        '<g class="vg-lamp">' +
          '<ellipse cx="80" cy="226" rx="24" ry="8" fill="#0d2350" opacity="0.95"/>' +
          '<rect x="76" y="150" width="8" height="78" rx="4" fill="#0d2350" opacity="0.95"/>' +
          '<path d="M80 150 C80 120 98 112 120 116" fill="none" stroke="#0d2350" stroke-width="8" stroke-linecap="round" opacity="0.95"/>' +
          '<path d="M112 114 C100 122 96 132 96 142 L144 142 C144 132 140 122 128 114 Z" fill="#123063" opacity="0.98"/>' +
          '<path d="M96 142 L144 142" stroke="#3f79d6" stroke-width="2" opacity="0.5"/>' +
          '<circle class="vg-lamp-bulb" cx="120" cy="144" r="6" fill="#ffe9a8"/>' +
        '</g>' +
        '<polygon class="vg-lamp-glow" points="120 144 28 252 340 252" fill="url(#vgLampGlow)"/>' +
      "</svg>";
    gate = document.createElement("div");
    gate.id = "verifyGate";
    gate.className = "vg-gate hidden";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.innerHTML =
      '<div class="vg-box vg-main">' +
        '<button type="button" class="vg-close hidden" id="vgClose" aria-label="ปิด">&#215;</button>' +
        '<aside class="vg-visual" aria-hidden="true">' +
          '<div class="vg-brand">' +
            '<span class="vg-brand-th">ระบบแจ้งซ่อมของร้านวรรณสาขามาบตาพุต</span>' +
            '<span class="vg-brand-en">(ไอทีซัพพอร์ต)</span>' +
          "</div>" +
          '<div class="vg-scene" aria-hidden="true">' + SCENE + "</div>" +
          '<div class="vg-plants vg-plants-a">' + PLANT + "</div>" +
          '<div class="vg-plants vg-plants-b">' + PLANT + "</div>" +
        "</aside>" +
        '<div class="vg-form">' +
          '<div class="vg-head">' +
            '<h2 class="vg-title" id="vgTitle">เข้าสู่ระบบ</h2>' +
            '<p class="vg-sub" id="vgSub">เข้าสู่ระบบด้วย LINE เพื่อแจ้งซ่อมและติดตามสถานะ</p>' +
          "</div>" +

        // ---- ขั้นที่ 1: เลือกวิธีเข้าใช้งาน (LINE / เร่งด่วน) ----
        '<div class="vg-pane" data-pane="line">' +
          // line-login.js เป็นตัวเติมปุ่มเข้ามาในช่องนี้
          '<div class="vg-line-slot" id="vgLineSlot"></div>' +
          '<div class="vg-or">หรือ</div>' +
          '<button type="button" class="vg-quick-btn" id="vgQuick">' +
            "<span>เข้าใช้งานเร่งด่วน</span>" +
          "</button>" +
          '<div class="vg-or">หรือ</div>' +
          '<button type="button" class="vg-quick-btn" id="vgKpOpen">' +
            "<span>เข้าใช้งานด้วย Key Pass</span>" +
          "</button>" +
          '<a class="vg-home-link" href="index.html">ย้อนกลับสู่หน้าหลัก</a>' +
        "</div>" +

        // ---- ขั้นที่ 2: กรอกชื่อ / ตำแหน่ง / ประจำสาขา ----
        '<div class="vg-pane hidden" data-pane="profile">' +
          '<button type="button" class="vg-back hidden" id="vgBack">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>' +
            "<span>ย้อนกลับ</span>" +
          "</button>" +
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

        // ---- ขั้นที่ 3: แสดง Key Pass (ทางเร่งด่วน) ----
        '<div class="vg-pane hidden" data-pane="done">' +
          '<p class="vg-kp-lead">สมัครเรียบร้อยแล้ว เก็บ <strong>Key Pass</strong> นี้ไว้ใช้กู้บัญชีเมื่อเปลี่ยนเครื่องหรือเบราว์เซอร์</p>' +
          '<div class="vg-kp-box">' +
            '<span class="vg-kp-value" id="vgKpValue"></span>' +
            '<button type="button" class="vg-kp-copy" id="vgKpCopy">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>' +
              "<span>คัดลอก</span>" +
            "</button>" +
          "</div>" +
          '<p class="vg-kp-warn">ถ้าไม่เก็บไว้ จะต้องให้ฝ่าย IT ออก Key Pass ใหม่</p>' +
          '<button id="vgEnter" class="vg-btn" type="button">เข้าใช้งาน</button>' +
        "</div>" +

        '<p id="vgErr" class="vg-err hidden"></p>' +
        "</div>" +
      "</div>";
    document.body.appendChild(gate);

    // popup สำหรับกรอก Key Pass (กดปุ่ม "เข้าใช้งานด้วย Key Pass" แล้วเด้งมา)
    var kpPopup = document.createElement("div");
    kpPopup.id = "kpPopup";
    kpPopup.className = "vg-gate vg-gate--kp hidden";
    kpPopup.setAttribute("role", "dialog");
    kpPopup.setAttribute("aria-modal", "true");
    kpPopup.innerHTML =
      '<div class="vg-box vg-kp-popup">' +
        '<button type="button" class="vg-close" id="kpClose" aria-label="ปิด">&#215;</button>' +
        '<div class="vg-head">' +
          '<div class="vg-logo"><img class="vg-logo-img" src="logo-ticket/logo-wan.png" alt=""></div>' +
          '<h2 class="vg-title">เข้าใช้งานด้วย Key Pass</h2>' +
          '<p class="vg-sub">กรอกรหัส Key Pass 5 ตัวที่ฝ่ายไอทีออกให้ เพื่อเข้าใช้งานบัญชีเดิมของคุณ</p>' +
        "</div>" +
        '<input type="text" id="kpInput" class="vg-input vg-input-kp" maxlength="5" placeholder="กรอกรหัส 5 ตัว" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Key Pass">' +
        '<button type="button" id="kpSubmit" class="vg-btn">เข้าใช้งาน</button>' +
        '<p id="kpErr" class="vg-err hidden"></p>' +
      "</div>";
    document.body.appendChild(kpPopup);

    els.title = document.getElementById("vgTitle");
    els.sub = document.getElementById("vgSub");
    els.name = document.getElementById("vgName");
    els.position = document.getElementById("vgPosition");
    els.branch = document.getElementById("vgBranch");
    els.next = document.getElementById("vgNext");
    els.err = document.getElementById("vgErr");
    els.close = document.getElementById("vgClose");
    els.back = document.getElementById("vgBack");
    els.quick = document.getElementById("vgQuick");
    els.enter = document.getElementById("vgEnter");
    els.kpValue = document.getElementById("vgKpValue");
    els.kpCopy = document.getElementById("vgKpCopy");
    els.kpOpen = document.getElementById("vgKpOpen");
    els.kpPopup = kpPopup;
    els.kpInput = document.getElementById("kpInput");
    els.kpSubmit = document.getElementById("kpSubmit");
    els.kpClose = document.getElementById("kpClose");
    els.kpErr = document.getElementById("kpErr");

    els.close.addEventListener("click", close);
    if (els.quick) els.quick.addEventListener("click", openQuick);
    if (els.back) els.back.addEventListener("click", goBack);
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
    if (els.enter) els.enter.addEventListener("click", finishQuick);
    if (els.kpCopy) els.kpCopy.addEventListener("click", copyKeypass);
    if (els.kpOpen) els.kpOpen.addEventListener("click", openKpPopup);
    if (els.kpSubmit) els.kpSubmit.addEventListener("click", submitKeypass);
    if (els.kpClose) els.kpClose.addEventListener("click", closeKpPopup);
    if (els.kpPopup) {
      els.kpPopup.addEventListener("click", function (e) { if (e.target === els.kpPopup) closeKpPopup(); });
    }
    if (els.kpInput) {
      els.kpInput.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        submitKeypass();
      });
      els.kpInput.addEventListener("input", function () {
        els.kpInput.classList.remove("invalid");
        hideKpErr();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && els.kpPopup && !els.kpPopup.classList.contains("hidden")) closeKpPopup();
    });
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
    if (name === "profile" && current.quick) {
      els.title.textContent = "เข้าใช้งานเร่งด่วน";
      els.sub.textContent = "กรอกชื่อ / ตำแหน่ง / ประจำสาขา แล้วกดปุ่มด้านล่างเพื่อเข้าใช้งานทันที";
    } else if (name === "profile") {
      els.title.textContent = "สมัครใช้งาน";
      els.sub.innerHTML = "เข้าสู่ระบบด้วย LINE เรียบร้อย<br>กรอกชื่อ / ตำแหน่ง / ประจำสาขา แล้วกดสมัครเพื่อเข้าใช้งาน";
    } else if (name === "done") {
      els.title.textContent = "สมัครสำเร็จ";
      els.sub.textContent = "บัญชีของคุณพร้อมใช้งานแล้ว";
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
    if (els.kpSubmit) els.kpSubmit.disabled = on;
  }

  function open(opts) {
    build();
    var o = opts || {};
    hideErr();
    gate.removeAttribute("data-mode");
    current.quick = false;
    els.next.textContent = "สมัคร";
    if (els.kpInput) els.kpInput.value = "";
    if (els.kpPopup) els.kpPopup.classList.add("hidden");
    // ปุ่มปิดมีเฉพาะตอนสลับบัญชี (ปกติปิดไม่ได้ ไม่งั้นเกตติ้งเด้งกลับมาเรื่อย)
    canClose = !!o.allowClose;
    els.close.classList.toggle("hidden", !canClose);
    setBack(false);
    showPane("line");
    gate.classList.remove("hidden");
  }

  // ---------- หลังล็อกอิน LINE: กรอกชื่อ / ตำแหน่ง / ประจำสาขา ----------
  function openProfileCompletion(visitor) {
    build();
    hideErr();
    current.quick = false;
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
    setBack(false);
    setTimeout(function () {
      if (els.name.value) els.position.focus(); else els.name.focus();
    }, 80);
  }

  // ---------- เข้าใช้งานเร่งด่วน: กรอกชื่อ/ตำแหน่ง/สาขา แล้วเข้าใช้งานทันที (ไม่ต้อง LINE) ----------
  function openQuick() {
    build();
    hideErr();
    current.quick = true;
    canClose = false;
    els.close.classList.add("hidden");
    els.next.textContent = "เข้าใช้งาน";
    els.name.value = "";
    els.position.value = "";
    if (els.branch) els.branch.value = "";
    var trigger = document.getElementById("vgBranchTrigger");
    if (trigger) {
      trigger.textContent = "เลือกสาขาที่คุณประจำอยู่";
      trigger.classList.add("is-placeholder");
    }
    showPane("profile");
    gate.setAttribute("data-mode", "quick");
    gate.classList.remove("hidden");
    setBack(true);
    setTimeout(function () { els.name.focus(); }, 80);
  }

  // ปิดเกตติ้งได้เฉพาะตอนสลับบัญชี — ถ้ายังไม่ได้ยืนยันห้ามปิด ไม่งั้นเกตติ้งจะเด้งกลับมาเรื่อย
  function close() {
    if (!canClose) return;
    hideGate();
  }

  // แสดง/ซ่อนปุ่มย้อนกลับ (เฉพาะทางเข้าใช้งานเร่งด่วน)
  function setBack(on) {
    if (els.back) els.back.classList.toggle("hidden", !on);
  }

  // ปุ่มย้อนกลับ: กลับไปหน้าเลือกวิธีเข้าใช้งาน (LINE / เร่งด่วน / Key Pass)
  function goBack() {
    if (busy) return;
    current.quick = false;
    gate.removeAttribute("data-mode");
    els.next.textContent = "สมัคร";
    els.name.value = "";
    els.position.value = "";
    if (els.branch) els.branch.value = "";
    var trigger = document.getElementById("vgBranchTrigger");
    if (trigger) {
      trigger.textContent = "เลือกสาขาที่คุณประจำอยู่";
      trigger.classList.add("is-placeholder");
    }
    hideErr();
    setBack(false);
    showPane("line");
  }

  function hideGate() {
    if (gate) gate.classList.add("hidden");
  }

  // ---------- กด "สมัคร" / "เข้าใช้งาน" → บันทึกข้อมูล ----------
  function profileSubmit() {
    if (busy) return;
    var name = els.name.value.trim();
    var position = els.position.value.trim();
    var branch = els.branch ? els.branch.value.trim() : "";
    if (!name) { markInvalid(els.name); showErr("กรุณากรอกชื่อ"); return; }
    if (!position) { markInvalid(els.position); showErr("กรุณากรอกตำแหน่ง"); return; }
    if (!branch) { markInvalid(document.getElementById("vgBranchTrigger") || els.branch); showErr("กรุณาเลือกสาขา"); return; }
    lock(true);

    // ทางเร่งด่วน: สร้างบัญชีใหม่ทันที (ไม่ต้อง LINE) แล้วออก Key Pass ให้เก็บ
    if (current.quick) {
      api("/api/visitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, position: position, branch: branch })
      }).then(function (r) {
        lock(false);
        if (!r.ok) { showErr(r.d.message || "เข้าใช้งานไม่สำเร็จ กรุณาลองใหม่"); return; }
        cache = { registered: true, authed: true, visitor: r.d.visitor || null };
        gate.removeAttribute("data-mode");
        if (els.kpValue) els.kpValue.textContent = r.d.keypass || "";
        els.next.textContent = "สมัคร";
        showPane("done");
      }).catch(function () {
        lock(false);
        showErr("เครือข่ายขัดข้อง กรุณาลองใหม่");
      });
      return;
    }

    // ทาง LINE: เติมข้อมูลให้บัญชีที่ล็อกอิน LINE ไว้
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

  // ---------- ปุ่ม "เข้าใช้งาน" หลังแสดง Key Pass (ทางเร่งด่วน) ----------
  function finishQuick() {
    var name = cache && cache.visitor && cache.visitor.name;
    gate.removeAttribute("data-mode");
    current.quick = false;
    hideGate();
    toast("ยินดีต้อนรับ" + (name ? " " + name : ""));
    fireAuthed(cache);
  }

  // ---------- คัดลอก Key Pass ----------
  function fallbackCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (e) {}
  }

  function copyKeypass() {
    var val = els.kpValue ? els.kpValue.textContent : "";
    if (!val) return;
    var label = els.kpCopy ? els.kpCopy.querySelector("span") : null;
    var done = function () {
      if (!els.kpCopy) return;
      els.kpCopy.classList.add("is-done");
      if (label) label.textContent = "คัดลอกแล้ว";
      setTimeout(function () {
        els.kpCopy.classList.remove("is-done");
        if (label) label.textContent = "คัดลอก";
      }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(val).then(done).catch(function () { fallbackCopy(val); done(); });
    } else {
      fallbackCopy(val);
      done();
    }
  }

  // ---------- ปุ่ม "เข้าใช้งานด้วย Key Pass" → เด้ง popup ให้กรอกรหัส ----------
  function openKpPopup() {
    build();
    if (!els.kpInput) return;
    els.kpInput.value = "";
    els.kpInput.classList.remove("invalid");
    hideKpErr();
    if (els.kpPopup) els.kpPopup.classList.remove("hidden");
    setTimeout(function () { els.kpInput.focus(); }, 80);
  }

  function hideKpErr() {
    if (els.kpErr) els.kpErr.classList.add("hidden");
  }

  function closeKpPopup() {
    if (els.kpPopup) els.kpPopup.classList.add("hidden");
  }

  function showKpErr(msg) {
    if (!els.kpErr) { showErr(msg); return; }
    els.kpErr.textContent = msg;
    els.kpErr.classList.remove("hidden");
  }

  // ---------- กด "เข้าใช้งาน" ใน popup → ตรวจ Key Pass (บัญชีเดิมบนเครื่องใหม่) ----------
  function submitKeypass() {
    if (busy) return;
    var val = els.kpInput ? els.kpInput.value.trim() : "";
    if (!val) { markInvalid(els.kpInput); showKpErr("กรุณากรอก Key Pass"); return; }
    lock(true);
    api("/api/visitors/keypass-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keypass: val })
    }).then(function (r) {
      lock(false);
      if (!r.ok) { showKpErr(r.d.message || "Key Pass ไม่ถูกต้อง"); return; }
      cache = { registered: true, authed: true, visitor: r.d.visitor || null };
      closeKpPopup();
      hideGate();
      toast("ยินดีต้อนรับกลับ");
      fireAuthed(cache);
    }).catch(function () {
      lock(false);
      showKpErr("เครือข่ายขัดข้อง กรุณาลองใหม่");
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
    openQuick: openQuick,
    close: close,
    requireAuth: requireAuth,
    logout: logout,
    onAuthed: function (fn) { if (typeof fn === "function") onAuthed.push(fn); }
  };

  // ---------- เปิดเกตติ้งอัตโนมัติเมื่อยังไม่ได้ยืนยันตัวตน ----------
  function warm() {
    // เปิดเกตติ้งไว้ก่อนทันที (fail-closed) เพื่อไม่ให้ผู้ใช้เห็นหรือค้างที่หน้าแจ้งซ่อมระหว่างตรวจสอบสิทธิ์
    // splash ที่ทับอยู่ด้านบนจะบังไว้จนกว่าจะรู้ผล จึงไม่มีหน้าจอกะพริบ
    try { open({}); } catch (e) {}
    check().then(function (st) {
      if (st.authed && st.visitor && st.visitor.needsProfile) {
        // มาจาก LINE แล้วยังกรอกข้อมูลไม่ครบ -> ให้กรอกแล้วสมัคร
        openProfileCompletion(st.visitor);
      } else if (st.authed) {
        // ยืนยันตัวตนแล้ว -> ปิดเกตติ้งที่เปิดไว้ชั่วคราว
        hideGate();
        gate.removeAttribute("data-mode");
      }
      // ยังไม่ยืนยันตัวตน -> คงเกตติ้งที่เปิดไว้ตามเดิม
    }).catch(function () {
      // ตรวจสอบไม่สำเร็จ (เช่น เซิร์ฟเวอร์/ฐานข้อมูลขัดข้อง) -> คงเกตติ้งไว้ กันค้างที่หน้าแจ้งซ่อม
      try { open({}); } catch (e) {}
    }).then(signalReady);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", warm);
  } else {
    warm();
  }
})();
