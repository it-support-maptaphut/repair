-- ============================================================================
-- Migration: ระบบเก็บไดร์ฟเวอร์ (drive_notes)
--
-- วิธีใช้: เปิด Supabase Dashboard -> SQL Editor -> วางไฟล์นี้ -> Run
-- รันซ้ำได้ (idempotent) ไม่ทำลบข้อมูลเดิม
--
-- หมายเหตุ: ระบบนี้เป็นแท็บเมนูหลัก (นอกกลุ่ม "ระบบโน้ต") ไม่ต้องมีหมวดหมู่
-- โครงสร้างเดียวกับ work_notes: หัวเรื่อง + ขั้นตอน (JSON) + ข้อมูลเสริม
-- ============================================================================

-- ---------- 1) ตาราง ----------
create table if not exists public.drive_notes (
  id bigint generated always as identity primary key,
  title text not null default '',
  steps_json text default '[]',
  info_extra text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- 2) RLS ----------
-- เข้าถึงผ่าน service_role key ของ server เท่านั้น
-- ผู้ใช้ปลายทางไม่เรียกตารางนี้โดยตรง
alter table public.drive_notes enable row level security;

-- ---------- 3) Index ----------
create index if not exists drive_notes_created_idx
  on public.drive_notes (created_at desc);

-- ---------- 4) สิทธิ์ของ user admin ต้องมีคีย์ driveNotes ----------
-- ผู้ดูแลระบบหลัก (role = admin / is_admin) ใช้งานได้ทันที
-- ถ้ามีผู้ใช้ระดับ user ที่ต้องการสิทธิ์นี้ ให้เพิ่มในหน้า "ระบบจัดการข้อมูลส่วนตัว"
-- หรือรันคำสั่งตัวอย่างด้านล่าง (ปรับ username ตามจริง)
--
-- update public.system_users
--    set perms = perms::jsonb || '{"driveNotes": true}'::jsonb
--  where username = 'your-username';

-- ---------- 5) ตรวจสอบผล ----------
select count(*) as drive_notes_rows from public.drive_notes;