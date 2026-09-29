var MAX_PHOTOS = 3;

var photos = [];
var toastTimer = null;
var submitted = false;

var recognition = null;
var recognizing = false;
var voiceActive = false;
var voiceBase = "";
var voiceFinal = "";
var voiceInterim = "";

var SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

var photoInput = document.getElementById("photoInput");
var photoBtn = document.getElementById("photoBtn");
var photoGrid = document.getElementById("photoGrid");
var photoCount = document.getElementById("photoCount");
var loadingOverlay = document.getElementById("loadingOverlay");
var successOverlay = document.getElementById("successOverlay");
var ticketNoEl = document.getElementById("ticketNo");
var toastEl = document.getElementById("toast");
var form = document.getElementById("ticketForm");
var actionBar = document.querySelector(".action-bar");
var submitBtn = document.getElementById("submitBtn");
var symptomText = document.getElementById("symptomText");
var device = document.getElementById("device");
var positionText = document.getElementById("positionText");

// ---------- ยืนยันตัวตน / บัญชีผู้ใช้ (จัดการที่ verify.js) ----------
var visitorPassed = false;

function setVisitorPassed(on) {
  visitorPassed = !!on;
}

if (window.WanGate) {
  window.WanGate.onAuthed(function () { setVisitorPassed(true); });
}
var voicePanel = document.getElementById("voicePanel");
var micBtn = document.getElementById("micBtn");
var micLabel = document.getElementById("micLabel");
var voiceBars = document.getElementById("voiceBars");
var voiceHint = document.getElementById("voiceHint");
var voiceUnsupported = document.getElementById("voiceUnsupported");
var copyTicketBtn = document.getElementById("copyTicketBtn");
var successClose = document.getElementById("successClose");

var modeBtns = document.querySelectorAll(".mode-btn");

