# รายงานความปลอดภัย — ระบบแจ้งซ่อมอุปกรณ์ IT ผ่าน LINE OA

เอกสารนี้สรุปผลการตรวจสอบ (security audit) โครงสร้างและช่องโหว่ของระบบ
พร้อมแผนการแก้ไขและสถานะการดำเนินการ

- อัปเดตล่าสุด: 2026-10-14
- ผู้ตรวจสอบ: security review (read-only) + remediation
- ขอบเขต: `server.js`, `config.js`, `cloudinary.js`, `supabase.js`, `db-adapter.js`,
  `db-migrate.js`, `notify.js`, `*.pdf` modules, `public/**`, `Database/*.sql`, `vercel.json`, `.env.example`

---

## 1. ภาพรวมสถาปัตยกรรม

| ส่วน | รายละเอียด |
| --- | --- |
| Runtime | Node.js + Express 4 (`server.js` ไฟล์เดียว ~3,700 บรรทัด) |
| ฐานข้อมูล | Supabase (service_role) หรือ PostgreSQL ตรง — สลับผ่าน `db-adapter.js` |
| ที่เก็บไฟล์ | Cloudinary (ถ้าตั้งค่า) ไม่เช่นนั้นใช้ Supabase Storage bucket `photos` |
| PDF | pdfkit (ฝั่ง server) + html2canvas/jsPDF (ฝั่ง client) + puppeteer-core |
| Auth | Cookie HttpOnly ที่เซ็นด้วย HMAC-SHA256 (`admin_token`, `su_token`, `vst_token`, `visitor_token`) |
| Frontend | static ใน `public/` (index, ticket, my-tickets, admin, admin-mobile, admin-db, travel-print, repair-intake-print) |
| Deploy | Vercel (`vercel.json`) หรือรันเองด้วย `npm start` |

### ระดับความรุนแรง
- **วิกฤต (Critical)** — ยึดระบบ/ข้อมูลได้ทันที
- **สูง (High)** — เพิ่มความเสี่ยงอย่างมีนัยสำคัญ
- **กลาง (Medium)** — ต้องมีเงื่อนไขประกอบ
- **ต่ำ (Low)** — ปัญหาสุขภาวะ/ความแข็งแรงของโค้ด

---

## 2. สรุปช่องโหว่และสถานะ

| ID | ระดับ | ช่องโหว่ | ตำแหน่ง | สถานะ |
| --- | --- | --- | --- | --- |
| SEC-01 | วิกฤต | `/api/admin/db-config` ส่ง service_role key / secret key / PG password กลับเป็น plaintext | `server.js` (db-config), `public/admin-db.html` | ✅ แก้แล้ว |
| SEC-02 | วิกฤต | Rate limit บายพาสได้ด้วยการปลอม `X-Forwarded-For` | `server.js` (`trust proxy`/`clientIp`) | ✅ แก้แล้ว |
| SEC-03 | วิกฤต | HMAC secret ตัวเดียวใช้เซ็นทุก token + default ว่าง | `server.js`, `config.js` | ✅ แก้แล้ว |
| SEC-04 | สูง | ค่า default อ่อนถูก commit ใน `.env.example` และใช้จริง | `.env.example`, `.env` | ✅ แก้แล้ว (ควร rotate ค่าจริงต่อ) |
| SEC-05 | สูง | `PASSWORD_NOTE_KEY` ไม่ใช่ 32-byte base64 → fallback เงียบ | `server.js`, `.env` | ✅ แก้แล้ว |
| SEC-06 | สูง | ไม่มี security headers (CSP/clickjacking/MIME sniffing/HSTS) | `server.js`, `vercel.json` | ✅ แก้แล้ว |
| SEC-07 | สูง | ไม่ validate ชนิดไฟล์อัปโหลดจริง + ลิมิตหลวม | `server.js` (multer/`verifyMagic`) | ✅ แก้แล้ว |
| SEC-08 | สูง | `db-test`/`db-switch`/`save-pg` เชื่อม host/port อะไรก็ได้ (SSRF) | `server.js` (`isAllowedDbHost`) | ✅ แก้แล้ว |
| SEC-09 | กลาง | ไม่มี CSRF token (พึ่ง SameSite=Lax อย่างเดียว) | `server.js`, `public/csrf.js` | ✅ แก้แล้ว |
| SEC-10 | กลาง | Stored XSS จาก device-option `icon_url`/`name` | `public/admin.html`, `public/admin-mobile.html` | ✅ แก้แล้ว |
| SEC-11 | กลาง | ไฟล์ `.xlsx` (แบบฟอร์มเบิกค่าเดินทาง) เสิร์ฟ public | ย้ายไป `private/` | ✅ แก้แล้ว |
| SEC-12 | ต่ำ | `express.json()` ลงทะเบียนซ้ำ | `server.js` | ✅ แก้แล้ว |
| SEC-13 | ต่ำ | dead config `TURNSTILE_*` | `.env` | ✅ แก้แล้ว |
| SEC-14 | ต่ำ | ไฟล์/ฟอนต์ที่ไม่เกี่ยวข้องถูก commit | `fonts/`, `public/` | ✅ แก้แล้ว |
| SEC-15 | ต่ำ | ไม่มี lint/test script, `README.md` ไม่สมบูรณ์ | `package.json`, `README.md` | ✅ แก้แล้ว |

