-- ============================================================
-- ระบบบันทึกอุปกรณ์ที่นำมาซ่อม (Repair Intake) — ฝั่ง ADMIN
-- วิธีใช้: เปิด Supabase Dashboard -> SQL Editor -> วางไฟล์นี้ -> Run
--   (เพิ่มเฉพาะ 1 ตารางใหม่ ไม่แตะตารางเดิม)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.repair_intakes (
  id                  serial PRIMARY KEY,
  intake_no           text UNIQUE NOT NULL DEFAULT '',   -- RPR-001
  device_type         text NOT NULL DEFAULT '',          -- ประเภทอุปกรณ์ (จาก device_categories)
  model               text NOT NULL DEFAULT '',          -- ชื่อรุ่น
  branch              text NOT NULL DEFAULT '',          -- รหัสสาขา '1' '3' '4' '5'
  photo_url           text NOT NULL DEFAULT '',          -- รูปภาพอุปกรณ์
  symptom_photo_url   text NOT NULL DEFAULT '',          -- รูปภาพอาการเสีย
  detail              text NOT NULL DEFAULT '',          -- รายละเอียดอาการเสีย
  status              text NOT NULL DEFAULT 'ดำเนินการซ่อม',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- เพิ่มคอลัมน์ให้ตารางเก่า (ถ้ารันสคริปต์นี้ซ้ำ)
ALTER TABLE public.repair_intakes ADD COLUMN IF NOT EXISTS intake_no         text NOT NULL DEFAULT '';
ALTER TABLE public.repair_intakes ADD COLUMN IF NOT EXISTS device_type       text NOT NULL DEFAULT '';
ALTER TABLE public.repair_intakes ADD COLUMN IF NOT EXISTS model             text NOT NULL DEFAULT '';
ALTER TABLE public.repair_intakes ADD COLUMN IF NOT EXISTS branch            text NOT NULL DEFAULT '';
ALTER TABLE public.repair_intakes ADD COLUMN IF NOT EXISTS photo_url         text NOT NULL DEFAULT '';
ALTER TABLE public.repair_intakes ADD COLUMN IF NOT EXISTS symptom_photo_url text NOT NULL DEFAULT '';
ALTER TABLE public.repair_intakes ADD COLUMN IF NOT EXISTS detail            text NOT NULL DEFAULT '';
ALTER TABLE public.repair_intakes ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'ดำเนินการซ่อม';

CREATE INDEX IF NOT EXISTS repair_intakes_created_at_idx ON public.repair_intakes (created_at DESC);
CREATE INDEX IF NOT EXISTS repair_intakes_status_idx     ON public.repair_intakes (status);

-- ---------- RLS ----------
-- ระบบนี้เข้าถึงผ่าน service role key จาก server เท่านั้น
ALTER TABLE public.repair_intakes ENABLE ROW LEVEL SECURITY;
