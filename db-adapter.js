const config = require("./config");

let currentAdapter = null;
let currentMode = "supabase";

const supabaseModule = require("./supabase");

function createSupabaseAdapter() {
  return {
    mode: "supabase",
    ready: supabaseModule.ready,
    supabase: supabaseModule.supabase,
    
    async genTicketNo(device) {
      return supabaseModule.genTicketNo(device);
    },
    
    async createTicket(data) {
      return supabaseModule.createTicket(data);
    },
    
    async addPhotos(ticketId, urls) {
      return supabaseModule.addPhotos(ticketId, urls);
    },
    
    async updateArchive(ticketNo, gzipBase64, sizeBytes) {
      return supabaseModule.updateArchive(ticketNo, gzipBase64, sizeBytes);
    },
    
    async listTickets(limit = 500) {
      return supabaseModule.listTickets(limit);
    },
    
    async listInbox(limit = 100) {
      return supabaseModule.listInbox(limit);
    },
    
    async acceptTicket(ticketNo) {
      return supabaseModule.acceptTicket(ticketNo);
    },
    
    async listMyTickets(visitorId, reporterName) {
      return supabaseModule.listMyTickets(visitorId, reporterName);
    },
    
    async recordDevice(data) {
      return supabaseModule.recordDevice(data);
    },
    
    async listDevices(limit = 200) {
      return supabaseModule.listDevices(limit);
    },
    
    async setDeviceName(ip, name) {
      return supabaseModule.setDeviceName(ip, name);
    },
    
    async createDevice(data) {
      return supabaseModule.createDevice(data);
    },
    
    async removeDevice(ip) {
      return supabaseModule.removeDevice(ip);
    },

    async findVisitor(opts) {
      return supabaseModule.findVisitor(opts);
    },

    async getVisitorById(id) {
      return supabaseModule.getVisitorById(id);
    },

    async findVisitorByUsername(username) {
      return supabaseModule.findVisitorByUsername(username);
    },

    async setVisitorCredentials(id, data) {
      return supabaseModule.setVisitorCredentials(id, data);
    },

    async setVisitorPassword(id, data) {
      return supabaseModule.setVisitorPassword(id, data);
    },

    async renameVisitor(id, username) {
      return supabaseModule.renameVisitor(id, username);
    },

    async getVisitorCredentials(id) {
      return supabaseModule.getVisitorCredentials(id);
    },

    async setVisitorKeypass(id, data) {
      return supabaseModule.setVisitorKeypass(id, data);
    },

    async findVisitorByKeypassLookup(lookup) {
      return supabaseModule.findVisitorByKeypassLookup(lookup);
    },

    async getTicketOwner(ticketNo) {
      return supabaseModule.getTicketOwner(ticketNo);
    },

    async createVisitor(data) {
      return supabaseModule.createVisitor(data);
    },

    async listVisitors(limit = 300) {
      return supabaseModule.listVisitors(limit);
    },

    async updateVisitor(id, patch) {
      return supabaseModule.updateVisitor(id, patch);
    },

    async removeVisitor(id) {
      return supabaseModule.removeVisitor(id);
    },

    async listVisitorIps(visitorId) {
      return supabaseModule.listVisitorIps(visitorId);
    },

    async bumpVisitorTicket(id) {
      return supabaseModule.bumpVisitorTicket(id);
    },
    
    async genDeviceNo() {
      return supabaseModule.genDeviceNo();
    },
    
    async listDeviceCategories() {
      return supabaseModule.listDeviceCategories();
    },
    
    async addDeviceCategory(name) {
      return supabaseModule.addDeviceCategory(name);
    },
    
    async listDeviceOptions() {
      return supabaseModule.listDeviceOptions();
    },
    
    async addDeviceOption(data) {
      return supabaseModule.addDeviceOption(data);
    },
    
    async updateDeviceOption(id, patch) {
      return supabaseModule.updateDeviceOption(id, patch);
    },
    
    async deleteDeviceOption(id) {
      return supabaseModule.deleteDeviceOption(id);
    },

    async listDeviceEntries(limit = 500) {
      return supabaseModule.listDeviceEntries(limit);
    },
    
    async createDeviceEntry(data) {
      return supabaseModule.createDeviceEntry(data);
    },
    
    async updateDeviceEntry(id, patch) {
      return supabaseModule.updateDeviceEntry(id, patch);
    },
    
    async deleteDeviceEntry(id) {
      return supabaseModule.deleteDeviceEntry(id);
    },
    
    async addEntryPhotos(entryId, cloudUrls) {
      return supabaseModule.addEntryPhotos(entryId, cloudUrls);
    },
    
    async listDeviceMaintenance(limit = 1000) {
      return supabaseModule.listDeviceMaintenance(limit);
    },
    
    async createMaintenanceCheck(data) {
      return supabaseModule.createMaintenanceCheck(data);
    },
    
    async listMaintenanceChecks(entryId) {
      return supabaseModule.listMaintenanceChecks(entryId);
    },
    
    async deleteMaintenanceCheck(logId) {
      return supabaseModule.deleteMaintenanceCheck(logId);
    },
    
    async listWorkNotes(limit = 500) {
      return supabaseModule.listWorkNotes(limit);
    },
    
    async getWorkNote(id) {
      return supabaseModule.getWorkNote(id);
    },
    
    async createWorkNote(data) {
      return supabaseModule.createWorkNote(data);
    },
    
    async updateWorkNote(id, patch) {
      return supabaseModule.updateWorkNote(id, patch);
    },
    
    async deleteWorkNote(id) {
      return supabaseModule.deleteWorkNote(id);
    },

    async listDriveNotes(limit = 500) {
      return supabaseModule.listDriveNotes(limit);
    },

    async getDriveNote(id) {
      return supabaseModule.getDriveNote(id);
    },

    async createDriveNote(data) {
      return supabaseModule.createDriveNote(data);
    },

    async updateDriveNote(id, patch) {
      return supabaseModule.updateDriveNote(id, patch);
    },

    async deleteDriveNote(id) {
      return supabaseModule.deleteDriveNote(id);
    },

    async listDriverCatalog(limit = 500) {
      return supabaseModule.listDriverCatalog(limit);
    },

    async createDriverCatalog(data) {
      return supabaseModule.createDriverCatalog(data);
    },

    async deleteDriverCatalog(id) {
      return supabaseModule.deleteDriverCatalog(id);
    },

    async listDriverBrandLinks() {
      return supabaseModule.listDriverBrandLinks();
    },

    async putDriverBrandLink(brand, supportUrl) {
      return supabaseModule.putDriverBrandLink(brand, supportUrl);
    },

    async getTravelSettings() {
      return supabaseModule.getTravelSettings();
    },

    async saveTravelSettings(patch) {
      return supabaseModule.saveTravelSettings(patch);
    },

    async listTravelClaims(limit) {
      return supabaseModule.listTravelClaims(limit);
    },

    async getTravelClaim(id) {
      return supabaseModule.getTravelClaim(id);
    },

    async createTravelClaim(claim) {
      return supabaseModule.createTravelClaim(claim);
    },

    async updateTravelClaim(id, claim) {
      return supabaseModule.updateTravelClaim(id, claim);
    },

    async deleteTravelClaim(id) {
      return supabaseModule.deleteTravelClaim(id);
    },

    async listFieldWorkLogs(limit) {
      return supabaseModule.listFieldWorkLogs(limit);
    },

    async getFieldWorkLog(id) {
      return supabaseModule.getFieldWorkLog(id);
    },

    async createFieldWorkLog(entry) {
      return supabaseModule.createFieldWorkLog(entry);
    },

    async updateFieldWorkLog(id, entry) {
      return supabaseModule.updateFieldWorkLog(id, entry);
    },

    async deleteFieldWorkLog(id) {
      return supabaseModule.deleteFieldWorkLog(id);
    },
    
    async listRepairNotes(limit = 500) {
      return supabaseModule.listRepairNotes(limit);
    },
    
    async createRepairNote(data) {
      return supabaseModule.createRepairNote(data);
    },
    
    async updateRepairNote(id, patch) {
      return supabaseModule.updateRepairNote(id, patch);
    },
    
    async deleteRepairNote(id) {
      return supabaseModule.deleteRepairNote(id);
    },
    
    async listSystemUsers() {
      return supabaseModule.listSystemUsers();
    },
    
    async createSystemUser(data) {
      return supabaseModule.createSystemUser(data);
    },
    
    async updateSystemUser(username, patch) {
      return supabaseModule.updateSystemUser(username, patch);
    },
    
    async deleteSystemUser(username) {
      return supabaseModule.deleteSystemUser(username);
    },
    
    async getSystemUserAuth(username) {
      return supabaseModule.getSystemUserAuth(username);
    },

    async listPasswordNotes(opts) {
      return supabaseModule.listPasswordNotes(opts || {});
    },

    async createPasswordNote(data) {
      return supabaseModule.createPasswordNote(data);
    },

    async deletePasswordNote(id) {
      return supabaseModule.deletePasswordNote(id);
    },
    
    async listWarrantyCheckSites() {
      return supabaseModule.listWarrantyCheckSites();
    },
    
    async createWarrantyCheckSite(data) {
      return supabaseModule.createWarrantyCheckSite(data);
    },
    
    async updateWarrantyCheckSite(id, patch) {
      return supabaseModule.updateWarrantyCheckSite(id, patch);
    },
    
    async deleteWarrantyCheckSite(id) {
      return supabaseModule.deleteWarrantyCheckSite(id);
    },
    
    async addWarrantyCheck(data) {
      return supabaseModule.addWarrantyCheck(data);
    },
    
    async listWarrantyChecks(limit = 100) {
      return supabaseModule.listWarrantyChecks(limit);
    },
    
    async testConnection() {
      if (!supabaseModule.ready) {
        return { ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ใน .env" };
      }
      try {
        const { error } = await supabaseModule.supabase.from("tickets").select("id").limit(1);
        if (error) throw error;
        return { ok: true, message: "เชื่อมต่อ Supabase สำเร็จ" };
      } catch (e) {
        return { ok: false, message: "เชื่อมต่อ Supabase ล้มเหลว: " + e.message };
      }
    }
  };
}

let pgPool = null;
let pgConfig = null;

function createPostgresAdapter() {
  const { Pool } = require("pg");
  
  if (!pgConfig) {
    pgConfig = {
      host: config.PG_HOST || "",
      port: config.PG_PORT || 5432,
      database: config.PG_DATABASE || "",
      user: config.PG_USER || "",
      password: config.PG_PASSWORD || "",
      ssl: config.PG_SSL === "true" ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
  }
  
  if (!pgPool) {
    pgPool = new Pool(pgConfig);
    
    pgPool.on("error", (err) => {
      console.error("[PostgreSQL] Unexpected pool error:", err);
    });
  }
  
  const query = async (text, params) => {
    const client = await pgPool.connect();
    try {
      return await client.query(text, params);
    } finally {
      client.release();
    }
  };

  // รันหลายคำสั่งภายใน transaction เดียวกัน (ใช้กับการออกเลขที่เอกสารเพื่อกันเลขชนกัน)
  const queryTx = async (fn) => {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn({
        query: (text, params) => client.query(text, params),
        lock: (key) => client.query("SELECT pg_advisory_xact_lock($1)", [key])
      });
      await client.query("COMMIT");
      return out;
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch (_) { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  };

  // เตรียมคอลัมน์บัญชีผู้ใช้ให้ PostgreSQL ตรงกับ Supabase (รันครั้งเดียวต่อ process)
  let visitorCredColsReady = false;
  const ensureVisitorCredCols = async () => {
    if (visitorCredColsReady) return true;
    try {
      await query(`
        ALTER TABLE external_visitors ADD COLUMN IF NOT EXISTS username text DEFAULT '';
        ALTER TABLE external_visitors ADD COLUMN IF NOT EXISTS password_hash text DEFAULT '';
        ALTER TABLE external_visitors ADD COLUMN IF NOT EXISTS password_enc text DEFAULT '';
        ALTER TABLE external_visitors ADD COLUMN IF NOT EXISTS credentials_at timestamptz;
        ALTER TABLE external_visitors ADD COLUMN IF NOT EXISTS keypass_lookup text DEFAULT '';
        ALTER TABLE external_visitors ADD COLUMN IF NOT EXISTS keypass_hash text DEFAULT '';
        ALTER TABLE external_visitors ADD COLUMN IF NOT EXISTS keypass_enc text DEFAULT '';
        ALTER TABLE external_visitors ADD COLUMN IF NOT EXISTS keypass_at timestamptz;
        ALTER TABLE external_visitors ADD COLUMN IF NOT EXISTS branch text DEFAULT '';
        CREATE UNIQUE INDEX IF NOT EXISTS external_visitors_username_lower_idx
          ON external_visitors (lower(username)) WHERE username IS NOT NULL AND username <> '';
        CREATE UNIQUE INDEX IF NOT EXISTS external_visitors_keypass_lookup_key
          ON external_visitors (keypass_lookup) WHERE keypass_lookup <> '';
      `);
      visitorCredColsReady = true;
      return true;
    } catch (err) {
      console.error("[PostgreSQL] เตรียมคอลัมน์บัญชีผู้ใช้ไม่สำเร็จ:", err.message);
      return false;
    }
  };

  // เตรียมตารางระบบบันทึกเบิกค่าเดินทางให้ PostgreSQL ตรงกับ Supabase (รันครั้งเดียวต่อ process)
  let travelTablesReady = false;
  const ensureTravelTables = async () => {
    if (travelTablesReady) return true;
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key text PRIMARY KEY,
          value text NOT NULL DEFAULT '',
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS travel_claims (
          id serial PRIMARY KEY,
          doc_no text UNIQUE,
          claimer_visitor_id integer REFERENCES external_visitors(id) ON DELETE SET NULL,
          claimer_name text NOT NULL DEFAULT '',
          claim_date date NOT NULL DEFAULT CURRENT_DATE,
          position text NOT NULL DEFAULT '',
          bank_name text NOT NULL DEFAULT '',
          bank_account text NOT NULL DEFAULT '',
          account_name text NOT NULL DEFAULT '',
          trips_json jsonb NOT NULL DEFAULT '[]'::jsonb,
          total_km numeric(12,2) NOT NULL DEFAULT 0,
          total_amount numeric(12,2) NOT NULL DEFAULT 0,
          note text NOT NULL DEFAULT '',
          status text NOT NULL DEFAULT 'รอดำเนินการ',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        -- เพิ่มคอลัมน์สถานะให้ตารางที่มีอยู่ก่อนแล้ว (ตารางเก่าไม่มีคอลัมน์นี้)
        ALTER TABLE travel_claims ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'รอดำเนินการ';
        CREATE INDEX IF NOT EXISTS travel_claims_created_at_idx ON travel_claims (created_at DESC);
        CREATE INDEX IF NOT EXISTS travel_claims_claim_date_idx ON travel_claims (claim_date DESC);
        INSERT INTO app_settings (key, value) VALUES
          ('fuel_rate_motorcycle','3'),
          ('fuel_rate_car','5'),
          ('travel_bank_name','กรุงไทย'),
          ('travel_doc_prefix','ใบเบิก')
        ON CONFLICT (key) DO NOTHING;
      `);
      travelTablesReady = true;
      return true;
    } catch (err) {
      console.error("[PostgreSQL] เตรียมตารางเบิกค่าเดินทางไม่สำเร็จ:", err.message);
      return false;
    }
  };

  // ---------- ระบบเก็บไดร์ฟเวอร์ (Drive Notes) ----------
  let driveNotesTablesReady = false;
  const ensureDriveNotesTable = async () => {
    if (driveNotesTablesReady) return true;
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS drive_notes (
          id bigserial PRIMARY KEY,
          title text NOT NULL DEFAULT '',
          steps_json text NOT NULL DEFAULT '[]',
          info_extra text NOT NULL DEFAULT '',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS drive_notes_created_idx ON drive_notes (created_at DESC);
      `);
      driveNotesTablesReady = true;
      return true;
    } catch (err) {
      console.error("[PostgreSQL] เตรียมตารางระบบเก็บไดร์ฟเวอร์ไม่สำเร็จ:", err.message);
      return false;
    }
  };

  // ---------- ดาวน์โหลดไดร์ฟเวอร์ (Driver Catalog + Brand Links) ----------
  let driverTablesReady = false;
  const ensureDriverTables = async () => {
    if (driverTablesReady) return true;
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS driver_catalog (
          id bigserial PRIMARY KEY,
          device_type text NOT NULL DEFAULT 'printer',
          brand text NOT NULL DEFAULT '',
          model text NOT NULL DEFAULT '',
          source_url text NOT NULL DEFAULT '',
          notes text NOT NULL DEFAULT '',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS driver_catalog_created_idx ON driver_catalog (created_at DESC);

        CREATE TABLE IF NOT EXISTS driver_brand_links (
          brand text PRIMARY KEY,
          support_url text NOT NULL DEFAULT '',
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        INSERT INTO driver_brand_links (brand, support_url) VALUES
          ('epson',   'https://www.epson.com/Support'),
          ('canon',   'https://www.canon.com/support'),
          ('hp',      'https://support.hp.com'),
          ('brother', 'https://support.brother.com')
        ON CONFLICT (brand) DO UPDATE SET support_url = EXCLUDED.support_url, updated_at = now();
      `);
      driverTablesReady = true;
      return true;
    } catch (err) {
      console.error("[PostgreSQL] เตรียมตารางไดร์ฟเวอร์ไม่สำเร็จ:", err.message);
      return false;
    }
  };

  // ---------- บันทึกปฏิบัติงานนอกสถานที่ (Field Work) ----------
  let fieldWorkTablesReady = false;
  const FIELD_WORK_TIME_COLS = ["depart_branch_time", "arrive_site_time", "depart_site_time", "arrive_branch_time"];

  const normalizeFieldWorkTime = (v) => {
    const s = String(v == null ? "" : v).trim();
    if (!s) return null;
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
    if (!m) return null;
    const hh = Math.min(23, Number(m[1]));
    const mm = Math.min(59, Number(m[2]));
    const ss = Math.min(59, Number(m[3] || 0));
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  };

  const normalizeFieldWorkAttachments = (v) => {
    let list = v;
    if (typeof v === "string") {
      try { list = JSON.parse(v); } catch (e) { list = []; }
    }
    if (!Array.isArray(list)) return [];
    return list
      .filter((f) => f && f.url)
      .map((f) => ({ name: String(f.name || "ไฟล์แนบ"), url: String(f.url) }));
  };

  const mapFieldWorkRow = (row) => {
    if (!row) return null;
    return {
      ...row,
      attachments: normalizeFieldWorkAttachments(row.attachments_json),
      depart_branch_time: row.depart_branch_time || null,
      arrive_site_time: row.arrive_site_time || null,
      depart_site_time: row.depart_site_time || null,
      arrive_branch_time: row.arrive_branch_time || null
    };
  };

  // ค่าสำหรับ INSERT/UPDATE เรียงตามลำดับคอลัมน์ใน createFieldWorkLog / updateFieldWorkLog
  const fieldWorkValues = (input) => {
    const d = input || {};
    return [
      d.ticketId == null || d.ticketId === "" ? null : Number(d.ticketId),
      String(d.ticketNo || "").trim(),
      d.sourceMode === "ticket" ? "ticket" : "manual",
      String(d.workDate || "").trim() || new Date().toISOString().slice(0, 10),
      normalizeFieldWorkTime(d.workTime) || new Date().toISOString().slice(11, 19),
      String(d.location || "").trim(),
      String(d.detail || "").trim(),
      normalizeFieldWorkTime(d.depart_branch_time),
      normalizeFieldWorkTime(d.arrive_site_time),
      normalizeFieldWorkTime(d.depart_site_time),
      normalizeFieldWorkTime(d.arrive_branch_time),
      JSON.stringify(normalizeFieldWorkAttachments(d.attachments)),
      String(d.recorderName || "").trim(),
      String(d.note || "").trim()
    ];
  };

  const ensureFieldWorkTables = async () => {
    if (fieldWorkTablesReady) return true;
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS field_work_logs (
          id serial PRIMARY KEY,
          ticket_id integer REFERENCES tickets(id) ON DELETE SET NULL,
          ticket_no text NOT NULL DEFAULT '',
          source_mode text NOT NULL DEFAULT 'manual',
          work_date date NOT NULL DEFAULT CURRENT_DATE,
          work_time time NOT NULL DEFAULT CURRENT_TIME,
          location text NOT NULL DEFAULT '',
          detail text NOT NULL DEFAULT '',
          depart_branch_time time,
          arrive_site_time time,
          depart_site_time time,
          arrive_branch_time time,
          attachments_json jsonb NOT NULL DEFAULT '[]'::jsonb,
          recorder_name text NOT NULL DEFAULT '',
          recorder_id integer REFERENCES external_visitors(id) ON DELETE SET NULL,
          note text NOT NULL DEFAULT '',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS field_work_logs_created_at_idx ON field_work_logs (created_at DESC);
        CREATE INDEX IF NOT EXISTS field_work_logs_work_date_idx  ON field_work_logs (work_date DESC);
        CREATE INDEX IF NOT EXISTS field_work_logs_ticket_idx     ON field_work_logs (ticket_no);
      `);
      fieldWorkTablesReady = true;
      return true;
    } catch (err) {
      console.error("[PostgreSQL] เตรียมตารางบันทึกปฏิบัติงานนอกสถานที่ไม่สำเร็จ:", err.message);
      return false;
    }
  };

  const TRAVEL_DOC_LOCK_KEY = 784421;
  const TRAVEL_DOC_PREFIX = "ใบเบิก";  // รูปแบบเลขที่เอกสาร: "ใบเบิก-1", "ใบเบิก-2", ...
  // นับต่อจากเลขเดิมที่มีอยู่ โดยลอกเฉพาะตัวเลขท้าย (รองรับทั้งรูปแบบใหม่
  // และข้อมูลเก่าที่เคยเป็น "TRV-000001")
  const nextTravelNo = async (tx) => {
    const r = await (tx ? tx.query : query)(
      `SELECT COALESCE(MAX((regexp_replace(doc_no, '\\D', '', 'g'))::bigint), 0) + 1 AS n
         FROM travel_claims
        WHERE doc_no IS NOT NULL AND doc_no ~ '^\\D+\\d+$'`
    );
    const n = Number(r.rows[0]?.n || 1);
    return TRAVEL_DOC_PREFIX + "-" + String(n);
  };

  // สถานะใบเบิก: รับเฉพาะ 3 ค่านี้ ค่าอื่น (รวมถึงค่าว่างจากข้อมูลเก่า) ให้เป็น "รอดำเนินการ"
  const TRAVEL_STATUSES = ["กำลังดำเนินการ", "รอดำเนินการ", "เสร็จสิ้น"];
  const normalizeTravelStatus = (v) => {
    const s = String(v == null ? "" : v).trim();
    return TRAVEL_STATUSES.indexOf(s) >= 0 ? s : "รอดำเนินการ";
  };

  const travelRow = (claim) => {
    const c = claim || {};
    const trips = Array.isArray(c.trips) ? c.trips : [];
    return [
      c.claimerVisitorId == null || c.claimerVisitorId === "" ? null : Number(c.claimerVisitorId),
      c.claimerName || "",
      c.claimDate || new Date().toISOString().slice(0, 10),
      c.position || "",
      c.bankName || "",
      c.bankAccount || "",
      c.accountName || "",
      JSON.stringify(trips),
      Number(c.totalKm) || 0,
      Number(c.totalAmount) || 0,
      c.note || "",
      normalizeTravelStatus(c.status)
    ];
  };

  const mapTicket = (row) => ({
    id: row.id,
    ticket_no: row.ticket_no,
    device: row.device,
    symptom: row.symptom,
    location: row.location,
    reporter_name: row.reporter_name,
    reporter_phone: row.reporter_phone,
    reporter_line_id: row.reporter_line_id,
    status: row.status,
    handler_name: row.handler_name,
    status_date: row.status_date,
    status_time: row.status_time || "",
    source: row.source,
    approved_at: row.approved_at,
    accepted_at: row.accepted_at,
    created_at: row.created_at,
    pdf_url: row.pdf_url,
    archive_size: row.archive_size,
    archived_at: row.archived_at,
    audio_url: row.audio_url || "",
  });
  
  const mapDevice = (row) => ({
    id: row.id,
    ip: row.ip,
    name: row.name,
    last_seen_at: row.last_seen_at,
    last_ticket_no: row.last_ticket_no,
    ticket_count: row.ticket_count,
    created_at: row.created_at,
  });
  
  return {
    mode: "postgres",
    ready: !!(pgConfig.host && pgConfig.database && pgConfig.user),
    pool: pgPool,
    
    async genTicketNo(device) {
      const prefix = devicePrefix(device);
      // Try function first (may not exist in all PostgreSQL setups)
      try {
        const result = await query(
          `SELECT next_ticket_no($1) as ticket_no`,
          [prefix]
        );
        if (result.rows[0]?.ticket_no) return result.rows[0].ticket_no;
      } catch (e) {
        // Function doesn't exist, use fallback
      }
      
      // Fallback: query latest ticket number directly
      const fallback = await query(
        `SELECT ticket_no FROM tickets WHERE ticket_no LIKE $1 ORDER BY id DESC LIMIT 1`,
        [prefix + "%"]
      );
      const lastDigits = (no) => {
        const m = /(\d+)\s*$/.exec(no || "");
        return m ? parseInt(m[1], 10) : 0;
      };
      const row = fallback.rows[0];
      const seq = row ? lastDigits(row.ticket_no) + 1 : 1;
      return prefix + String(seq).padStart(3, "0");
    },
    
    async createTicket({ ticketNo, device, symptom, location, reporterName, reporterPhone, reporterLineId, status, handlerName, statusDate, statusTime, source, acceptedAt, audioUrl }) {
      const acceptedAtVal = acceptedAt || null;
      const audioUrlVal = audioUrl || "";
      const tryInsert = () =>
        query(
          `INSERT INTO tickets (ticket_no, device, symptom, location, reporter_name, reporter_phone, reporter_line_id, status, handler_name, status_date, status_time, source, approved_at, accepted_at, audio_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           RETURNING id`,
          [ticketNo, device, symptom, location, reporterName, reporterPhone, reporterLineId, status || "new", handlerName || "", statusDate || null, statusTime || "", source || "external", status === "working" ? new Date() : null, acceptedAtVal, audioUrlVal]
        );
      try {
        const result = await tryInsert();
        return result.rows[0].id;
      } catch (e) {
        // ยังไม่ได้ ran SQL เพิ่มคอลัมน์ accepted_at / audio_url
        if (/accepted_at/.test(e.message)) {
          if (source === "external") {
            // ใบแจ้งจากภายนอกต้องเข้ากล่องข้อความก่อนเสมอ — ห้าม bypass
            throw new Error("ระบบกล่องข้อความยังไม่พร้อม: ต้องรัน SQL เพิ่มคอลัมน์ accepted_at");
          }
          return this.insertWithoutColumns({ ticketNo, device, symptom, location, reporterName, reporterPhone, reporterLineId, status, handlerName, statusDate, statusTime, source, audioUrlVal }, ["accepted_at", "audio_url"]);
        }
        if (/status_time/.test(e.message)) {
          const retry = await query(
            `INSERT INTO tickets (ticket_no, device, symptom, location, reporter_name, reporter_phone, reporter_line_id, status, handler_name, status_date, source, approved_at, accepted_at, audio_url)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             RETURNING id`,
            [ticketNo, device, symptom, location, reporterName, reporterPhone, reporterLineId, status || "new", handlerName || "", statusDate || null, source || "external", status === "working" ? new Date() : null, acceptedAtVal, audioUrlVal]
          );
          return retry.rows[0].id;
        }
        if (/audio_url/.test(e.message)) {
          const retry = await query(
            `INSERT INTO tickets (ticket_no, device, symptom, location, reporter_name, reporter_phone, reporter_line_id, status, handler_name, status_date, source, approved_at, accepted_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             RETURNING id`,
            [ticketNo, device, symptom, location, reporterName, reporterPhone, reporterLineId, status || "new", handlerName || "", statusDate || null, source || "external", status === "working" ? new Date() : null, acceptedAtVal]
          );
          return retry.rows[0].id;
        }
        throw e;
      }
    },
    
    async insertWithoutColumns({ ticketNo, device, symptom, location, reporterName, reporterPhone, reporterLineId, status, handlerName, statusDate, statusTime, source, audioUrlVal }, skip) {
      const cols = [], vals = [], params = [];
      const push = (col, val) => { cols.push(col); vals.push("$" + (params.length + 1)); params.push(val); };
      if (!skip.includes("status_time")) push("status_time", statusTime || "");
      if (!skip.includes("accepted_at")) push("accepted_at", null);
      if (!skip.includes("audio_url")) push("audio_url", audioUrlVal);
      if (!skip.includes("approved_at")) push("approved_at", status === "working" ? new Date() : null);
      push("ticket_no", ticketNo);
      push("device", device);
      push("symptom", symptom);
      push("location", location);
      push("reporter_name", reporterName);
      push("reporter_phone", reporterPhone);
      push("reporter_line_id", reporterLineId);
      push("status", status || "new");
      push("handler_name", handlerName || "");
      push("status_date", statusDate || null);
      push("source", source || "external");
      const result = await query(
        `INSERT INTO tickets (${cols.join(", ")}) VALUES (${vals.join(", ")}) RETURNING id`,
        params
      );
      return result.rows[0].id;
    },
    
    async addPhotos(ticketId, urls) {
      if (!urls.length) return;
      const values = urls.map((u, i) => `(${ticketId}, $${i * 2 + 1}, ${i + 1})`).join(",");
      const params = urls.flatMap((u) => [u]);
      await query(`INSERT INTO ticket_photos (ticket_id, cloud_url, sort_order) VALUES ${values}`, params);
    },
    
    async updateArchive(ticketNo, gzipBase64, sizeBytes) {
      await query(
        `UPDATE tickets SET archive_base64 = $1, archive_size = $2, archived_at = $3 WHERE ticket_no = $4`,
        [gzipBase64, sizeBytes, new Date(), ticketNo]
      );
    },
    
    async listTickets(limit = 500) {
      const result = await query(
        `SELECT t.*, 
          json_agg(json_build_object('id', tp.id, 'cloud_url', tp.cloud_url, 'sort_order', tp.sort_order) ORDER BY tp.sort_order) FILTER (WHERE tp.id IS NOT NULL) as ticket_photos
         FROM tickets t
         LEFT JOIN ticket_photos tp ON tp.ticket_id = t.id
         WHERE t.accepted_at IS NOT NULL
         GROUP BY t.id
         ORDER BY t.id DESC
         LIMIT $1`,
        [limit]
      );
      return result.rows.map(mapTicket);
    },
    
    async listInbox(limit = 100) {
      const result = await query(
        `SELECT t.*, 
          json_agg(json_build_object('id', tp.id, 'cloud_url', tp.cloud_url, 'sort_order', tp.sort_order) ORDER BY tp.sort_order) FILTER (WHERE tp.id IS NOT NULL) as ticket_photos
         FROM tickets t
         LEFT JOIN ticket_photos tp ON tp.ticket_id = t.id
         WHERE t.source = 'external' AND t.accepted_at IS NULL
         GROUP BY t.id
         ORDER BY t.id DESC
         LIMIT $1`,
        [limit]
      );
      const rows = result.rows;
      const ids = [];
      rows.forEach(function (r) {
        if (r.visitor_id != null && ids.indexOf(r.visitor_id) === -1) ids.push(r.visitor_id);
      });
      const vmap = {};
      if (ids.length) {
        try {
          const vr = await query(
            `SELECT id, name, position, branch FROM external_visitors WHERE id = ANY($1)`,
            [ids]
          );
          vr.rows.forEach(function (v) { vmap[v.id] = v; });
        } catch (e) {
          // ยังไม่ได้เพิ่มคอลัมน์ branch → ดึงเท่าที่มี (ประจำสาขาจะว่าง)
          try {
            const vr2 = await query(
              `SELECT id, name, position FROM external_visitors WHERE id = ANY($1)`,
              [ids]
            );
            vr2.rows.forEach(function (v) { vmap[v.id] = v; });
          } catch (e2) {}
        }
      }
      return rows.map(function (r) {
        const t = mapTicket(r);
        t.ticket_photos = r.ticket_photos || [];
        if (r.visitor_id != null && vmap[r.visitor_id]) t.visitor = vmap[r.visitor_id];
        return t;
      });
    },
    
    async acceptTicket(ticketNo) {
      const result = await query(
        `UPDATE tickets SET accepted_at = $1
         WHERE ticket_no = $2 AND accepted_at IS NULL
         RETURNING ticket_no`,
        [new Date(), ticketNo]
      );
      return result.rows[0] || null;
    },
    
    async listMyTickets(visitorId, reporterName) {
      const base = `SELECT id, ticket_no, device, symptom, location, reporter_name, status, handler_name, status_date, status_time, source, approved_at, accepted_at, created_at, pdf_url, audio_url FROM tickets`;
      if (visitorId) {
        try {
          const result = await query(
            `${base} WHERE visitor_id = $1 ORDER BY id DESC LIMIT 200`,
            [visitorId]
          );
          return result.rows.map(mapTicket);
        } catch (e) {
          if (!/visitor_id/.test(e.message)) throw e;
        }
      }
      if (reporterName) {
        const result = await query(
          `${base} WHERE reporter_name = $1 ORDER BY id DESC LIMIT 200`,
          [reporterName]
        );
        return result.rows.map(mapTicket);
      }
      return [];
    },
    
    async recordDevice({ ip, ticketNo }) {
      if (!ip) return;
      await query(
        `INSERT INTO user_devices (ip, name, last_seen_at, last_ticket_no, ticket_count)
         VALUES ($1, '', $2, $3, 1)
         ON CONFLICT (ip) DO UPDATE SET
           last_seen_at = $2,
           last_ticket_no = $3,
           ticket_count = user_devices.ticket_count + 1`,
        [ip, new Date(), ticketNo]
      );
    },
    
    async listDevices(limit = 200) {
      const result = await query(
        `SELECT * FROM user_devices ORDER BY last_seen_at DESC LIMIT $1`,
        [limit]
      );
      return result.rows.map(mapDevice);
    },
    
    async setDeviceName(ip, name) {
      const result = await query(
        `UPDATE user_devices SET name = $1 WHERE ip = $2 RETURNING id`,
        [name, ip]
      );
      return result.rows[0];
    },
    
    async createDevice({ ip, name }) {
      if (!ip) throw new Error("IP is required");
      const existing = await query(`SELECT * FROM user_devices WHERE ip = $1`, [ip]);
      if (existing.rows[0]) {
        const result = await query(
          `UPDATE user_devices SET name = $1 WHERE ip = $2 RETURNING ip, name`,
          [name || "", ip]
        );
        return result.rows[0];
      } else {
        const result = await query(
          `INSERT INTO user_devices (ip, name, last_seen_at, last_ticket_no, ticket_count)
           VALUES ($1, $2, $3, '', 0) RETURNING ip, name`,
          [ip, name || "", new Date()]
        );
        return result.rows[0];
      }
    },
    
    async removeDevice(ip) {
      const result = await query(`DELETE FROM user_devices WHERE ip = $1 RETURNING id`, [ip]);
      return result.rows;
    },

    async findVisitor({ ip, token, deviceId, allowIpFallback = true, ipFallbackHours = 12 }) {
      if (!(await ensureVisitorCredCols())) {
        // ยังไม่มีคอลัมน์บัญชีผู้ใช้: ห้ามใช้ IP fallback เด็ดขาด
        allowIpFallback = false;
      }
      let row = null;
      let matchedBy = "";
      if (token) {
        const r = await query(`SELECT * FROM external_visitors WHERE token = $1 LIMIT 1`, [token]);
        row = r.rows[0] || null;
        if (row) matchedBy = "token";
      }
      // เลขเครื่อง: ถ้าไม่มี cookie ให้ยืนยันด้วยอุปกรณ์เดิมแทน (กันเปลี่ยนเน็ตแล้วคิดว่าเป็นคนใหม่)
      if (!row && deviceId) {
        const r = await query(`SELECT * FROM external_visitors WHERE device_id = $1 ORDER BY last_seen_at DESC LIMIT 1`, [deviceId]);
        row = r.rows[0] || null;
        if (row) matchedBy = "device";
      }
      // IP: ใช้ได้เฉพาะผู้ใช้เก่าที่ยังไม่ได้ตั้ง user/password และเพิ่งใช้งานภายในชั่วโมงที่กำหนด
      if (!row && ip && allowIpFallback) {
        const r = await query(
          `SELECT * FROM external_visitors
            WHERE ip = $1
              AND credentials_at IS NULL
              AND last_seen_at > now() - ($2 || ' hours')::interval
            ORDER BY last_seen_at DESC LIMIT 1`,
          [ip, String(Number(ipFallbackHours) || 12)]
        );
        row = r.rows[0] || null;
        if (row) matchedBy = "ip";
      }
      if (!row) return null;

      // เลขเครื่อง: เติมให้ครั้งแรกเท่านั้น ไม่เขียนทับของเดิม
      if (matchedBy !== "session" && deviceId && !row.device_id) {
        await query(`UPDATE external_visitors SET device_id = $1 WHERE id = $2`, [deviceId, row.id]);
        row.device_id = deviceId;
      }
      // IP: เก็บไว้แสดงในหลังบ้านเท่านั้น — ห้ามเขียนทับตอนเข้าสู่ระบบผ่าน session
      if (matchedBy !== "session" && ip && row.ip !== ip) {
        await query(`UPDATE external_visitors SET ip = $1, last_seen_at = now() WHERE id = $2`, [ip, row.id]);
        row.ip = ip;
      } else {
        await query(`UPDATE external_visitors SET last_seen_at = now() WHERE id = $1`, [row.id]);
      }
      if (ip) await this._touchVisitorIps(row.id, ip);
      return row;
    },

    async _touchVisitorIps(visitorId, ip) {
      if (!visitorId || !ip) return;
      await query(
        `INSERT INTO visitor_ips (visitor_id, ip, first_seen_at, last_seen_at, visit_count)
         VALUES ($1, $2, now(), now(), 1)
         ON CONFLICT (visitor_id, ip)
         DO UPDATE SET last_seen_at = now(), visit_count = visitor_ips.visit_count + 1`,
        [visitorId, ip]
      );
    },

    async createVisitor({ name, position, branch, ip, token, deviceId }) {
      await ensureVisitorCredCols();
      const result = await query(
        `INSERT INTO external_visitors (name, position, branch, ip, token, device_id, ticket_count, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, 0, now())
         RETURNING *`,
        [name || "", position || "", branch || "", ip || "", token || "", deviceId || ""]
      );
      const row = result.rows[0];
      if (ip) await this._touchVisitorIps(row.id, ip);
      return row;
    },

    async getVisitorById(id) {
      if (!id) return null;
      const result = await query(`SELECT * FROM external_visitors WHERE id = $1 LIMIT 1`, [id]);
      return result.rows[0] || null;
    },

    async findVisitorByUsername(username) {
      const want = String(username || "").trim().toLowerCase();
      if (!want) return null;
      if (!(await ensureVisitorCredCols())) return null;
      const result = await query(
        `SELECT * FROM external_visitors WHERE lower(username) = $1 LIMIT 1`,
        [want]
      );
      return result.rows[0] || null;
    },

    async setVisitorCredentials(id, { username, passwordHash, passwordEnc }) {
      if (!id) return null;
      if (!(await ensureVisitorCredCols())) return null;
      try {
        const result = await query(
          `UPDATE external_visitors
             SET username = $1, password_hash = $2, password_enc = $3, credentials_at = now()
           WHERE id = $4
           RETURNING *`,
          [String(username || "").trim(), passwordHash || "", passwordEnc || "", id]
        );
        return result.rows[0] || null;
      } catch (err) {
        if (/username|duplicate|unique|23505/i.test(String(err.message || ""))) {
          const dup = new Error("ชื่อผู้ใช้นี้ถูกใช้ไปแล้ว กรุณาตั้งชื่ออื่น");
          dup.code = "DUP_USERNAME";
          throw dup;
        }
        throw err;
      }
    },

    async setVisitorPassword(id, { passwordHash, passwordEnc }) {
      if (!id) return null;
      if (!(await ensureVisitorCredCols())) return null;
      const result = await query(
        `UPDATE external_visitors SET password_hash = $1, password_enc = $2 WHERE id = $3 RETURNING *`,
        [passwordHash || "", passwordEnc || "", id]
      );
      return result.rows[0] || null;
    },

    async renameVisitor(id, username) {
      if (!id) return null;
      if (!(await ensureVisitorCredCols())) return null;
      try {
        const result = await query(
          `UPDATE external_visitors SET username = $1 WHERE id = $2 RETURNING *`,
          [String(username || "").trim(), id]
        );
        return result.rows[0] || null;
      } catch (err) {
        if (/username|duplicate|unique|23505/i.test(String(err.message || ""))) {
          const dup = new Error("ชื่อผู้ใช้นี้ถูกใช้ไปแล้ว กรุณาตั้งชื่ออื่น");
          dup.code = "DUP_USERNAME";
          throw dup;
        }
        throw err;
      }
    },

    async getVisitorCredentials(id) {
      if (!id) return null;
      if (!(await ensureVisitorCredCols())) return null;
      const result = await query(
        `SELECT id, username, password_hash, password_enc, credentials_at
           FROM external_visitors WHERE id = $1 LIMIT 1`,
        [id]
      );
      return result.rows[0] || null;
    },

    async setVisitorKeypass(id, { lookup, hash, enc }) {
      if (!id) return null;
      if (!(await ensureVisitorCredCols())) return null;
      const result = await query(
        `UPDATE external_visitors
            SET keypass_lookup = $1, keypass_hash = $2, keypass_enc = $3, keypass_at = now()
          WHERE id = $4
          RETURNING id, name, position, keypass_at`,
        [String(lookup || "").trim().toLowerCase(), hash || "", enc || "", id]
      );
      return result.rows[0] || null;
    },

    async findVisitorByKeypassLookup(lookup) {
      const want = String(lookup || "").trim().toLowerCase();
      if (!want) return null;
      if (!(await ensureVisitorCredCols())) return null;
      const result = await query(
        `SELECT * FROM external_visitors WHERE keypass_lookup = $1 LIMIT 1`,
        [want]
      );
      return result.rows[0] || null;
    },

    async getTicketOwner(ticketNo) {
      if (!ticketNo) return null;
      const result = await query(
        `SELECT id, ticket_no, visitor_id, reporter_name FROM tickets WHERE ticket_no = $1 LIMIT 1`,
        [ticketNo]
      );
      return result.rows[0] || null;
    },

    async listVisitors(limit = 300) {
      if (!(await ensureVisitorCredCols())) {
        const plain = await query(
          `SELECT id, name, position, ip, device_id, ticket_count, last_seen_at, created_at
             FROM external_visitors ORDER BY last_seen_at DESC LIMIT $1`,
          [limit]
        );
        return plain.rows;
      }
      const result = await query(
        `SELECT id, name, position, ip, device_id, ticket_count, last_seen_at, created_at,
                username, credentials_at, keypass_at
           FROM external_visitors ORDER BY last_seen_at DESC LIMIT $1`,
        [limit]
      );
      return result.rows;
    },

    async updateVisitor(id, patch) {
      const keys = Object.keys(patch);
      if (!keys.length) return null;
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      const values = keys.map(k => patch[k]);
      values.push(id);
      const result = await query(
        `UPDATE external_visitors SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
        values
      );
      return result.rows[0] || null;
    },

    async removeVisitor(id) {
      const result = await query(`DELETE FROM external_visitors WHERE id = $1 RETURNING id`, [id]);
      return result.rows;
    },

    async listVisitorIps(visitorId) {
      const result = await query(
        `SELECT * FROM visitor_ips WHERE visitor_id = $1 ORDER BY last_seen_at DESC`,
        [visitorId]
      );
      return result.rows;
    },

    async bumpVisitorTicket(id) {
      if (!id) return;
      await query(
        `UPDATE external_visitors SET ticket_count = ticket_count + 1, last_seen_at = now() WHERE id = $1`,
        [id]
      );
    },
    
    async genDeviceNo() {
      const result = await query(`SELECT entry_no FROM device_entries WHERE entry_no LIKE 'DEV-%' ORDER BY id DESC LIMIT 1`);
      const row = result.rows[0];
      const m = /(\d+)\s*$/.exec(row ? row.entry_no : "");
      const seq = row && m ? parseInt(m[1], 10) + 1 : 1;
      return "DEV-" + String(seq).padStart(3, "0");
    },
    
    async listDeviceCategories() {
      const result = await query(`SELECT * FROM device_categories ORDER BY name`);
      return result.rows;
    },
    
    async addDeviceCategory(name) {
      const result = await query(`INSERT INTO device_categories (name) VALUES ($1) RETURNING id, name`, [name.trim()]);
      return result.rows[0];
    },
    
    async listDeviceOptions() {
      const result = await query(`SELECT * FROM device_options ORDER BY category, sort_order, name`);
      return result.rows;
    },
    
    async addDeviceOption({ category, name, iconUrl, sortOrder }) {
      const result = await query(
        `INSERT INTO device_options (category, name, icon_url, sort_order)
         VALUES ($1, $2, $3, $4)
         RETURNING id, category, name, icon_url, sort_order`,
        [String(category || "Hardware").trim(), String(name || "").trim(), String(iconUrl || "").trim(), Number.isFinite(sortOrder) ? sortOrder : 0]
      );
      return result.rows[0];
    },
    
    async updateDeviceOption(id, { category, name, iconUrl, sortOrder }) {
      const sets = [];
      const params = [];
      const push = (sql, val) => { params.push(val); sets.push(sql); };
      if (category !== undefined) push(`category = $${params.length + 1}`, String(category).trim());
      if (name !== undefined && name !== null) push(`name = $${params.length + 1}`, String(name).trim());
      if (iconUrl !== undefined && iconUrl !== null) push(`icon_url = $${params.length + 1}`, String(iconUrl).trim());
      if (sortOrder !== undefined && Number.isFinite(sortOrder)) push(`sort_order = $${params.length + 1}`, sortOrder);
      if (!sets.length) return null;
      params.push(id);
      const result = await query(
        `UPDATE device_options SET ${sets.join(", ")} WHERE id = $${params.length}
         RETURNING id, category, name, icon_url, sort_order`,
        params
      );
      return result.rows[0];
    },
    
    async deleteDeviceOption(id) {
      const result = await query(`DELETE FROM device_options WHERE id = $1 RETURNING id`, [id]);
      return result.rows;
    },
    
    async listDeviceEntries(limit = 500) {
      const result = await query(
        `SELECT de.*, 
          json_agg(json_build_object('id', dep.id, 'cloud_url', dep.cloud_url, 'sort_order', dep.sort_order) ORDER BY dep.sort_order) FILTER (WHERE dep.id IS NOT NULL) as photos
         FROM device_entries de
         LEFT JOIN device_entry_photos dep ON dep.entry_id = de.id
         GROUP BY de.id
         ORDER BY de.created_at DESC
         LIMIT $1`,
        [limit]
      );
      return result.rows.map(r => ({ ...r, photos: r.photos || [] }));
    },
    
    async createDeviceEntry(data) {
      const result = await query(
        `INSERT INTO device_entries (entry_no, category, model, spec_json, spec_source, spec_url, warranty_no, claim_company, warranty_expire_date, status, broken_date, claim_date, asset_code, branch, position, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [data.entryNo, data.category, data.model, data.specJson, data.specSource, data.specUrl, data.warrantyNo, data.claimCompany, data.warrantyExpireDate || null, data.status || "claim", data.brokenDate || null, data.claimDate || null, data.assetCode, data.branch || "", data.position || "", data.notes]
      );
      return result.rows[0].id;
    },
    
    async updateDeviceEntry(id, patch) {
      const keys = Object.keys(patch);
      if (!keys.length) return;
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      const values = keys.map(k => patch[k]);
      values.push(id);
      await query(`UPDATE device_entries SET ${setClause} WHERE id = $${keys.length + 1}`, values);
      return { id };
    },
    
    async deleteDeviceEntry(id) {
      const result = await query(`DELETE FROM device_entries WHERE id = $1 RETURNING id`, [id]);
      return result.rows;
    },
    
    async addEntryPhotos(entryId, cloudUrls) {
      if (!cloudUrls?.length) return [];
      const values = cloudUrls.map((u, i) => `($1, $${i + 2}, $${i + 2 + cloudUrls.length})`).join(",");
      const params = [entryId, ...cloudUrls, ...cloudUrls.map((_, i) => i)];
      await query(`INSERT INTO device_entry_photos (entry_id, cloud_url, sort_order) VALUES ${values}`, params);
      return [];
    },
    
    async listDeviceMaintenance(limit = 1000) {
      const result = await query(
        `SELECT de.*,
                COALESCE(json_agg(DISTINCT jsonb_build_object('id', dep.id, 'cloud_url', dep.cloud_url, 'sort_order', dep.sort_order))
                   FILTER (WHERE dep.id IS NOT NULL), '[]') AS photos,
                COALESCE((SELECT MAX(lc.checked_date) FROM device_maintenance_logs lc WHERE lc.entry_id = de.id)::text, '') AS last_check_date,
                COALESCE((SELECT lc2.status FROM device_maintenance_logs lc2 WHERE lc2.entry_id = de.id
                          ORDER BY lc2.checked_date DESC LIMIT 1), '') AS last_check_status
         FROM device_entries de
         LEFT JOIN device_entry_photos dep ON dep.entry_id = de.id
         GROUP BY de.id
         ORDER BY de.created_at DESC
         LIMIT $1`,
        [limit]
      );
      return result.rows.map(r => ({ ...r, photos: typeof r.photos === "string" ? JSON.parse(r.photos) : (r.photos || []) }));
    },
    
    async createMaintenanceCheck({ entryId, checkedDate, status, notes }) {
      const result = await query(
        `INSERT INTO device_maintenance_logs (entry_id, checked_date, status, notes) VALUES ($1, $2, $3, $4) RETURNING id`,
        [entryId, checkedDate, status || "ok", notes || ""]
      );
      await query(`UPDATE device_entries SET status = $2, updated_at = now() WHERE id = $1`, [entryId, status || "ok"]);
      return result.rows[0].id;
    },
    
    async listMaintenanceChecks(entryId) {
      const result = await query(
        `SELECT id, checked_date, status, notes, created_at FROM device_maintenance_logs
         WHERE entry_id = $1 ORDER BY checked_date DESC, id DESC LIMIT 500`,
        [entryId]
      );
      return result.rows;
    },
    
    async deleteMaintenanceCheck(logId) {
      const result = await query(`DELETE FROM device_maintenance_logs WHERE id = $1 RETURNING id`, [logId]);
      return result.rows;
    },
    
    async listWorkNotes(limit = 500) {
      const result = await query(`SELECT * FROM work_notes ORDER BY created_at DESC LIMIT $1`, [limit]);
      return result.rows;
    },
    
    async getWorkNote(id) {
      const result = await query(`SELECT * FROM work_notes WHERE id = $1`, [id]);
      return result.rows[0] || null;
    },
    
    async createWorkNote({ title, stepsJson, infoExtra }) {
      const result = await query(
        `INSERT INTO work_notes (title, steps_json, info_extra) VALUES ($1, $2, $3) RETURNING id`,
        [title || "", stepsJson || "[]", infoExtra || ""]
      );
      return result.rows[0].id;
    },
    
    async updateWorkNote(id, patch) {
      const keys = Object.keys(patch);
      if (!keys.length) return;
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      const values = keys.map(k => patch[k]);
      values.push(id);
      await query(`UPDATE work_notes SET ${setClause} WHERE id = $${keys.length + 1}`, values);
      return { id };
    },
    
    async deleteWorkNote(id) {
      const result = await query(`DELETE FROM work_notes WHERE id = $1 RETURNING id`, [id]);
      return result.rows;
    },

    // ---------- ระบบเก็บไดร์ฟเวอร์ (Drive Notes) ----------
    async listDriveNotes(limit = 500) {
      await ensureDriveNotesTable();
      const result = await query(`SELECT * FROM drive_notes ORDER BY created_at DESC LIMIT $1`, [limit]);
      return result.rows;
    },

    async getDriveNote(id) {
      await ensureDriveNotesTable();
      const result = await query(`SELECT * FROM drive_notes WHERE id = $1`, [id]);
      return result.rows[0] || null;
    },

    async createDriveNote({ title, stepsJson, infoExtra }) {
      await ensureDriveNotesTable();
      const result = await query(
        `INSERT INTO drive_notes (title, steps_json, info_extra) VALUES ($1, $2, $3) RETURNING id`,
        [title || "", stepsJson || "[]", infoExtra || ""]
      );
      return result.rows[0].id;
    },

    async updateDriveNote(id, patch) {
      await ensureDriveNotesTable();
      const keys = Object.keys(patch);
      if (!keys.length) return;
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      const values = keys.map(k => patch[k]);
      values.push(id);
      await query(`UPDATE drive_notes SET ${setClause} WHERE id = $${keys.length + 1}`, values);
      return { id };
    },

    async deleteDriveNote(id) {
      await ensureDriveNotesTable();
      const result = await query(`DELETE FROM drive_notes WHERE id = $1 RETURNING id`, [id]);
      return result.rows;
    },

    // ---------- ดาวน์โหลดไดร์ฟเวอร์ (Driver Catalog + Brand Links) ----------
    async listDriverCatalog(limit = 500) {
      await ensureDriverTables();
      const result = await query(
        `SELECT id, device_type, brand, model, source_url, notes, created_at, updated_at
           FROM driver_catalog ORDER BY created_at DESC LIMIT $1`, [limit]);
      return result.rows.map((r) => ({ ...r, id: Number(r.id) }));
    },

    async createDriverCatalog({ deviceType, brand, model, sourceUrl, notes }) {
      await ensureDriverTables();
      const result = await query(
        `INSERT INTO driver_catalog (device_type, brand, model, source_url, notes)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [deviceType || "printer", brand || "", model || "", sourceUrl || "", notes || ""]
      );
      return Number(result.rows[0].id);
    },

    async deleteDriverCatalog(id) {
      await ensureDriverTables();
      const result = await query(
        `DELETE FROM driver_catalog WHERE id = $1 RETURNING id`, [id]);
      return result.rows.map((r) => ({ ...r, id: Number(r.id) }));
    },

    async listDriverBrandLinks() {
      await ensureDriverTables();
      const result = await query(
        `SELECT brand, support_url, updated_at FROM driver_brand_links ORDER BY brand`);
      return result.rows;
    },

    async putDriverBrandLink(brand, supportUrl) {
      await ensureDriverTables();
      const result = await query(
        `INSERT INTO driver_brand_links (brand, support_url, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (brand) DO UPDATE
           SET support_url = EXCLUDED.support_url, updated_at = now()
         RETURNING brand, support_url`, [brand, supportUrl || ""]);
      return result.rows[0];
    },

    // ---------- TRAVEL EXPENSE (ระบบบันทึกเบิกค่าเดินทาง — ฝั่ง ADMIN) ----------
    async getTravelSettings() {
      await ensureTravelTables();
      const result = await query(`SELECT key, value FROM app_settings`);
      const out = {
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
        travel_doc_prefix: TRAVEL_DOC_PREFIX
      };
      (result.rows || []).forEach((r) => {
        if (r && typeof r.key === "string") out[r.key] = r.value == null ? "" : String(r.value);
      });
      return out;
    },

    async saveTravelSettings(patch) {
      await ensureTravelTables();
      const payload = patch && typeof patch === "object" ? patch : {};
      const allowed = new Set([
        "fuel_rate_motorcycle", "fuel_rate_car", "travel_company", "travel_bank_name",
        "travel_account_name", "travel_bank_account", "travel_claimer_name", "travel_claimer_position",
        "travel_approver_name", "travel_approver_title", "travel_checker_name",
        "travel_checker_title", "travel_checker2_name", "travel_checker2_title",
        "travel_vehicle_columns",
        "travel_doc_prefix"
      ]);
      for (const [k, v] of Object.entries(payload)) {
        if (!allowed.has(k)) continue;
        await query(
          `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [k, v == null ? "" : String(v)]
        );
      }
      return this.getTravelSettings();
    },

    async listTravelClaims(limit = 500) {
      await ensureTravelTables();
      const result = await query(
        `SELECT * FROM travel_claims ORDER BY created_at DESC LIMIT $1`,
        [Number(limit) || 500]
      );
      return result.rows || [];
    },

    async getTravelClaim(id) {
      await ensureTravelTables();
      const result = await query(`SELECT * FROM travel_claims WHERE id = $1`, [id]);
      return result.rows[0] || null;
    },

    async createTravelClaim(claim) {
      await ensureTravelTables();
      const v = travelRow(claim);
      // ล็อกแบบ transaction-scoped เพื่อไม่ให้เลขที่เอกสารชนกันเมื่อบันทึกพร้อมกันหลายคน
      return queryTx(async (tx) => {
        await tx.lock(TRAVEL_DOC_LOCK_KEY);
        const docNo = await nextTravelNo(tx);
        const result = await tx.query(
          `INSERT INTO travel_claims
             (doc_no, claimer_visitor_id, claimer_name, claim_date, position,
              bank_name, bank_account, account_name, trips_json, total_km, total_amount, note, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)
           RETURNING *`,
          [docNo, ...v]
        );
        return result.rows[0] || null;
      });
    },

    async updateTravelClaim(id, claim) {
      await ensureTravelTables();
      const v = travelRow(claim);
      const result = await query(
        `UPDATE travel_claims SET
           claimer_visitor_id = $1, claimer_name = $2, claim_date = $3, position = $4,
           bank_name = $5, bank_account = $6, account_name = $7, trips_json = $8::jsonb,
           total_km = $9, total_amount = $10, note = $11, status = $12, updated_at = now()
         WHERE id = $13 RETURNING *`,
        [...v, id]
      );
      return result.rows[0] || null;
    },

    async deleteTravelClaim(id) {
      await ensureTravelTables();
      const result = await query(`DELETE FROM travel_claims WHERE id = $1 RETURNING id`, [id]);
      return result.rows || [];
    },

    // ---------- บันทึกปฏิบัติงานนอกสถานที่ ----------
    async listFieldWorkLogs(limit = 500) {
      await ensureFieldWorkTables();
      const result = await query(
        `SELECT * FROM field_work_logs ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      return result.rows.map(mapFieldWorkRow);
    },

    async getFieldWorkLog(id) {
      await ensureFieldWorkTables();
      const result = await query(`SELECT * FROM field_work_logs WHERE id = $1`, [id]);
      return result.rows[0] ? mapFieldWorkRow(result.rows[0]) : null;
    },

    async createFieldWorkLog(entry) {
      await ensureFieldWorkTables();
      const v = fieldWorkValues(entry);
      const result = await query(
        `INSERT INTO field_work_logs
           (ticket_id, ticket_no, source_mode, work_date, work_time, location, detail,
            depart_branch_time, arrive_site_time, depart_site_time, arrive_branch_time,
            attachments_json, recorder_name, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14)
         RETURNING *`,
        v
      );
      return result.rows[0] ? mapFieldWorkRow(result.rows[0]) : null;
    },

    async updateFieldWorkLog(id, entry) {
      await ensureFieldWorkTables();
      const v = fieldWorkValues(entry);
      const result = await query(
        `UPDATE field_work_logs SET
            ticket_id = $1, ticket_no = $2, source_mode = $3, work_date = $4, work_time = $5,
            location = $6, detail = $7, depart_branch_time = $8, arrive_site_time = $9,
            depart_site_time = $10, arrive_branch_time = $11, attachments_json = $12::jsonb,
            recorder_name = $13, note = $14, updated_at = now()
          WHERE id = $15 RETURNING *`,
        [...v, id]
      );
      return result.rows[0] ? mapFieldWorkRow(result.rows[0]) : null;
    },

    async deleteFieldWorkLog(id) {
      await ensureFieldWorkTables();
      const result = await query(`DELETE FROM field_work_logs WHERE id = $1 RETURNING id`, [id]);
      return result.rows || [];
    },
    
    async listRepairNotes(limit = 500) {
      const result = await query(
        `SELECT rn.*, t.ticket_no, t.device, t.symptom, t.location, t.status, t.created_at as ticket_created_at
         FROM repair_notes rn
         LEFT JOIN tickets t ON t.ticket_no = rn.ticket_no
         ORDER BY rn.created_at DESC
         LIMIT $1`,
        [limit]
      );
      return result.rows;
    },
    
    async createRepairNote({ ticketNo, category, content }) {
      const result = await query(
        `INSERT INTO repair_notes (ticket_no, category, content) VALUES ($1, $2, $3) RETURNING id`,
        [ticketNo || "", category || "", content || ""]
      );
      return result.rows[0].id;
    },
    
    async updateRepairNote(id, patch) {
      const keys = Object.keys(patch);
      if (!keys.length) return;
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      const values = keys.map(k => patch[k]);
      values.push(id);
      await query(`UPDATE repair_notes SET ${setClause} WHERE id = $${keys.length + 1}`, values);
      return { id };
    },
    
    async deleteRepairNote(id) {
      const result = await query(`DELETE FROM repair_notes WHERE id = $1 RETURNING id`, [id]);
      return result.rows;
    },
    
    async listSystemUsers() {
      const result = await query(
        `SELECT id, username, permissions, note, created_at, updated_at
         FROM system_users ORDER BY username`
      );
      return result.rows.map((row) => ({
        id: row.id,
        username: row.username,
        permissions: JSON.parse(row.permissions || "[]"),
        note: row.note || "",
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
    },
    
    async createSystemUser({ username, password_hash, permissions, note }) {
      const result = await query(
        `INSERT INTO system_users (username, password_hash, permissions, note)
         VALUES ($1, $2, $3, $4)
         RETURNING id, username, permissions, note, created_at, updated_at`,
        [username, password_hash || "", JSON.stringify(permissions || []), note || ""]
      );
      const row = result.rows[0];
      return { ...row, permissions: JSON.parse(row.permissions || "[]") };
    },
    
    async updateSystemUser(username, patch) {
      const keys = Object.keys(patch);
      if (!keys.length) return;
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      const values = keys.map((k) => patch[k]);
      values.push(username);
      const result = await query(
        `UPDATE system_users SET ${setClause} WHERE username = $${keys.length + 1}
         RETURNING id, username, permissions, note, created_at, updated_at`,
        values
      );
      if (!result.rows.length) return null;
      const row = result.rows[0];
      return { ...row, permissions: JSON.parse(row.permissions || "[]") };
    },
    
    async deleteSystemUser(username) {
      const result = await query(`DELETE FROM system_users WHERE username = $1 RETURNING id`, [username]);
      return result.rows;
    },
    
    async getSystemUserAuth(username) {
      const result = await query(
        `SELECT username, password_hash, permissions FROM system_users WHERE username = $1`,
        [username]
      );
      if (!result.rows.length) return null;
      const row = result.rows[0];
      try {
        row.permissions = JSON.parse(row.permissions || "[]");
      } catch (err) {
        row.permissions = [];
      }
      return row;
    },

    async listPasswordNotes({ limit = 500, includeSecret = false } = {}) {
      const selectCols = includeSecret ? "*" : "id, title, created_at";
      const result = await query(
        `SELECT ${selectCols} FROM password_notes ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      return result.rows;
    },

    async createPasswordNote({ title, encJson }) {
      const result = await query(
        `INSERT INTO password_notes (title, enc_json) VALUES ($1, $2) RETURNING id`,
        [title || "", encJson || ""]
      );
      return result.rows[0].id;
    },

    async deletePasswordNote(id) {
      const result = await query(`DELETE FROM password_notes WHERE id = $1 RETURNING id`, [id]);
      return result.rows;
    },
    
    async listWarrantyCheckSites() {
      const result = await query(`SELECT * FROM warranty_check_sites ORDER BY sort, id`);
      return result.rows;
    },
    
    async createWarrantyCheckSite({ name, url, mode, sort }) {
      const result = await query(
        `INSERT INTO warranty_check_sites (name, url, mode, sort, enabled) VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [name || "", url || "", mode || "link", sort == null ? 0 : Number(sort)]
      );
      return result.rows[0].id;
    },
    
    async updateWarrantyCheckSite(id, patch) {
      const keys = Object.keys(patch);
      if (!keys.length) return;
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      const values = keys.map(k => patch[k]);
      values.push(id);
      await query(`UPDATE warranty_check_sites SET ${setClause} WHERE id = $${keys.length + 1}`, values);
      return { id };
    },
    
    async deleteWarrantyCheckSite(id) {
      const result = await query(`DELETE FROM warranty_check_sites WHERE id = $1 RETURNING id`, [id]);
      return result.rows;
    },
    
    async addWarrantyCheck({ serial, resultsJson, summary }) {
      const result = await query(
        `INSERT INTO warranty_checks (serial, results_json, summary) VALUES ($1, $2, $3) RETURNING id`,
        [serial || "", resultsJson || "[]", summary || ""]
      );
      return result.rows[0].id;
    },
    
    async listWarrantyChecks(limit = 100) {
      const result = await query(`SELECT * FROM warranty_checks ORDER BY created_at DESC LIMIT $1`, [limit]);
      return result.rows;
    },
    
    async testConnection() {
      if (!pgConfig.host || !pgConfig.database || !pgConfig.user) {
        return { ok: false, message: "ยังไม่ได้ตั้งค่า PostgreSQL ใน .env (PG_HOST, PG_DATABASE, PG_USER, PG_PASSWORD)" };
      }
      try {
        const result = await query(`SELECT 1 as test`);
        if (result.rows[0]?.test === 1) {
          return { ok: true, message: `เชื่อมต่อ PostgreSQL สำเร็จ (${pgConfig.host}:${pgConfig.port}/${pgConfig.database})` };
        }
        return { ok: false, message: "ทดสอบการเชื่อมต่อไม่สำเร็จ" };
      } catch (e) {
        return { ok: false, message: "เชื่อมต่อ PostgreSQL ล้มเหลว: " + e.message };
      }
    },
    
    async close() {
      if (pgPool) {
        await pgPool.end();
        pgPool = null;
      }
    }
  };
}

function devicePrefix(device) {
  const d = String(device || "").toLowerCase();
  if (!d) return "R-";
  if (d.includes("hardware")) return "HW-";
  if (d.includes("software") || d.includes("soft") || d === "sw") return "SW-";
  return "HW-";
}

function getAdapter() {
  if (!currentAdapter) {
    currentAdapter = createSupabaseAdapter();
  }
  return currentAdapter;
}

function getCurrentMode() {
  return currentMode;
}

async function switchDatabase(mode, pgOptions = {}) {
  if (mode === "supabase") {
    if (pgPool) {
      await pgPool.end();
      pgPool = null;
    }
    currentAdapter = createSupabaseAdapter();
    currentMode = "supabase";
    return { ok: true, mode: "supabase", message: "สลับไปใช้ Supabase แล้ว" };
  } else if (mode === "postgres") {
    const sslValue = pgOptions.ssl !== undefined ? pgOptions.ssl : (config.PG_SSL === "true");
    pgConfig = {
      host: pgOptions.host || config.PG_HOST,
      port: pgOptions.port || config.PG_PORT || 5432,
      database: pgOptions.database || config.PG_DATABASE,
      user: pgOptions.user || config.PG_USER,
      password: pgOptions.password || config.PG_PASSWORD,
      ssl: sslValue ? { rejectUnauthorized: false } : false,
    };
    
    if (!pgConfig.host || !pgConfig.database || !pgConfig.user) {
      return { ok: false, message: "กรุณาระบุข้อมูลการเชื่อมต่อ PostgreSQL ให้ครบถ้วน" };
    }
    
    if (pgPool) {
      await pgPool.end();
    }
    currentAdapter = createPostgresAdapter();
    currentMode = "postgres";
    
    const test = await currentAdapter.testConnection();
    if (!test.ok) {
      currentAdapter = createSupabaseAdapter();
      currentMode = "supabase";
      return { ok: false, message: test.message };
    }
    return { ok: true, mode: "postgres", message: "สลับไปใช้ PostgreSQL ตรงๆ แล้ว" };
  }
  return { ok: false, message: "โหมดไม่ถูกต้อง" };
}

function resetPostgresPool() {
  if (pgPool) {
    pgPool.end();
    pgPool = null;
  }
}

module.exports = {
  getAdapter,
  getCurrentMode,
  switchDatabase,
  resetPostgresPool,
  createSupabaseAdapter,
  createPostgresAdapter,
};