-- ============================================================
-- ระบบบันทึกปฏิบัติงานนอกสถานที่ (Field Work) — ฝั่ง ADMIN
-- วิธีใช้: เปิด Supabase Dashboard -> SQL Editor -> วางไฟล์นี้ -> Run
--   (เพิ่มเฉพาะ 1 ตารางใหม่ ไม่แตะตารางเดิม)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.field_work_logs (
  id                   serial PRIMARY KEY,
  -- เชื่อมกับระบบบันทึกรายการแจ้งซ่อม (ดึงข้อมูลมาใช้ได้ แต่ไม่บังคับ)
  ticket_id            integer REFERENCES public.tickets(id) ON DELETE SET NULL,
  ticket_no            text NOT NULL DEFAULT '',
  source_mode          text NOT NULL DEFAULT 'manual',   -- 'manual' = พิมเอง, 'ticket' = ดึงจากระบบแจ้งซ่อม

  -- วันที่ / เวลา ที่ปฏิบัติงาน
  work_date            date NOT NULL DEFAULT CURRENT_DATE,
  work_time            time NOT NULL DEFAULT CURRENT_TIME,

  -- สถานที่ + รายละเอียดงาน
  location             text NOT NULL DEFAULT '',
  detail               text NOT NULL DEFAULT '',

  -- เวลาเดินทาง 4 ช่อง (พิมเองทั้งหมด)
  depart_branch_time   time,
  arrive_site_time     time,
  depart_site_time     time,
  arrive_branch_time   time,

  -- ไฟล์แนบหลักฐาน (เอกสาร / งานที่ไปทำ)
  attachments_json     jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- ผู้บันทึก
  recorder_name        text NOT NULL DEFAULT '',
  recorder_id          integer REFERENCES public.external_visitors(id) ON DELETE SET NULL,

  note                 text NOT NULL DEFAULT '',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- เพิ่มคอลัมน์ให้ตารางเก่า (ถ้ารันสคริปต์นี้ซ้ำ)
ALTER TABLE public.field_work_logs ADD COLUMN IF NOT EXISTS ticket_id           integer;
ALTER TABLE public.field_work_logs ADD COLUMN IF NOT EXISTS ticket_no           text NOT NULL DEFAULT '';
ALTER TABLE public.field_work_logs ADD COLUMN IF NOT EXISTS source_mode         text NOT NULL DEFAULT 'manual';
ALTER TABLE public.field_work_logs ADD COLUMN IF NOT EXISTS depart_branch_time  time;
ALTER TABLE public.field_work_logs ADD COLUMN IF NOT EXISTS arrive_site_time    time;
ALTER TABLE public.field_work_logs ADD COLUMN IF NOT EXISTS depart_site_time    time;
ALTER TABLE public.field_work_logs ADD COLUMN IF NOT EXISTS arrive_branch_time  time;
ALTER TABLE public.field_work_logs ADD COLUMN IF NOT EXISTS attachments_json    jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.field_work_logs ADD COLUMN IF NOT EXISTS recorder_name       text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS field_work_logs_created_at_idx ON public.field_work_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS field_work_logs_work_date_idx  ON public.field_work_logs (work_date DESC);
CREATE INDEX IF NOT EXISTS field_work_logs_ticket_idx     ON public.field_work_logs (ticket_no);

-- ---------- RLS ----------
-- ระบบนี้เข้าถึงผ่าน service role key จาก server เท่านั้น
ALTER TABLE public.field_work_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS field_work_logs_all ON public.field_work_logs;
