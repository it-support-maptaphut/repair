var toastTimer = null;

var statusNo = document.getElementById("statusNo");
var statusBtn = document.getElementById("statusBtn");
var statusWrap = document.getElementById("statusWrap");
var resultEl = document.getElementById("result");
var toastEl = document.getElementById("toast");

var STATUS = {
  new: { label: "รอการตอบรับ", short: "รอการตอบรับ", cls: "st-new", msg: "ได้รับแจ้งซ่อมแล้ว แต่ยังไม่ได้รับคำตอบรับจากทีม IT กรุณารอสักครู่" },
  working: { label: "อนุมัติแล้ว", short: "อนุมัติแล้ว", cls: "st-working", msg: "ทีม IT รับทราบและกำลังดำเนินการแก้ไขแล้ว" },
  done: { label: "เสร็จสิ้นแล้ว", short: "เสร็จสิ้น", cls: "st-done", msg: "การแจ้งซ่อมนี้เสร็จสิ้นเรียบร้อยแล้ว" }
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

function parseLocation(loc) {
  if (!loc) return { branch: "-", position: "-" };
  var i = loc.indexOf(" · ");
  if (i > -1) return { branch: loc.slice(0, i), position: loc.slice(i + 3) };
  return { branch: loc, position: "-" };
}

function stampIcon(size) {
  var s = size || 16;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l2.5 2.5"/></svg>';
}

function checkIcon(size) {
  var s = size || 16;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
}

function bellIcon(size) {
  var s = size || 16;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
}

function statusView(t, isSingle) {
  var st = STATUS[t.status] || STATUS.new;
  var loc = parseLocation(t.location);
  var icon = t.status === "new" ? bellIcon() : t.status === "working" ? stampIcon() : checkIcon();
  var cardActions = "";
  if (isSingle || t.pdf_url) {
    cardActions =
      '<div class="card-actions">' +
        '<button class="back-btn ghost" type="button" data-copy="' + esc(t.ticket_no) + '">คัดลอกรหัสซ่อม</button>' +
        (t.pdf_url
          ? '<a class="back-btn" target="_blank" rel="noopener" href="' + esc(t.pdf_url) + '">เปิด PDF ใบเสร็จงาน</a>'
          : "") +
      "</div>";
  }

  return (
    '<div class="card">' +
      '<div class="card-head">' +
        '<div class="card-no">' + esc(t.ticket_no) + "</div>" +
        '<span class="status-stamp ' + st.cls + '">' + icon + st.label + "</span>" +
      "</div>" +
      '<div class="card-body">' +
        '<div class="card-row"><span class="k">หมวด</span><span class="v">' + esc(t.device || "-") + "</span></div>" +
        '<div class="card-row"><span class="k">วันที่แจ้ง</span><span class="v">' + esc(fmtDate(t.created_at)) + "</span></div>" +
        '<div class="card-row"><span class="k">สาขา</span><span class="v">' + esc(loc.branch) + "</span></div>" +
        '<div class="card-row"><span class="k">ตำแหน่ง</span><span class="v">' + esc(loc.position) + "</span></div>" +
        (t.status === "done" ? '<div class="card-row"><span class="k">เสร็จสิ้น</span><span class="v">' + esc(fmtDate(t.approved_at)) + "</span></div>" : "") +
        '<div class="card-row"><span class="k">อาการ</span><span class="v">' + esc(t.symptom || "-") + "</span></div>" +
      "</div>" +
      '<div class="card-msg ' + st.cls + '"><span class="strong">' + st.label + "</span> — " + st.msg + "</div>" +
      cardActions +
    "</div>"
  );
}

function setHasResult(on) {
  if (statusWrap) statusWrap.classList.toggle("has-result", on);
}

function renderTicket(t) {
  resultEl.innerHTML = statusView(t, true);
  resultEl.classList.remove("hidden");
  setHasResult(true);
}

function renderError(msg) {
  resultEl.innerHTML =
    '<div class="result-empty">' +
      esc(msg) + '<br><button class="btn" type="button" onclick="focusSearch()">ลองใหม่</button>' +
    "</div>";
  resultEl.classList.remove("hidden");
  setHasResult(true);
}

function focusSearch() {
  statusNo.focus();
}

function lookup() {
  var no = statusNo.value.trim();
  if (!no) {
    showToast("กรุณาใส่หมายเลขใบแจ้งซ่อม");
    statusNo.focus();
    return;
  }
  statusBtn.disabled = true;
  statusBtn.innerHTML = '<span class="spinner-sm"></span>';
  resultEl.innerHTML = "";
  resultEl.classList.add("hidden");
  setHasResult(false);
  fetch("/api/tickets/" + encodeURIComponent(no) + "/status")
    .then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, d: d }; });
    })
    .then(function (res) {
      statusBtn.disabled = false;
      statusBtn.textContent = "ตรวจสอบ";
      if (!res.ok) {
        renderError(res.d.message || "ไม่พบงาน ตรวจสอบหมายเลขอีกครั้ง");
        return;
      }
      renderTicket(res.d.ticket);
    })
    .catch(function () {
      statusBtn.disabled = false;
      statusBtn.textContent = "ตรวจสอบ";
      renderError("ตรวจสอบไม่สำเร็จ กรุณาลองใหม่");
    });
}

statusBtn.addEventListener("click", lookup);

statusNo.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    lookup();
  }
});

document.addEventListener("click", function (e) {
  var btn = e.target.closest("[data-copy]");
  if (!btn) return;
  var txt = btn.getAttribute("data-copy") || "";
  if (!txt) return;
  var done = function () {
    showToast("คัดลอกหมายเลข " + txt + " แล้ว");
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(txt).then(done).catch(function () {
      copyFallback(txt, done);
    });
  } else {
    copyFallback(txt, done);
  }
});

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

function readQueryNo() {
  try {
    return new URLSearchParams(window.location.search).get("no") || "";
  } catch (e) {
    return "";
  }
}

function initByQuery() {
  var no = readQueryNo();
  if (no) {
    statusNo.value = no;
    lookup();
  }
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toastEl.classList.add("hidden");
  }, 2600);
}

initByQuery();