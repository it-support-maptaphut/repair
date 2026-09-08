var LINE_OA_URL = "https://line.me/";

var MAX_PHOTOS = 10;
var ZONE_MAX_PHOTOS = 2;

var photos = [];
var zonePhotos = [];
var toastTimer = null;
var currentStep = 1;

var photoInput = document.getElementById("photoInput");
var photoBtn = document.getElementById("photoBtn");
var photoGrid = document.getElementById("photoGrid");
var photoCount = document.getElementById("photoCount");
var symptom = document.getElementById("symptom");
var prevBtn = document.getElementById("prevBtn");
var nextBtn = document.getElementById("nextBtn");
var loadingOverlay = document.getElementById("loadingOverlay");
var successOverlay = document.getElementById("successOverlay");
var ticketNoEl = document.getElementById("ticketNo");
var countdownEl = document.getElementById("countdown");
var backLink = document.getElementById("backLink");
var toastEl = document.getElementById("toast");
var form = document.getElementById("ticketForm");
var actionBar = document.querySelector(".action-bar");
var reporterName = document.getElementById("reporterName");
var reporterPhone = document.getElementById("reporterPhone");
var reporterLineId = document.getElementById("reporterLineId");

var zonePhotoInput = document.getElementById("zonePhotoInput");
var zonePhotoBtn = document.getElementById("zonePhotoBtn");
var zonePhotoGrid = document.getElementById("zonePhotoGrid");
var zonePhotoCount = document.getElementById("zonePhotoCount");
var positionText = document.getElementById("positionText");
var positionSection = document.getElementById("positionSection");

