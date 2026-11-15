# API AUDIT — รายงานตรวจสอบ API

Base: `http://localhost:4000/api` — ทดสอบจริงด้วย curl + session จริง

## 1. Public endpoints (ไม่ต้อง auth)

| Method | Path | ผล | หมายเหตุ |
|---|---|---|---|
| GET | `/health` | ✅ 200 | liveness |
| GET | `/lottery/markets` | ✅ 200 | ประเภท+รอบที่เปิด |
| GET | `/lottery/results` | ✅ 200 | ผลล่าสุด |
| GET | `/lottery/winners` | ✅ 200 | ผู้ชนะ (pool-based) |
| GET | `/lottery/public-config` | ✅ 200 | ตั้งค่าสาธารณะ |
| GET | `/push/vapid-key` | ✅ 200 | VAPID public key |
| GET | `/csrf-token` | ✅ 200 | ออก cookie+token คู่ |
| POST | `/auth/register` `/login` `/forgot-password` `/otp/*` `/mfa/*` `/line` `/line/callback` | ✅ | loginLimiter + validation + zod |

## 2. Member endpoints (ต้อง session)

| Method | Path | ผล no-auth | หมายเหตุ |
|---|---|---|---|
| GET | `/auth/me` | ✅ 401 | profile+balance+roles |
| POST | `/auth/logout` `/change-password` `/me/confirm-age` | — | session-bound |
| PATCH | `/auth/me/prefs` `/auth/me/responsible-gambling` | — | GET บน RG = 404 (PATCH only — ถูกต้อง) |
| GET | `/bets/mine` `/bets/wallet` `/bets/draws` `/bets/draws/:id` `/bets/draws/:id/rules` `/bets/slips/:ref` | ✅ 401 | own data only; slip ของคนอื่น → 404 |
| POST | `/bets/place` `/:id/cancel` `/wallet/action` | ✅ CSRF+auth | atomic tx + idempotency |
| GET/POST | `/kiwi/info` `/kiwi/play` `/kiwi/mine` `/kiwi/verify` | ✅ | instant game |
| GET/POST | `/hilo/*` `/scratch/*` | ✅ | instant games |
| GET/POST | `/notifications` `/notifications/read` | ✅ | own only |
| GET/POST | `/chat/*` (member mount) | ✅ | own threads only |
| POST | `/push/subscribe` `/unsubscribe` | ✅ | VAPID |

## 3. Admin endpoints (ต้อง session + MFA + perm)

ทุกตัว mount `/api/admin` + `requireAuth`+`requireMfaVerified`+`requirePerm`:

| กลุ่ม | Endpoints | perm |
|---|---|---|
| Dashboard | `/overview` | `dashboard.admin` |
| Types/Categories/Rules | `/lottery/types[/:id]` `/lottery/categories` `/lottery/rules[/:id]` | `lottery.manage` |
| Draws | `/draws` `/:id` `/:id/status` `/:id/settle` `/:id/settle-preview` `/auto-settle` `/:id/fetch-result` `/:id/result` | `draws.manage` / `results.publish` |
| Bets | `/bets` `/bets/export` | `bets.view_all` |
| Wallet | `/wallet/adjust` `/wallet/transactions` | `wallet.adjust` |
| Members | `/members` `/:id` | `members.manage` |
| Reports | `/reports/summary` | `reports.view` |
| Settings/Promo | `/settings[/:key]` `/promotions/cashback/*` | `settings.manage` |
| Audit/Security | `/audit` `/security-events` | `audit.view`/`security.view` |
| Chat admin | `/api/admin/chat/*` | (mount ก่อน admin.js) |
| Roles | `/roles` `/roles/permissions` | `roles.manage` (+super_admin สำหรับ permissions) |

## 4. ผลทดสอบสิทธิ์ (จริง)

| เคส | ผลจริง | คาดหวัง |
|---|---|---|
| Public endpoint ไม่มี auth | 200 | ✅ |
| Member endpoint ไม่มี auth (9 ตัว) | 401 ทั้งหมด | ✅ |
| Admin endpoint ไม่มี auth (7 ตัว) | 401 ทั้งหมด | ✅ |
| Member→admin (overview/members/settings/wallet-adjust) | 403 ทั้งหมด | ✅ |
| Member→slip ของ user อื่น (`BET-20261110-2CGCJI` ของ user 13) | 404 | ✅ ไม่รั่ว |
| POST mutating ไม่มี CSRF token | `CSRF_FAILED` | ✅ |
| GET `/me/responsible-gambling` | 404 | ✅ (PATCH only) |
| GET `/chat/rooms` | 404 | ✅ (route จริงคือ `/chat/` ฯลฯ) |

## 5. Validation & Error format
- ทุก route สำคัญใช้ Zod → 400 พร้อมข้อความไทย
- Error กลาง: `{error: "...", code?: "..."}` consistent
- Rate limit: `/api/` global limiter + loginLimiter เข้มบน auth

## 6. ปัญหา/ข้อสังเกต
- ไม่มี API versioning (`/api/v1`) — demo-acceptable
- ไม่มี pagination มาตรฐานบนบาง list (bets/mine, audit) — ระดับต่ำ ถ้าข้อมูลโต
- `GET /api/auth/status` ไม่มี — frontend ใช้ `/auth/me` แทน (ถูกต้อง)
