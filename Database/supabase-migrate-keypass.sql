-- Migration: ระบบ Key Pass (แทนรหัสผ่าน/ชื่อผู้ใช้)
--
-- หลักการ
--   * ผู้ใช้กรอกชื่อ + ตำแหน่ง แล้วใช้งานได้ทันที ไม่ต้องตั้งรหัสผ่าน
--   * ระบบสุ่ม Key Pass 5 ตัว (A-Z ไม่รวม I L O + 2-9 = 31 ตัว, 31^5 = 28,629,151 แบบ)
--   * Key Pass แสดงครั้งเดียวเท่านั้น ระบบไม่เก็บค่าต้นฉบับ
--   * เก็บ 2 ชั้น: keypass_lookup (HMAC-SHA256 + pepper, ใช้ index หา O(1))
--                 keypass_hash   (scrypt v1, key = pepper ได้ 64 bytes, ใช้ยืนยันซ้ำ)
--   * คอลัมน์ username / password_hash / password_enc คงไว้ (ปล่อยว่าง) เพื่อย้อนกลับได้

-- 1) คอลัมน์ใหม่
alter table public.external_visitors
  add column if not exists keypass_lookup text default '';
comment on column public.external_visitors.keypass_lookup is 'HMAC-SHA256(KeyPass + VISITOR_KEYPASS_PEPPER) — ใช้ค้นหาแบบ index (ว่าง = ยังไม่ออก Key Pass)';

alter table public.external_visitors
  add column if not exists keypass_hash text default '';
comment on column public.external_visitors.keypass_hash is 'scrypt$salt$hash ของ Key Pass (ไม่เก็บค่าต้นฉบับ)';

alter table public.external_visitors
  add column if not exists keypass_at timestamptz;
comment on column public.external_visitors.keypass_at is 'เวลาที่ออก Key Pass ล่าสุด (null = ยังไม่มี)';

-- 2) ดัชนี: Key Pass ต้องไม่ซ้ำ
create unique index if not exists external_visitors_keypass_lookup_key
  on public.external_visitors (keypass_lookup)
  where keypass_lookup <> '';

create index if not exists external_visitors_keypass_idx
  on public.external_visitors (keypass_at);

-- 3) ล้าง credential เดิมให้ว่าง เพื่อไม่ให้มีข้อมูลลับค้างอยู่ (ย้อนกลับไม่ได้ — ถ้าจำเป็นให้สำรองก่อนรัน)
update public.external_visitors
   set password_enc = ''
 where password_enc <> '';

update public.external_visitors
   set password_hash = ''
 where password_hash <> '';

-- 4) ตรวจ Key Pass ซ้ำในข้อมูลเดิม (ถ้าคืน > 0 แถว แปลว่ามี keypass_lookup เหมือนกัน ต้องแก้ก่อนใช้งาน)
select keypass_lookup, count(*) as dup
  from public.external_visitors
 where keypass_lookup <> ''
 group by keypass_lookup
having count(*) > 1;