var branchRadios = document.querySelectorAll('#branchGroup input[name="branch"]');
branchRadios.forEach(function (radio) {
  radio.addEventListener("change", function () {
    positionSection.classList.remove("hidden");
    positionSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

positionText.addEventListener("input", function () {
  positionText.classList.remove("invalid");
});

reporterPhone.addEventListener("input", function () {
  reporterPhone.classList.remove("invalid");
});

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

symptom.addEventListener("input", function () {
  document.getElementById("symptomCount").textContent = symptom.value.length;
  symptom.classList.remove("invalid");
});

photoBtn.addEventListener("click", function () {
  photoInput.click();
});

photoInput.addEventListener("change", function () {
  var files = Array.prototype.slice.call(photoInput.files);
  var remaining = MAX_PHOTOS - photos.length;
  if (files.length > remaining) {
    files = files.slice(0, remaining);
    showToast("รองรับได้สูงสุด " + MAX_PHOTOS + " รูป");
  }
  photos = photos.concat(files);
  photoInput.value = "";
  renderPhotos();
});

photoGrid.addEventListener("click", function (e) {
  var addBtn = e.target.closest(".photo-add");
  if (addBtn) {
    photoInput.click();
    return;
  }
  var delBtn = e.target.closest(".photo-del");
  if (!delBtn) return;
  var index = parseInt(delBtn.dataset.index, 10);
  photos.splice(index, 1);
  renderPhotos();
});

function renderPhotos() {
  var empty = photos.length === 0;
  photoBtn.classList.toggle("hidden", !empty);
  photoCount.textContent = photos.length + "/" + MAX_PHOTOS;

  photoGrid.innerHTML = "";
  photos.forEach(function (file, i) {
    var item = document.createElement("div");
    item.className = "photo-item";

    var img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.alt = "รูป-" + (i + 1);

    var index = document.createElement("span");
    index.className = "photo-index";
    index.textContent = i + 1;

    var del = document.createElement("button");
    del.type = "button";
    del.className = "photo-del";
    del.dataset.index = i;
    del.setAttribute("aria-label", "ลบรูป " + (i + 1));
    del.textContent = "×";

    item.appendChild(img);
    item.appendChild(index);
    item.appendChild(del);
    photoGrid.appendChild(item);
  });

  if (!empty) {
    var add = document.createElement("button");
    add.type = "button";
    add.className = "photo-add";
    add.setAttribute("aria-label", "เพิ่มรูป");
    add.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>เพิ่มรูป</span>';
    photoGrid.appendChild(add);
  }
}

zonePhotoBtn.addEventListener("click", function () {
  zonePhotoInput.click();
});

zonePhotoInput.addEventListener("change", function () {
  var files = Array.prototype.slice.call(zonePhotoInput.files);
  var remaining = ZONE_MAX_PHOTOS - zonePhotos.length;
  if (files.length > remaining) {
    files = files.slice(0, remaining);
    showToast("ถ่ายรูปโซนได้ไม่เกิน " + ZONE_MAX_PHOTOS + " รูป");
  }
  zonePhotos = zonePhotos.concat(files);
  zonePhotoInput.value = "";
  renderZonePhotos();
});

zonePhotoGrid.addEventListener("click", function (e) {
  var addBtn = e.target.closest(".photo-add");
  if (addBtn) {
    zonePhotoInput.click();
    return;
  }
  var delBtn = e.target.closest(".photo-del");
  if (!delBtn) return;
  var index = parseInt(delBtn.dataset.index, 10);
  zonePhotos.splice(index, 1);
  renderZonePhotos();
});

function renderZonePhotos() {
  var empty = zonePhotos.length === 0;
  zonePhotoBtn.classList.toggle("hidden", !empty);
  zonePhotoCount.textContent = zonePhotos.length + "/" + ZONE_MAX_PHOTOS;

  zonePhotoGrid.innerHTML = "";
  zonePhotos.forEach(function (file, i) {
    var item = document.createElement("div");
    item.className = "photo-item";

    var img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.alt = "รูปโซน-" + (i + 1);

    var index = document.createElement("span");
    index.className = "photo-index";
    index.textContent = i + 1;

    var del = document.createElement("button");
    del.type = "button";
    del.className = "photo-del";
    del.dataset.index = i;
    del.setAttribute("aria-label", "ลบรูปโซน " + (i + 1));
    del.textContent = "×";

    item.appendChild(img);
    item.appendChild(index);
    item.appendChild(del);
    zonePhotoGrid.appendChild(item);
  });

  if (!empty) {
    var add = document.createElement("button");
    add.type = "button";
    add.className = "photo-add";
    add.setAttribute("aria-label", "เพิ่มรูปโซน");
    add.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>เพิ่มรูป</span>';
    zonePhotoGrid.appendChild(add);
  }
}

function getSelectedDevice() {
  var checked = document.querySelector('input[name="device"]:checked');
  return checked ? checked.value : "";
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
    if (photos.length === 0) {
      showToast("กรุณาถ่ายรูปอย่างน้อย 1 รูป");
      return false;
    }
    return true;
  }

  if (step === 2) {
    if (symptom.value.trim().length === 0) {
      symptom.classList.add("invalid");
      symptom.scrollIntoView({ behavior: "smooth", block: "center" });
      showToast("กรุณากรอกอาการ");
      return false;
    }

    var device = getSelectedDevice();
    if (!device) {
      document.getElementById("deviceGroup").closest(".field")
        .scrollIntoView({ behavior: "smooth", block: "center" });
      showToast("กรุณาเลือกหมวดของปัญหา");
      return false;
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

    if (zonePhotos.length === 0) {
      positionSection.classList.remove("hidden");
      zonePhotoBtn.scrollIntoView({ behavior: "smooth", block: "center" });
      showToast("กรุณาถ่ายรูปโซนอย่างน้อย 1 รูป");
      return false;
    }

    if (positionText.value.trim().length === 0) {
      positionSection.classList.remove("hidden");
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
    form.requestSubmit();
  }
});

prevBtn.addEventListener("click", function () {
  if (currentStep > 1) goTo(currentStep - 1);
});

form.addEventListener("submit", function (e) {
  e.preventDefault();

  if (!validateStep(3)) return;

  nextBtn.disabled = true;
  showLoading();

  var formData = new FormData();
  photos.forEach(function (file) {
    formData.append("photos", file, file.name);
  });
  zonePhotos.forEach(function (file) {
    formData.append("photos", file, file.name);
  });
  formData.append("symptom", symptom.value.trim());
  formData.append("device", getSelectedDevice());
  formData.append("location", getLocation());
  formData.append("zone_count", String(zonePhotos.length));
  formData.append("reporter_name", reporterName.value.trim());
  formData.append("reporter_phone", reporterPhone.value.trim());
  formData.append("reporter_line_id", reporterLineId.value.trim());

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
});

function showLoading() {
  loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
  loadingOverlay.classList.add("hidden");
}

function showSuccess(ticketNo) {
  ticketNoEl.textContent = ticketNo;
  loadingOverlay.classList.add("hidden");
  successOverlay.classList.remove("hidden");

  var seconds = 5;
  countdownEl.textContent = "กลับเข้าสู่ Line อัตโนมัติใน " + seconds + " วินาที";

  var timer = setInterval(function () {
    seconds -= 1;
    if (seconds <= 0) {
      clearInterval(timer);
      backToLine();
      return;
    }
    countdownEl.textContent = "กลับเข้าสู่ Line อัตโนมัติใน " + seconds + " วินาที";
  }, 1000);
}

backLink.addEventListener("click", function () {
  backToLine();
});

function backToLine() {
  window.location.href = LINE_OA_URL;
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

initLineProfile();

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toastEl.classList.add("hidden");
  }, 2600);
}