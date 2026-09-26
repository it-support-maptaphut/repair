-- =============================================================
-- Migration: เพิ่มคอลัมน์ที่ระบบต้องการ (รันซ้ำได้ ไม่ลบข้อมูล)
-- คำสั่ง: Supabase Dashboard -> SQL Editor -> New query -> วาง -> Run
-- =============================================================

-- 1) ตาราง tickets: เวลาของสถานะ (ใช้บันทึก "เสร็จสิ้นเวลา" ผ่านฟอร์มปิดงาน)
alter table public.tickets add column if not exists status_time text default '';
comment on column public.tickets.status_time is 'เวลาของสถานะ เช่น 14:45';

-- 2) ตาราง tickets: คอลัมน์เก็บไฟล์บีบอัดถาวร (สร้างตอนปิดงาน/เสร็จสิ้น)
alter table public.tickets add column if not exists archive_base64 text;
alter table public.tickets add column if not exists archive_size bigint default 0;
alter table public.tickets add column if not exists archived_at timestamptz;
comment on column public.tickets.archive_base64 is 'ข้อมูลงานบีบอัด (gzip base64) เก็บถาวรเมื่อปิดงาน';

-- 3) device_entries: ป้ายสาขา/ตำแหน่ง และลิงก์ซัพพลายเออร์ (เผื่อยังไม่มี)
alter table public.device_entries add column if not exists branch text default '';
alter table public.device_entries add column if not exists position text default '';
alter table public.device_entries add column if not exists category_id bigint;
alter table public.device_entries add column if not exists supplier_url text default '';

-- 4) RLS: ให้ service role / authenticated อ่าน-เขียนข้อมูลได้ (รันขั้นสุดท้ายเสมอ)
alter table public.tickets enable row level security;
alter table public.ticket_photos enable row level security;
alter table public.external_visitors enable row level security;
alter table public.visitor_ips enable row level security;

drop policy if exists "service_role_all_tickets" on public.tickets;
create policy "service_role_all_tickets"
  on public.tickets for all
  to service_role using (true) with check (true);

drop policy if exists "service_role_all_photos" on public.ticket_photos;
create policy "service_role_all_photos"
  on public.ticket_photos for all
  to service_role using (true) with check (true);

drop policy if exists "service_role_all_visitors" on public.external_visitors;
create policy "service_role_all_visitors"
  on public.external_visitors for all
  to service_role using (true) with check (true);

drop policy if exists "service_role_all_visitor_ips" on public.visitor_ips;
create policy "service_role_all_visitor_ips"
  on public.visitor_ips for all
  to service_role using (true) with check (true);