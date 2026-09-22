-- ============================================================
-- ระบบแจ้งซ่อม Line OA : ตารางข้อมูล (Supabase)
-- วิธีใช้: ไปที่ Supabase Dashboard -> SQL Editor -> วางโค้ดนี้ -> Run
-- หมายเหตุ: Node server ของเราจะใช้ service_role key ซึ่งข้าม RLS ได้อัตโนมัติ
-- คำเตือน: รันซ้ำได้ (create if not exists) จะไม่ลบข้อมูลเดิม
-- ============================================================

create table if not exists public.tickets (
  id bigint generated always as identity primary key,
  ticket_no text unique not null,
  device text not null,
  symptom text not null,
  location text not null,
  reporter_name text default '',
  reporter_phone text default '',
  reporter_line_id text default '',
  status text default 'new',
  handler_name text default '',     -- ผู้ดำเนินการ (เช่น บาส IT support / พี่เอ็ม IT support)
  status_date date,                 -- วันที่ของสถานะ (กรอกในขั้นตอนบันทึกสถานะ)
  source text default 'external',   -- 'external'=แจ้งจากข้างนอก (Line OA) / 'internal'=บันทึกจากระบบภายใน
  approved_at timestamptz,          -- ตั้งเมื่อ IT กด "อนุมัติ/กำลังดำเนินการ" (สถานะ working)
  accepted_at timestamptz,          -- ตั้งเมื่อ IT กด "ตอบรับ" งานในกล่องข้อความ (NULL = ยังรอตอบรับ ยังไม่เข้าระบบ)
  created_at timestamptz default now()
);

-- เพิ่มคอลัมน์ใหม่ให้ตารางที่มีอยู่แล้ว (ถ้ายังไม่มี) — รันซ้ำได้ ไม่ลบข้อมูลเดิม
alter table public.tickets add column if not exists handler_name text default '';
alter table public.tickets add column if not exists status_date date;
alter table public.tickets add column if not exists source text default 'external';
alter table public.tickets add column if not exists accepted_at timestamptz;
alter table public.tickets add column if not exists audio_url text default '';

create table if not exists public.ticket_photos (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.tickets(id) on delete cascade,
  cloud_url text not null,
  sort_order int default 0
);

create table if not exists public.user_devices (
  id bigint generated always as identity primary key,
  ip text unique not null,
  name text default '',
  last_seen_at timestamptz default now(),
  last_ticket_no text default '',
  ticket_count int default 0,
  created_at timestamptz default now()
);

alter table public.tickets enable row level security;
alter table public.ticket_photos enable row level security;
alter table public.user_devices enable row level security;

-- ============================================================
-- โน้ตอุปกรณ์ (Device Notebook) — จดงานอุปกรณ์ชำรุด + สเปคอัตโนมัติ
-- ============================================================

-- ---------- หมวดอุปกรณ์ ----------
create table if not exists public.device_categories (
  id bigint generated always as identity primary key,
  name text unique not null,
  created_at timestamptz default now()
);

alter table public.device_categories enable row level security;

-- หมวดเริ่มต้น (admin เพิ่มเองได้ในฟอร์ม)
insert into public.device_categories (name) values
   ('คอมพิวเตอร์'), ('โน้ตบุ๊ก'), ('เครื่องพิมพ์'), ('จอภาพ'), ('เครือข่าย'), ('โปรแกรม'), ('อื่นๆ'), ('งานทั่วไป')
on conflict (name) do nothing;

