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

async function createTicket({ ticketNo, device, symptom, location, reporterName, reporterPhone, reporterLineId, status, handlerName, statusDate, statusTime, source, acceptedAt, audioUrl }) {
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
    audio_url: audioUrl || ""
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

async function listInbox(limit = 100) {
  const cols =
    "id,ticket_no,device,symptom,location,reporter_name,reporter_phone,reporter_line_id,status,handler_name,status_date,status_time,source,approved_at,created_at,audio_url,ticket_photos(id,cloud_url,sort_order)";
  const { data, error } = await supabase
    .from("tickets")
    .select(cols)
    .eq("source", "external")
    .is("accepted_at", null)
    .order("id", { ascending: false })
    .limit(limit);
  if (!error) return data || [];
  // ยังไม่ได้ ran SQL เพิ่มคอลัมน์ accepted_at → ระบบ inbox ยังไม่เปิด (คืนค่าว่าง)
  if (/accepted_at/.test(error.message)) return [];
  const fb = await supabase
    .from("tickets")
    .select("*, ticket_photos(id, cloud_url, sort_order)")
    .order("id", { ascending: false })
    .limit(limit);
  if (fb.error) throw fb.error;
  return (fb.data || []).filter(function (t) { return t.source === "external" && !t.accepted_at; });
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

// หา visitor จาก cookie token ก่อน ถ้าไม่เจอค่อยหาจาก IP
async function findVisitor({ ip, token }) {
  if (!ready) return null;
  let row = null;
  try {
    if (token) {
      const { data } = await supabase.from("external_visitors").select("*").eq("token", token).maybeSingle();
      row = data;
    }
    if (!row && ip) {
      const { data } = await supabase.from("external_visitors").select("*").eq("ip", ip).order("last_seen_at", { ascending: false }).limit(1);
      row = data && data[0];
    }
    if (row && ip && row.ip !== ip) {
      // คนเดียวกันย้ายเครือข่าย → อัปเดตเป็น IP ปัจจุบัน
      await supabase.from("external_visitors").update({ ip, last_seen_at: new Date().toISOString() }).eq("id", row.id);
      row.ip = ip;
    } else if (row) {
      await supabase.from("external_visitors").update({ last_seen_at: new Date().toISOString() }).eq("id", row.id);
    }
    if (row && ip) await touchVisitorIps(row.id, ip);
    return row;
  } catch (err) {
    console.warn("[Visitors] ค้นหาผู้ใช้ไม่สำเร็จ (ต้องรัน SQL ตาราง external_visitors):", err.message);
    return null;
  }
}

async function createVisitor({ name, position, ip, token }) {
  if (!ready) throw new Error("ยังไม่ได้ตั้งค่า Supabase ใน .env");
  const { data, error } = await supabase
    .from("external_visitors")
    .insert({
      name: name || "",
      position: position || "",
      ip: ip || "",
      token: token || "",
      ticket_count: 0,
      last_seen_at: new Date().toISOString()
    })
    .select("id, name, position, ip, token, ticket_count, last_seen_at, created_at")
    .single();
  if (error) throw error;
  if (ip) await touchVisitorIps(data.id, ip);
  return data;
}

async function listVisitors(limit = 300) {
  const { data, error } = await supabase
    .from("external_visitors")
    .select("*")
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function updateVisitor(id, patch) {
  const { data, error } = await supabase
    .from("external_visitors")
    .update(patch)
    .eq("id", id)
    .select("id, name, position, ip, token, ticket_count, last_seen_at, created_at")
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

module.exports = { supabase, ready, genTicketNo, createTicket, addPhotos, updateArchive, listTickets, listInbox, acceptTicket, recordDevice, listDevices, setDeviceName, createDevice, removeDevice, genDeviceNo, listDeviceCategories, addDeviceCategory, listDeviceEntries, createDeviceEntry, updateDeviceEntry, deleteDeviceEntry, addEntryPhotos, listWorkNotes, getWorkNote, createWorkNote, updateWorkNote, deleteWorkNote, listRepairNotes, createRepairNote, updateRepairNote, deleteRepairNote, listWarrantyCheckSites, createWarrantyCheckSite, updateWarrantyCheckSite, deleteWarrantyCheckSite, addWarrantyCheck, listWarrantyChecks, listDeviceMaintenance, createMaintenanceCheck, listMaintenanceChecks, deleteMaintenanceCheck, listDeviceOptions, addDeviceOption, updateDeviceOption, deleteDeviceOption, findVisitor, createVisitor, listVisitors, updateVisitor, removeVisitor, listVisitorIps, bumpVisitorTicket };