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
  if (d === "โปรแกรม" || d.includes("software") || d.includes("soft") || d === "sw") return "SW-";
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

async function createTicket({ ticketNo, device, symptom, location, reporterName, reporterPhone, reporterLineId }) {
  const { data, error } = await supabase
    .from("tickets")
    .insert({
      ticket_no: ticketNo,
      device,
      symptom,
      location,
      reporter_name: reporterName,
      reporter_phone: reporterPhone,
      reporter_line_id: reporterLineId
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
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
    "id,ticket_no,device,symptom,location,reporter_name,reporter_phone,reporter_line_id,status,approved_at,created_at,pdf_url,archive_size,archived_at,ticket_photos(id,cloud_url,sort_order)";
  const { data, error } = await supabase
    .from("tickets")
    .select(cols)
    .order("id", { ascending: false })
    .limit(limit);
  if (!error) return data;
  const { data: fallback, error: fbErr } = await supabase
    .from("tickets")
    .select("*, ticket_photos(id, cloud_url, sort_order)")
    .order("id", { ascending: false })
    .limit(limit);
  if (fbErr) throw fbErr;
  return fallback;
}

module.exports = { supabase, ready, genTicketNo, createTicket, addPhotos, updateArchive, listTickets };