-- ============================================================
-- ระบบแจ้งซ่อม Line OA : ตารางข้อมูล (Supabase)
-- วิธีใช้: ไปที่ Supabase Dashboard -> SQL Editor -> วางโค้ดนี้ -> Run
-- หมายเหตุ: Node server ของเราจะใช้ service_role key ซึ่งข้าม RLS ได้อัตโนมัติ
-- ============================================================

drop table if exists public.ticket_photos;
drop table if exists public.tickets;

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
  approved_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.ticket_photos (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.tickets(id) on delete cascade,
  cloud_url text not null,
  sort_order int default 0
);

alter table public.tickets enable row level security;
alter table public.ticket_photos enable row level security;