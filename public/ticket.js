var LINE_OA_URL = "https://line.me/";

var MAX_PHOTOS = 10;

var photos = [];
var toastTimer = null;
var currentStep = 1;
var selectedDevs = [];
var problems = {};
var customSeq = 0;

var photoInput = document.getElementById("photoInput");
var photoBtn = document.getElementById("photoBtn");
var photoGrid = document.getElementById("photoGrid");
var photoCount = document.getElementById("photoCount");
var prevBtn = document.getElementById("prevBtn");
var nextBtn = document.getElementById("nextBtn");
var loadingOverlay = document.getElementById("loadingOverlay");
var successOverlay = document.getElementById("successOverlay");
var ticketNoEl = document.getElementById("ticketNo");
var toastEl = document.getElementById("toast");
var form = document.getElementById("ticketForm");
var actionBar = document.querySelector(".action-bar");
var reporterName = document.getElementById("reporterName");
var reporterPhone = document.getElementById("reporterPhone");
var reporterLineId = document.getElementById("reporterLineId");
var lineIdText = document.getElementById("lineIdText");
var positionText = document.getElementById("positionText");
var device = document.getElementById("device");
var devTypeGroup = document.getElementById("devTypeGroup");
var hardGrid = document.getElementById("hardGrid");
var softGrid = document.getElementById("softGrid");
var devSelectedWrap = document.getElementById("devSelectedWrap");
var devSelectedList = document.getElementById("devSelectedList");
var devSelectedCount = document.getElementById("devSelectedCount");
var problemFields = document.getElementById("problemFields");
var copyTicketBtn = document.getElementById("copyTicketBtn");
var successClose = document.getElementById("successClose");

