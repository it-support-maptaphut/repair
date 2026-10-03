-- =============================================================
-- Migration: เพิ่มคอลัมน์ "ประจำสาขา" ให้ผู้ใช้ภายนอก (external_visitors)
-- รันซ้ำได้ ไม่ลบข้อมูล
-- คำสั่ง: Supabase Dashboard -> SQL Editor -> New query -> วาง -> Run
-- =============================================================

alter table public.external_visitors add column if not exists branch text not null default '';
comment on column public.external_visitors.branch is 'ประจำสาขาของผู้แจ้ง เช่น ร้านวรรณสาขา 1 (ขนส่งเก่าระยอง)';

alter table public.external_visitors enable row level security;

drop policy if exists "service_role_all_visitors" on public.external_visitors;
create policy "service_role_all_visitors"
  on public.external_visitors for all
  to service_role using (true) with check (true);
