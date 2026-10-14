# ระบบแจ้งซ่อมอุปกรณ์ IT ผ่าน LINE OA

ระบบรับแจ้งซ่อม/ซ่อมบำรุงอุปกรณ์ IT สำหรับพนักงานภายใน พร้อมหน้าผู้ดูแล (admin)
รองรับการแจ้งซ่อมผ่าน LINE OA, การติดตามสถานะ, งานภาคสนาม, ค่าเดินทาง, โน้ตงาน,
โน้ตรหัสผ่าน และการพิมพ์เอกสาร PDF

## ความต้องการของระบบ
- Node.js 18+ (แนะนำ 20+)
- บัญชี Supabase และ/หรือ PostgreSQL สำหรับเก็บข้อมูล
- (ทางเลือก) Cloudinary สำหรับเก็บรูป — ถ้าไม่ตั้งจะใช้ Supabase Storage

## การติดตั้ง

```bash
npm install
```

## การตั้งค่า

คัดลอกไฟล์ตัวอย่างแล้วเติมค่าจริง:

```bash
copy .env.example .env
```

ตัวแปรสำคัญ (ดูรายละเอียดใน `.env.example`):

| ตัวแปร | ความหมาย |
| --- | --- |
| `ADMIN_USER` / `ADMIN_PASS` | บัญชีผู้ดูแลระบบ |
| `ADMIN_SECRET` | คีย์เซ็น session ของ admin — สุ่มยาว ๆ (`openssl rand -hex 48`) |
| `USER_SECRET` / `VISITOR_SECRET` | (แนะนำ) แยกคีย์ตามชนิดผู้ใช้ ถ้าว่างจะใช้ `ADMIN_SECRET` |
| `TRUST_PROXY` | จำนวนชั้น reverse proxy ที่เชื่อถือได้ (nginx 1 ชั้น = `1`) — ห้ามใส่ `true` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | การเชื่อมต่อ Supabase |
| `PG_HOST` ฯลฯ | การเชื่อมต่อ PostgreSQL ตรง |
| `ALLOWED_DB_HOSTS` | รายการ host ฐานข้อมูลที่อนุญาตเพิ่มเติม (คั่นด้วย `,`) |
| `PASSWORD_NOTE_KEY` | base64 ของคีย์ 32 ไบต์ (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) |
| `PASSWORD_NOTE_PIN` / `PASSWORD_NOTE_PASS` | ยืนยันตัวตนก่อนใช้โน้ตรหัสผ่าน |
| `VISITOR_KEYPASS_PEPPER` / `VISITOR_KEYPASS_ENC_KEY` | คีย์สำหรับ Key Pass ผู้ใช้ภายนอก (ห้ามเปลี่ยน) |
| `LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | LINE Login / Messaging API |

> ค่า `PASSWORD_NOTE_PIN`, `PASSWORD_NOTE_PASS` และ `ADMIN_PASS` ต้องเป็นค่าที่คาดเดายาก ห้ามใช้ค่า default

## ฐานข้อมูล

รันไฟล์ SQL ในโฟลเดอร์ `Database/` บน Supabase ตามลำดับที่จำเป็น (schema ก่อน แล้วจึง migrate)
เช่น `supabase-schema.sql`, `supabase-migrate-*.sql`

## การรัน

```bash
npm start        # เริ่มเซิร์ฟเวอร์ (ค่าเริ่มต้น http://localhost:3000)
npm run check    # ตรวจ syntax ของโมดูลฝั่งเซิร์ฟเวอร์
```

หน้าใช้งานหลัก: `/` (แจ้งซ่อม) · `/my-tickets.html` (งานของฉัน) · `/admin.html` (ผู้ดูแล)

## การ deploy บน Vercel

ตั้งค่า environment variables ให้ครบ แล้ว deploy — `vercel.json` กำหนด build เป็น `server.js`
หมายเหตุ: การเขียนไฟล์ `.env` จากหน้า admin-db จะไม่ทำงานบน Vercel (ระบบไฟล์อ่านอย่างเดียว)

## ความปลอดภัย

ดูรายงานและ checklist การแก้ไขที่ [`SECURITY.md`](./SECURITY.md)
