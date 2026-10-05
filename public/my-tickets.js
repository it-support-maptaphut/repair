(function () {
  "use strict";

  var toastTimer = null;
  var listEl = document.getElementById("myList");
  var loadingEl = document.getElementById("loadingOverlay");
  var loadingMsg = document.getElementById("loadingMsg");
  var toastEl = document.getElementById("toast");

  var STATUS = {
    new: { label: "รอการตอบรับ", cls: "st-new", msg: "ได้รับใบแจ้งซ่อมแล้ว แต่ยังไม่ได้รับคำตอบรับจากทีม IT" },
    working: { label: "อนุมัติแล้ว", cls: "st-working", msg: "ทีม IT รับทราบและกำลังดำเนินการแก้ไขแล้ว" },
    done: { label: "เสร็จสิ้นแล้ว", cls: "st-done", msg: "การแจ้งซ่อมนี้เสร็จสิ้นเรียบร้อยแล้ว" }
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }

  function fmtDate(iso) {
    if (!iso) return "-";
    var d = new Date(iso);
    if (isNaN(d)) return "-";
    return d.toLocaleString("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function fmtDateOnly(d) {
    if (!d) return "-";
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
    if (m) {
      var months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
      var mi = parseInt(m[2], 10) - 1;
      return m[3] + " " + (months[mi] || m[2]) + " " + (parseInt(m[1], 10) + 543);
    }
    var parsed = new Date(d);
    if (isNaN(parsed)) return "-";
    return parsed.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
  }

  function parseLocation(loc) {
    if (!loc) return { branch: "-", position: "-" };
    var i = loc.indexOf(" · ");
    if (i > -1) return { branch: loc.slice(0, i), position: loc.slice(i + 3) };
    return { branch: loc, position: "-" };
  }

  function stampIcon(status) {
    var s = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    if (status === "working") s += '<circle cx="12" cy="12" r="9"/><path d="M12 8v4l2.5 2.5"/>';
    else if (status === "done") s += '<polyline points="20 6 9 17 4 12"/>';
    else s += '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>';
    return s + "</svg>";
  }

  function progPct(status) {
    if (status === "done") return 100;
    if (status === "working") return 55;
    return 12;
  }

  function photoThumbsHTML(t) {
    var list = (t.photos || []).filter(Boolean);
    if (!list.length) return "";
    var shown = list.slice(0, 6);
    var extra = list.length - shown.length;
    var h = '<div class="mt-photo-list">';
    var i;
    for (i = 0; i < shown.length; i++) {
      h += '<a class="mt-photo" href="' + esc(shown[i]) + '" target="_blank" rel="noopener" title="เปิดรูปดูใหญ่">' +
        '<img loading="lazy" alt="รูปแจ้งซ่อม" src="' + esc(shown[i]) + '">' +
        (i === shown.length - 1 && extra > 0 ? '<span class="mt-photo-more">+' + extra + "</span>" : "") +
        "</a>";
    }
    return h + "</div>";
  }

  var URGENT_PHONE = "0630050430";

  function reporterOf(t) {
    var v = t.visitor || { branch: visitorBranch || "" };
    var loc = parseLocation(t.location);
    var name = v.name || t.reporter_name || "-";
    if (name.indexOf(" · ") > -1) name = name.slice(0, name.indexOf(" · "));
    return {
      name: name || "-",
      position: v.position || loc.position || "-",
      branch: v.branch || loc.branch || "-"
    };
  }

  function cardHTML(t) {
    var st = STATUS[t.status] || STATUS.new;
    var loc = parseLocation(t.location);
    var rep = reporterOf(t);
    var pdfBtn = t.pdf_url
      ? '<a class="mt-action pdf" target="_blank" rel="noopener" href="' + esc(t.pdf_url) + '">เปิด PDF ใบเสร็จงาน</a>'
      : "";
    var photos = photoThumbsHTML(t);
    var prog = '<div class="mt-prog ' + st.cls + '">' +
        '<div class="mt-prog-track">' +
          '<span class="mt-prog-fill" style="--p:' + progPct(t.status) + '%"></span>' +
          '<span class="mt-prog-dot d1" aria-hidden="true"></span>' +
          '<span class="mt-prog-dot d2" aria-hidden="true"></span>' +
          '<span class="mt-prog-dot d3" aria-hidden="true"></span>' +
        "</div>" +
        '<div class="mt-prog-labels"><span>ได้รับเรื่อง</span><span>กำลังดำเนินการ</span><span>เสร็จสิ้น</span></div>' +
      "</div>";
    return (
      '<div class="mt-card">' +
        '<div class="mt-card-head" role="button" tabindex="0" aria-expanded="false">' +
          '<div class="mt-head-main">' +
            '<span class="mt-no">' + esc(t.ticket_no) + "</span>" +
            '<span class="mt-date">' + esc(fmtDate(t.created_at)) + "</span>" +
          "</div>" +
          '<span class="mt-stamp ' + st.cls + '">' + stampIcon(t.status) + st.label + "</span>" +
          '<svg class="mt-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>' +
        "</div>" +
        '<div class="mt-body">' +
          '<div class="mt-sect">' +
            '<div class="mt-sect-h">ข้อมูลผู้แจ้งซ่อม</div>' +
            '<div class="mt-grid">' +
              '<div class="mt-cell"><span class="mt-lb">ชื่อผู้แจ้ง</span><span class="mt-vl">' + esc(rep.name) + "</span></div>" +
              '<div class="mt-cell"><span class="mt-lb">ตำแหน่งผู้แจ้ง</span><span class="mt-vl">' + esc(rep.position) + "</span></div>" +
              '<div class="mt-cell"><span class="mt-lb">ประจำสาขา</span><span class="mt-vl">' + esc(rep.branch) + "</span></div>" +
            "</div>" +
          "</div>" +
          '<div class="mt-sect">' +
            '<div class="mt-sect-h">รายละเอียดการแจ้งซ่อม</div>' +
            '<div class="mt-grid">' +
              '<div class="mt-cell"><span class="mt-lb">เลขที่ใบแจ้งซ่อม</span><span class="mt-vl mt-mono">' + esc(t.ticket_no) + "</span></div>" +
              '<div class="mt-cell"><span class="mt-lb">วันที่แจ้งซ่อม</span><span class="mt-vl">' + esc(fmtDate(t.created_at)) + "</span></div>" +
              '<div class="mt-cell"><span class="mt-lb">สถานที่แจ้งซ่อม</span><span class="mt-vl">' + esc(loc.position) + "</span></div>" +
            "</div>" +
            '<div class="mt-cell mt-cell-full"><span class="mt-lb">รายละเอียดปัญหา</span><span class="mt-vl mt-desc">' + esc(t.symptom || "-") + "</span></div>" +
          "</div>" +
          '<div class="mt-sect">' +
            '<div class="mt-sect-h">การดำเนินการ</div>' +
            '<div class="mt-grid">' +
              '<div class="mt-cell"><span class="mt-lb">สถานะปัจจุบัน</span><span class="mt-vl">' + st.label + "</span></div>" +
              '<div class="mt-cell"><span class="mt-lb">ผู้ดำเนินการ</span><span class="mt-vl">' + esc(t.handler_name || "รอเจ้าหน้าที่รับงาน") + "</span></div>" +
              (t.status === "done"
                ? '<div class="mt-cell"><span class="mt-lb">วันที่เสร็จสิ้น</span><span class="mt-vl">' +
                  esc(fmtDateOnly(t.status_date || t.approved_at) + (t.status_time ? " " + esc(t.status_time) + " น." : "")) +
                  "</span></div>"
                : "") +
            "</div>" +
          "</div>" +
          (photos ? '<div class="mt-sect"><div class="mt-sect-h">รูปภาพที่แนบ</div>' + photos + "</div>" : "") +
          prog +
          '<div class="mt-note ' + st.cls + '">' + st.msg + "</div>" +
          '<div class="mt-actions">' +
            '<button class="mt-action ghost" type="button" data-copy="' + esc(t.ticket_no) + '">คัดลอกรหัสซ่อม</button>' +
            pdfBtn +
            '<a class="mt-action urgent" href="tel:' + URGENT_PHONE + '" role="button">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' +
              "ติดต่อเร่งด่วน</a>" +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function render(tickets, visitorBranch) {
    listEl.innerHTML = "";
    if (!tickets || !tickets.length) {
      listEl.innerHTML =
        '<div class="mt-empty">' +
          '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>' +
          "<p>ยังไม่มีรายการที่เคยแจ้งซ่อมด้วยชื่อนี้</p>" +
          '<a class="mt-empty-link" href="ticket.html">ไปหน้าแจ้งซ่อม</a>' +
        "</div>";
      return;
    }
    var i, html = "";
    for (i = 0; i < tickets.length; i++) {
      html += cardHTML(tickets[i]);
    }
    listEl.innerHTML = html;
  }

  function showListError(msg) {
    listEl.innerHTML =
      '<div class="mt-empty">' +
        "<p>" + esc(msg) + "</p>" +
        '<button class="mt-empty-link" type="button" onclick="window.__mtLoad && window.__mtLoad()">ลองใหม่</button>' +
      "</div>";
  }

  // ----- loading overlay -----
  function setLoading(on, msg) {
    if (on) {
      if (msg) loadingMsg.textContent = msg;
      loadingEl.classList.remove("hidden");
    } else {
      loadingEl.classList.add("hidden");
    }
  }

  function loadMine() {
    setLoading(true, "กำลังโหลดประวัติ...");
    fetch("/api/tickets/mine", { credentials: "same-origin" })
      .then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; });
      })
      .then(function (res) {
        setLoading(false);
        if (res.status === 401) {
          // ยังไม่เข้าสู่ระบบ — เปิดเกตติ้งสมัคร/เข้าสู่ระบบ แล้วโหลดใหม่อัตโนมัติเมื่อสำเร็จ
          openLoginGate();
          return;
        }
        if (!res.ok) {
            showListError(res.d.message || "โหลดประวัติไม่สำเร็จ");
          return;
        }
        render(res.d.tickets, (res.d.visitor && res.d.visitor.branch) || "");
      })
      .catch(function () {
        setLoading(false);
        showListError("เชื่อมต่อไม่ได้ กรุณาลองใหม่");
      });
  }
  window.__mtLoad = loadMine;

  // เปิดเกตติ้งยืนยันตัวตน (ชื่อ-ตำแหน่ง หรือ Key Pass เดิม)
  function openLoginGate() {
    if (!window.WanGate) {
      showListError("กรุณายืนยันตัวตนก่อนดูประวัติ");
      return;
    }
    window.WanGate.check().then(function (st) {
      if (st.visitor) window.WanGate.open({ state: st });
      else window.WanGate.open({ pane: "login" });
    }).catch(function () {
      window.WanGate.open();
    });
  }

  // หลังยืนยันตัวตนสำเร็จ ให้โหลดประวัติใหม่อัตโนมัติ
  if (window.WanGate) {
    window.WanGate.onAuthed(function () { loadMine(); });
  }

  // ----- expand / collapse -----
  listEl.addEventListener("click", function (e) {
    var head = e.target.closest(".mt-card-head");
    if (head) toggleCard(head.parentNode);
  });
  listEl.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var head = e.target.closest(".mt-card-head");
    if (head) { e.preventDefault(); toggleCard(head.parentNode); }
  });
  listEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-copy]");
    if (!btn) return;
    e.stopPropagation();
    copyCode(btn.getAttribute("data-copy") || "");
  });

  function toggleCard(card) {
    var body = card.querySelector(".mt-body");
    var head = card.querySelector(".mt-card-head");
    var open = card.classList.toggle("is-open");
    if (body) body.style.maxHeight = open ? body.scrollHeight + "px" : "";
    if (head) head.setAttribute("aria-expanded", open ? "true" : "false");
  }

  // ----- copy -----
  function copyCode(text) {
    if (!text) return;
    var done = function () { showToast("คัดลอกหมายเลข " + text + " แล้ว"); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(function () { copyFallback(text, done); });
    } else {
      copyFallback(text, done);
    }
  }

  function copyFallback(text, ok) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      ok();
    } catch (e) {
      showToast("คัดลอกไม่สำเร็จ กรุณากดค้างที่หมายเลข");
    }
    document.body.removeChild(ta);
  }

  // ----- toast -----
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.add("hidden");
    }, 2600);
  }

  // หน้านี้ต้องมีบัญชี — ยังไม่เข้าสู่ระบบให้เปิดเกตติ้งก่อน
  loadMine();
})();