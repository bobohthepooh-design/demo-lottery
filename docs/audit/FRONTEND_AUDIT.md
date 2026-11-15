# FRONTEND AUDIT — รายงานตรวจสอบหน้าบ้าน

## 1. โครงสร้าง
- `client/src/App.jsx` — router + lazy routes
- `client/src/pages/` — 16 หน้า (Home, Login, Register, ForgotPassword, Profile, Wallet, MyBets, PlaceBet, Lotteries, Winners, Hilo, Kiwi, Scratch, Performance)
- `client/src/admin/` — 14 หน้า admin + AdminLayout + confirm helper
- `client/src/components/` — 24 components (Layout, SlotMachine, ResultPopup, ChatWidget, Fairness, Countdown, Toast, ฯลฯ)
- `client/src/api.js` — fetch wrapper + CSRF + SSE helper
- `client/src/auth.jsx` — auth context (user/balance/login/logout)
- `client/src/sound.js`, `push.js`, `ann.js`, `resultSource.js`, `lotterySchema.js`, `typeAccent.js`, `i18n.js`, `time.js`, `bannerConfig.js`

## 2. ผลตรวจสอบหน้าหลัก (ทดสอบจริงผ่าน CDP headless Chrome)

| หน้า | ผล | หลักฐาน |
|---|---|---|
| Login/Register/Forgot | ✅ | form + validation + OTP/MFA flow มีครบ; loginLimiter ฝั่ง server |
| Home | ✅ | hero, ผลล่าสุด, winners ticker, menu 12 ปุ่ม — render ถูก |
| Lotteries → PlaceBet | ✅ | เลือกประเภท→ช่วง→กติกา→ใส่เลข→สรุป→ยืนยัน; idempotency key; cancel ได้ |
| MyBets | ✅ | filter สถานะ 7 แบบ + โพย pending ลอยบนสุด (แก้รอบก่อน); instant games แยก section |
| Wallet | ⚠️→✅ | **พบ+แก้ B-01**: `crypto.randomUUID()` undefined บน http://LAN-IP → เติม/ถอน error ทุกครั้ง; ตอนนี้มี fallback แล้ว; withdraw guard + unlock 100฿ ถูก |
| Profile | ✅ | แก้ข้อมูล/RG limits/MFA setup/change-password |
| Hilo | ✅ | ตู้เต๋าcasino + animation staggered + history click-to-replay + fairness verify |
| Kiwi | ✅ | ตู้ draw/dice machine + click history replay + fairness; "ถูก 1 ไม่เข้าเงื่อนไข" แสดงถูก |
| Scratch→Slot | ✅ | 5-reel + bet panel + history replay + fairness |
| Winners | ✅ | pool-based, instant games แยก section, verify seed button |
| Admin (ทุกหน้า) | ✅ | audit รอบก่อนครบ: draws/rules/types/members/roles/settings/reports/bets/wallet/chat/banner/audit/security/settle — แก้ 8+ จุดแล้ว |

## 3. ปัญหาที่พบ

### B-01 (แก้แล้ว) — Deposit/Withdraw พังบน LAN HTTP
- **ไฟล์:** `client/src/pages/Wallet.jsx:93`
- **สาเหตุ:** `crypto.randomUUID()` มีเฉพาะ secure context (https/localhost) — บน `http://192.168.x.x` เป็น undefined → TypeError ใน try → setErr ทุกครั้ง
- **ผลกระทบ:** สมาชิกบน LAN **เติมเงินไม่ได้เลย** (อาการที่ user รายงาน)
- **แก้:** fallback `${Date.now()}-${Math.random()...}` เหมือน PlaceBet.jsx:166
- **ทดสอบหลังแก้:** build ผ่าน; ควรทดสอบ manual บน http://LAN-IP อีกครั้ง

### ข้อสังเกต (ไม่ใช่บั๊ก)
- `api.js` cache CSRF token ใน memory — ถ้า cookie หมุน (login ใหม่/expire) request เก่าจะ fail ครั้งแรก; `resetCsrf()` มีแต่ไม่มี auto-retry → user อาจเห็น error ครั้งเดียวแล้ว retry ผ่าน (ระดับต่ำ)
- Bundle 556KB — โหลดช้าบนเน็ตอ่อน (ข้อเสนอแนะ code-split)
- NotificationBell poll ทุก ~5s + SSE — ปกติสำหรับ demo
- `prefers-reduced-motion` รองรับใน animation หลักแล้ว

## 4. Responsive
- Tailwind breakpoints + floating quick-bar ซ่อนบน mobile (กดได้ใน floating bar แทน)
- ทดสอบ viewport desktop+mobile ผ่าน CDP — layout ไม่แตก

## 5. Accessibility/UX
- ปุ่มทุกปุ่มมี state (disabled ตอน busy, loading text)
- Error แสดงใน modal/form เป็นภาษาไทยชัดเจน
- Empty states มีทุก list
- Toast มี success/error