---

## 3. รายละเอียดช่องโหว่

### SEC-01 — เปิดเผย database secret ผ่าน API (วิกฤต)
`GET /api/admin/db-config` ตอบกลับ `supabase.secretKey`, `supabase.serviceRoleKey`,
`pg.password` เป็นค่าเต็ม ๆ ให้เบราว์เซอร์ และหน้า `public/admin-db.html` มีปุ่ม "เผย" แสดงค่าจริง
- ผลกระทบ: service_role key ของ Supabase = สิทธิ์สูงสุดในฐานข้อมูล; ถ้าแอดมินเครื่องถูกยึด,
  ถูก XSS, หรือมีคนดู devtools/ประวัติเบราว์เซอร์ = ยึด DB ทั้งระบบ
- การแก้: ส่งเฉพาะ metadata ที่ mask (host/port/database/user/ssl + boolean `hasPassword`/`hasSecret`)
  ไม่ส่งค่าลับออกจากเซิร์ฟเวอร์เลย; ปรับ `admin-db.html` ให้เลิกใช้ค่าจริง

### SEC-02 — Rate limit bypass (วิกฤต)
`app.set("trust proxy", true)` + `clientIp()` อ่าน `x-forwarded-for` ก่อน ทำให้ผู้โจมตีหมุน header
เพื่อรีเซ็ต bucket ได้ไม่จำกัด
- ผลกระทบ: ทำลายการป้องกัน brute-force Key Pass (5 ครั้ง/15 นาที, `server.js:1100`)
  และลิมิตเปิดตั๋ว (`server.js:641`); Key Pass 5 ตัวมี space เพียง 31^5 ≈ 28.6 ล้าน
- การแก้: ใช้ `req.ip` หลังตั้ง `trust proxy` ตามจำนวน hop จริง (env `TRUST_PROXY`)
  และเพิ่ม per-identity lockout ต่อบัญชี

### SEC-03 — Secret เดียวสำหรับทุก token (วิกฤต)
`ADMIN_SECRET` ถูกใช้เซ็น admin/user/visitor token ทั้งหมด และ default เป็น `""`
- ผลกระทบ: secret ตัวเดียวหลุด = forge token ได้ทุกชนิด; ถ้าไม่ตั้งค่า token ปลอมได้เลย
- การแก้: แยก `ADMIN_SECRET` / `USER_SECRET` / `VISITOR_SECRET` (fallback เพื่อความเข้ากันได้)
  และเตือน/fail-closed ถ้า secret หลักว่าง

### SEC-04 / SEC-05 — ค่า default อ่อน / คีย์ผิดรูปแบบ (สูง)
`.env.example` ฝัง `PASSWORD_NOTE_PASS=wan2024`, `PASSWORD_NOTE_PIN=741236`, `PASSWORD_NOTE_KEY=wan2024`
และ `.env` จริงใช้ค่าเดียวกัน; `PASSWORD_NOTE_KEY` ไม่ใช่ base64 32 ไบต์ จึง fallback ไปใช้คีย์ที่
derive จาก `ADMIN_SECRET` แบบเงียบ ๆ
- การแก้: ล้างค่า default ใน `.env.example`, บังคับ key ให้ถูกต้อง, สุ่มค่าจริงใหม่ (rotate)

