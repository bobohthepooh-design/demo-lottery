# Break-glass Runbook — กู้ระบบเมื่อแอดมินเข้าไม่ได้

> ทีมแอดมินมี**สูงสุด 2 คน** — เอกสารนี้สำหรับเหตุฉุกเฉินที่ทั้ง 2 คนเข้า admin ไม่ได้
> ทุกการกระทำในนี้ต้องบันทึกเหตุผล + เวลา + ผู้ดำเนินการลง `audit_logs`/บันทึกภายนอก

## สถานการณ์ที่ครอบคลุม

1. ลืมรหัสผ่าน admin ทั้ง 2 คน
2. ทำ MFA device หายทั้ง 2 คน
3. บัญชีโดน lock/disable ทั้งหมด
4. SESSION_SECRET หาย/ต้อง rotate

## ขั้นตอน A — Reset รหัสผ่าน admin ผ่าน DB (ไม่มีใคร login ได้เลย)

รันบนเครื่องที่รัน Docker:

```bash
# 1) เข้า postgres container
docker exec -it demo-lottery-postgres-1 psql -U lottery -d lottery

# 2) ดูรายชื่อ admin
docker exec demo-lottery-postgres-1 psql -U lottery -d lottery \
  -c "SELECT u.id,u.username,u.status,u.mfa_enabled,r.name role
      FROM users u JOIN user_roles ur ON ur.user_id=u.id
      JOIN roles r ON r.id=ur.role_id WHERE r.name IN ('super_admin','admin');"

# 3) สร้าง password hash ใหม่ — ใช้ node ใน app container (มี lib/password.js)
docker exec demo-lottery-app-1 node --input-type=module -e "
  const {hashPassword}=await import('/app/server/src/lib/password.js');
  console.log(hashPassword('รหัสใหม่ที่แข็งแรง10+'));"
# → copy hash ที่ได้

# 4) อัปเดต (แทน <HASH> และ <USER_ID>)
docker exec demo-lottery-postgres-1 psql -U lottery -d lottery -c "
  UPDATE users SET password_hash='<HASH>', failed_login_count=0, locked_until=NULL
  WHERE id=<USER_ID>;"

# 5) บังคับ logout ทุก session ของ admin คนนั้น
docker exec demo-lottery-postgres-1 psql -U lottery -d lottery -c "
  UPDATE user_sessions SET revoked_at=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
  WHERE user_id=<USER_ID> AND revoked_at IS NULL;"

# 6) login ปกติ → ระบบจะให้ setup MFA ใหม่ถ้าจำเป็น (ดูสถานการณ์ B)
```

## สถานการณ์ B — MFA device หาย (login ได้แต่ไม่มี TOTP)

MFA secret ถูก encrypt แล้ว — ถอดรหัสไม่ได้โดยตรง แต่สามารถ **reset MFA** แล้ว setup ใหม่:

```bash
# ปิด MFA ของ admin (ต้องมีรหัสผ่านที่ถูก — ทำขั้นตอน A ก่อนถ้าจำรหัสไม่ได้)
docker exec demo-lottery-postgres-1 psql -U lottery -d lottery -c "
  UPDATE users SET mfa_enabled=0, mfa_secret=NULL WHERE id=<USER_ID>;"

# login → เข้า Profile → ตั้งค่า MFA ใหม่ (scan QR ใหม่)
```

> ถ้าปิด MFA แล้วแต่ `ADMIN_MFA_REQUIRED=true` — admin routes ยังต้อง `mfa_verified` ใน session:
> ให้ setup+enable MFA ใหม่ก่อนใช้งานหน้า admin (ระบบบังคับอยู่แล้ว)

## สถานการณ์ C — SESSION_SECRET หาย/rotate

- SESSION_SECRET ใช้ sign CSRF cookie + derive key encrypt `mfa_secret`
- **Rotate = ทุก session หลุด + MFA secrets ที่ encrypt ด้วย key เดิมถอดไม่ได้**
- ถ้าจะ rotate: ตั้ง `MFA_ENCRYPTION_KEY` แยกไว้ล่วงหน้าใน `.env` (แนะนำ) แล้วค่อย rotate SESSION_SECRET ทีหลังโดยไม่กระทบ MFA
- หลัง rotate: `docker compose up -d app` (env ใหม่) → ทุกคนต้อง login ใหม่

## สถานการณ์ D — เพิ่ม/ลบ admin

```bash
# เพิ่ม admin ใหม่ (ทำผ่านหน้า admin ปกติถ้าทำได้ — /admin/members + roles)
# หรือตรง DB:
docker exec demo-lottery-app-1 node --input-type=module -e "
  const {hashPassword}=await import('/app/server/src/lib/password.js');
  const {qGet,qRun}=await import('/app/server/src/db/pg.js');
  const h=hashPassword('รหัสแข็งแรง10+');
  const u=await qGet(\"INSERT INTO users (username,email,password_hash,display_name) VALUES ('admin2','admin2@x','\"+h+\"','Admin 2') RETURNING id\");
  const r=await qGet(\"SELECT id FROM roles WHERE name='admin'\");
  await qRun('INSERT INTO user_roles (user_id,role_id) VALUES (\$1,\$2)',[u.id,r.id]);
  console.log('created',u.id);"
```

## กฎเหล็ก

- ห้ามใช้ break-glass เพื่อ"แอบ"ทำอะไร — ทุก query ที่แก้ users/user_roles ต้องจดไว้
- หลังเหตุการณ์: review `audit_logs` + `security_events` ย้อนหลัง, อัปเดต PROJECT_STATUS.md
- เก็บ `MFA_ENCRYPTION_KEY` แยกจาก SESSION_SECRET ใน `.env` ตั้งแต่เนิ่นๆ — จะได้ rotate session ได้โดยไม่ทำ MFA พัง
