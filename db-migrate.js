const { createClient } = require("@supabase/supabase-js");
const { Pool } = require("pg");
const config = require("./config");
const fs = require("fs");
const path = require("path");

const migrationJobs = new Map();
const activeJobIds = new Set();

const lastSync = {
  jobId: null,
  status: "none",
  running: false,
  finishedAt: null,
  duration: 0,
  totalRows: 0,
  tableResults: {},
  verification: null,
  error: null,
};

function hasPgConfig() {
  return !!(config.PG_HOST && config.PG_DATABASE && config.PG_USER);
}

function getPgOptionsFromConfig() {
  return {
    host: config.PG_HOST,
    port: config.PG_PORT || 5432,
    database: config.PG_DATABASE,
    user: config.PG_USER,
    password: config.PG_PASSWORD || "",
    ssl: String(config.PG_SSL) === "true",
  };
}

function getLastSync() {
  return { ...lastSync };
}

function createSupabaseClient() {
  const supabaseKey = config.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_SECRET_KEY;
  if (!config.SUPABASE_URL || !supabaseKey) {
    throw new Error("Supabase config not found in .env");
  }
  return createClient(config.SUPABASE_URL, supabaseKey);
}

function createPgPool(pgOptions = {}) {
  const pgConfig = {
    host: pgOptions.host || config.PG_HOST,
    port: pgOptions.port || config.PG_PORT || 5432,
    database: pgOptions.database || config.PG_DATABASE,
    user: pgOptions.user || config.PG_USER,
    password: pgOptions.password || config.PG_PASSWORD,
    ssl: pgOptions.ssl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
  return new Pool(pgConfig);
}

// ลำดับตารางทั้งหมด (lock ไว้ให้ครบทุกตารางใน Supabase)
// เรียงตามลำดับ dependency ของ FK เพื่อให้ insert ไม่ทับกับข้อมูลอ้างอิง
const TABLE_ORDER = [
  "device_categories",
  "device_options",
  "warranty_check_sites",
  "tickets",
  "ticket_photos",
  "user_devices",
  "external_visitors",
  "visitor_ips",
  "device_entries",
  "device_entry_photos",
  "device_maintenance_logs",
  "work_notes",
  "repair_notes",
  "warranty_checks",
  "password_notes",
  "system_users",
];

const BATCH_SIZE = 500;

async function runMigration(jobId, pgOptions = {}) {
  const job = migrationJobs.get(jobId);
  if (!job) return;
  
  job.status = "running";
  job.startTime = Date.now();
  job.logs = [];
  job.tableResults = {};
  activeJobIds.add(jobId);
  lastSync.jobId = jobId;
  lastSync.running = true;
  lastSync.status = "running";
  
  const addLog = (msg, level = "info") => {
    const log = { time: new Date().toISOString(), level, msg };
    job.logs.push(log);
    console.log(`[Migration ${jobId}] ${msg}`);
  };
  
  const supabase = createSupabaseClient();
  const pgPool = createPgPool(pgOptions);
  
  try {
    addLog("เริ่มเชื่อมต่อฐานข้อมูล...");
    
    // Test connections
    await supabase.from("tickets").select("id").limit(1);
    await pgPool.query("SELECT 1");
    addLog("เชื่อมต่อสำเร็จทั้งสองฝั่ง");
    
    // 1. Create schema on target (run SQL)
    addLog("สร้างโครงสร้างตารางบน PostgreSQL...");
    await createSchema(pgPool, addLog);
    addLog("สร้างโครงสร้างตารางเสร็จสิ้น");
    
    // 2. Migrate each table
    let totalRows = 0;
    for (const table of TABLE_ORDER) {
      if (job.cancelled) {
        addLog("ยกเลิกการโอนย้าย", "warn");
        break;
      }
      
      job.currentTable = table;
      addLog(`กำลังโอนย้ายตาราง: ${table}...`);
      
      const result = await migrateTable(supabase, pgPool, table, addLog, job);
      job.tableResults[table] = result;
      totalRows += result.count;
      
      addLog(`ตาราง ${table}: ${result.count} แถว - ${result.status}`, result.status === "success" ? "info" : "error");
      
      if (result.status !== "success" && !job.continueOnError) {
        throw new Error(`Migration failed at table ${table}: ${result.error}`);
      }
    }
    
    // 3. Reset sequences
    if (!job.cancelled) {
      addLog("รีเซต Sequences...");
      await resetSequences(pgPool, addLog);
      addLog("รีเซต Sequences เสร็จสิ้น");
    }
    
    // 4. Verify counts
    if (!job.cancelled) {
      addLog("ตรวจสอบจำนวนข้อมูล...");
      const verification = await verifyCounts(supabase, pgPool, addLog);
      job.verification = verification;
    }
    
    job.status = job.cancelled ? "cancelled" : "completed";
    job.endTime = Date.now();
    job.duration = job.endTime - job.startTime;
    job.totalRows = totalRows;
    addLog(`โอนย้ายเสร็จสิ้น: ${totalRows} แถว ใช้เวลา ${(job.duration / 1000).toFixed(1)} วินาที`, "success");
    
  } catch (err) {
    job.status = "failed";
    job.endTime = Date.now();
    job.error = err.message;
    addLog(`เกิดข้อผิดพลาด: ${err.message}`, "error");
    console.error("[Migration Error]", err);
  } finally {
    activeJobIds.delete(jobId);
    if (lastSync.jobId === jobId) {
      lastSync.running = activeJobIds.size > 0;
      lastSync.status = job.status;
      lastSync.finishedAt = new Date().toISOString();
      lastSync.duration = job.duration || 0;
      lastSync.totalRows = job.totalRows || 0;
      lastSync.tableResults = job.tableResults || {};
      lastSync.verification = job.verification || null;
      lastSync.error = job.error || null;
    }
    await pgPool.end().catch(() => {});
  }
}

async function createSchema(pgPool, addLog) {
  // Read schema SQL files
  const schemaFiles = [
    "supabase-schema.sql",
    "supabase-schema-counters.sql",
    "supabase-migrate-finish.sql",
  ];

  // ข้าม statement เฉพาะ Supabase (roles/policy/grant) ที่ PostgreSQL ทั่วไปไม่มี
  const SKIP_RE = /\b(grant|revoke|policy|service_role|authenticated|anon)\b/i;

  for (const file of schemaFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      const sql = fs.readFileSync(filePath, "utf8");
      // Split by semicolon but keep function bodies intact
      const statements = splitSqlStatements(sql);
      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (trimmed && !trimmed.startsWith("--") && !SKIP_RE.test(trimmed)) {
          try {
            await pgPool.query(trimmed);
          } catch (e) {
            // Ignore "already exists" errors
            if (!/already exists|duplicate/i.test(e.message)) {
              addLog(`Schema warning (${file}): ${e.message}`, "warn");
            }
          }
        }
      }
    }
  }
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let inFunction = false;
  let dollarQuote = null;
  
  const lines = sql.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();

    // ข้าม comment เต็มบรรทัด (ยกเว้นอยู่ข้างในฟังก์ชัน $...$)
    if (!dollarQuote && trimmed.startsWith("--")) continue;
    
    // Detect dollar-quoted function bodies
    if (/\$\w*\$/.test(line)) {
      const matches = line.match(/\$(\w*)\$/g);
      if (matches) {
        for (const m of matches) {
          if (dollarQuote === m) {
            dollarQuote = null;
            inFunction = false;
          } else if (!dollarQuote) {
            dollarQuote = m;
            inFunction = true;
          }
        }
      }
    }
    
    current += line + "\n";
    
    // Split on semicolon only if not in function body
    if (trimmed.endsWith(";") && !inFunction && !dollarQuote) {
      statements.push(current);
      current = "";
    }
  }
  
  if (current.trim()) statements.push(current);
  return statements;
}

