var MAX_PHOTOS = 3;

var photos = [];
var toastTimer = null;
var submitted = false;

var audioBlob = null;
var audioUrl = null;
var mediaRecorder = null;
var mediaChunks = [];
var micStream = null;
var recognition = null;
var recognizing = false;
var recording = false;
var recordStart = 0;
var timerInterval = null;

var SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
var MediaRecorderOK = typeof window.MediaRecorder !== "undefined";

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
var reporterName = document.getElementById("reporterName");
var reporterPhone = document.getElementById("reporterPhone");
var lineIdText = document.getElementById("lineIdText");
var device = document.getElementById("device");
var voicePanel = document.getElementById("voicePanel");
var micBtn = document.getElementById("micBtn");
var micLabel = document.getElementById("micLabel");
var voiceTimer = document.getElementById("voiceTimer");
var voiceHint = document.getElementById("voiceHint");
var voiceAudioWrap = document.getElementById("voiceAudioWrap");
var voiceAudio = document.getElementById("voiceAudio");
var redoBtn = document.getElementById("redoBtn");
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
  if (isVoice && !SpeechRecognitionAPI && !MediaRecorderOK) {
    voiceUnsupported.classList.remove("hidden");
  } else {
    voiceUnsupported.classList.add("hidden");
  }
  if (!isVoice) stopRecording();
}

modeBtns.forEach(function (btn) {
  btn.addEventListener("click", function () {
    setMode(btn.getAttribute("data-mode"));
    saveDraftSoon();
  });
});

// ---------- การจดจำเสียง (Speech → ข้อความ) ----------
function makeRecognition() {
  if (!SpeechRecognitionAPI) return null;
  var rec = new SpeechRecognitionAPI();
  rec.lang = "th-TH";
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = function (event) {
    var text = "";
    for (var i = event.resultIndex; i < event.results.length; i++) {
      text += event.results[i][0].transcript;
    }
    var cur = symptomText.value;
    var base = cur.trim();
    var appended = false;
    if (base && !base.endsWith(text)) {
      symptomText.value = base + (base.endsWith(" ") ? "" : " ") + text.trim();
      appended = true;
    } else if (!base) {
      symptomText.value = text.trim();
      appended = true;
    }
    if (appended) {
      symptomText.scrollTop = symptomText.scrollHeight;
      saveDraftSoon();
    }
  };
  rec.onerror = function (e) {
    console.warn("[voice] recognition error:", e.error);
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      showToast("ไม่อนุญาตให้ใช้ไมโครโฟน");
    }
  };
  rec.onend = function () {
    recognizing = false;
    if (recording) updateMicUI();
  };
  return rec;
}

// ---------- อัดเสียง (MediaRecorder) ----------
function startRecording() {
  if (recording) return;
  if (!MediaRecorderOK) {
    showToast("เบราว์เซอร์นี้ไม่รองรับการอัดเสียง");
    return;
  }
  if (audioUrl) {
    if (!confirm("เริ่มอัดใหม่ จะทิ้งไฟล์เสียงเดิม?")) return;
    audioBlob = null;
    URL.revokeObjectURL(audioUrl);
    audioUrl = null;
    voiceAudio.removeAttribute("src");
    voiceAudioWrap.classList.add("hidden");
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast("เบราว์เซอร์นี้ไม่รองรับการอัดเสียง (ใช้โหมดพิมพ์แทน)");
    return;
  }
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(function (stream) {
      micStream = stream;
      mediaChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) mediaChunks.push(e.data);
      };
      mediaRecorder.onstop = function () {
        micStream.getTracks().forEach(function (t) { t.stop(); });
        micStream = null;
        recording = false;
        clearInterval(timerInterval);
        voiceTimer.textContent = "00:00";
        var type = (mediaRecorder && mediaRecorder.mimeType) || "audio/webm";
        audioBlob = new Blob(mediaChunks, { type: type });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        audioUrl = URL.createObjectURL(audioBlob);
        voiceAudio.src = audioUrl;
        voiceAudioWrap.classList.remove("hidden");
        updateMicUI();
        saveDraftSoon();
      };
      mediaRecorder.start();
      recording = true;
      recordStart = Date.now();
      timerInterval = setInterval(function () {
        var s = Math.floor((Date.now() - recordStart) / 1000);
        voiceTimer.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
      }, 500);
      if (SpeechRecognitionAPI && !recognizing) {
        recognition = recognition || makeRecognition();
        recognizing = true;
        try { recognition.start(); } catch (e) {}
      }
      updateMicUI();
    })
    .catch(function () {
      showToast("ไม่สามารถเปิดไมโครโฟนได้");
    });
}

