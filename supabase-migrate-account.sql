-- =============================================================
-- Migration: บัญชีผู้ใช้หน้าเว็บ (user / password) + ตัดการล็อกอินด้วย IP
-- คำสั่ง: Supabase Dashboard -> SQL Editor -> New query -> วาง -> Run
-- รันซ้ำได้ ไม่ลบข้อมูลเดิม
-- =============================================================

-- 1) external_visitors: บัญชีสำหรับเข้าสู่ระบบของผู้ใช้ภายนอก
alter table public.external_visitors add column if not exists username text default '';
comment on column public.external_visitors.username is 'ชื่อผู้ใช้สำหรับเข้าสู่ระบบ (หน้าเว็บผู้ใช้)';

alter table public.external_visitors add column if not exists password_hash text default '';
comment on column public.external_visitors.password_hash is 'scrypt$salt$hash — ใช้ตรวจสอบรหัสผ่านตอนเข้าสู่ระบบ';

alter table public.external_visitors add column if not exists password_enc text default '';
comment on column public.external_visitors.password_enc is 'AES-256-GCM ของรหัสผ่าน ใช้แสดงค่าเดิมในหน้าตั้งค่าของผู้ใช้';

alter table public.external_visitors add column if not exists credentials_at timestamptz;
comment on column public.external_visitors.credentials_at is 'วันที่ตั้ง user/password ครั้งแรก (null = ผู้ใช้เก่าที่ยังไม่ได้ตั้ง)';

-- 2) username ต้องไม่ซ้ำ (ไม่สนตัวพิมพ์) — ข้ามแถวที่ยังไม่ได้ตั้ง username
create unique index if not exists external_visitors_username_key
  on public.external_visitors (lower(username))
  where username <> '';

-- 3) ดัชนีช่วยค้นหาบัญชี
create index if not exists external_visitors_credentials_idx
  on public.external_visitors (credentials_at);

-- 4) อนุญาตให้ service role อ่าน-เขียน (ปลอดภัยที่สุด — คอมเมนต์ 2 บรรทัดถัดไปถ้ารันซ้ำ)
alter table public.external_visitors enable row level security;

-- 5) ตรวจสอบผล (ควรได้ 0 แถว ถ้าได้ > 0 แปลว่ามี username ซ้ำ ให้แก้ให้ไม่ซ้ำก่อน)
select lower(username) as username, count(*) as dup
from public.external_visitors
where username <> ''
group by lower(username)
having count(*) > 1;