async function migrateTable(supabase, pgPool, tableName, addLog, job) {
  const startTime = Date.now();
  let totalCount = 0;
  let offset = 0;
  const pageSize = 1000;
  
  try {
    // ใช้คอลัมน์ของฝั่งปลายทาง (pgsql) เป็นเกณฑ์ แล้วตัดให้แค่คอลัมน์ที่ฝั่งต้นทางมีจริง
    const colRes = await pgPool.query(
      `SELECT column_name, is_identity FROM information_schema.columns ` +
      `WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [tableName]
    );
    const hasIdentity = colRes.rows.some((r) => String(r.is_identity || "").toLowerCase() === "yes");
    const targetCols = colRes.rows.map((r) => r.column_name);

    const sampleRes = await supabase.from(tableName).select("*").limit(1);
    if (sampleRes.error) {
      return {
        table: tableName,
        count: 0,
        status: "failed",
        duration: Date.now() - startTime,
        error: "Supabase: " + (sampleRes.error.message || "ไม่พบตาราง"),
      };
    }
    // ถ้าตารางฝั่งต้นทางยังไม่มีข้อมูล ให้ใช้คอลัมน์ฝั่ง pgsql แทน (ตารางทั้งคู่มาจาก schema เดียวกัน)
    const srcCols = sampleRes.data && sampleRes.data.length ? Object.keys(sampleRes.data[0]) : targetCols;
    const cols = targetCols.filter((c) => srcCols.includes(c));

    if (!cols.length) {
      return {
        table: tableName,
        count: 0,
        status: "failed",
        duration: Date.now() - startTime,
        error: "ไม่พบคอลัมน์ที่ตรงกันระหว่าง Supabase กับ pgsql",
      };
    }

    // Get total count first
    const { count } = await supabase.from(tableName).select("*", { count: "exact", head: true });
    totalCount = count || 0;
    
    if (totalCount === 0) {
      await pgPool.query(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`);
      return { table: tableName, count: 0, status: "success", duration: Date.now() - startTime, message: "ไม่มีข้อมูล" };
    }
    
    addLog(`  พบข้อมูล ${totalCount} แถว`);
    
    // Truncate target table first (preserve identity)
    await pgPool.query(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`);
    
    const colList = cols.join(",");
    
    // Migrate in batches
    while (offset < totalCount) {
      if (job.cancelled) break;
      
      const { data, error } = await supabase
        .from(tableName)
        .select(colList)
        .range(offset, offset + pageSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      // Insert batch
      await insertBatch(pgPool, tableName, cols, data, hasIdentity);
      
      offset += data.length;
      job.progress = { table: tableName, current: offset, total: totalCount };
      
      if (offset % (pageSize * 5) === 0 || offset >= totalCount) {
        addLog(`  โอนแล้ว ${offset}/${totalCount} แถว`);
      }
    }
    
    return { table: tableName, count: totalCount, status: "success", duration: Date.now() - startTime };
    
  } catch (err) {
    return { table: tableName, count: 0, status: "failed", duration: Date.now() - startTime, error: err.message };
  }
}

async function insertBatch(pgPool, tableName, cols, rows, hasIdentity) {
  if (!rows.length || !cols.length) return;
  
  const colNames = cols.map(c => `"${c}"`).join(", ");
  const placeholders = rows.map((_, i) => 
    "(" + cols.map((_, j) => `$${i * cols.length + j + 1}`).join(", ") + ")"
  ).join(", ");
  
  const values = rows.flatMap(r => cols.map(c => (r[c] === undefined ? null : r[c])));
  
  // ใช้ OVERRIDING SYSTEM VALUE เฉพาะตารางที่มี identity column (กัน insert id ซ้ำไม่ได้)
  const sysVal = hasIdentity ? " OVERRIDING SYSTEM VALUE" : "";
  const sql = `INSERT INTO "${tableName}" (${colNames})${sysVal} VALUES ${placeholders}`;
  await pgPool.query(sql, values);
}

async function resetSequences(pgPool, addLog) {
  const sequences = [
    { table: "tickets", col: "id" },
    { table: "ticket_photos", col: "id" },
    { table: "user_devices", col: "id" },
    { table: "external_visitors", col: "id" },
    { table: "visitor_ips", col: "id" },
    { table: "device_categories", col: "id" },
    { table: "device_options", col: "id" },
    { table: "device_entries", col: "id" },
    { table: "device_entry_photos", col: "id" },
    { table: "device_maintenance_logs", col: "id" },
    { table: "work_notes", col: "id" },
    { table: "repair_notes", col: "id" },
    { table: "warranty_check_sites", col: "id" },
    { table: "warranty_checks", col: "id" },
    { table: "password_notes", col: "id" },
    { table: "system_users", col: "id" },
  ];
  
  for (const seq of sequences) {
    try {
      await pgPool.query(`
        SELECT setval(pg_get_serial_sequence('public.${seq.table}', '${seq.col}'), 
        COALESCE((SELECT MAX(${seq.col}) FROM public.${seq.table}), 0) + 1, false)
      `);
    } catch (e) {
      addLog(`Sequence reset warning for ${seq.table}: ${e.message}`, "warn");
    }
  }
}

async function verifyCounts(supabase, pgPool, addLog) {
  const results = {};
  let allMatch = true;
  
  for (const table of TABLE_ORDER) {
    try {
      const { count: srcCount } = await supabase.from(table).select("*", { count: "exact", head: true });
      const { rows } = await pgPool.query(`SELECT COUNT(*) FROM "${table}"`);
      const dstCount = parseInt(rows[0].count);
      
      const match = srcCount === dstCount;
      if (!match) allMatch = false;
      
      results[table] = { source: srcCount, target: dstCount, match };
      addLog(`  ${table}: Supabase=${srcCount} | PostgreSQL=${dstCount} ${match ? "✓" : "✗"}`, match ? "info" : "error");
    } catch (e) {
      results[table] = { error: e.message };
      addLog(`  ${table}: verify error - ${e.message}`, "error");
    }
  }
  
  return { allMatch, tables: results };
}

function createMigrationJob(pgOptions = {}) {
  const jobId = "migrate_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  const job = {
    id: jobId,
    status: "pending",
    pgOptions,
    startTime: null,
    endTime: null,
    duration: 0,
    currentTable: null,
    progress: null,
    tableResults: {},
    logs: [],
    verification: null,
    totalRows: 0,
    error: null,
    cancelled: false,
    continueOnError: true,
  };
  migrationJobs.set(jobId, job);
  
  // Run async
  runMigration(jobId, pgOptions);
  
  return jobId;
}

// รันโดยใช้ค่าที่บันทึกไว้ (ใช้ตอนเปิดเซิร์ฟเวอร์ / ปุ่มถ่ายโอนในหน้า)
function createMigrationJobFromConfig() {
  if (!hasPgConfig()) {
    throw new Error("ยังไม่ได้ตั้งค่า PostgreSQL (PG_HOST, PG_DATABASE, PG_USER)");
  }
  return createMigrationJob(getPgOptionsFromConfig());
}

function runSyncFromConfig() {
  return createMigrationJobFromConfig();
}

async function listPgTables(pool) {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables ` +
    `WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
  );
  const out = [];
  for (const r of rows) {
    const name = r.table_name;
    const cnt = await pool.query(`SELECT COUNT(*)::int AS c FROM "public"."${name}"`).catch(() => ({ rows: [{ c: -1 }] }));
    out.push({ name, rows: (cnt.rows[0] && cnt.rows[0].c) == null ? -1 : cnt.rows[0].c });
  }
  return out;
}

function getJobStatus(jobId) {
  return migrationJobs.get(jobId) || null;
}

function cancelJob(jobId) {
  const job = migrationJobs.get(jobId);
  if (job) job.cancelled = true;
}

module.exports = {
  createMigrationJob,
  getJobStatus,
  cancelJob,
  TABLE_ORDER,
  hasPgConfig,
  getPgOptionsFromConfig,
  getLastSync,
  createMigrationJobFromConfig,
  runSyncFromConfig,
  listPgTables,
};