const { createClient } = require("@supabase/supabase-js");
const config = require("./config");

function usable(key) {
  if (key && String(key).length > 20 && !String(key).toLowerCase().startsWith("xxxxx")) {
    return String(key);
  }
  return null;
}

const supabaseKey =
  usable(config.SUPABASE_SECRET_KEY) ||
  usable(config.SUPABASE_SERVICE_ROLE_KEY) ||
  "";

const ready = config.SUPABASE_URL && supabaseKey;

const supabase = ready
  ? createClient(config.SUPABASE_URL, supabaseKey)
  : null;

let photosBucketReady = false;
async function ensurePhotosBucket() {
  if (!ready || photosBucketReady) return;
  try {
    const { error } = await supabase.storage.createBucket("photos", { public: true });
    if (error && !/already exists/i.test(error.message)) {
      console.warn("[Supabase Storage] สร้าง bucket 'photos':", error.message);
    }
  } catch (e) {}
  photosBucketReady = true;
}
ensurePhotosBucket();

function devicePrefix(device) {
  const d = String(device || "").toLowerCase();
  if (!d) return "R-";
  if (d.includes("hardware")) return "HW-";
  if (d.includes("software") || d.includes("soft") || d === "sw") return "SW-";
  return "HW-";
}

async function genTicketNo(device) {
  const prefix = devicePrefix(device);
  if (ready) {
    const { data, error } = await supabase.rpc("next_ticket_no", { p_prefix: prefix });
    if (!error && data) return String(data);
  }
  const lastDigits = (no) => {
    const m = /(\d+)\s*$/.exec(no || "");
    return m ? parseInt(m[1], 10) : 0;
  };
  const { data } = await supabase
    .from("tickets")
    .select("ticket_no")
    .like("ticket_no", prefix + "%")
    .order("id", { ascending: false })
    .limit(1);
  const row = data && data[0];
  const seq = row ? lastDigits(row.ticket_no) + 1 : 1;
  return prefix + String(seq).padStart(3, "0");
}

async function createTicket({ ticketNo, device, symptom, location, reporterName, reporterPhone, reporterLineId, status, handlerName, statusDate, statusTime, source, acceptedAt, audioUrl, visitorId }) {
  const accepted_at = acceptedAt || null;
  const payload = {
    ticket_no: ticketNo,
    device,
    symptom,
    location,
    reporter_name: reporterName,
    reporter_phone: reporterPhone,
    reporter_line_id: reporterLineId,
    status: status || "new",
    handler_name: handlerName || "",
    status_date: statusDate || null,
    status_time: statusTime || "",
    source: source || "external",
    approved_at: status === "working" ? new Date().toISOString() : null,
    accepted_at,
    audio_url: audioUrl || "",
    visitor_id: visitorId || null
  };
  let res = await supabase
    .from("tickets")
    .insert(payload)
    .select("id")
    .single();
  // ยังไม่ได้ ran SQL เพิ่มคอลัมน์ accepted_at
  if (res.error && /accepted_at/.test(res.error.message)) {
    if (source === "external") {
      // ใบแจ้งจากภายนอกต้องเข้ากล่องข้อความก่อนเสมอ — ห้าม bypass
      throw new Error("ระบบกล่องข้อความยังไม่พร้อม: ต้องรัน SQL เพิ่มคอลัมน์ accepted_at");
    }
    // ใบแจ้งภายใน — ลอง insert โดยไม่มีคอลัมน์นี้ (ยังเข้าระบบได้)
    const p2 = Object.assign({}, payload);
    delete p2.accepted_at;
    res = await supabase
      .from("tickets")
      .insert(p2)
      .select("id")
      .single();
  }
  if (res.error && /audio_url/.test(res.error.message)) {
    // ยังไม่ได้ ran SQL เพิ่มคอลัมน์ audio_url — เก็บงานโดยไม่มีไฟล์เสียง
    const p3 = Object.assign({}, payload);
    delete p3.audio_url;
    res = await supabase
      .from("tickets")
      .insert(p3)
      .select("id")
      .single();
  }
  if (res.error && /status_time/.test(res.error.message)) {
    // ยังไม่ได้ ran SQL เพิ่มคอลัมน์ status_time — เก็บงานโดยไม่มีเวลา
    const p4 = Object.assign({}, payload);
    delete p4.status_time;
    res = await supabase
      .from("tickets")
      .insert(p4)
      .select("id")
      .single();
  }
  if (res.error && /visitor_id/.test(res.error.message)) {
    // ยังไม่ได้ ran SQL เพิ่มคอลัมน์ visitor_id — เก็บงานโดยไม่ผูกผู้ใช้ (หาประวัติจากชื่อ/ตำแหน่งแทน)
    const p5 = Object.assign({}, payload);
    delete p5.visitor_id;
    res = await supabase
      .from("tickets")
      .insert(p5)
      .select("id")
      .single();
  }
  if (res.error) throw res.error;
  return res.data.id;
}

async function addPhotos(ticketId, urls) {
  if (!urls.length) return;
  const rows = urls.map((u, i) => ({
    ticket_id: ticketId,
    cloud_url: u,
    sort_order: i + 1
  }));
  const { error } = await supabase.from("ticket_photos").insert(rows);
  if (error) throw error;
}

async function updateArchive(ticketNo, gzipBase64, sizeBytes) {
  const { error } = await supabase
    .from("tickets")
    .update({
      archive_base64: gzipBase64,
      archive_size: sizeBytes,
      archived_at: new Date().toISOString()
    })
    .eq("ticket_no", ticketNo);
  if (error) throw error;
}

async function listTickets(limit = 500) {
  const cols =
    "id,ticket_no,device,symptom,location,reporter_name,reporter_phone,reporter_line_id,status,handler_name,status_date,status_time,source,approved_at,created_at,pdf_url,archive_size,archived_at,audio_url,ticket_photos(id,cloud_url,sort_order)";
  const { data, error } = await supabase
    .from("tickets")
    .select(cols)
    .not("accepted_at", "is", null)
    .order("id", { ascending: false })
    .limit(limit);
  if (!error) return data;
  const { data: fallback, error: fbErr } = await supabase
    .from("tickets")
    .select("*, ticket_photos(id, cloud_url, sort_order)")
    .order("id", { ascending: false })
    .limit(limit);
  if (fbErr) throw fbErr;
  // ถ้ายังไม่ได้ ran SQL เพิ่มคอลัมน์ accepted_at จะได้ undefined หมด → แสดงทุกตัว (พฤติกรรมเดิม)
  return (fallback || []).filter(function (t) { return t.accepted_at === undefined || t.accepted_at; });
}