function stopRecording() {
  if (recording && mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  if (recognition && recognizing) {
    recognizing = false;
    try { recognition.stop(); } catch (e) {}
  }
}

function updateMicUI() {
  var on = recording;
  micBtn.classList.toggle("rec", on);
  micLabel.textContent = on ? "หยุดพูด" : "เริ่มพูด";
  voiceHint.textContent = on ? "พูดแล้วบอกรายละเอียดได้เลยครับ" : (audioBlob ? "อัดเสียงเสร็จแล้ว — กดฟังซ้ำได้ หรือพูดเพิ่ม" : "กด " + (on ? "หยุดพูด" : "เริ่มพูด") + " เพื่ออัดเสียง");
  voiceTimer.classList.toggle("hidden", !on);
}

micBtn.addEventListener("click", function () {
  if (recording) { stopRecording(); return; }
  startRecording();
});

redoBtn.addEventListener("click", function () {
  stopRecording();
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null;
  audioBlob = null;
  voiceAudio.removeAttribute("src");
  voiceAudioWrap.classList.add("hidden");
  voiceTimer.textContent = "00:00";
  updateMicUI();
});

symptomText.addEventListener("input", function () {
  symptomText.classList.remove("invalid");
  saveDraftSoon();
});

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

function getLocation() {
  return getSelectedBranch();
}

// ---------- ส่งฟอร์ม ----------
function invalidField(el, msg) {
  if (el) el.classList.add("invalid");
  showToast(msg);
  if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

function submitForm() {
  var symptom = symptomText.value.trim();
  var branch = getSelectedBranch();
  var name = reporterName.value.trim();

  if (!symptom) {
    invalidField(symptomText, "กรุณาพิมพ์หรือพูดบอกรายละเอียด");
    return;
  }
  if (!branch) {
    invalidField(document.getElementById("branchGroup"), "กรุณาเลือกสาขา");
    return;
  }
  if (!name) {
    invalidField(reporterName, "กรุณากรอกชื่อผู้แจ้ง (ชื่อเล่น)");
    return;
  }
  var phone = reporterPhone.value.replace(/[^0-9]/g, "");
  if (reporterPhone.value.trim() !== "" && phone.length < 9) {
    invalidField(reporterPhone, "กรุณากรอกเบอร์โทรให้ถูกต้อง");
    return;
  }

  submitBtn.disabled = true;
  showLoading();

  var formData = new FormData();
  photos.forEach(function (file) {
    formData.append("photos", file, file.name);
  });
  if (audioBlob) {
    var ext = "";
    var mt = String(audioBlob.type || "");
    if (mt.indexOf("mp4") > -1 || mt.indexOf("mp3") > -1) ext = ".mp4";
    else if (mt.indexOf("ogg") > -1) ext = ".ogg";
    else ext = ".webm";
    formData.append("audio", audioBlob, "voice" + ext);
  }
  formData.append("symptom", symptom);
  formData.append("device", device.value.trim());
  formData.append("location", getLocation());
  formData.append("zone_count", "0");
  formData.append("reporter_name", name);
  formData.append("reporter_phone", reporterPhone.value.trim());
  formData.append("reporter_line_id", lineIdText.value.trim());

  fetch("/api/tickets", { method: "POST", body: formData })
    .then(function (res) {
      if (!res.ok) throw new Error("server");
      return res.json();
    })
    .then(function (data) {
      hideLoading();
      submitted = true;
      clearDraft();
      showSuccess(data.ticketNo, {
        location: getLocation(),
        name: name,
        phone: reporterPhone.value.trim(),
        photos: photos.length,
        audio: !!audioBlob
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
  ticketNoEl.textContent = ticketNo;
  info = info || {};
  document.getElementById("sLocation").textContent = info.location || "-";
  document.getElementById("sName").textContent = info.name || "-";
  document.getElementById("sPhone").textContent = info.phone || "-";
  document.getElementById("sPhotos").textContent = info.photos ? info.photos + " รูป" : "ไม่มีรูป";
  document.getElementById("sAudio").textContent = info.audio ? "มีไฟล์เสียง" : "ไม่มี";
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
    v: 2,
    symptom: symptomText.value,
    branch: getSelectedBranch(),
    name: reporterName.value,
    phone: reporterPhone.value,
    lineId: lineIdText.value,
    mode: mode,
    savedAt: Date.now()
  };
}

function saveDraft() {
  var hasText = symptomText.value.trim() || reporterName.value.trim() || reporterPhone.value.trim() || lineIdText.value.trim() || getSelectedBranch();
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
    !!(d.name && String(d.name).trim()) ||
    !!(d.phone && String(d.phone).trim()) ||
    !!(d.lineId && String(d.lineId).trim()) ||
    !!(d.branch && String(d.branch).trim());
  if (!hasData) return false;

  symptomText.value = d.symptom || "";
  var br = d.branch || "";
  if (br) {
    var radios = document.querySelectorAll('input[name="branch"]');
    [].slice.call(radios).forEach(function (r) {
      r.checked = r.value === br;
    });
  }
  reporterName.value = d.name || "";
  reporterPhone.value = d.phone || "";
  lineIdText.value = d.lineId || "";
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

function toggleTicketNav(event) {
  if (event && event.stopPropagation) event.stopPropagation();
  var nav = document.getElementById("topNav");
  if (nav) nav.classList.toggle("is-open");
}

function closeTicketNav() {
  var nav = document.getElementById("topNav");
  if (nav) nav.classList.remove("is-open");
}

document.addEventListener("click", function (e) {
  var nav = document.getElementById("topNav");
  if (!nav) return;
  if (!nav.contains(e.target)) closeTicketNav();
});

window.toggleTicketNav = toggleTicketNav;
window.closeTicketNav = closeTicketNav;