// ---------- โหมดพิมพ์ / พิมพ์ด้วยเสียง ----------
function setMode(mode) {
  modeBtns.forEach(function (b) {
    var on = b.getAttribute("data-mode") === mode;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  var isVoice = mode === "voice";
  voicePanel.classList.toggle("hidden", !isVoice);
  if (isVoice && !SpeechRecognitionAPI) {
    voiceUnsupported.classList.remove("hidden");
  } else {
    voiceUnsupported.classList.add("hidden");
  }
  if (!isVoice) stopVoice();
}

modeBtns.forEach(function (btn) {
  btn.addEventListener("click", function () {
    setMode(btn.getAttribute("data-mode"));
    saveDraftSoon();
  });
});

// ---------- โหมดเสียง: แปลงเสียง → ข้อความ (ไม่บันทึกเสียง) ----------
var SPACE = " ";

function makeRecognition() {
  if (!SpeechRecognitionAPI) return null;
  var rec = new SpeechRecognitionAPI();
  rec.lang = "th-TH";
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = function (event) {
    var finalTxt = "";
    var interimTxt = "";
    var clean = function (s) {
      return s.replace(/\s+/g, " ").trim();
    };
    for (var i = event.resultIndex; i < event.results.length; i++) {
      var r = event.results[i];
      var t = clean(r[0].transcript);
      if (!t) continue;
      if (r.isFinal) finalTxt += (finalTxt ? SPACE : "") + t;
      else interimTxt += (interimTxt ? SPACE : "") + t;
    }
    if (finalTxt) {
      voiceFinal += (voiceFinal && finalTxt ? SPACE : "") + finalTxt;
      voiceInterim = "";
    } else if (interimTxt) {
      voiceInterim = interimTxt;
    }
    placeVoiceText();
  };
  rec.onerror = function (e) {
    console.warn("[voice] recognition error:", e.error);
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      voiceActive = false;
      showToast("ไม่อนุญาตให้ใช้ไมโครโฟน");
      updateMicUI();
    }
  };
  rec.onend = function () {
    recognizing = false;
    if (voiceActive) {
      try { recognition.start(); recognizing = true; } catch (e) { voiceActive = false; }
    }
    updateMicUI();
  };
  return rec;
}

function placeVoiceText() {
  var base = voiceBase;
  var parts = [];
  if (base) parts.push(base);
  if (voiceFinal) parts.push(voiceFinal);
  if (voiceInterim) parts.push(voiceInterim);
  symptomText.value = parts.join(SPACE);
  autoGrowTextarea();
  saveDraftSoon();
}

function startVoice() {
  if (voiceActive) return;
  if (!SpeechRecognitionAPI) {
    showToast("เบราว์เซอร์นี้ไม่รองรับการแปลงเสียงเป็นข้อความ (ใช้โหมดพิมพ์แทน)");
    return;
  }
  voiceActive = true;
  voiceBase = symptomText.value.replace(/\s+/g, " ").trim();
  voiceFinal = "";
  voiceInterim = "";
  recognition = recognition || makeRecognition();
  try {
    recognition.start();
    recognizing = true;
  } catch (e) {
    voiceActive = false;
    showToast("เปิดไมค์ไม่สำเร็จ ลองอีกครั้ง");
  }
  updateMicUI();
}

function stopVoice() {
  voiceActive = false;
  if (recognition && recognizing) {
    recognizing = false;
    try { recognition.stop(); } catch (e) {}
  }
  updateMicUI();
}

function updateMicUI() {
  var on = voiceActive;
  micBtn.classList.toggle("listening", on);
  micLabel.textContent = on ? "กำลังฟัง... กดเพื่อหยุด" : "กดพูดบอกรายละเอียด";
  voiceBars.classList.toggle("hidden", !on);
  voiceHint.classList.toggle("hidden", !on);
}

micBtn.addEventListener("click", function () {
  if (voiceActive) { stopVoice(); return; }
  startVoice();
});

symptomText.addEventListener("input", function () {
  symptomText.classList.remove("invalid");
  autoGrowTextarea();
  saveDraftSoon();
});

function autoGrowTextarea() {
  if (!symptomText) return;
  symptomText.style.height = "auto";
  symptomText.style.height = Math.min(symptomText.scrollHeight + 2, 300) + "px";
}

// ---------- รูปภาพ (ไม่เกิน 3 รูป) ----------
function renderPhotos() {
  photoGrid.innerHTML = "";
  photos.forEach(function (file, i) {
    var item = document.createElement("div");
    item.className = "photo-item";
    item.style.animationDelay = (i * 0.04) + "s";

    var img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.alt = "รูป " + (i + 1);

    var idx = document.createElement("span");
    idx.className = "photo-index";
    idx.textContent = i + 1;

    var del = document.createElement("button");
    del.type = "button";
    del.className = "photo-del";
    del.setAttribute("data-index", i);
    del.setAttribute("aria-label", "ลบรูป " + (i + 1));
    del.innerHTML = "&times;";

    item.appendChild(img);
    item.appendChild(idx);
    item.appendChild(del);
    photoGrid.appendChild(item);
  });

  if (!photoGrid.querySelector(".photo-add")) {
    var add = document.createElement("button");
    add.type = "button";
    add.className = "photo-add";
    add.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';
    photoGrid.appendChild(add);
  }
  photoBtn.classList.toggle("hidden", photos.length !== 0);
  photoCount.textContent = photos.length + "/" + MAX_PHOTOS;
}

photoBtn.addEventListener("click", function () {
  photoInput.click();
});

photoInput.addEventListener("change", function () {
  var files = Array.prototype.slice.call(photoInput.files || []);
  var room = MAX_PHOTOS - photos.length;
  if (files.length > room) {
    files = files.slice(0, room);
    showToast("รองรับได้สูงสุด " + MAX_PHOTOS + " รูป");
  }
  files.forEach(function (f) {
    if (/^image\//.test(f.type) || /(png|jpe?g|gif|webp|bmp)$/i.test(f.name)) {
      photos.push(f);
    }
  });
  photoInput.value = "";
  renderPhotos();
});

photoGrid.addEventListener("click", function (e) {
  if (e.target.closest(".photo-add")) {
    photoInput.click();
    return;
  }
  var del = e.target.closest(".photo-del");
  if (!del) return;
  var index = parseInt(del.dataset.index, 10);
  photos.splice(index, 1);
  renderPhotos();
});

// ---------- สาขา ----------
function getSelectedBranch() {
  var checked = document.querySelector('input[name="branch"]:checked');
  return checked ? checked.value : "";
}

document.querySelectorAll('input[name="branch"]').forEach(function (radio) {
  radio.addEventListener("change", function () {
    saveDraftSoon();
  });
});

if (positionText) {
  positionText.addEventListener("input", function () {
    saveDraftSoon();
  });
}

function getLocation() {
  var br = getSelectedBranch();
  var pos = positionText.value.trim();
  return pos ? br + " · " + pos : br;
}

// ---------- ส่งฟอร์ม ----------
function invalidField(el, msg) {
  if (el) {
    el.classList.add("invalid");
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
    el.addEventListener("animationend", function () {
      el.classList.remove("shake");
    }, { once: true });
  }
  showToast(msg);
  if (window.__sounds) window.__sounds.error();
  if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

function submitForm() {
  if (!visitorPassed) {
    if (window.WanGate) {
      window.WanGate.open({ mode: "register" });
    }
    showToast("กรุณาสมัครหรือเข้าสู่ระบบก่อนแจ้งซ่อม");
    return;
  }
  var symptom = symptomText.value.trim();
  var branch = getSelectedBranch();

  if (!symptom) {
    invalidField(symptomText, "กรุณาพิมพ์หรือพูดบอกรายละเอียด");
    return;
  }
  if (!branch) {
    invalidField(document.getElementById("branchGroup"), "กรุณาเลือกสาขา");
    return;
  }
  if (!positionText.value.trim()) {
    invalidField(positionText, "กรุณากรอกตำแหน่ง / สถานที่");
    return;
  }

  submitBtn.disabled = true;
  showLoading();

  var formData = new FormData();
  photos.forEach(function (file) {
    formData.append("photos", file, file.name);
  });
  formData.append("symptom", symptom);
  formData.append("device", device.value.trim());
  formData.append("location", getLocation());
  formData.append("zone_count", "0");

  fetch("/api/tickets", { method: "POST", body: formData })
    .then(function (res) {
      return res.json().then(function (d) {
        return { ok: res.ok, status: res.status, d: d };
      }).catch(function () { return { ok: false, status: res.status, d: {} }; });
    })
    .then(function (result) {
      if (!result.ok) {
        if (result.status === 401) {
          // ยังไม่เข้าสู่ระบบ (เช่นเพิ่งออกจากระบบ) — ให้เข้าสู่ระบบใหม่
          hideLoading();
          submitBtn.disabled = false;
          if (window.WanGate) window.WanGate.open({ mode: "login" });
          return;
        }
        throw new Error("server");
      }
      hideLoading();
      submitted = true;
      clearDraft();
      showSuccess(result.d.ticketNo, {
        location: getLocation(),
        symptom: symptom,
        photos: photos.length
      });
    })
    .catch(function () {
      hideLoading();
      submitBtn.disabled = false;
      showToast("ส่งข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง");
    });
}

form.addEventListener("submit", function (e) {
  e.preventDefault();
  submitForm();
});

submitBtn.addEventListener("click", function () {
  submitForm();
});

function showLoading() {
  loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
  loadingOverlay.classList.add("hidden");
}

function showSuccess(ticketNo, info) {
  if (window.__sounds) window.__sounds.success();
  ticketNoEl.textContent = ticketNo;
  info = info || {};
  document.getElementById("sLocation").textContent = info.location || "-";
  document.getElementById("sSymptom").textContent = info.symptom || "-";
  document.getElementById("sPhotos").textContent = info.photos ? info.photos + " รูป" : "ไม่มีรูป";
  loadingOverlay.classList.add("hidden");
  successOverlay.classList.remove("hidden");
}

function copyTicket() {
  var txt = ticketNoEl.textContent || "";
  if (!txt) return;
  var done = function () {
    showToast("คัดลอกรหัส " + txt + " แล้ว");
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(txt).then(done).catch(function () {
      copyFallback(txt, done);
    });
  } else {
    copyFallback(txt, done);
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
    showToast("คัดลอกไม่สำเร็จ กดค้างที่รหัสได้เลย");
  }
  document.body.removeChild(ta);
}

copyTicketBtn.addEventListener("click", copyTicket);
successClose.addEventListener("click", function () {
  successOverlay.classList.add("hidden");
  submitBtn.disabled = false;
  window.location.href = "ticket.html";
});

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
  });
}