### SEC-06 — ไม่มี Security Headers (สูง)
- การแก้: เพิ่ม middleware ตั้ง header: `Content-Security-Policy`, `X-Frame-Options`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`
  (เมื่อ https) และปิด `X-Powered-By`; เพิ่ม header ระดับ Vercel ใน `vercel.json`

### SEC-07 — อัปโหลดไฟล์ไม่ปลอดภัย (สูง)
ไม่ตรวจ mimetype/magic byte จริง, ไฟล์ไม่รู้จักถูกบังคับเป็น `.jpg`, และรับได้ถึง 12 ไฟล์ × 10 MB
- การแก้: allowlist ชนิดไฟล์, ตรวจ magic byte รูป/เสียง, จำกัดขนาด/จำนวน, แยกโฟลเดอร์ไฟล์แนบ

### SEC-08 — SSRF ผ่าน DB endpoints (สูง)
`db-test`, `db-switch`, `save-pg`, `migrate/*` เปิดให้เชื่อม host/port ที่ผู้ใช้ระบุ และสะท้อน `err.message`
- การแก้: จำกัด host (self-host / Supabase pooler), ตัดข้อความ error ดิบ

### SEC-09 — ไม่มี CSRF (กลาง)
- การแก้: double-submit cookie + header `x-csrf-token` สำหรับ mutation ใน `/api/admin/*`
  พร้อมตรวจ `Origin`; ใช้สคริปต์ฝั่ง client เติม header อัตโนมัติ

### SEC-10 — Stored XSS (กลาง)
`opt.img`, `opt.label`, `dbMatch.icon_url`, `dbMatch.name`, `opt.name` ถูกใส่ใน innerHTML/แอตทริบิวต์โดยไม่ escape
- การแก้: escape ข้อความด้วย `esc()` และตรวจ scheme ของ URL ก่อนใส่ `src`/`href`

### SEC-11 — ไฟล์เอกสารเสิร์ฟ public (กลาง)
- การแก้: ย้ายออกจาก `public/` ไปยังโฟลเดอร์ส่วนตัว (ไม่ถูก static serve)

### SEC-12/13/14/15 — สุขภาวะโค้ด (ต่ำ)
`express.json()` ซ้ำ, dead config, ไฟล์/ฟอนต์ไม่ใช้, ไม่มี lint/test, README ไม่สมบูรณ์

---

## 4. ไฟล์ที่ไม่เกี่ยวข้องกับโปรเจกต์

| ไฟล์ | เหตุผล |
| --- | --- |
| `fonts/TCS-4DenimDEMO.ttf` | ฟอนต์ demo ไม่ถูกอ้างอิง (ใช้จริงเฉพาะ Sarabun) |
| `fonts/TKSongkranTester.ttf` | ฟอนต์ tester ไม่ถูกอ้างอิง |
| `fonts/431PANIYumMamuangDemo-Regular.ttf` | ฟอนต์ demo ไม่ถูกอ้างอิง |
| `public/Favorite Icon.png` | ไม่ถูกอ้างอิง |
| `public/logo-ms/แผนผังวรรณมาพตาพุตสาขา 4/วรรณ 4.png` | ไม่ถูกอ้างอิง |
| `public/เอกเซลเบิกตัวอย่าง/เบิกค่าเดินทาง.xlsx` | เอกสารเสิร์ฟ public (ย้ายออก) |
| `data/mock-seed.json`, `data/mock-96-seed.json` | ข้อมูล mock ไม่ถูกโหลดตอนรัน (gitignore) |

---

## 5. Checklist การแก้ไข

- [x] SEC-01 mask ค่าลับใน `/api/admin/db-config` + ปรับ `admin-db.html`
- [x] SEC-02 แก้ `clientIp`/`trust proxy` (env `TRUST_PROXY`) — ยังเหลือ per-identity lockout (ทำต่อได้)
- [x] SEC-03 แยก secret ต่อ token (`USER_SECRET`/`VISITOR_SECRET`) + fail-safe เมื่อ `ADMIN_SECRET` ว่าง
- [x] SEC-04/05 ล้าง `.env.example`, ตั้ง `PASSWORD_NOTE_KEY` ที่ถูกต้อง, เอกสาร rotate
- [x] SEC-06 เพิ่ม security headers (CSP/XFO/nosniff/HSTS) + `vercel.json`
- [x] SEC-07 validate อัปโหลด (mimetype allowlist + magic byte + error handler)
- [x] SEC-08 จำกัดปลายทาง DB (`ALLOWED_DB_HOSTS`)
- [x] SEC-09 CSRF (double-submit cookie + `public/csrf.js`)
- [x] SEC-10 escape device-option
- [x] SEC-11 ย้าย `.xlsx` ออกจาก `public/` → `private/`
- [x] SEC-12/13/14/15 สุขภาวะโค้ด (ลบ `express.json()` ซ้ำ, ลบ dead config, ลบไฟล์ไม่ใช้, README, npm scripts)

---

## 7. สรุปการเปลี่ยนแปลง (remediation)

| ไฟล์ | การเปลี่ยนแปลง |
| --- | --- |
| `server.js` | trust proxy ตามจำนวนชั้น, security headers, แยก secret, CSRF, mask db-config, allowlist DB host, validate อัปโหลด + error handler, ลบ `express.json()` ซ้ำ |
| `config.js` | เพิ่ม `USER_SECRET`, `VISITOR_SECRET` |
| `.env` | เพิ่ม `TRUST_PROXY=1`, ตั้ง `PASSWORD_NOTE_KEY` ที่ถูกต้อง, ลบ `TURNSTILE_*` |
| `.env.example` | ล้างค่า default อ่อน, เพิ่มคำแนะนำ secret/proxy/allowlist |
| `vercel.json` | เพิ่ม security headers |
| `public/admin-db.html` | เลิกแสดงค่าลับ (แสดงเฉพาะสถานะ) |
| `public/admin.html`, `public/admin-mobile.html` | escape device-option `icon_url`/`name` |
| `public/csrf.js` (ใหม่) | เติม `x-csrf-token` อัตโนมัติ (โหลดในหน้า admin ทั้งหมด) |
| `README.md` | เขียนใหม่ (ติดตั้ง/ตั้งค่า/รัน/deploy) |
| `package.json` | เพิ่ม `check`/`lint`/`audit` |
| `private/` (ใหม่) | ย้ายไฟล์เบิกค่าเดินทางออกจาก public |
| `fonts/`, `public/` | ลบฟอนต์ demo/trial และรูปที่ไม่ถูกอ้างอิง |

### สิ่งที่ยังต้องทำด้วยตนเอง (แนะนำ)
1. Rotate `ADMIN_PASS`, `PASSWORD_NOTE_PIN`, `PASSWORD_NOTE_PASS` ใน `.env` ให้เป็นค่าคาดเดายาก
2. ตั้ง `USER_SECRET` / `VISITOR_SECRET` แยกจาก `ADMIN_SECRET` (จะทำให้ session เดิมต้องล็อกอินใหม่)
3. ตรวจว่า `TRUST_PROXY` ตรงกับจำนวน reverse proxy จริงของระบบ (nginx 1 ชั้น = `1`)
4. พิจารณาลด `unsafe-inline` ใน CSP (ย้ายสคริปต์ inline เป็นไฟล์ + ใช้ nonce)

---

## 6. ข้อเสนอแนะระยะยาว

1. ย้าย CSP จาก `unsafe-inline` ไปใช้ nonce/hash และแยกสคริปต์ inline ออกเป็นไฟล์
2. เก็บ secret ทั้งหมดใน secret manager ของแพลตฟอร์ม ไม่เขียน `.env` จาก runtime
3. เพิ่มการทดสอบอัตโนมัติ (unit/integration) และรัน dependency audit ใน CI
4. ทบทวนสิทธิ์ RLS ของ Supabase และไม่ใช้ service_role key ฝั่ง client เด็ดขาด
5. พิจารณาแยกความยาว Key Pass หรือใช้ magic-link/LINE Login เป็นวิธีหลัก