// ติดข้อมูลบัญชีผู้ใช้ภายนอก (ชื่อ / ตำแหน่ง / ประจำสาขา) ให้ใบแจ้งในกล่องข้อความ
async function attachInboxVisitors(rows) {
  const ids = [];
  (rows || []).forEach(function (r) {
    if (r && r.visitor_id != null && ids.indexOf(r.visitor_id) === -1) ids.push(r.visitor_id);
  });
  if (!ids.length) return rows;
  const map = {};
  let res = await supabase.from("external_visitors").select("id,name,position,branch").in("id", ids);
  if (res.error && /branch/.test(res.error.message)) {
    res = await supabase.from("external_visitors").select("id,name,position").in("id", ids);
  }
  if (!res.error) (res.data || []).forEach(function (v) { map[v.id] = v; });
  (rows || []).forEach(function (r) {
    if (r && r.visitor_id != null && map[r.visitor_id]) r.visitor = map[r.visitor_id];
  });
  return rows;
}

async function listInbox(limit = 100) {
  const cols =
    "id,ticket_no,device,symptom,location,reporter_name,reporter_phone,reporter_line_id,status,handler_name,status_date,status_time,source,approved_at,created_at,audio_url,visitor_id,ticket_photos(id,cloud_url,sort_order)";
  const { data, error } = await supabase
    .from("tickets")
    .select(cols)
    .eq("source", "external")
    .is("accepted_at", null)
    .order("id", { ascending: false })
    .limit(limit);
  if (!error) return attachInboxVisitors(data || []);
  // ยังไม่ได้ ran SQL เพิ่มคอลัมน์ accepted_at → ระบบ inbox ยังไม่เปิด (คืนค่าว่าง)
  if (/accepted_at/.test(error.message)) return [];
  const fb = await supabase
    .from("tickets")
    .select("*, ticket_photos(id, cloud_url, sort_order)")
    .order("id", { ascending: false })
    .limit(limit);
  if (fb.error) throw fb.error;
  return attachInboxVisitors((fb.data || []).filter(function (t) { return t.source === "external" && !t.accepted_at; }));
}