// ---------- ฉบับร่าง (draft) ----------
var DRAFT_KEY = "wan_ticket_draft";
var draftTimer = null;

function saveDraftSoon() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraft, 400);
}

function collectDraft() {
  var mode = "type";
  modeBtns.forEach(function (b) {
    if (b.getAttribute("data-mode") === "voice" && b.classList.contains("is-active")) mode = "voice";
  });
  return {
    v: 3,
    symptom: symptomText.value,
    branch: getSelectedBranch(),
    position: positionText.value,
    mode: mode,
    savedAt: Date.now()
  };
}

function saveDraft() {
  var hasText = symptomText.value.trim() || getSelectedBranch() || positionText.value.trim();
  if (!hasText) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(collectDraft()));
  } catch (e) {}
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
}

function hasDraft() {
  try { return !!localStorage.getItem(DRAFT_KEY); } catch (e) { return false; }
}

function restoreDraft() {
  var raw = "";
  try { raw = localStorage.getItem(DRAFT_KEY) || ""; } catch (e) {}
  if (!raw) return false;
  var d = null;
  try { d = JSON.parse(raw); } catch (e) { return false; }
  if (!d || (!d.v && !d.symptom)) return false;

  var hasData = !!(d.symptom && String(d.symptom).trim()) ||
    !!(d.branch && String(d.branch).trim()) ||
    !!(d.position && String(d.position).trim());
  if (!hasData) return false;

  symptomText.value = d.symptom || "";
  autoGrowTextarea();
  var br = d.branch || "";
  if (br) {
    var radios = document.querySelectorAll('input[name="branch"]');
    [].slice.call(radios).forEach(function (r) {
      r.checked = r.value === br;
    });
  }
  positionText.value = d.position || "";
  setMode(d.mode === "voice" ? "voice" : "type");
  return true;
}

