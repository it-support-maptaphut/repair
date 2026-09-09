-- คอลัมน์สำหรับจัดเก็บข้อมูลบีบอัด (archive) เมื่อกด "เสร็จสิ้น" ในหน้า admin
-- รันไฟล์นี้ใน Supabase > SQL Editor หนึ่งครั้ง (รันซ้ำได้ ไม่กระทบข้อมูล)
alter table public.tickets
  add column if not exists pdf_url text;

alter table public.tickets
  add column if not exists archive_base64 text;

alter table public.tickets
  add column if not exists archive_size bigint default 0;

alter table public.tickets
  add column if not exists archived_at timestamptz;