async function acceptTicket(ticketNo) {
  const { data, error } = await supabase
    .from("tickets")
    .update({ accepted_at: new Date().toISOString() })
    .eq("ticket_no", ticketNo)
    .is("accepted_at", null)
    .select("ticket_no")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// ประวัติการแจ้งซ่อมของฉัน (ผู้ใช้ภายนอก) — อ่านอย่างเดียว
// จะให้ดูเฉพาะงานของตัวเองเท่านั้น ต้องผูกด้วย visitor_id
// ถ้ายังไม่ได้รัน SQL เพิ่มคอลัมน์ visitor_id ให้หาโดยเทียบเรปอร์เตอร์ (ชื่อ · ตำแหน่ง) แทน
const MY_TICKETS_COLS =
  "id,ticket_no,device,symptom,location,reporter_name,status,handler_name,status_date,status_time,source,approved_at,accepted_at,created_at,pdf_url,audio_url";

async function listMyTickets(visitorId, reporterName) {
  if (!ready) return [];
  if (visitorId) {
    const { data, error } = await supabase
      .from("tickets")
      .select(MY_TICKETS_COLS)
      .eq("visitor_id", visitorId)
      .order("id", { ascending: false })
      .limit(200);
    if (!error) return data || [];
    if (!/visitor_id/.test(error.message)) throw error;
  }
  if (reporterName) {
    const { data, error } = await supabase
      .from("tickets")
      .select(MY_TICKETS_COLS)
      .eq("reporter_name", reporterName)
      .order("id", { ascending: false })
      .limit(200);
    if (!error) return data || [];
    throw error;
  }
  return [];
}

// เจ้าของใบแจ้งซ่อม (ใช้ส่งแจ้งเตือนแบบผูกบัญชี แทนการผูก IP)
async function getTicketOwner(ticketNo) {
  if (!ready || !ticketNo) return null;
  try {
    const { data, error } = await supabase
      .from("tickets")
      .select("id, ticket_no, visitor_id, reporter_name")
      .eq("ticket_no", ticketNo)
      .limit(1);
    if (error) throw error;
    return (data && data[0]) || null;
  } catch (err) {
    console.warn("[Notify] โหลดเจ้าของใบแจ้งซ่อมไม่สำเร็จ:", err.message);
    return null;
  }
}

async function recordDevice({ ip, ticketNo }) {
  if (!ready || !ip) return;
  try {
    const { data: existing } = await supabase
      .from("user_devices")
      .select("id, ticket_count, name")
      .eq("ip", ip)
      .maybeSingle();
    const count = existing && existing.ticket_count ? existing.ticket_count + 1 : 1;
    const insert = await supabase
      .from("user_devices")
      .upsert(
        {
          ip,
          name: existing && existing.name ? existing.name : "",
          last_seen_at: new Date().toISOString(),
          last_ticket_no: ticketNo,
          ticket_count: count
        },
        { onConflict: "ip" }
      )
      .select("id");
    if (insert.error) throw insert.error;
  } catch (err) {
    console.warn("[Devices] บันทึกข้อมูลผู้ใช้ไม่สำเร็จ (ต้องรัน SQL ตาราง user_devices):", err.message);
  }
}

async function listDevices(limit = 200) {
  const { data, error } = await supabase
    .from("user_devices")
    .select("*")
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function setDeviceName(ip, name) {
  const { data, error } = await supabase
    .from("user_devices")
    .update({ name })
    .eq("ip", ip)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

async function createDevice({ ip, name }) {
  if (!ready || !ip) throw new Error("ยังไม่ได้ตั้งค่า Supabase ใน .env");
  const { data: existing } = await supabase
    .from("user_devices")
    .select("id, ticket_count, last_ticket_no, last_seen_at")
    .eq("ip", ip)
    .maybeSingle();
  let result;
  if (existing) {
    const { data, error } = await supabase
      .from("user_devices")
      .update({ name: name || "" })
      .eq("ip", ip)
      .select("ip, name")
      .single();
    if (error) throw error;
    result = data;
  } else {
    const { data, error } = await supabase
      .from("user_devices")
      .insert({
        ip,
        name: name || "",
        last_seen_at: new Date().toISOString(),
        last_ticket_no: "",
        ticket_count: 0
      })
      .select("ip, name")
      .single();
    if (error) throw error;
    result = data;
  }
  return result;
}

async function removeDevice(ip) {
  const { data, error } = await supabase
    .from("user_devices")
    .delete()
    .eq("ip", ip)
    .select("id");
  if (error) throw error;
  return data;
}

async function genDeviceNo() {
  const { data } = await supabase
    .from("device_entries")
    .select("entry_no")
    .like("entry_no", "DEV-%")
    .order("id", { ascending: false })
    .limit(1);
  const row = data && data[0];
  const m = /(\d+)\s*$/.exec(row ? row.entry_no : "");
  const seq = row && m ? parseInt(m[1], 10) + 1 : 1;
  return "DEV-" + String(seq).padStart(3, "0");
}

async function listDeviceCategories() {
  const { data, error } = await supabase
    .from("device_categories")
    .select("*")
    .order("name");
  if (error) throw error;
  return data || [];
}

async function addDeviceCategory(name) {
  const { data, error } = await supabase
    .from("device_categories")
    .insert({ name: name.trim() })
    .select("id, name")
    .single();
  if (error) throw error;
  return data;
}

async function listDeviceOptions() {
  const { data, error } = await supabase
    .from("device_options")
    .select("*")
    .order("category")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data || [];
}

async function addDeviceOption({ category, name, iconUrl, sortOrder }) {
  const row = {
    category: String(category || "Hardware").trim(),
    name: String(name || "").trim(),
    icon_url: String(iconUrl || "").trim(),
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0
  };
  const { data, error } = await supabase
    .from("device_options")
    .insert(row)
    .select("id, category, name, icon_url, sort_order")
    .single();
  if (error) throw error;
  return data;
}

async function updateDeviceOption(id, { category, name, iconUrl, sortOrder }) {
  const patch = {};
  if (category !== undefined) patch.category = String(category).trim();
  if (name !== undefined && name !== null) patch.name = String(name).trim();
  if (iconUrl !== undefined && iconUrl !== null) patch.icon_url = String(iconUrl).trim();
  if (sortOrder !== undefined && Number.isFinite(sortOrder)) patch.sort_order = sortOrder;
  const { data, error } = await supabase
    .from("device_options")
    .update(patch)
    .eq("id", id)
    .select("id, category, name, icon_url, sort_order")
    .single();
  if (error) throw error;
  return data;
}

async function deleteDeviceOption(id) {
  const { data, error } = await supabase
    .from("device_options")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data || [];
}

async function listDeviceEntries(limit = 500) {
  const { data, error } = await supabase
    .from("device_entries")
    .select("*, photos:device_entry_photos(id, cloud_url, sort_order)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(function (r) {
    r.photos = (r.photos || []).sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    return r;
  });
}

async function createDeviceEntry({ entryNo, category, model, specJson, specSource, specUrl, warrantyNo, claimCompany, warrantyExpireDate, status, brokenDate, claimDate, assetCode, branch, position, notes }) {
  const row = {
    entry_no: entryNo,
    category: category || "",
    model: model || "",
    spec_json: specJson || "",
    spec_source: specSource || "manual",
    spec_url: specUrl || "",
    warranty_no: warrantyNo || "",
    claim_company: claimCompany || "",
    warranty_expire_date: warrantyExpireDate || null,
    status: status || "claim",
    broken_date: brokenDate || null,
    claim_date: claimDate || null,
    asset_code: assetCode || "",
    branch: branch || "",
    position: position || "",
    notes: notes || ""
  };
  const { data, error } = await supabase
    .from("device_entries")
    .insert(row)
    .select("id")
    .single();
  if (error) {
    const msg = String(error.message || "");
    const colMissing = msg.indexOf("branch") !== -1 || msg.indexOf("position") !== -1 || msg.indexOf("column") !== -1;
    if (colMissing) {
      const legacyRow = Object.assign({}, row);
      delete legacyRow.branch;
      delete legacyRow.position;
      const retry = await supabase
        .from("device_entries")
        .insert(legacyRow)
        .select("id")
        .single();
      if (retry.error) throw retry.error;
      return retry.data.id;
    }
    throw error;
  }
  return data.id;
}

async function updateDeviceEntry(id, patch) {
  const { data, error } = await supabase
    .from("device_entries")
    .update(patch)
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

async function deleteDeviceEntry(id) {
  const { data, error } = await supabase
    .from("device_entries")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data || [];
}

// ---------- Maintenance อุปกรณ์ขององค์กร ----------
async function listDeviceMaintenance(limit = 1000) {
  const entriesPromise = supabase
    .from("device_entries")
    .select("*, photos:device_entry_photos(id, cloud_url, sort_order)")
    .order("created_at", { ascending: false })
    .limit(limit);
  const logsPromise = supabase
    .from("device_maintenance_logs")
    .select("entry_id, checked_date, status, notes, created_at")
    .order("checked_date", { ascending: true })
    .limit(5000);
  const [entriesRes, logsRes] = await Promise.all([entriesPromise, logsPromise]);
  if (entriesRes.error) throw entriesRes.error;
  if (logsRes.error) throw logsRes.error;

  const lastCheck = {};
  (logsRes.data || []).forEach(function (l) {
    var key = String(l.entry_id);
    if (!l.entry_id) return;
    var prev = lastCheck[key];
    if (!prev || String(l.checked_date) > String(prev.checked_date)) {
      lastCheck[key] = l;
    }
  });

  return (entriesRes.data || []).map(function (r) {
    r.photos = (r.photos || []).sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    var lc = lastCheck[String(r.id)];
    r.last_check_date = lc ? lc.checked_date : "";
    r.last_check_status = lc ? lc.status : "";
    return r;
  });
}

async function createMaintenanceCheck({ entryId, checkedDate, status, notes }) {
  const { data, error } = await supabase
    .from("device_maintenance_logs")
    .insert({
      entry_id: entryId,
      checked_date: checkedDate,
      status: status || "ok",
      notes: notes || ""
    })
    .select("id")
    .single();
  if (error) throw error;

  const upRes = await supabase
    .from("device_entries")
    .update({ status: status || "ok", updated_at: new Date().toISOString() })
    .eq("id", entryId)
    .select("id")
    .single();
  if (upRes.error) throw upRes.error;

  return data.id;
}

async function listMaintenanceChecks(entryId) {
  const { data, error } = await supabase
    .from("device_maintenance_logs")
    .select("id, checked_date, status, notes, created_at")
    .eq("entry_id", entryId)
    .order("checked_date", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data || [];
}

async function deleteMaintenanceCheck(logId) {
  const { data, error } = await supabase
    .from("device_maintenance_logs")
    .delete()
    .eq("id", logId)
    .select("id");
  if (error) throw error;
  return data || [];
}

async function addEntryPhotos(entryId, cloudUrls) {
  if (!cloudUrls || !cloudUrls.length) return [];
  const rows = cloudUrls.map(function (url, i) {
    return { entry_id: entryId, cloud_url: url, sort_order: i };
  });
  const { data, error } = await supabase
    .from("device_entry_photos")
    .insert(rows)
    .select("id");
  if (error) throw error;
  return data || [];
}

async function listWorkNotes(limit = 500) {
  const { data, error } = await supabase
    .from("work_notes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function getWorkNote(id) {
  const { data, error } = await supabase
    .from("work_notes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function createWorkNote({ title, stepsJson, infoExtra }) {
  const { data, error } = await supabase
    .from("work_notes")
    .insert({
      title: title || "",
      steps_json: stepsJson || "[]",
      info_extra: infoExtra || ""
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function updateWorkNote(id, patch) {
  const { data, error } = await supabase
    .from("work_notes")
    .update(patch)
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

async function deleteWorkNote(id) {
  const { data, error } = await supabase
    .from("work_notes")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data || [];
}

// ---------- ระบบเก็บไดร์ฟเวอร์ (Drive Notes — กลุ่มระบบโน้ต) ----------
async function listDriveNotes(limit = 500) {
  const { data, error } = await supabase
    .from("drive_notes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function getDriveNote(id) {
  const { data, error } = await supabase
    .from("drive_notes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function createDriveNote({ title, stepsJson, infoExtra }) {
  const { data, error } = await supabase
    .from("drive_notes")
    .insert({
      title: title || "",
      steps_json: stepsJson || "[]",
      info_extra: infoExtra || ""
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function updateDriveNote(id, patch) {
  const { data, error } = await supabase
    .from("drive_notes")
    .update(patch)
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

async function deleteDriveNote(id) {
  const { data, error } = await supabase
    .from("drive_notes")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data || [];
}

async function listDriverCatalog(limit = 500) {
  const { data, error } = await supabase
    .from("driver_catalog")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function createDriverCatalog({ deviceType, brand, model, sourceUrl, notes }) {
  const { data, error } = await supabase
    .from("driver_catalog")
    .insert({
      device_type: deviceType || "printer",
      brand: brand || "",
      model: model || "",
      source_url: sourceUrl || "",
      notes: notes || ""
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function deleteDriverCatalog(id) {
  const { data, error } = await supabase
    .from("driver_catalog")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data || [];
}

async function listDriverBrandLinks() {
  const { data, error } = await supabase
    .from("driver_brand_links")
    .select("*")
    .order("brand");
  if (error) throw error;
  return data || [];
}

async function putDriverBrandLink(brand, supportUrl) {
  const { data, error } = await supabase
    .from("driver_brand_links")
    .upsert({ brand, support_url: supportUrl, updated_at: new Date().toISOString() }, { onConflict: "brand" })
    .select("brand, support_url")
    .single();
  if (error) throw error;
  return data;
}

// ---------- TRAVEL EXPENSE (ระบบบันทึกเบิกค่าเดินทาง — ฝั่ง ADMIN) ----------
const TRAVEL_DEFAULT_SETTINGS = {
  fuel_rate_motorcycle: "3",
  fuel_rate_car: "5",
  travel_company: "",
  travel_bank_name: "กรุงไทย",
  travel_account_name: "",
  travel_bank_account: "",
  travel_claimer_name: "",
  travel_claimer_position: "",
  travel_approver_name: "",
  travel_approver_title: "",
  travel_checker_name: "",
  travel_checker_title: "",
  travel_checker2_name: "",
  travel_checker2_title: "",
  
  travel_vehicle_columns: "moto,car",
  travel_doc_prefix: "ใบเบิก"
};

// สถานะใบเบิก: รับเฉพาะ 3 ค่านี้ ค่าอื่น (รวมถึงค่าว่างจากข้อมูลเก่า) ให้เป็น "รอดำเนินการ"
const TRAVEL_STATUSES = ["กำลังดำเนินการ", "รอดำเนินการ", "เสร็จสิ้น"];
function normalizeTravelStatus(v) {
  const s = String(v == null ? "" : v).trim();
  return TRAVEL_STATUSES.indexOf(s) >= 0 ? s : "รอดำเนินการ";
}

async function getTravelSettings() {
  const { data, error } = await supabase.from("app_settings").select("key, value");
  if (error) throw error;
  const out = { ...TRAVEL_DEFAULT_SETTINGS };
  (data || []).forEach((r) => {
    if (r && typeof r.key === "string") out[r.key] = r.value == null ? "" : String(r.value);
  });
  return out;
}

async function saveTravelSettings(patch) {
  const payload = patch && typeof patch === "object" ? patch : {};
  const out = {};
  for (const [k, v] of Object.entries(payload)) {
    if (!(k in TRAVEL_DEFAULT_SETTINGS)) continue;
    const val = v == null ? "" : String(v);
    const { data, error } = await supabase
      .from("app_settings")
      .upsert({ key: k, value: val, updated_at: new Date().toISOString() }, { onConflict: "key" })
      .select("value")
      .single();
    if (error) throw error;
    out[k] = data ? data.value : val;
  }
  return { ...(await getTravelSettings()), ...out };
}

async function listTravelClaims(limit = 500) {
  const { data, error } = await supabase
    .from("travel_claims")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function getTravelClaim(id) {
  const { data, error } = await supabase
    .from("travel_claims")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function travelClaimRow(claim) {
  const c = claim || {};
  const trips = Array.isArray(c.trips) ? c.trips : [];
  return {
    claimer_visitor_id: c.claimerVisitorId == null || c.claimerVisitorId === "" ? null : Number(c.claimerVisitorId),
    claimer_name: c.claimerName || "",
    claim_date: c.claimDate || new Date().toISOString().slice(0, 10),
    position: c.position || "",
    bank_name: c.bankName || "",
    bank_account: c.bankAccount || "",
    account_name: c.accountName || "",
    trips_json: JSON.stringify(trips),
    total_km: Number(c.totalKm) || 0,
    total_amount: Number(c.totalAmount) || 0,
    note: c.note || "",
    status: normalizeTravelStatus(c.status)
  };
}

async function createTravelClaim(claim) {
  const row = travelClaimRow(claim);
  const { data, error } = await supabase.rpc("create_travel_claim", { p_claim: row });
  if (error) throw error;
  return data;
}

async function updateTravelClaim(id, claim) {
  const row = travelClaimRow(claim);
  row.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("travel_claims")
    .update(row)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function deleteTravelClaim(id) {
  const { data, error } = await supabase.from("travel_claims").delete().eq("id", id).select("id");
  if (error) throw error;
  return data || [];
}

// ---------- บันทึกปฏิบัติงานนอกสถานที่ (Field Work) ----------
// ตาราง field_work_logs ต้องรัน supabase-fieldwork.sql ก่อน
let fieldWorkReady = null;

async function ensureFieldWorkTable() {
  if (fieldWorkReady === true) return true;
  if (!ready) return false;
  try {
    const { error } = await supabase.from("field_work_logs").select("id").limit(1);
    fieldWorkReady = !error;
    if (error) {
      console.warn("[FieldWork] ยังไม่มีตาราง field_work_logs — ระบบบันทึกปฏิบัติงานนอกสถานที่จะใช้ไม่ได้ (รัน supabase-fieldwork.sql ใน Supabase):", error.message);
    }
  } catch (err) {
    fieldWorkReady = false;
  }
  return fieldWorkReady;
}

const FIELD_WORK_TIME_FIELDS = ["depart_branch_time", "arrive_site_time", "depart_site_time", "arrive_branch_time"];

function normalizeTime(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s) return null;
  // รับทั้ง HH:MM และ HH:MM:SS
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return null;
  const hh = Math.min(23, Number(m[1]));
  const mm = Math.min(59, Number(m[2]));
  const ss = Math.min(59, Number(m[3] || 0));
  return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
}

function normalizeAttachments(v) {
  if (Array.isArray(v)) return v.filter((f) => f && f.url).map((f) => ({ name: String(f.name || "ไฟล์แนบ"), url: String(f.url) }));
  if (typeof v === "string" && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return normalizeAttachments(parsed);
    } catch (e) { /* ไม่ใช่ JSON → ถือว่าไม่มีไฟล์แนบ */ }
  }
  return [];
}

function mapFieldWork(row) {
  if (!row) return null;
  return {
    ...row,
    attachments: normalizeAttachments(row.attachments_json),
    depart_branch_time: row.depart_branch_time || null,
    arrive_site_time: row.arrive_site_time || null,
    depart_site_time: row.depart_site_time || null,
    arrive_branch_time: row.arrive_branch_time || null
  };
}

function fieldWorkRow(input) {
  const d = input || {};
  const row = {
    ticket_id: d.ticketId == null || d.ticketId === "" ? null : Number(d.ticketId),
    ticket_no: String(d.ticketNo || "").trim(),
    source_mode: d.sourceMode === "ticket" ? "ticket" : "manual",
    work_date: String(d.workDate || "").trim() || new Date().toISOString().slice(0, 10),
    work_time: normalizeTime(d.workTime) || new Date().toISOString().slice(11, 19),
    location: String(d.location || "").trim(),
    detail: String(d.detail || "").trim(),
    attachments_json: JSON.stringify(normalizeAttachments(d.attachments)),
    recorder_name: String(d.recorderName || "").trim(),
    note: String(d.note || "").trim()
  };
  FIELD_WORK_TIME_FIELDS.forEach((f) => { row[f] = normalizeTime(d[f]); });
  return row;
}

async function listFieldWorkLogs(limit = 500) {
  if (!(await ensureFieldWorkTable())) return [];
  const { data, error } = await supabase
    .from("field_work_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapFieldWork);
}

async function getFieldWorkLog(id) {
  if (!(await ensureFieldWorkTable())) return null;
  const { data, error } = await supabase
    .from("field_work_logs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return mapFieldWork(data);
}

async function createFieldWorkLog(entry) {
  if (!(await ensureFieldWorkTable())) throw new Error("ยังไม่ได้สร้างตาราง field_work_logs");
  const { data, error } = await supabase
    .from("field_work_logs")
    .insert(fieldWorkRow(entry))
    .select("*")
    .single();
  if (error) throw error;
  return mapFieldWork(data);
}

async function updateFieldWorkLog(id, entry) {
  if (!(await ensureFieldWorkTable())) throw new Error("ยังไม่ได้สร้างตาราง field_work_logs");
  const row = fieldWorkRow(entry);
  row.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("field_work_logs")
    .update(row)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapFieldWork(data);
}

async function deleteFieldWorkLog(id) {
  if (!(await ensureFieldWorkTable())) return [];
  const { data, error } = await supabase.from("field_work_logs").delete().eq("id", id).select("id");
  if (error) throw error;
  return data || [];
}

// ---------- PASSWORD NOTE (บันทึกรหัสผ่านเฉพาะ USER admin) ----------
async function listPasswordNotes({ limit = 500, includeSecret = false } = {}) {
  const { data, error } = await supabase
    .from("password_notes")
    .select(includeSecret ? "*" : "id, title, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function createPasswordNote({ title, encJson }) {
  const { data, error } = await supabase
    .from("password_notes")
    .insert({ title: title || "", enc_json: encJson || "" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function deletePasswordNote(id) {
  const { data, error } = await supabase
    .from("password_notes")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data || [];
}

// ---------- โน๊ตแจ้งซ่อม (Repair Notes) ----------
async function listRepairNotes(limit = 500) {
  const { data, error } = await supabase
    .from("repair_notes")
    .select("*, ticket:tickets(ticket_no, device, symptom, location, status, created_at)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    const { data: fallback, error: fbErr } = await supabase
      .from("repair_notes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (fbErr) throw fbErr;
    return fallback || [];
  }
  return data || [];
}

async function createRepairNote({ ticketNo, category, content }) {
  const { data, error } = await supabase
    .from("repair_notes")
    .insert({
      ticket_no: ticketNo || "",
      category: category || "",
      content: content || ""
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function updateRepairNote(id, patch) {
  const { data, error } = await supabase
    .from("repair_notes")
    .update(patch)
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

async function deleteRepairNote(id) {
  const { data, error } = await supabase
    .from("repair_notes")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data || [];
}

// ---------- ตั้งค่าสิทธิ์การเข้าใช้งานระบบ (System Users) ----------
function parsePerms(row) {
  if (!row) return null;
  try {
    row.permissions = JSON.parse(row.permissions || "[]");
  } catch (err) {
    row.permissions = [];
  }
  return row;
}

async function listSystemUsers() {
  const { data, error } = await supabase
    .from("system_users")
    .select("id, username, permissions, note, created_at, updated_at")
    .order("username", { ascending: true });
  if (error) throw error;
  return (data || []).map(parsePerms);
}

async function createSystemUser({ username, password_hash, permissions, note }) {
  const { data, error } = await supabase
    .from("system_users")
    .insert({
      username,
      password_hash,
      permissions: JSON.stringify(permissions || []),
      note: note || ""
    })
    .select("id, username, permissions, note, created_at, updated_at")
    .single();
  if (error) throw error;
  return parsePerms(data);
}

async function updateSystemUser(username, patch) {
  const { data, error } = await supabase
    .from("system_users")
    .update(patch)
    .eq("username", username)
    .select("id, username, permissions, note, created_at, updated_at")
    .single();
  if (error) throw error;
  return parsePerms(data);
}

async function deleteSystemUser(username) {
  const { data, error } = await supabase
    .from("system_users")
    .delete()
    .eq("username", username)
    .select("id");
  if (error) throw error;
  return data || [];
}

async function getSystemUserAuth(username) {
  const { data: row, error } = await supabase
    .from("system_users")
    .select("username, password_hash, permissions")
    .eq("username", username)
    .maybeSingle();
  if (error || !row) return null;
  try {
    row.permissions = JSON.parse(row.permissions || "[]");
  } catch (err) {
    row.permissions = [];
  }
  return row;
}

// ---------- ระบบตรวจสอบประกัน (Warranty Check) ----------
async function listWarrantyCheckSites() {
  const { data, error } = await supabase
    .from("warranty_check_sites")
    .select("*")
    .order("sort", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function createWarrantyCheckSite({ name, url, mode, sort }) {
  const { data, error } = await supabase
    .from("warranty_check_sites")
    .insert({
      name: name || "",
      url: url || "",
      mode: mode || "link",
      sort: sort == null ? 0 : Number(sort),
      enabled: true
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function updateWarrantyCheckSite(id, patch) {
  const { data, error } = await supabase
    .from("warranty_check_sites")
    .update(patch)
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

async function deleteWarrantyCheckSite(id) {
  const { data, error } = await supabase
    .from("warranty_check_sites")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data || [];
}

async function addWarrantyCheck({ serial, resultsJson, summary }) {
  const { data, error } = await supabase
    .from("warranty_checks")
    .insert({
      serial: serial || "",
      results_json: resultsJson || "[]",
      summary: summary || ""
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function listWarrantyChecks(limit = 100) {
  const { data, error } = await supabase
    .from("warranty_checks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// ---------- ระบบจดจำผู้ใช้งานภายนอก ----------
async function touchVisitorIps(visitorId, ip) {
  if (!visitorId || !ip) return;
  try {
    const { data: existing } = await supabase
      .from("visitor_ips")
      .select("id, visit_count")
      .eq("visitor_id", visitorId)
      .eq("ip", ip)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("visitor_ips")
        .update({ last_seen_at: new Date().toISOString(), visit_count: (existing.visit_count || 0) + 1 })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("visitor_ips")
        .insert({ visitor_id: visitorId, ip, first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), visit_count: 1 });
    }
  } catch (err) {
    console.warn("[Visitors] บันทึกประวัติ IP ไม่สำเร็จ (ต้องรัน SQL ตาราง visitor_ips):", err.message);
  }
}

// ---------- คอลัมน์บัญชีผู้ใช้ (ตรวจครั้งเดียว แล้วจำไว้) ----------
const VISITOR_BASE_COLS = "id, name, position, ip, token, device_id, ticket_count, last_seen_at, created_at";
const VISITOR_FULL_COLS = VISITOR_BASE_COLS + ", username, credentials_at, keypass_lookup, keypass_hash, keypass_enc, keypass_at";
let visitorHasCredCols = null;

async function ensureVisitorCredCols() {
  if (visitorHasCredCols === true) return true; // แคชเฉพาะสถานะ "พร้อม" เท่านั้น
  if (!ready) return false;
  try {
    const { error } = await supabase.from("external_visitors").select(VISITOR_FULL_COLS).limit(1);
    visitorHasCredCols = !error;
    if (error) {
      // ไม่แคชเหมือนเดิม ถ้าแคช false ไว้ เซิร์ฟเวอร์ที่เปิดค้างอยู่จะไม่รู้ว่าวิ่ง migration เสร็จแล้ว
      console.warn("[Visitors] ยังไม่ได้รัน supabase-migrate-keypass.sql / supabase-migrate-keypass-enc.sql — ระบบ Key Pass จะใช้ไม่ได้:", error.message);
    }
  } catch (err) {
    visitorHasCredCols = false;
  }
  return visitorHasCredCols;
}

// ---------- คอลัมน์ "ประจำสาขา" (ตรวจแยกจาก creds เพื่อไม่ให้ Key Pass พังถ้ายังไม่รัน migration) ----------
let visitorHasBranchCol = null;

async function ensureVisitorBranchCol() {
  if (visitorHasBranchCol === true) return true;
  if (!ready) return false;
  try {
    const { error } = await supabase.from("external_visitors").select("id, branch").limit(1);
    visitorHasBranchCol = !error;
    if (error) {
      console.warn("[Visitors] ยังไม่มีคอลัมน์ branch — ประจำสาขาจะยังไม่ถูกบันทึก (รัน supabase-migrate-visitor-branch.sql ใน Supabase):", error.message);
    }
  } catch (err) {
    visitorHasBranchCol = false;
  }
  return visitorHasBranchCol;
}

function pickVisitorCols(hasCreds, hasBranch) {
  return (hasCreds ? VISITOR_FULL_COLS : VISITOR_BASE_COLS) + (hasBranch ? ", branch" : "");
}

async function visitorSelectCols() {
  const hasCreds = await ensureVisitorCredCols();
  const hasBranch = await ensureVisitorBranchCol();
  return pickVisitorCols(hasCreds, hasBranch);
}

// หา visitor จาก session/cookie/เลขเครื่อง — ใช้ IP เป็นตัวสำรองเฉพาะผู้ใช้เก่าที่ยังไม่ได้ตั้งรหัสผ่าน
// matchedBy: "session" = เข้าสู่ระบบแล้ว (ไม่แตะ ip/device_id), "token"/"device", "ip" = ตัวสำรอง
async function findVisitor({ ip, token, deviceId, allowIpFallback = true, ipFallbackHours = 12 }) {
  if (!ready) return null;
  let row = null;
  let matchedBy = "";
  try {
    const hasCreds = await ensureVisitorCredCols();
    const cols = await visitorSelectCols();
    if (token) {
      const { data } = await supabase.from("external_visitors").select(cols).eq("token", token).limit(1);
      row = (data && data[0]) || null;
      if (row) matchedBy = "token";
    }
    // เลขเครื่อง: ถ้าไม่มี cookie ให้ยืนยันด้วยอุปกรณ์เดิมแทน (กันเปลี่ยนเน็ตแล้วคิดว่าเป็นคนใหม่)
    if (!row && deviceId) {
      const { data } = await supabase.from("external_visitors").select(cols).eq("device_id", deviceId).order("last_seen_at", { ascending: false }).limit(1);
      row = (data && data[0]) || null;
      if (row) matchedBy = "device";
    }
    // IP: ใช้ได้เฉพาะผู้ใช้เก่าที่ยังไม่ได้ตั้ง user/password และเพิ่งใช้งานภายในชั่วโมงที่กำหนด
    if (!row && ip && allowIpFallback) {
      const since = new Date(Date.now() - (Number(ipFallbackHours) || 12) * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from("external_visitors")
        .select(cols)
        .eq("ip", ip)
        .gt("last_seen_at", since)
        .order("last_seen_at", { ascending: false })
        .limit(1);
      if (hasCreds) {
        // กรองซ้ำอีกชั้น: แถวที่ตั้งรหัสผ่านแล้วห้ามจับคู่ด้วย IP เด็ดขาด
        row = ((data && data[0]) || null);
        if (row && row.credentials_at) row = null;
      } else {
        row = (data && data[0]) || null;
      }
      if (row) matchedBy = "ip";
    }
    if (!row) return null;

    const now = new Date().toISOString();
    const patch = { last_seen_at: now };
    // เลขเครื่อง: เติมให้ครั้งแรกเท่านั้น ไม่เขียนทับของเดิม (กันเครื่องอื่นมาแย่ง device_id)
    if (matchedBy !== "session" && deviceId && !row.device_id) patch.device_id = deviceId;
    // IP: เก็บไว้แสดงในหลังบ้านเท่านั้น (ไม่ใช่ตัวระบุตัวตน) — ห้ามเขียนทับตอนเข้าสู่ระบบผ่าน session
    if (matchedBy !== "session" && ip && row.ip !== ip) patch.ip = ip;
    await supabase.from("external_visitors").update(patch).eq("id", row.id);
    Object.assign(row, patch);
    if (ip) await touchVisitorIps(row.id, ip);
    return row;
  } catch (err) {
    console.warn("[Visitors] ค้นหาผู้ใช้ไม่สำเร็จ (ต้องรัน SQL ตาราง external_visitors):", err.message);
    return null;
  }
}

async function getVisitorById(id) {
  if (!ready || !id) return null;
  try {
    const cols = await visitorSelectCols();
    const { data } = await supabase.from("external_visitors").select(cols).eq("id", id).limit(1);
    return (data && data[0]) || null;
  } catch (err) {
    console.warn("[Visitors] โหลดผู้ใช้ไม่สำเร็จ:", err.message);
    return null;
  }
}

async function findVisitorByUsername(username) {
  if (!ready || !username) return null;
  const want = String(username).trim().toLowerCase();
  if (!want) return null;
  try {
    const cols = await visitorSelectCols();
    const { data, error } = await supabase.from("external_visitors").select(cols).limit(1000);
    if (error) throw error;
    const hit = (data || []).find((r) => String(r.username || "").trim().toLowerCase() === want);
    if (hit) return hit;
    if (!/username/.test(error ? error.message : "")) return null;
    return null;
  } catch (err) {
    console.warn("[Visitors] ค้นหาจากชื่อผู้ใช้ไม่สำเร็จ:", err.message);
    return null;
  }
}

// ตั้งบัญชีครั้งแรก (ขั้นที่ 2 ของการสมัคร) — username ต้องไม่ซ้ำ
async function setVisitorCredentials(id, { username, passwordHash, passwordEnc }) {
  if (!ready || !id) return null;
  if (!(await ensureVisitorCredCols())) {
    throw new Error("ระบบบัญชีผู้ใช้ยังไม่พร้อม: กรุณารันไฟล์ supabase-migrate-account.sql ใน Supabase");
  }
  const patch = {
    username: String(username || "").trim(),
    password_hash: passwordHash || "",
    password_enc: passwordEnc || "",
    credentials_at: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from("external_visitors")
    .update(patch)
    .eq("id", id)
    .select(VISITOR_FULL_COLS)
    .single();
  if (error) {
    if (/username|duplicate|unique|23505/i.test(String(error.message || ""))) {
      const dup = new Error("ชื่อผู้ใช้นี้ถูกใช้ไปแล้ว กรุณาตั้งชื่ออื่น");
      dup.code = "DUP_USERNAME";
      throw dup;
    }
    throw error;
  }
  return data;
}

// เปลี่ยนรหัสผ่าน (ผู้ใช้เปลี่ยนเอง หรือแอดมินรีเซ็ตให้)
async function setVisitorPassword(id, { passwordHash, passwordEnc }) {
  if (!ready || !id) return null;
  if (!(await ensureVisitorCredCols())) {
    throw new Error("ระบบบัญชีผู้ใช้ยังไม่พร้อม: กรุณารันไฟล์ supabase-migrate-account.sql ใน Supabase");
  }
  const { data, error } = await supabase
    .from("external_visitors")
    .update({ password_hash: passwordHash || "", password_enc: passwordEnc || "" })
    .eq("id", id)
    .select(VISITOR_FULL_COLS)
    .single();
  if (error) throw error;
  return data;
}

// เปลี่ยนชื่อผู้ใช้ (ต้องไม่ซ้ำ)
async function renameVisitor(id, username) {
  if (!ready || !id) return null;
  if (!(await ensureVisitorCredCols())) {
    throw new Error("ระบบบัญชีผู้ใช้ยังไม่พร้อม: กรุณารันไฟล์ supabase-migrate-account.sql ใน Supabase");
  }
  const { data, error } = await supabase
    .from("external_visitors")
    .update({ username: String(username || "").trim() })
    .eq("id", id)
    .select(VISITOR_FULL_COLS)
    .single();
  if (error) {
    if (/username|duplicate|unique|23505/i.test(String(error.message || ""))) {
      const dup = new Error("ชื่อผู้ใช้นี้ถูกใช้ไปแล้ว กรุณาตั้งชื่ออื่น");
      dup.code = "DUP_USERNAME";
      throw dup;
    }
    throw error;
  }
  return data;
}

// ดึงเฉพาะข้อมูลลับของผู้ใช้ (ไว้ตรวจรหัสผ่าน / ถอดแสดงในหน้าตั้งค่า)
async function getVisitorCredentials(id) {
  if (!ready || !id) return null;
  if (!(await ensureVisitorCredCols())) return null;
  try {
    const { data, error } = await supabase
      .from("external_visitors")
      .select("id, username, password_hash, password_enc, credentials_at")
      .eq("id", id)
      .limit(1);
    if (error) throw error;
    return (data && data[0]) || null;
  } catch (err) {
    console.warn("[Visitors] โหลดข้อมูลบัญชีไม่สำเร็จ:", err.message);
    return null;
  }
}

// ---------- Key Pass ----------
// ออก/เปลี่ยน Key Pass ให้ผู้ใช้ (คืนค่าต้นฉบับครั้งเดียวที่ฝั่งเซิร์ฟเวอร์สุ่มมาเท่านั้น)
// ถ้ายังไม่ได้รัน migration ต้อง throw ออกไป — ไม่งั้นจะแจก Key Pass ที่ใช้งานไม่ได้จริง
async function setVisitorKeypass(id, { lookup, hash, enc }) {
  if (!ready || !id) return null;
  if (!(await ensureVisitorCredCols())) {
    throw new Error("ระบบ Key Pass ยังไม่พร้อม: ต้องรัน supabase-migrate-keypass.sql และ supabase-migrate-keypass-enc.sql ใน Supabase ก่อน");
  }
  const { data, error } = await supabase
    .from("external_visitors")
    .update({ keypass_lookup: lookup || "", keypass_hash: hash || "", keypass_enc: enc || "", keypass_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name, position, keypass_at")
    .limit(1);
  if (error) throw error;
  return (data && data[0]) || null;
}

// หาผู้ใช้จาก keypass_lookup (HMAC) — ใช้ index จึง O(1) ไม่ต้องวนเทียบทีละคน
async function findVisitorByKeypassLookup(lookup) {
  const want = String(lookup || "").trim().toLowerCase();
  if (!ready || !want) return null;
  if (!(await ensureVisitorCredCols())) return null;
  try {
    const { data, error } = await supabase
      .from("external_visitors")
      .select(await visitorSelectCols())
      .eq("keypass_lookup", want)
      .limit(1);
    if (error) throw error;
    return (data && data[0]) || null;
  } catch (err) {
    console.warn("[Visitors] ค้นหาด้วย Key Pass ไม่สำเร็จ:", err.message);
    return null;
  }
}

async function createVisitor({ name, position, branch, ip, token, deviceId }) {
  if (!ready) throw new Error("ยังไม่ได้ตั้งค่า Supabase ใน .env");
  const hasBranch = await ensureVisitorBranchCol();
  const cols = await visitorSelectCols();
  const row = {
    name: name || "",
    position: position || "",
    ip: ip || "",
    token: token || "",
    device_id: deviceId || "",
    ticket_count: 0,
    last_seen_at: new Date().toISOString()
  };
  if (hasBranch) row.branch = branch || "";
  const { data, error } = await supabase
    .from("external_visitors")
    .insert(row)
    .select(cols)
    .single();
  if (error) throw error;
  if (ip) await touchVisitorIps(data.id, ip);
  return data;
}

async function listVisitors(limit = 300) {
  let cols = await ensureVisitorCredCols()
    ? "id, name, position, ip, device_id, ticket_count, last_seen_at, created_at, username, credentials_at, keypass_at"
    : VISITOR_BASE_COLS;
  if (await ensureVisitorBranchCol()) cols += ", branch";
  const { data, error } = await supabase
    .from("external_visitors")
    .select(cols)
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function updateVisitor(id, patch) {
  const cols = await visitorSelectCols();
  const { data, error } = await supabase
    .from("external_visitors")
    .update(patch)
    .eq("id", id)
    .select(cols)
    .single();
  if (error) throw error;
  return data;
}

async function removeVisitor(id) {
  const { data, error } = await supabase.from("external_visitors").delete().eq("id", id).select("id");
  if (error) throw error;
  return data || [];
}

async function listVisitorIps(visitorId) {
  const { data, error } = await supabase
    .from("visitor_ips")
    .select("*")
    .eq("visitor_id", visitorId)
    .order("last_seen_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function bumpVisitorTicket(id) {
  if (!id) return;
  try {
    const { data: v } = await supabase.from("external_visitors").select("ticket_count").eq("id", id).maybeSingle();
    await supabase
      .from("external_visitors")
      .update({ ticket_count: ((v && v.ticket_count) || 0) + 1, last_seen_at: new Date().toISOString() })
      .eq("id", id);
  } catch (err) {
    console.warn("[Visitors] อัปเดตจำนวนครั้งไม่สำเร็จ:", err.message);
  }
}

module.exports = { supabase, ready, genTicketNo, createTicket, addPhotos, updateArchive, listTickets, listInbox, acceptTicket, recordDevice, listDevices, setDeviceName, createDevice, removeDevice, genDeviceNo, listDeviceCategories, addDeviceCategory, listDeviceEntries, createDeviceEntry, updateDeviceEntry, deleteDeviceEntry, addEntryPhotos, listWorkNotes, getWorkNote, createWorkNote, updateWorkNote, deleteWorkNote, listDriveNotes, getDriveNote, createDriveNote, updateDriveNote, deleteDriveNote, listDriverCatalog, createDriverCatalog, deleteDriverCatalog, listDriverBrandLinks, putDriverBrandLink, getTravelSettings, saveTravelSettings, listTravelClaims, getTravelClaim, createTravelClaim, updateTravelClaim, deleteTravelClaim, listFieldWorkLogs, getFieldWorkLog, createFieldWorkLog, updateFieldWorkLog, deleteFieldWorkLog, listRepairNotes, createRepairNote, updateRepairNote, deleteRepairNote, listSystemUsers, createSystemUser, updateSystemUser, deleteSystemUser, getSystemUserAuth, listPasswordNotes, createPasswordNote, deletePasswordNote, listWarrantyCheckSites, createWarrantyCheckSite, updateWarrantyCheckSite, deleteWarrantyCheckSite, addWarrantyCheck, listWarrantyChecks, listDeviceMaintenance, createMaintenanceCheck, listMaintenanceChecks, deleteMaintenanceCheck, listDeviceOptions, addDeviceOption, updateDeviceOption, deleteDeviceOption, findVisitor, getVisitorById, findVisitorByUsername, setVisitorCredentials, setVisitorPassword, renameVisitor, getVisitorCredentials, setVisitorKeypass, findVisitorByKeypassLookup, createVisitor, listVisitors, updateVisitor, removeVisitor, listVisitorIps, bumpVisitorTicket, listMyTickets, getTicketOwner };