var HARDWARE_OPTIONS = [
  { id: "printer",  label: "เครื่องปริ้น",  icon: '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/>' },
  { id: "computer", label: "คอมพิวเตอร์",  icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>' },
  { id: "pos",      label: "เครื่อง POS",   icon: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>' },
  { id: "cctv",     label: "กล้อง CCTV",   icon: '<circle cx="12" cy="10" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>' },
  { id: "server",   label: "เซิร์ฟเวอร์",   icon: '<rect x="3" y="3" width="18" height="6" rx="2"/><rect x="3" y="15" width="18" height="6" rx="2"/><path d="M7 6h.01M7 18h.01"/>' }
];

var SOFTWARE_OPTIONS = [
  { id: "excel", label: "Excel", img: "logo-ms/excel.webp" },
  { id: "word",  label: "Word",  img: "logo-ms/word.webp" },
  { id: "ppt",   label: "PowerPoint", img: "logo-ms/ppt.webp" }
];

if (window.visualViewport) {
  var shiftBar = function () {
    var vv = window.visualViewport;
    var hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    actionBar.style.transform = hidden > 0
      ? "translateX(-50%) translateY(-" + hidden + "px)"
      : "translateX(-50%)";
  };
  window.visualViewport.addEventListener("resize", shiftBar);
  window.visualViewport.addEventListener("scroll", shiftBar);
  shiftBar();
}

// ---------- อุปกรณ์ (multi-select) ----------
function devKey(dev) {
  return dev.type + "·" + dev.label;
}

function isSelected(dev) {
  var k = devKey(dev);
  return selectedDevs.some(function (d) { return devKey(d) === k; });
}

function buildDeviceGrid(grid, list, type) {
  grid.innerHTML = "";
  list.forEach(function (opt) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dev-opt";
    btn.setAttribute("aria-pressed", "false");
    var svg = opt.img
      ? '<img class="dev-logo" src="' + opt.img + '" alt="' + opt.label + '" aria-hidden="true" loading="lazy">'
      : opt.logo
        ? '<svg class="dev-logo" viewBox="0 0 24 24" aria-hidden="true">' + opt.logo + "</svg>"
        : '<svg class="dev-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + opt.icon + "</svg>";
    btn.innerHTML = svg + "<span>" + opt.label + "</span>";
    btn.addEventListener("click", function () {
      toggleDev({ type: type, label: opt.label });
    });
    grid.appendChild(btn);
  });
}

var catTabs = document.querySelectorAll(".cat-tab");
catTabs.forEach(function (tab) {
  tab.addEventListener("click", function () {
    var cat = tab.getAttribute("data-cat");
    catTabs.forEach(function (t) {
      t.classList.toggle("is-active", t === tab);
      t.setAttribute("aria-selected", t === tab ? "true" : "false");
    });
    [
      [document.getElementById("hardPanel"), "Hardware"],
      [document.getElementById("softPanel"), "Software"]
    ].forEach(function (p) {
      p[0].classList.toggle("hidden", cat !== p[1]);
    });
  });
});

(function () {
  var slot = document.getElementById("catSoftLogos");
  if (slot) {
    slot.innerHTML = SOFTWARE_OPTIONS.map(function (o) {
      return '<span class="cat-logo" title="' + o.label + '">' +
        (o.img ? '<img src="' + o.img + '" alt="' + o.label + '" aria-hidden="true" loading="lazy">' : '<svg viewBox="0 0 24 24" aria-hidden="true">' + o.logo + "</svg>") +
        "</span>";
    }).join("");
  }
})();

document.querySelectorAll(".cat-custom-toggle").forEach(function (btn) {
  btn.addEventListener("click", function () {
    var type = btn.getAttribute("data-custom-type");
    var row = null;
    if (type === "Hardware") {
      row = document.getElementById("hardCustomWrap");
    } else {
      row = document.getElementById("softCustomWrap");
    }
    if (!row) return;
    var on = row.classList.toggle("hidden");
    btn.classList.toggle("is-open", !on);
    if (!on) {
      var input = row.querySelector("input");
      if (input) return input.focus();
    }
  });
});

function toggleDev(dev) {
  var k = devKey(dev);
  var existing = selectedDevs.some(function (d) { return devKey(d) === k; });
  if (existing) {
    selectedDevs = selectedDevs.filter(function (d) { return devKey(d) !== k; });
    delete problems[k];
  } else {
    selectedDevs.push({ type: dev.type, label: dev.label });
  }
  renderSelection();
  syncGridState();
}

function refreshDevSelection() {
  var all = [].slice.call(document.querySelectorAll(".dev-opt"));
  all.forEach(function (btn) {
    var panel = btn.closest(".dev-panel");
    if (!panel) return;
    var type = panel.getAttribute("data-type");
    var label = btn.querySelector("span").textContent;
    var active = isSelected({ type: type, label: label });
    btn.classList.toggle("sel", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function syncGridState() {
  refreshDevSelection();
}

function renderSelection() {
  document.querySelectorAll(".dev-opt").forEach(function (btn) {
    var panel = btn.closest(".dev-panel");
    if (!panel) return;
    var type = panel.getAttribute("data-type");
    var label = btn.querySelector("span").textContent;
    var active = isSelected({ type: type, label: label });
    btn.classList.toggle("sel", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });

  var empty = selectedDevs.length === 0;
  devSelectedWrap.classList.toggle("hidden", empty);
  devSelectedCount.textContent = selectedDevs.length;
  updateDeviceValue();

  devSelectedList.innerHTML = "";
  selectedDevs.forEach(function (d, i) {
    var chip = document.createElement("div");
    chip.className = "dev-chip";
    chip.innerHTML =
      '<span class="dev-chip-type">' + escapeHtml(d.type) + "</span>" +
      '<span class="dev-chip-label">' + escapeHtml(d.label) + "</span>" +
      '<button type="button" class="dev-chip-del" data-i="' + i + '" aria-label="ลบ ' + escapeHtml(d.label) + '">&times;</button>';
    devSelectedList.appendChild(chip);
  });

  renderProblems();
}

devSelectedList.addEventListener("click", function (e) {
  var del = e.target.closest(".dev-chip-del");
  if (!del) return;
  var i = parseInt(del.dataset.i, 10);
  var d = selectedDevs[i];
  if (!d) return;
  delete problems[devKey(d)];
  selectedDevs.splice(i, 1);
  renderSelection();
});

document.querySelectorAll(".mini-add").forEach(function (btn) {
  btn.addEventListener("click", function () {
    var type = btn.getAttribute("data-custom-type");
    var inputId = btn.getAttribute("data-input");
    var input = document.getElementById(inputId);
    var text = (input.value || "").trim();
    if (!text) {
      showToast("กรุณาพิมพ์ชื่ออุปกรณ์ / โปรแกรม");
      input.focus();
      return;
    }
    var dup = selectedDevs.some(function (d) {
      return d.type === type && d.label.toLowerCase() === text.toLowerCase();
    });
    if (dup) {
      showToast("รายการนี้ถูกเลือกแล้ว");
      input.value = "";
      return;
    }
    customSeq++;
    selectedDevs.push({ type: type, label: text, customSeq: customSeq });
    input.value = "";
    renderSelection();
  });
});

// ---------- ปัญหา (แยกต่ออุปกรณ์) ----------
function devFamiliarLogo(dev) {
  var list = dev.type === "Software" ? SOFTWARE_OPTIONS : [];
  var match = null;
  list.forEach(function (o) { if (o.label === dev.label) match = o; });
  if (match && match.img) {
    return '<span class="prob-logo"><img src="' + match.img + '" alt="' + match.label + '" aria-hidden="true" loading="lazy"></span>';
  }
  if (match && match.logo) {
    return '<span class="prob-logo"><svg viewBox="0 0 24 24" aria-hidden="true">' + match.logo + "</svg></span>";
  }
  var hw = null;
  HARDWARE_OPTIONS.forEach(function (o) { if (o.label === dev.label) hw = o; });
  if (hw && hw.icon) {
    return '<span class="prob-logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + hw.icon + "</svg></span>";
  }
  return '<span class="prob-logo prob-generic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 8l-5-5-5 5M12 3v13"/><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg></span>';
}

function renderProblems() {
  problemFields.innerHTML = "";
  selectedDevs.forEach(function (d) {
    var k = devKey(d);
    var field = document.createElement("div");
    field.className = "field problem-item";
    field.setAttribute("data-key", k);

    var label = document.createElement("label");
    label.className = "field-label prob-flex";
    label.innerHTML = devFamiliarLogo(d) + "<span>" + escapeHtml(d.label) + " — ปัญหาคือ <span class=\"req\">*</span></span>";

    var ta = document.createElement("textarea");
    ta.rows = 3;
    ta.maxLength = 500;
    ta.placeholder = "พิมพ์รายละเอียดปัญหาของ " + d.label + " เช่น เปิดไม่ติด, ค้าง, error เด้ง";
    ta.value = problems[k] || "";
    ta.addEventListener("input", function () {
      problems[k] = this.value;
      this.classList.remove("invalid");
      var cnt = field.querySelector(".p-count");
      if (cnt) cnt.textContent = this.value.length;
    });

    var count = document.createElement("p");
    count.className = "char-count";
    count.innerHTML = '<span class="p-count">' + (problems[k] || "").length + "</span>/500";

    field.appendChild(label);
    field.appendChild(ta);
    field.appendChild(count);
    problemFields.appendChild(field);
  });
}

// ---------- อุปกรณ์ / ปัญหา: helpers ----------
function updateDeviceValue() {
  var parts = selectedDevs.map(function (d) { return d.type + " · " + d.label; });
  device.value = parts.join(", ");
}

function getSelectedBranch() {
  var checked = document.querySelector('input[name="branch"]:checked');
  return checked ? checked.value : "";
}

function getLocation() {
  var branch = getSelectedBranch();
  var pos = positionText.value.trim();
  if (!branch) return "";
  return pos ? branch + " · " + pos : branch;
}

// ---------- แผนผังร้าน (แสดงรูปภาพตามสาขา) ----------
function MAP_IMAGE(branchVal) {
  return branchVal.indexOf("สาขา 4") > -1 ? "maps/branch4.png" : "";
}

function renderMap(branchVal) {
  var holder = document.getElementById("isoPlaceholder");
  var img = document.getElementById("branchMapImg");
  if (!holder || !img) return;
  if (!branchVal) {
    holder.textContent = "โปรดเลือกสาขาด้านบนก่อน";
    holder.classList.remove("hidden");
    img.classList.add("hidden");
    img.removeAttribute("src");
    return;
  }
  var src = MAP_IMAGE(branchVal);
  if (!src) {
    holder.textContent = "สาขานี้ยังไม่มีแผนผังร้าน — โปรดแจ้งทีม IT (หรือพิมพ์ตำแหน่งเองด้านล่าง)";
    holder.classList.remove("hidden");
    img.classList.add("hidden");
    img.removeAttribute("src");
    return;
  }
  img.onload = function () {
    holder.classList.add("hidden");
    img.classList.remove("hidden");
  };
  img.onerror = function () {
    holder.textContent = "โหลดแผนผังร้านไม่สำเร็จ";
    holder.classList.remove("hidden");
    img.classList.add("hidden");
  };
  img.src = src;
}

// ---------- ขยายภาพผังร้าน (lightbox) ----------
function initMapLightbox() {
  var box = document.getElementById("mapLightbox");
  var boxImg = document.getElementById("mapLightboxImg");
  var closeBtn = document.getElementById("mapLightboxClose");
  if (!box || !boxImg || !closeBtn) return;

  var img = document.getElementById("branchMapImg");
  if (img) {
    img.addEventListener("click", function () {
      if (img.classList.contains("hidden") || !img.getAttribute("src")) return;
      boxImg.src = img.src;
      box.classList.remove("hidden");
    });
  }

  function close() {
    box.classList.add("hidden");
    boxImg.removeAttribute("src");
  }
  closeBtn.addEventListener("click", close);
  box.addEventListener("click", function (e) {
    if (e.target === box) close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !box.classList.contains("hidden")) close();
  });
}

initMapLightbox();

document.querySelectorAll('input[name="branch"]').forEach(function (radio) {
  radio.addEventListener("change", function () {
    renderMap(radio.value);
  });
});

function goTo(step) {
  var direction = step > currentStep ? "next" : "prev";
  currentStep = step;

  document.querySelectorAll(".step").forEach(function (sec) {
    var on = parseInt(sec.dataset.step, 10) === step;
    sec.classList.toggle("is-active", on);
    if (on) {
      sec.classList.remove("slide-next", "slide-prev");
      void sec.offsetWidth;
      sec.classList.add(direction === "next" ? "slide-next" : "slide-prev");
    }
  });

  updateStepper();
  updateActionBar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateStepper() {
  for (var i = 1; i <= 3; i++) {
    var ind = document.getElementById("ind" + i);
    ind.classList.toggle("is-active", i === currentStep);
    ind.classList.toggle("is-done", i < currentStep);
    if (i < 3) {
      var line = document.getElementById("line" + i);
      line.classList.toggle("is-done", i < currentStep);
    }
  }
}

function updateActionBar() {
  prevBtn.classList.toggle("hidden", currentStep === 1);
  nextBtn.textContent = currentStep === 3 ? "ส่งแจ้งซ่อม" : "ถัดไป";
}

function validateStep(step) {
  if (step === 1) {
    if (!selectedDevs.length) {
      devTypeGroup.scrollIntoView({ behavior: "smooth", block: "center" });
      showToast("กรุณาเลือกอุปกรณ์ / โปรแกรมอย่างน้อย 1 รายการ");
      return false;
    }
    return true;
  }

  if (step === 2) {
    for (var i = 0; i < selectedDevs.length; i++) {
      var d = selectedDevs[i];
      var k = devKey(d);
      var val = (problems[k] || "").trim();
      if (!val) {
        var field = problemFields.querySelectorAll(".problem-item")[i];
        var ta = field && field.querySelector("textarea");
        if (ta) {
          ta.classList.add("invalid");
          ta.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          problemFields.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        showToast("กรุณากรอกปัญหาของ " + d.label);
        return false;
      }
    }
    return true;
  }

  if (step === 3) {
    if (!getSelectedBranch()) {
      document.getElementById("branchGroup").closest(".field")
        .scrollIntoView({ behavior: "smooth", block: "center" });
      showToast("กรุณาเลือกสาขา");
      return false;
    }

    if (positionText.value.trim().length === 0) {
      positionText.classList.add("invalid");
      positionText.scrollIntoView({ behavior: "smooth", block: "center" });
      showToast("กรุณาพิมพ์ตำแหน่ง / สถานที่");
      return false;
    }

    var phone = reporterPhone.value.replace(/[^0-9]/g, "");
    if (reporterPhone.value.trim() !== "" && phone.length < 9) {
      reporterPhone.classList.add("invalid");
      reporterPhone.scrollIntoView({ behavior: "smooth", block: "center" });
      showToast("กรุณากรอกเบอร์โทรให้ถูกต้อง");
      return false;
    }
    return true;
  }

  return true;
}

nextBtn.addEventListener("click", function () {
  if (currentStep === 1) {
    if (validateStep(1)) goTo(2);
  } else if (currentStep === 2) {
    if (validateStep(2)) goTo(3);
  } else {
    submitForm();
  }
});

prevBtn.addEventListener("click", function () {
  if (currentStep > 1) goTo(currentStep - 1);
});

positionText.addEventListener("input", function () {
  positionText.classList.remove("invalid");
});

reporterPhone.addEventListener("input", function () {
  reporterPhone.classList.remove("invalid");
});

// ---------- รูปภาพ ----------
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

function buildSymptomText() {
  return selectedDevs.map(function (d) {
    var k = devKey(d);
    return d.label + ": " + ((problems[k] || "").trim());
  }).join("\n");
}

function submitForm() {
  if (!validateStep(3)) return;
  if (!device.value.trim()) {
    showToast("กรุณาเลือกอุปกรณ์");
    return;
  }

  nextBtn.disabled = true;
  showLoading();

  var formData = new FormData();
  photos.forEach(function (file) {
    formData.append("photos", file, file.name);
  });
  formData.append("symptom", buildSymptomText());
  formData.append("device", device.value.trim());
  formData.append("location", getLocation());
  formData.append("zone_count", "0");
  formData.append("reporter_name", reporterName.value.trim());
  formData.append("reporter_phone", reporterPhone.value.trim());
  formData.append("reporter_line_id", lineIdText.value.trim() || reporterLineId.value.trim());

  fetch("/api/tickets", { method: "POST", body: formData })
    .then(function (res) {
      if (!res.ok) throw new Error("server");
      return res.json();
    })
    .then(function (data) {
      hideLoading();
      showSuccess(data.ticketNo);
    })
    .catch(function () {
      hideLoading();
      nextBtn.disabled = false;
      showToast("ส่งข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง");
    });
}

form.addEventListener("submit", function (e) {
  e.preventDefault();
  submitForm();
});

function showLoading() {
  loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
  loadingOverlay.classList.add("hidden");
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

copyTicketBtn.addEventListener("click", copyTicket);
successClose.addEventListener("click", function () {
  successOverlay.classList.add("hidden");
  nextBtn.disabled = false;
  window.location.href = "ticket.html";
});

function showSuccess(ticketNo) {
  ticketNoEl.textContent = ticketNo;
  loadingOverlay.classList.add("hidden");
  successOverlay.classList.remove("hidden");
}

function applyReporter(profile) {
  if (reporterName.value.trim() === "") {
    reporterName.value = profile.displayName || "";
  }
  reporterLineId.value = profile.userId || "";
}

function initLineProfile() {
  fetch("/api/config")
    .then(function (res) {
      return res.json();
    })
    .then(function (cfg) {
      if (cfg.lineOaUrl) LINE_OA_URL = cfg.lineOaUrl;
      if (!cfg.liffId || !window.liff) return;
      liff
        .init({ liffId: cfg.liffId })
        .then(function () {
          if (!liff.isLoggedIn()) {
            liff.login();
            return null;
          }
          return liff.getProfile();
        })
        .then(function (profile) {
          if (profile) applyReporter(profile);
        })
        .catch(function () {});
    })
    .catch(function () {});
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
  });
}

initLineProfile();
buildDeviceGrid(hardGrid, HARDWARE_OPTIONS, "Hardware");
buildDeviceGrid(softGrid, SOFTWARE_OPTIONS, "Software");

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toastEl.classList.add("hidden");
  }, 2600);
}