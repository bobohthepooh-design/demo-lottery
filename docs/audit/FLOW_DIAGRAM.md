# FLOW DIAGRAM — แผนผังการทำงานของระบบ

## 1. Authentication Flow
```
User → /login → authService.verify (bcrypt) → TOTP check (ถ้าเปิด MFA)
     → สร้าง user_sessions row + dl_session cookie (HttpOnly)
     → requireAuth ทุก request: เช็ค session + user.status='active'
Admin → เหมือนกัน + requireMfaVerified + requirePerm(perm) ทุก /api/admin/*
```

## 2. Betting Flow (หวยปกติ)
```
Member → /lotteries → เลือก type+ช่วง (draw ใกล้ปิด) → /bet/:id
  → GET /bets/draws/:id/rules (validation rules ของ type)
  → กรอกเลข+ยอด → POST /bets/place
      Zod validate → check draw.status='open' + now<close_at + balance≥stake
      → responsible-gambling limits check
      → INSERT bet_slips + bet_items + virtual_transactions(debit) [1 TX]
      → idempotency_key กันซ้ำ
  → POST /bets/:id/cancel (ก่อน close) → refund atomic
  → MyBets แสดงผล + SSE refresh
```

## 3. Draw Lifecycle
```
Admin → POST /admin/draws (type+close_at+draw_at) → status='open'
Scheduler (ทุก 1 นาที):
  → draw ถึง draw_at → status='closed'
  → resultFetcher ดึงผลจริง (Thai/Lao/Hanoi/HR) หรือ deterministic fallback
  → POST internal settle → status='settled'
Admin manual: /draws/:id/status (cancel→refund), /settle, /result (override+audit)
```

## 4. Settlement Flow
```
settleDraw(drawId):
  → TX: อ่าน rules snapshot → คำนวณ match แต่ละ bet_item
  → UPDATE bet_items status (won/lost/partial) + payout
  → UPDATE bet_slips status รวม
  → UPDATE virtual_wallets + INSERT virtual_transactions(win credit) [atomic]
  → INSERT notifications → events.emit('sys:update') → SSE → ทุก client refresh
  → announce merge (ผลรางวัลไปที่ Winners/ResultPopup)
```

## 5. Instant Game Flow (Kiwi/Hilo/Scratch)
```
Member → /kiwi → เลือกเกม+ราคา → เลือกเลข/สัตว์ → POST /kiwi/play
  → server seed commit (SHA-256) → PRNG → ผลลัพธ์ deterministic
  → TX: bet_slips+bet_items+kiwi_tickets + debit + win credit
  → ticketView คืน picks/drawn/hits/payout/fairness
  → UI: ตู้เครื่อง animation (staggered) + LCD
Member → GET /kiwi/verify?ticket → ตรวจ seed จริง (provably fair)
```

## 6. Wallet Flow
```
Deposit: POST /bets/wallet/action {direction:'deposit', amount(satang), paymentMethod, idempotencyKey}
  → validate → wallet version-check UPDATE balance+ → INSERT virtual_transactions(deposit,credit)
  → notify + return {transaction, balance}
Withdraw: เหมือนกันแต่:
  → block ถ้ามี pending slips → require deposited≥100฿ unlock
  → check withdrawable (deposits+winnings−withdrawn−promo−pending)
  → UPDATE balance− → INSERT withdraw(debit) → audit
Admin adjust: POST /admin/wallet/adjust {userId, amount, reason, idemKey} → audit+notify
```

## 7. Notification Flow
```
event เกิด (bet win/lose, deposit, result change, chat, promo)
  → notifyService.create → INSERT notifications + pushService (VAPID)
  → NotificationBell poll/SSE → unread badge → /notifications list
```

## 8. Admin Management Flow
```
Admin login → MFA verify → /admin/* (perm-guarded)
  → Overview dashboard (counts/recent)
  → Draws: create/close/cancel/settle/auto-settle/fetch-result/result-override
  → Reports: summary (turnover/payout/win-rate/pending/pendingExposure/unplayedInstant)
  → Members: list/edit/lock/delete/reset-password
  → Settings: key-value (kiwi prices, hilo mult, scratch, limits, RG)
  → Audit/Security: event logs
```

## 9. Result Pipeline (fetch จริง)
```
resultFetcher (ทุก 1 นาที + on-demand):
  → Thai: fetch official source → parse → match draw
  → Lao/Hanoi: external API/demo source
  → HR (ราศี): deterministic zodiac จาก date seed
  → ann_* (รวมเลขพิเศษ): merge เข้า result หลัก
  → ถ้า fetch fail → deterministic fallback (ตั้งใจสำหรับ demo)
  → บันทึก result_source + fetched_at → settle trigger
```
