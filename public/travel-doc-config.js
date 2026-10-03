// ============================================================
// travel-doc-config.js — โมดูลกลางของ "ใบเบิกค่าน้ำมันและค่าเดินทาง"
// ใช้กับหน้าพิมพ์ (travel-print.html) เป็นหลัก
// เก็บการคำนวณและข้อความทั้งหมดไว้ที่เดียว เพื่อให้เอกสารที่พิมพ์
// ไม่ต้องกลัวไปแสดงข้อมูลไม่ตรงกับที่บันทึกไว้
//
// โครงสร้างอ้างอิงจากไฟล์ต้นแบบ:
//   public/เอ็กเซลเบิกตัวอย่าง/เบิกค่าเดินทาง.xlsx
//
// ไฟล์นี้อยู่ใน public/ เพื่อให้เบราว์เซอร์เรียกได้ตรงๆ
//   <script src="/travel-doc-config.js"></script>
// ============================================================
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TravelDoc = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ------------------------------------------------------------
  // ข้อความประจำเอกสาร (ต้องตรงกันทั้ง 3 ช่องทาง)
  // ------------------------------------------------------------
  var TITLE = "ใบเบิกค่าน้ำมันและค่าเดินทาง";
  var SUBTITLE = "สำหรับการเดินทางไปปฏิบัติงานนอกสถานที่";

  var HEAD_DATE = "วันที่";
  var HEAD_PURPOSE = "รายการ";
  var HEAD_KM = "ระยะทาง (กิโลเมตร)";
  var HEAD_TOTAL = "ยอดรวม (บาท)";

  // หัวคอลัมน์รถ 2 บรรทัด (บรรทัดบนคือหน่วยเงิน / เส้นคั่น / บรรทัดล่างคือประเภทรถ)
  //   1) "บาท/ต่อกิโลเมตร"
  //   2) "รถมอเตอร์ไซค์"
  // คนอ่านจึงรู้ว่าคอลัมน์นี้เป็นรถอะไร และหน่วยเงินคิดต่อกิโลเมตร
  var RATE_UNIT = "บาท/ต่อกิโลเมตร";
  var VEH_NAME_MOTO = "รถมอเตอร์ไซค์";
  var VEH_NAME_CAR = "รถยนต์";

var TOTAL_LABEL = "รวมทั้งสิ้น";
var BANK_HINT = "(กรอกในระบบ)";


  // ช่องลงนาม 4 ช่อง: ผู้เบิก / ผู้ตรวจสอบ 2 คน / ผู้อนุมัติ
  // ผู้ตรวจสอบทั้ง 2 คนใช้ป้ายหน้าที่เดียวกันว่า "ผู้ตรวจสอบ"
  // แยกกันด้วยชื่อ/ตำแหน่งที่กรอกในแต่ละช่องแทน
  var ROLES = {
    claimer: "ผู้เบิก",
    checkerAcc: "ผู้ตรวจสอบ",
    checkerHr: "ผู้ตรวจสอบ",
    approver: "ผู้อนุมัติ"
  };

