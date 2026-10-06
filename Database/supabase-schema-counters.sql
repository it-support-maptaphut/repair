-- ระบบเลขที่ซ่อมแยกหมวดหมู่ + ป้องกันเลขซ้ำแม้ลบข้อมูล
-- รันไฟล์นี้ใน Supabase > SQL Editor หนึ่งครั้ง

create table if not exists public.counters (
  prefix text primary key,
  seq bigint not null default 0
);

-- next_ticket_no: คืนเลขถัดไปสำหรับ prefix (เช่น "HW-", "SW-")
-- 1) หาเลขสูงสุดที่มีอยู่ในตาราง tickets (รองรับข้อมูลเก่า)
-- 2) ดันตัวนับให้ไม่ต่ำกว่าเลขสูงสุดนั้น
-- 3) +1 แล้วคืนเลขสามหลัก เช่น HW-001, SW-012
create or replace function public.next_ticket_no(p_prefix text)
returns text
language plpgsql
security definer
as $$
declare
  v_max bigint;
  v_seq bigint;
begin
  select coalesce(max(NULLIF(right(ticket_no, 3), '')::int), 0) into v_max
  from public.tickets
  where ticket_no like p_prefix || '%';

  insert into public.counters (prefix, seq)
  values (p_prefix, v_max)
  on conflict (prefix)
    do update set seq = greatest(counters.seq, v_max);

  update public.counters
  set seq = seq + 1
  where prefix = p_prefix
  returning seq into v_seq;

  return p_prefix || lpad(v_seq::text, 3, '0');
end;
$$;

-- เปิดใช้ผ่าน RPC ได้ (service_role ข้าม RLS อยู่แล้ว)
grant execute on function public.next_ticket_no(text) to anon, authenticated, service_role;