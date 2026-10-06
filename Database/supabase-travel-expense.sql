-- ============================================================
-- ระบบบันทึกเบิกค่าเดินทาง (Travel Expense) — ฝั่ง ADMIN
-- วันที่: 2026-09-30
-- วิธีใช้: เปิด Supabase Dashboard -> SQL Editor -> วางไฟล์นี้ -> Run
--   (ระบบอื่นไม่ได้ถูกแตะ เพิ่มเฉพาะ 2 ตารางใหม่)
-- ============================================================

-- ---------- 1) ตารางตั้งค่าระบบ (key-value) ----------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ค่าเริ่มต้นของระบบเบิกค่าเดินทาง
INSERT INTO public.app_settings (key, value) VALUES
  ('fuel_rate_motorcycle', '3'),
  ('fuel_rate_car', '5'),
  ('travel_company', ''),
  ('travel_bank_name', 'กรุงไทย'),
  ('travel_account_name', ''),
  ('travel_bank_account', ''),
  ('travel_claimer_name', ''),
  ('travel_claimer_position', ''),
  ('travel_approver_name', ''),
  ('travel_approver_title', ''),
  ('travel_checker_name', ''),
  ('travel_checker_title', ''),
  ('travel_checker2_name', ''),
  ('travel_checker2_title', ''),
  
  ('travel_vehicle_columns', 'moto,car'),
  ('travel_doc_prefix', 'ใบเบิก')
ON CONFLICT (key) DO NOTHING;

-- อัปเดตค่าเดิมที่ยังเป็น 'TRV' ให้เป็นรูปแบบใหม่
UPDATE public.app_settings SET value = 'ใบเบิก' WHERE key = 'travel_doc_prefix' AND value = 'TRV';

-- ---------- 2) ตารางใบเบิกค่าเดินทาง ----------
CREATE TABLE IF NOT EXISTS public.travel_claims (
  id                 serial PRIMARY KEY,
  doc_no             text UNIQUE,
  claimer_visitor_id integer REFERENCES public.external_visitors(id) ON DELETE SET NULL,
  claimer_name       text NOT NULL DEFAULT '',
  claim_date         date NOT NULL DEFAULT CURRENT_DATE,
  position           text NOT NULL DEFAULT '',
  bank_name          text NOT NULL DEFAULT '',
  bank_account       text NOT NULL DEFAULT '',
  account_name       text NOT NULL DEFAULT '',
  trips_json         jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_km           numeric(12,2) NOT NULL DEFAULT 0,
  total_amount       numeric(12,2) NOT NULL DEFAULT 0,
  note               text NOT NULL DEFAULT '',
  status             text NOT NULL DEFAULT 'รอดำเนินการ',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- เพิ่มคอลัมน์สถานะให้ตารางที่มีอยู่ก่อนแล้ว (ถ้ารันสคริปต์นี้ซ้ำ)
ALTER TABLE public.travel_claims ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'รอดำเนินการ';

CREATE INDEX IF NOT EXISTS travel_claims_created_at_idx ON public.travel_claims (created_at DESC);
CREATE INDEX IF NOT EXISTS travel_claims_claim_date_idx  ON public.travel_claims (claim_date DESC);

-- ---------- 3) เลขที่เอกสารอัตโนมัติ (ใบเบิก-1) ----------
CREATE OR REPLACE FUNCTION public.next_travel_no() RETURNS text AS $$
DECLARE
  n integer;
BEGIN
  -- ล็อกแบบ transaction-scoped กันเลขที่เอกสารซ้ำเมื่อบันทึกพร้อมกันหลายคน
  PERFORM pg_advisory_xact_lock(784421);

  -- ลอกเฉพาะตัวเลขท้าย รองรับทั้งรูปแบบใหม่ "ใบเบิก-1"
  -- และข้อมูลเก่าที่เคยเป็น "TRV-000001"
  SELECT COALESCE(MAX((regexp_replace(doc_no, '\D', '', 'g'))::bigint), 0) + 1
    INTO n
    FROM public.travel_claims
   WHERE doc_no IS NOT NULL
     AND doc_no ~ '^\D+\d+$';

  RETURN 'ใบเบิก-' || n::text;
END;
$$ LANGUAGE plpgsql;

-- ---------- 4) helper: อ่านค่าตั้งค่า ----------
CREATE OR REPLACE FUNCTION public.get_app_setting(p_key text) RETURNS text AS $$
  SELECT value FROM public.app_settings WHERE key = p_key;
$$ LANGUAGE sql;

-- ---------- 5) helper: เขียนค่าตั้งค่า ----------
CREATE OR REPLACE FUNCTION public.set_app_setting(p_key text, p_value text) RETURNS text AS $$
  INSERT INTO public.app_settings (key, value, updated_at)
  VALUES (p_key, coalesce(p_value, ''), now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now()
  RETURNING value;
$$ LANGUAGE sql;

-- ---------- 6) helper: บันทึกใบเบิกพร้อมเลขที่อัตโนมัติ ----------
CREATE OR REPLACE FUNCTION public.create_travel_claim(p_claim jsonb) RETURNS jsonb AS $$
DECLARE
  v_doc text;
  v_row public.travel_claims%ROWTYPE;
BEGIN
  v_doc := public.next_travel_no();

  INSERT INTO public.travel_claims (
    doc_no, claimer_visitor_id, claimer_name, claim_date, position,
    bank_name, bank_account, account_name, trips_json,
    total_km, total_amount, note, status
  ) VALUES (
    v_doc,
    NULLIF(p_claim->>'claimer_visitor_id','')::integer,
    coalesce(p_claim->>'claimer_name', ''),
    coalesce(nullif(p_claim->>'claim_date', '')::date, CURRENT_DATE),
    coalesce(p_claim->>'position', ''),
    coalesce(p_claim->>'bank_name', ''),
    coalesce(p_claim->>'bank_account', ''),
    coalesce(p_claim->>'account_name', ''),
    coalesce(nullif(p_claim->>'trips_json', '')::jsonb, '[]'::jsonb),
    coalesce(nullif(p_claim->>'total_km', '')::numeric, 0),
    coalesce(nullif(p_claim->>'total_amount', '')::numeric, 0),
    coalesce(p_claim->>'note', ''),
    CASE WHEN p_claim->>'status' IN ('กำลังดำเนินการ','รอดำเนินการ','เสร็จสิ้น')
         THEN p_claim->>'status' ELSE 'รอดำเนินการ' END
  ) RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$ LANGUAGE plpgsql;

-- ---------- 7) RLS ----------
ALTER TABLE public.app_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_claims ENABLE ROW LEVEL SECURITY;

-- ระบบนี้เข้าถึงผ่าน service role key จาก server เท่านั้น
DROP POLICY IF EXISTS app_settings_all   ON public.app_settings;
DROP POLICY IF EXISTS travel_claims_all  ON public.travel_claims;