-- ---------- รายการอุปกรณ์ที่จดไว้ ----------
create table if not exists public.device_entries (
  id bigint generated always as identity primary key,
  entry_no text unique not null,          -- DEV-001
  category text not null default '',      -- หมวด (จาก device_categories หรือที่เพิ่มเอง)
  model text not null default '',         -- รุ่นสินค้า
  spec_json text default '',              -- สเปคที่ดึง/ยืนยัน (JSON string)
  spec_source text default 'manual',      -- 'web'=ดึงจากเน็ต / 'manual'=กรอกเอง
  spec_url text default '',               -- ลิงก์แหล่งสเปค
  warranty_no text default '',            -- เลขประกันสินค้า
  claim_company text default '',          -- บริษัทที่เคลม (จำอัตโนมัติ)
  warranty_expire_date date,              -- วันที่หมดประกัน (แสดงเมื่อกรอกเลขประกันแล้ว)
  status text not null default 'claim',   -- 'claim'=กำลังส่งเคลม / 'repair'=อยู่ระหว่างซ่อมบำรุง / 'done'=เสร็จแล้ว / 'ok'=ปกติ
  broken_date date,                       -- วันที่พัง
  claim_date date,                        -- วันที่ส่งเคลม (เฉพาะสถานะ 'กำลังส่งเคลม')
  asset_code text default '',             -- รหัสทรัพย์สินบริษัท
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.device_entries enable row level security;

-- เผื่อตารางมีอยู่แล้วจากเวอร์ชันเก่า ให้เพิ่มคอลัมน์ใหม่ที่หายไป (รันซ้ำได้ ไม่ลบข้อมูล)
alter table public.device_entries add column if not exists spec_json text default '';
alter table public.device_entries add column if not exists spec_source text default 'manual';
alter table public.device_entries add column if not exists spec_url text default '';
alter table public.device_entries add column if not exists warranty_no text default '';
alter table public.device_entries add column if not exists claim_company text default '';
alter table public.device_entries add column if not exists warranty_expire_date date;
alter table public.device_entries add column if not exists broken_date date;
alter table public.device_entries add column if not exists claim_date date;
alter table public.device_entries add column if not exists asset_code text default '';
alter table public.device_entries add column if not exists notes text default '';
alter table public.device_entries add column if not exists updated_at timestamptz default now();

create index if not exists device_entries_status_idx on public.device_entries (status);
create index if not exists device_entries_model_idx on public.device_entries (model);

-- ---------- รูปถ่ายอุปกรณ์ (หลายรูปต่อรายการ) ----------
create table if not exists public.device_entry_photos (
  id bigint generated always as identity primary key,
  entry_id bigint not null references public.device_entries(id) on delete cascade,
  cloud_url text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

alter table public.device_entry_photos enable row level security;
create index if not exists device_entry_photos_entry_idx on public.device_entry_photos (entry_id);

-- ============================================================
-- โน๊ตงาน (Work Notes) — จดบันทึกขั้นตอนการทำงาน/การเคลม
-- ขั้นตอนเก็บเป็น JSON array ของข้อความ เช่น ["ขั้นตอนที่ 1", "ขั้นตอนที่ 2", ...]
-- ============================================================
create table if not exists public.work_notes (
  id bigint generated always as identity primary key,
  title text not null default '',
  steps_json text default '[]',
  info_extra text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.work_notes enable row level security;

create index if not exists work_notes_created_idx on public.work_notes (created_at);

-- ============================================================
-- ระบบตรวจสอบประกัน (Warranty Check)
-- ============================================================
-- รายชื่อบริษัทตัวแทนจำหน่าย + หน้าเช็คประกัน (admin จัดการได้)
create table if not exists public.warranty_check_sites (
  id bigint generated always as identity primary key,
  name text not null unique,          -- ชื่อบริษัท (JIB, Advice, Synnex ...)
  url text not null,                  -- URL หน้าเช็คประกัน
  mode text not null default 'link',  -- 'auto' = กรอก/ค้นหาให้อัตโนมัติ, 'link' = เปิดหน้าให้ผู้ใช้คัดลอก S/N ไปวางเอง
  sort int default 0,
  enabled boolean default true,
  created_at timestamptz default now()
);

alter table public.warranty_check_sites enable row level security;

-- ประวัติการค้นหาประกัน
create table if not exists public.warranty_checks (
  id bigint generated always as identity primary key,
  serial text not null,               -- เลข S/N ที่ค้นหา
  results_json text default '[]',     -- ผลรายบริษัท (JSON array)
  summary text default '',            -- สรุป "ประกันอยู่ที่ ... หมดวันที่ ..."
  created_at timestamptz default now()
);

alter table public.warranty_checks enable row level security;

create index if not exists warranty_checks_serial_idx on public.warranty_checks (serial);
create index if not exists warranty_checks_created_idx on public.warranty_checks (created_at);

-- ============================================================
-- โน๊ตแจ้งซ่อม (Repair Notes) — จดบันทึกงานแต่ละใบแจ้งซ่อม
-- ช่อง ticket_no ผูกกับ tickets.ticket_no แล้ว ข้อมูลจะซิงค์
-- ไปยังหน้าระบบวิเคราะห์การแจ้งซ่อมโดยอัตโนมัติ
-- ============================================================
create table if not exists public.repair_notes (
  id bigint generated always as identity primary key,
  ticket_no text not null,             -- เลขใบแจ้งซ่อม (tickets.ticket_no)
  category text default '',            -- หมวดโน้ต เช่น ซ่อม / เคลม / อัปเดต / อื่นๆ
  content text not null default '',    -- เนื้อหาโน้ต
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.repair_notes enable row level security;

-- FK → tickets เพื่อให้ดึงข้อมูลใบแจ้งซ่อม (อุปกรณ์/อาการ) มาแสดงได้
-- (Postgres ไม่รองรับ ADD CONSTRAINT IF NOT EXISTS จึงใช้ DO block แทน)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'repair_notes_ticket_no_fk'
  ) then
    alter table public.repair_notes
      add constraint repair_notes_ticket_no_fk
      foreign key (ticket_no) references public.tickets(ticket_no) on delete cascade;
  end if;
end $$;

create index if not exists repair_notes_ticket_idx on public.repair_notes (ticket_no);
create index if not exists repair_notes_created_idx on public.repair_notes (created_at);