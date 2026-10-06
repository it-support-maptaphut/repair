-- ============================================================
-- Migration: เพิ่มตาราง system_users (ตั้งค่าสิทธิ์การเข้าใช้งานระบบ)
-- วิธีใช้: ไปที่ Supabase Dashboard -> SQL Editor -> วางโค้ดนี้ -> Run
-- รันซ้ำได้ (create if not exists) จะไม่ลบข้อมูลเดิม
-- ============================================================

create table if not exists public.system_users (
  id bigint generated always as identity primary key,
  username text unique not null,
  password_hash text not null default '',
  permissions text default '[]',      -- JSON array เช่น ["tickets","devices"]
  note text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.system_users enable row level security;

create index if not exists system_users_username_idx on public.system_users (username);