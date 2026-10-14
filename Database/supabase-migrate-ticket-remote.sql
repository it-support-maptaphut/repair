-- =============================================================
-- Migration: เพิ่มคอลัมน์ "การแก้ไขด้วย remote" (UltraViewer) ให้ตาราง tickets
-- รันซ้ำได้ ไม่ลบข้อมูล
-- คำสั่ง: Supabase Dashboard -> SQL Editor -> New query -> วาง -> Run
-- =============================================================

alter table public.tickets add column if not exists remote_enabled boolean not null default false;
alter table public.tickets add column if not exists remote_id text not null default '';
alter table public.tickets add column if not exists remote_password text not null default '';

comment on column public.tickets.remote_enabled is 'ผู้ใช้ต้องการให้แก้ไขผ่าน remote (UltraViewer) หรือไม่';
comment on column public.tickets.remote_id is 'UltraViewer ID ที่ผู้ใช้ให้ไว้สำหรับการ remote';
comment on column public.tickets.remote_password is 'รหัสผ่าน UltraViewer ชั่วคราวที่ผู้ใช้ให้ไว้';