// ความกว้างคอลัมน์ของตาราง (หน่วย % ของพื้นที่เนื้อหา 180 มม.)
//   คำนวณจากความกว้างตัวอักษรจริงของฟอนต์ Sarabun ที่สเกลเต็ม --s = 1.25
// คอลัมน์รถ: ต้องพอสำหรับบรรทัด "บาท/ต่อกิโลเมตร" (28.5 มม. ที่ตัวเล็ก)
//   ถ้าเหลือรถประเภทเดียว ขยายเป็น 20% แล้วคืนพื้นที่ที่เหลือให้คอลัมน์ "รายการ"
var COL_BASE = { date: 14.0, purpose: 0, km: 12.2, total: 11.0 };
var VEH_PAIR = 17.0;   // ติ๊ก 2 ประเภท
var VEH_ONE = 20.0;    // ติ๊ก 1 ประเภท

  var DEFAULT_RATE_MOTO = 3;
  var DEFAULT_RATE_CAR = 5;

  // ความกว้างคอลัมน์ (หน่วย "อักษร" ของ Excel) ตามต้นแบบ
  // หมายเหตุ: คอลัมน์ "วันที่" ขยายจาก 8.875 เป็น 10.5 เพราะฟอนต์ Sarabun
  // กว้างกว่า Angsana New ของต้นแบบ — ถ้าใช้ค่าเดิมข้อความวันที่จะล้นเส้น
  var COLS = [
    { i: 1, w: 10.5 },
    { i: 2, w: 11.5 },
    { i: 3, w: 9 },
    { i: 4, w: 23.25 },
    { i: 5, w: 9.875 },
    { i: 6, w: 9.125 },
    { i: 7, w: 9.625 },
    { i: 8, w: 11.75 }
  ];

  // ------------------------------------------------------------
  // Utilities
  // ------------------------------------------------------------
  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function num2(n) {
    return Math.round(num(n) * 100) / 100;
  }

  function money(n) {
    return num2(n).toFixed(2);
  }

  function str(v) {
    return String(v == null ? "" : v).trim();
  }

  function fmtDate(value) {
    var s = String(value == null ? "" : value).slice(0, 10);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return s;
    return m[3] + "/" + m[2] + "/" + m[1];
  }

  // แปลงชนิดรถให้รับได้ทั้งค่าจากฟอร์ม (motorcycle/car)
  // และค่าที่เคยบันทึกเป็นภาษาไทย ถ้าไม่แปลง ข้อมูลเก่าที่มี "รถยนต์"
  // จะถูกนับเป็นมอเตอร์ไซค์ ทำให้ยอดไปตกผิดช่อง
  function vehicleOf(value) {
    var v = str(value).toLowerCase().replace(/\s+/g, "");
    if (!v) return "motorcycle";
    if (v === "car" || v === "รถยนต์" || v === "รถ" || v === "ยนต์") return "car";
    return "motorcycle";
  }

  function parseTrips(claim) {
    var raw = (claim || {}).trips_json;
    if (Array.isArray(raw)) return raw;
    try {
      var p = JSON.parse(raw || "[]");
      return Array.isArray(p) ? p : [];
    } catch (e) {
      return [];
    }
  }

  // ตัดข้อความที่ซ้ำกับชื่อบริษัทออก (กันพิมพ์ชื่อบริษัท 2 ครั้ง)
  // ถ้าไม่ได้ระบุตำแหน่งเลย -> คืนค่าว่าง ให้หน้าพิมพ์ไปแสดงเป็นช่องกรอกแทน
  // (ไม่เดาไปใส่ชื่อบริษัทให้ เพราะผู้ตรวจสอบบางคนต้องการเขียนเอง)
  function subLines(title, company) {
    var out = [];
    var t = str(title);
    var co = str(company);
    if (!t) return out;
    var nt = t.replace(/\s+/g, "");
    var nc = co.replace(/\s+/g, "");
    if (!nc || (nt.indexOf(nc) < 0 && nc.indexOf(nt) < 0)) out.push(t);
    if (co) out.push(co);
    return out;
  }

  // อ่านจำนวนเงินเป็นภาษาไทย
  function thaiBaht(amount) {
    var n = Math.round((Number(amount) || 0) * 100);
    if (!isFinite(n)) return "";
    var neg = n < 0;
    n = Math.abs(n);

    var THAI = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
    var POS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

    function readGroup(x) {
      var s = String(x);
      var len = s.length;
      var out = "";
      for (var i = 0; i < len; i++) {
        var d = Number(s[i]);
        var p = len - 1 - i;
        if (!d) continue;
        if (p === 1 && d === 1) out += "สิบ";
        else if (p === 1 && d === 2) out += "ยี่สิบ";
        else if (p === 0 && d === 1 && len > 1) out += "เอ็ด";
        else out += THAI[d] + POS[p];
      }
      return out;
    }

    function readInt(x) {
      if (!x) return "ศูนย์";
      var million = Math.floor(x / 1000000);
      var rest = x % 1000000;
      var out = "";
      if (million > 0) out += readGroup(million) + "ล้าน";
      if (rest > 0) out += readGroup(rest);
      return out;
    }

    var baht = Math.floor(n / 100);
    var satang = n % 100;
    var out = readInt(baht) + "บาท";
    out += satang === 0 ? "ถ้วน" : readInt(satang) + "สตางค์";
    return (neg ? "ลบ" : "") + out;
  }

  // ------------------------------------------------------------
  // เก็บค่าจาก settings แบบมีค่า default
  // ------------------------------------------------------------
  function pick(value, fallback) {
    var s = str(value);
    return s ? s : fallback;
  }

  function rate(value, fallback) {
    var n = Number(value);
    if (value == null || value === "" || !isFinite(n) || n < 0) return fallback;
    return num2(n);
  }

  // ------------------------------------------------------------
  // build() — รวมข้อมูลทั้งใบเป็นโครงสร้างเดียว ให้ทั้ง 3 ช่องทางใช้ตรงกัน
  // ------------------------------------------------------------
  function build(claim, settings) {
    var c = claim || {};
    var cfg = settings || {};

    // ---------- อัตราค่าน้ำมัน ----------
    var rateMoto = rate(cfg.fuel_rate_motorcycle, DEFAULT_RATE_MOTO);
    var rateCar = rate(cfg.fuel_rate_car, DEFAULT_RATE_CAR);

    // ---------- เที่ยวเดินทาง ----------
    var raw = parseTrips(c);
    if (!raw.length) raw = [{ date: "", purpose: "", km: 0, vehicle: "motorcycle" }];

    var trips = raw.map(function (t) {
      var row = t && typeof t === "object" ? t : {};
      var vehicle = vehicleOf(row.vehicle);
      var km = num2(row.km);
      var r =
        row.rate != null && row.rate !== ""
          ? num2(row.rate)
          : (vehicle === "car" ? rateCar : rateMoto);
      var amount = row.amount != null && row.amount !== "" ? num2(row.amount) : num2(km * r);

      return {
        date: str(row.date),
        purpose: str(row.purpose),
        km: km,
        vehicle: vehicle,
        rate: r,
        amount: amount,
        moto: vehicle === "car" ? 0 : amount,
        car: vehicle === "car" ? amount : 0
      };
    });

    // ---------- ยอดรวม (คิดจากยอดจริงทุกเที่ยว ไม่เกี่ยวกับค่าอัตราในแถวแรก) ----------
    var sumKm = 0;
    var sumMoto = 0;
    var sumCar = 0;
    var sumTotal = 0;
    trips.forEach(function (t) {
      sumKm += t.km;
      sumMoto += t.moto;
      sumCar += t.car;
      sumTotal += t.amount;
    });
    sumKm = num2(sumKm);
    sumMoto = num2(sumMoto);
    sumCar = num2(sumCar);
    sumTotal = num2(sumTotal);

    // ---------- ข้อมูลผู้ลงนาม ----------
    // รูปแบบช่องลงนาม (เรียงจากบนลงล่าง):
    //   (เส้นประสำหรับลงนาม)
    //   ชื่อ
    //   ตำแหน่ง
    //   (หน้าที่)
    var company = str(cfg.travel_company);

    var claimerName = pick(c.claimer_name, str(cfg.travel_claimer_name));
    var claimerDept = pick(c.position, str(cfg.travel_claimer_position));

    var approverName = str(cfg.travel_approver_name);
    var checkerName = str(cfg.travel_checker_name);
    var checker2Name = str(cfg.travel_checker2_name);

    // ชื่อแยกไว้ใน .name ส่วน .position เก็บตำแหน่ง
    // ตัดบรรทัดที่ซ้ำกับหน้าที่ทิ้ง เช่น ตั้งตำแหน่งว่า "ผู้ตรวจสอบ"
    // ซึ่งจะไปซ้ำกับ "(ผู้ตรวจสอบ)" ที่พิมพ์ไว้บนสุดอยู่แล้ว
    function officer(name, title, role) {
      var position = subLines(title, company).filter(function (line) {
        return line.replace(/\s+/g, "") !== String(role).replace(/\s+/g, "");
      });
      return { name: name, position: position };
    }

    var approver = officer(approverName, cfg.travel_approver_title, ROLES.approver);
    var checker = officer(checkerName, cfg.travel_checker_title, ROLES.checkerAcc);
    var checker2 = officer(checker2Name, cfg.travel_checker2_title, ROLES.checkerHr);

    // เติมบรรทัดให้ผู้ตรวจสอบ 2 คน มีจำนวนเท่ากัน
    // ถ้าไม่เติม เส้นลงนามของสองคนจะอยู่คนละระดับ (คนที่ตำแหน่งน้อยกว่าจะสูงกว่า)
    var lowLines = Math.max(checker.position.length, checker2.position.length);
    while (checker.position.length < lowLines) checker.position.push("");
    while (checker2.position.length < lowLines) checker2.position.push("");

    // ---------- คอลัมน์รถที่จะแสดง ----------
    // ค่ามาจากการติ๊กในหน้าตั้งค่า: "moto,car" = ทั้งคู่ / "moto" = มอเตอร์ไซค์ / "car" = รถยนต์
    // ค่าผิดปกติ (ว่าง หรือไม่มีประเภทไหนเลย) ให้ยึดค่าเดิม "ทั้งคู่" เพื่อไม่ให้ตารางหายคอลัมน์
    var vehCols = str(cfg.travel_vehicle_columns)
      .toLowerCase()
      .split(",")
      .map(function (x) { return x.trim(); })
      .filter(function (x) { return x === "moto" || x === "car"; });
    var showMoto = vehCols.length ? vehCols.indexOf("moto") >= 0 : true;
    var showCar = vehCols.length ? vehCols.indexOf("car") >= 0 : true;
    if (!showMoto && !showCar) { showMoto = true; showCar = true; }

    // คอลัมน์รถ 1 ประเภทต้องกว้างกว่าเดิม เพื่อให้หัว "อัตรา(บาท/กม.)" พอดี
    // แล้วคืนพื้นที่ที่ได้เพิ่มให้คอลัมน์ "รายการ" (ต้องได้ผลรวม 100%)
    var vehCount = (showMoto ? 1 : 0) + (showCar ? 1 : 0);
    var vehWidth = vehCount === 1 ? VEH_ONE : VEH_PAIR;
    var colPurpose = 100 - COL_BASE.date - COL_BASE.km - COL_BASE.total - vehWidth * vehCount;

    // คอลัมน์ที่แสดงเสมอ
    var cols = {
      date: COL_BASE.date,
      purpose: colPurpose,
      km: COL_BASE.km,
      total: COL_BASE.total
    };
    // คอลัมน์รถ แสดงเฉพาะประเภทที่ติ๊กไว้
    if (showMoto) cols.moto = vehWidth;
    if (showCar) cols.car = vehWidth;

    return {
      title: TITLE,
      subtitle: SUBTITLE,
heads: {
    date: HEAD_DATE,
        purpose: HEAD_PURPOSE,
        km: HEAD_KM,
        total: HEAD_TOTAL,
        // หัวคอลัมน์รถ: บรรทัดบน "บาท/ต่อกิโลเมตร" บรรทัดล่าง "รถมอเตอร์ไซค์"
        // ใช้รูปแบบเดียวกันทุกโหมด (ติ๊กครบ / ติ๊กรถเดียว)
        moto: { rate: RATE_UNIT, name: VEH_NAME_MOTO },
        car: { rate: RATE_UNIT, name: VEH_NAME_CAR }
      },
      totalLabel: TOTAL_LABEL,
      bankHint: BANK_HINT,

      rateMoto: rateMoto,
      rateCar: rateCar,

      // ---------- คอลัมน์รถที่แสดง ----------
      showMoto: showMoto,
      showCar: showCar,
      // ความกว้างคอลัมน์ (%) สำหรับ <colgroup> — รวม 100 เสมอ
      cols: cols,

      trips: trips,
      sumKm: sumKm,
      sumMoto: sumMoto,
      sumCar: sumCar,
      sumTotal: sumTotal,
      sumThaiBaht: thaiBaht(sumTotal),

      // ---------- ข้อมูลการรับเงิน ----------
      bankName: pick(c.bank_name, str(cfg.travel_bank_name)),
      bankAccount: pick(c.bank_account, str(cfg.travel_bank_account)),
      accountName: pick(c.account_name, pick(str(cfg.travel_account_name), claimerName)),

      // ---------- ช่องลงนาม ----------
      // ทุกช่องเรียง: (เส้นประ) → ชื่อ → ตำแหน่ง → (หน้าที่)
      // ผู้เบิก              : อยู่ด้านบนกึ่งกลาง
      claimer: {
        name: claimerName,
        position: claimerDept ? [claimerDept] : [],
        role: ROLES.claimer
      },
      // ผู้ตรวจสอบ 2 คน : อยู่แถวกลางคู่กัน
      checker: checker,
      checker2: checker2,
      // ผู้อนุมัติ : อยู่แถวล่างกึ่งกลาง
      approver: approver,
      roles: ROLES,

      note: str(c.note)
    };
  }

  // ------------------------------------------------------------
  // Export
  // ------------------------------------------------------------
  return {
    TITLE: TITLE,
    SUBTITLE: SUBTITLE,
    COLS: COLS,
    ROLES: ROLES,
    DEFAULT_RATE_MOTO: DEFAULT_RATE_MOTO,
    DEFAULT_RATE_CAR: DEFAULT_RATE_CAR,
    num: num,
    num2: num2,
    money: money,
    str: str,
    fmtDate: fmtDate,
    parseTrips: parseTrips,
    subLines: subLines,
    thaiBaht: thaiBaht,
    build: build
  };
});
