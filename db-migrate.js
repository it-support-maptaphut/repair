const { createClient } = require("@supabase/supabase-js");
const { Pool } = require("pg");
const config = require("./config");
const fs = require("fs");
const path = require("path");

const migrationJobs = new Map();

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

const TABLE_ORDER = [
  "device_categories",
  "warranty_check_sites",
  "tickets",
  "ticket_photos",
  "user_devices",
  "device_entries",
  "device_entry_photos",
  "work_notes",
  "repair_notes",
  "warranty_checks",
];

const BATCH_SIZE = 500;

async function runMigration(jobId, pgOptions = {}) {
  const job = migrationJobs.get(jobId);
  if (!job) return;
  
  job.status = "running";
  job.startTime = Date.now();
  job.logs = [];
  job.tableResults = {};
  
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
    await pgPool.end().catch(() => {});
  }
}

async function createSchema(pgPool, addLog) {
  // Read schema SQL files
  const schemaFiles = [
    "supabase-schema.sql",
    "supabase-schema-counters.sql",
    "supabase-schema-archive.sql",
  ];
  
  for (const file of schemaFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      const sql = fs.readFileSync(filePath, "utf8");
      // Split by semicolon but keep function bodies intact
      const statements = splitSqlStatements(sql);
      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (trimmed && !trimmed.startsWith("--")) {
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
    // Get total count first
    const { count } = await supabase.from(tableName).select("*", { count: "exact", head: true });
    totalCount = count || 0;
    
    if (totalCount === 0) {
      return { table: tableName, count: 0, status: "success", duration: Date.now() - startTime, message: "ไม่มีข้อมูล" };
    }
    
    addLog(`  พบข้อมูล ${totalCount} แถว`);
    
    // Truncate target table first (preserve identity)
    await pgPool.query(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE`);
    
    // Migrate in batches
    while (offset < totalCount) {
      if (job.cancelled) break;
      
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .range(offset, offset + pageSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      // Insert batch
      await insertBatch(pgPool, tableName, data);
      
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

async function insertBatch(pgPool, tableName, rows) {
  if (!rows.length) return;
  
  const columns = Object.keys(rows[0]);
  const colNames = columns.map(c => `"${c}"`).join(", ");
  const placeholders = rows.map((_, i) => 
    "(" + columns.map((_, j) => `$${i * columns.length + j + 1}`).join(", ") + ")"
  ).join(", ");
  
  const values = rows.flatMap(r => columns.map(c => r[c]));
  
  // Use OVERRIDING SYSTEM VALUE for identity columns
  const sql = `INSERT INTO "${tableName}" (${colNames}) OVERRIDING SYSTEM VALUE VALUES ${placeholders}`;
  await pgPool.query(sql, values);
}

async function resetSequences(pgPool, addLog) {
  const sequences = [
    { table: "tickets", col: "id" },
    { table: "ticket_photos", col: "id" },
    { table: "user_devices", col: "id" },
    { table: "device_categories", col: "id" },
    { table: "device_entries", col: "id" },
    { table: "device_entry_photos", col: "id" },
    { table: "work_notes", col: "id" },
    { table: "repair_notes", col: "id" },
    { table: "warranty_check_sites", col: "id" },
    { table: "warranty_checks", col: "id" },
  ];
  
  for (const seq of sequences) {
    try {
      await pgPool.query(`
        SELECT setval(pg_get_serial_sequence('${seq.table}', '${seq.col}'), 
        COALESCE((SELECT MAX(${seq.col}) FROM ${seq.table}), 0) + 1, false)
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
};