function showDraftPrompt() {
  var banner = document.getElementById("draftBanner");
  if (!banner) return;
  banner.classList.remove("hidden");
  var btnRestore = document.getElementById("draftRestoreBtn");
  var btnDiscard = document.getElementById("draftDiscardBtn");
  var btnClose = document.getElementById("draftClose");
  if (btnRestore) {
    btnRestore.addEventListener("click", function () {
      var ok = restoreDraft();
      banner.classList.add("hidden");
      showToast(ok ? "กู้ข้อมูลฉบับร่างกลับมาแล้ว" : "ไม่พบข้อมูลฉบับร่าง");
    });
  }
  if (btnDiscard) {
    btnDiscard.addEventListener("click", function () {
      clearDraft();
      banner.classList.add("hidden");
      showToast("ลบข้อมูลฉบับร่างแล้ว");
    });
  }
  if (btnClose) {
    btnClose.addEventListener("click", function () {
      banner.classList.add("hidden");
    });
  }
}

if (hasDraft()) showDraftPrompt();

// เช็คบัญชีผู้ใช้บนเครื่องนี้ (ยังไม่มีบัญชี/ยังไม่ล็อกอิน → เปิดเกตติ้ง)
if (window.WanGate) {
  window.WanGate.check().then(function (st) {
    if (st.authed) { setVisitorPassed(true); return; }
    window.WanGate.open({
      mode: st.registered && !st.needsCredentials ? "login" : "register",
      step: st.registered && st.needsCredentials ? "2" : "1",
      state: st
    });
  }).catch(function () {
    if (window.WanGate) window.WanGate.open({ mode: "register" });
  });
}

window.addEventListener("beforeunload", function () {
  if (submitted) return;
  saveDraft();
});

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toastEl.classList.add("hidden");
  }, 2600);
}