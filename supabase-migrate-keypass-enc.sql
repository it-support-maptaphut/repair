-- Migration (เพิ่มรอบ 2): ให้ผู้ใช้ดู/คัดลอก Key Pass ของตัวเองได้ในหน้า Settings
--
-- หลักการเดิม (supabase-migrate-keypass.sql) เก็บแค่ hash จึงยืนยันการเข้ารหัสได้
-- แต่ผู้ใช้ไม่มีทาง "ดู Key Pass ของตัวเองได้" ต้องคอยถามฝ่าย IT เสมอ
-- ไฟล์นี้เพิ่มคอลัมน์ keypass_enc เก็บ Key Pass แบบเข้ารหัส (AES-256-GCM)
-- ผูกกับ VISITOR_KEYPASS_ENC_KEY ใน .env ของเซิร์ฟเวอร์
--   * แม้ DB รั่วหรือสำรองข้อมูลออกไป อ่านค่า Key Pass ไม่ออกถ้าไม่มีคีย์บนเซิร์ฟเวอร์
--   * ผู้ใช้กด "แสดง Key Pass" ในหน้า ตั้งค่า เพื่อดู/คัดลอก กลับเข้าบัญชีเดิมจากเครื่องอื่นเอง
--
-- ข้อควรระวัง:
--   * ผู้ใช้ที่ถูกออก Key Pass ไปก่อนรันไฟล์นี้จะยังไม่มี keypass_enc (คอลัมน์ว่าง)
--     -> ดูไม่ได้ใน Settings ต้องให้แอดมินกด "Key Pass" ในตารางผู้ใช้เพื่อออกใหม่
--   * ต้องใส่ VISITOR_KEYPASS_ENC_KEY ใน .env ของเซิร์ฟเวอร์ด้วย (ห้ามเปลี่ยนภายหลัง)
--     เพราะถ้าเปลี่ยน จะถอดรหัส keypass_enc เดิมทั้งหมดไม่ออก (เข้าใช้งานด้วย Key Pass
--     ยังปกติ เพราะยืนยันด้วย hash ที่ไม่ได้ผูกกับคีย์นี้)

alter table public.external_visitors
  add column if not exists keypass_enc text default '';
comment on column public.external_visitors.keypass_enc is 'Key Pass เวอร์ชันเข้ารหัส AES-256-GCM ด้วย VISITOR_KEYPASS_ENC_KEY ใช้ให้ผู้ใช้ดู/คัดลอกในหน้า Settings (ว่าง = ผู้ใช้เก่าที่ยังไม่ได้ออกใหม่)';