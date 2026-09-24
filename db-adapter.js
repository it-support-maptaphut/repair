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

    async findVisitor({ ip, token }) {
      return supabaseModule.findVisitor({ ip, token });
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
      return result.rows.map(mapTicket);
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

    async findVisitor({ ip, token }) {
      let row = null;
      if (token) {
        const r = await query(`SELECT * FROM external_visitors WHERE token = $1 LIMIT 1`, [token]);
        row = r.rows[0] || null;
      }
      if (!row && ip) {
        const r = await query(`SELECT * FROM external_visitors WHERE ip = $1 ORDER BY last_seen_at DESC LIMIT 1`, [ip]);
        row = r.rows[0] || null;
      }
      if (!row) return null;
      if (ip && row.ip !== ip) {
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

    async createVisitor({ name, position, ip, token }) {
      const result = await query(
        `INSERT INTO external_visitors (name, position, ip, token, ticket_count, last_seen_at)
         VALUES ($1, $2, $3, $4, 0, now())
         RETURNING id, name, position, ip, token, ticket_count, last_seen_at, created_at`,
        [name || "", position || "", ip || "", token || ""]
      );
      const row = result.rows[0];
      if (ip) await this._touchVisitorIps(row.id, ip);
      return row;
    },

    async listVisitors(limit = 300) {
      const result = await query(`SELECT * FROM external_visitors ORDER BY last_seen_at DESC LIMIT $1`, [limit]);
      return result.rows;
    },

    async updateVisitor(id, patch) {
      const keys = Object.keys(patch);
      if (!keys.length) return null;
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      const values = keys.map(k => patch[k]);
      values.push(id);
      const result = await query(
        `UPDATE external_visitors SET ${setClause} WHERE id = $${keys.length + 1}
         RETURNING id, name, position, ip, token, ticket_count, last_seen_at, created_at`,
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