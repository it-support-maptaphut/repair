-- =============================================================
-- Migration: เพิ่มคอลัมน์ "เข้าสู่ระบบด้วย LINE" ให้ผู้ใช้ภายนอก (external_visitors)
-- รันซ้ำได้ ไม่ลบข้อมูล
-- คำสั่ง: Supabase Dashboard -> SQL Editor -> New query -> วาง -> Run
-- =============================================================

alter table public.external_visitors add column if not exists line_uid text not null default '';
alter table public.external_visitors add column if not exists line_name text not null default '';
alter table public.external_visitors add column if not exists line_picture_url text not null default '';

comment on column public.external_visitors.line_uid is 'LINE userId ที่ได้จาก LINE Login (ว่าง = ยังไม่ได้ผูก)';
comment on column public.external_visitors.line_name is 'ชื่อที่แสดงใน LINE ของผู้ใช้';
comment on column public.external_visitors.line_picture_url is 'รูปโปรไฟล์ LINE ของผู้ใช้';

-- ผูก LINE 1 บัญชี ต่อ 1 ผู้ใช้ (ไม่นับแถวที่ยังไม่ได้ผูก)
create unique index if not exists external_visitors_line_uid_key
  on public.external_visitors (line_uid) where line_uid <> '';

alter table public.external_visitors enable row level security;

drop policy if exists "service_role_all_visitors" on public.external_visitors;
create policy "service_role_all_visitors"
  on public.external_visitors for all
  to service_role using (true) with check (true);
