# SECURITY AUDIT — รายงานตรวจสอบความปลอดภัย (OWASP-aligned)

## 1. Authentication & Session
| รายการ | ผล | หลักฐาน |
|---|---|---|
| Password hashing | ✅ bcrypt | `lib/password.js` |
| Session token | ✅ HttpOnly + SameSite cookie `dl_session` | auth.js |
| Session expiry + revoke | ✅ status check ทุก request; reset password → revoke all | authService |
| MFA (TOTP) | ✅ setup/enable/verify; admin บังคับ verified | middleware/rbac |
| OTP (SMS/phone) | ✅ request+verify + rate limit | auth.js |
| Login brute-force | ✅ `loginLimiter` + OTP limiter | index.js |
| LINE Login | ⚠️ route มี แต่ไม่ได้ทดสอบกับ LINE จริง | auth.js `/line` `/line/callback` |

## 2. Authorization
| รายการ | ผล |
|---|---|
| Member→admin endpoints | ✅ 403 ทุกตัว (ทดสอบจริง 4 endpoints) |
| IDOR slip/user data | ✅ slip ของ user อื่น → 404 |
| Admin→member data | ✅ perm `members.manage`/`bets.view_all` ฯลฯ ครบ |
| Self-lock/delete | ✅ admin ล็อก/ลบตัวเองถูก block (แก้รอบก่อน) |
| Super-admin role mgmt | ✅ เฉพาะ super_admin แก้ permissions; กัน non-super แตะ super |
| RBAC enforcement | ✅ `requirePerm` ทุก admin route; `requireMfaVerified` |

## 3. Input Validation & Injection
| รายการ | ผล |
|---|---|
| SQL injection | ✅ parameterized queries ทั้งหมด (node:sqlite prepare) — ไม่พบ string concat ใน query |
| XSS | ✅ React escape default; ไม่มี `dangerouslySetInnerHTML` ในจุดเสี่ยง; announcement/banner text render เป็น text |
| CSRF | ✅ double-submit HMAC cookie+header ทุก `/api/` mutating |
| Zod validation | ✅ ทุก route สำคัญ; bet slip validate number/stake/count/range |
| File upload | ✅ ไม่มี upload endpoint (demo) |
| Rate limit | ✅ global `/api/` limiter + loginLimiter; ไม่มี per-endpoint limit บน bets (ระดับต่ำ) |

## 4. Data Protection
| รายการ | ผล |
|---|---|
| Secrets ใน code | ✅ `.env` ignored; `config.js` อ่าน env; ไม่มี hardcode secret (ตรวจแล้ว) |
| Password ใน logs/audit | ✅ audit ไม่เก็บ password (แก้รอบก่อน) |
| Sensitive data exposure | ✅ API คืนเฉพาะ field จำเป็น; slip ของคนอื่น → 404 |
| HTTPS/TLS | ⚠️ deploy http:// LAN/local เท่านั้น — ไม่มี TLS (demo-acceptable แต่ควร note) |
| CORS | ✅ same-origin (static+API port เดียวกัน); ไม่มี CORS เปิดกว้าง |

## 5. Business Logic Security
| รายการ | ผล |
|---|---|
| Double-spend | ✅ wallet version-check + tx atomic + idempotency_key unique |
| Bet after close | ✅ check `draw.status='open'` + `now<close_at` ใน TX |
| Edit slip after place | ✅ slips write-once; cancel เท่านั้นก่อน close |
| Cancel after draw | ✅ status check |
| Negative balance | ✅ CHECK/validation + version guard; DB audit = 0 ติดลบ |
| Withdraw rules | ✅ unlock 100฿ + pending-slip block + withdrawable calc (promo excluded) |
| Instant game fairness | ✅ server seed commit→reveal; verify endpoint; client ไม่ส่งผลเอง |

## 6. Headers & Config
- ✅ `helmet()` เปิด (CSP/X-Frame-Options/etc.)
- ✅ `express.json({limit:'256kb'})` กัน large payload
- ✅ errorHandler ไม่รั่ว stack ใน production
- ✅ static serve เฉพาะ `client/dist`; ไม่ serve `server/` หรือ `.env`

## 7. ช่องโหว่/ข้อสังเกตที่พบ

| # | ระดับ | รายละเอียด |
|---|---|---|
| S-01 | ต่ำ | ไม่มี rate limit เฉพาะ `/bets/place` — spam bet request ได้ (global limiter ช่วยบางส่วน) |
| S-02 | ต่ำ | `GET /api/lottery/winners` + results public — ตั้งใจ (demo) แต่ถ้าใช้จริงควรจำกัด field |
| S-03 | ต่ำ | ไม่มี account lockout หลัง login fail N ครั้ง (มี rate limit แทน) |
| S-04 | ข้อเสนอแนะ | เพิ่ม `npm audit` ใน CI + pin versions; ปัจจุบันไม่มี SCA pipeline |
| S-05 | ข้อเสนอแนะ | ถ้า deploy จริง ต้องเพิ่ม TLS + secure cookie flag + HSTS |

## 8. สรุป
ไม่มีช่องโหว่ระดับวิกฤต/สูงที่พบจากการตรวจ — ระบบมี auth/session/CSRF/RBAC/validation/atomic-tx ครบถ้วนสำหรับ demo scope การโจมตีที่เหลืออยู่ในระดับ rate-limit hardening + TLS (ถ้าออก production)
