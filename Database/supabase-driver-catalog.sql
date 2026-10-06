-- ============================================================================
-- Migration: ปุ่ม "ดาวน์โหลดไดร์ฟเวอร์" (driver_catalog + driver_brand_links)
--
-- วิธีใช้: เปิด Supabase Dashboard -> SQL Editor -> วางไฟล์นี้ -> Run
-- รันซ้ำได้ (idempotent) ไม่ทำลบข้อมูลเดิม
--
-- ระบบไหล:
--   1) กดปุ่ม "ดาวน์โหลดไดร์ฟเวอร์" -> Popup
--   2) เลือกอุปกรณ์ (ตอนนี้มีเฉพาะ เครื่องปริ้นท์)
--   3) กรอก/เลือกยี่ห้อ (epson, canon, ...)
--   4) พิมพ์รุ่น -> ระบบดึงลิงก์ดาวน์โหลดอย่างเป็นทางการจาก driver_brand_links
--   5) บันทึกลง driver_catalog + เปิดลิงก์ผู้ผลิต
-- ลิงก์ต่อยี่ห้อดู/แก้ได้ในหน้า ระบบเก็บไดร์ฟเวอร์ -> ปุ่ม "ลิงก์ยี่ห้อ"
-- ============================================================================

-- ---------- 1) ตารางบันทึกไดร์ฟเวอร์ที่ดาวน์โหลด ----------
create table if not exists public.driver_catalog (
  id bigint generated always as identity primary key,
  device_type text not null default 'printer',
  brand text not null default '',
  model text not null default '',
  source_url text not null default '',
  notes text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.driver_catalog enable row level security;

create index if not exists driver_catalog_created_idx
  on public.driver_catalog (created_at desc);

-- ---------- 2) ตารางลิงก์ดาวน์โหลดต่อยี่ห้อ ----------
create table if not exists public.driver_brand_links (
  brand text primary key,
  support_url text not null default '',
  updated_at timestamptz default now()
);

alter table public.driver_brand_links enable row level security;

-- ---------- 3) ลิงก์เริ่มต้น (ตรวจสอบแล้วว่าเป็นหน้า Support อย่างเป็นทางการ; แก้ไขได้ในระบบ) ----------
insert into public.driver_brand_links (brand, support_url)
values
  ('epson',   'https://www.epson.com/Support'),
  ('canon',   'https://www.canon.com/support'),
  ('hp',      'https://support.hp.com'),
  ('brother', 'https://support.brother.com')
on conflict (brand) do update set support_url = excluded.support_url, updated_at = now();

-- ---------- 4) สิทธิ์ ----------
-- ใช้สิทธิ์ "ระบบเก็บไดร์ฟเวอร์" (driveNotes) เดิมกับ API driver-catalog / driver-brand-links
-- ถ้าผู้ใช้ระดับ user ต้องการสิทธิ์นี้ ให้เพิ่มใน "ระบบจัดการข้อมูลส่วนตัว"

-- ---------- 5) ตรวจสอบผล ----------
select 'driver_catalog' as tbl, count(*) as rows from public.driver_catalog
union all
select 'driver_brand_links' as tbl, count(*) as rows from public.driver_brand_links;