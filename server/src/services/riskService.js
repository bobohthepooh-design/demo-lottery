import { q, qGet, qRun } from '../db/pg.js';
import { getSetting, setSetting } from './settingsService.js';

// ---------- risk rules engine ----------
// rule-based heuristics จากข้อมูลที่มีอยู่จริง (auth_events/security_events/payments/bets)
// ไม่ใช่ ML — ทุก flag มี code+detail อธิบายได้ และ score ช่วยจัดลำดับความสำคัญ
// flag ที่ persist ใน risk_flags: open → acknowledged → resolved (auto-resolve เมื่อเงื่อนไขหาย)

const RULES = [
  {
    code: 'brute_force', severity: 'high', score: 40,
    async check(d, uid) {
      const c = (await d.prepare(`SELECT COUNT(*) c FROM auth_events
        WHERE user_id=? AND event LIKE 'login.failed%' AND created_at > datetime('now','-7 days')`).get(uid)).c;
      return c >= 5 ? { label: `login ผิด ${c} ครั้งใน 7 วัน`, detail: `failed_logins_7d=${c}` } : null;
    },
  },
  {
    code: 'account_blocked', severity: 'high', score: 50,
    async check(d, uid) {
      const c = (await d.prepare(`SELECT COUNT(*) c FROM auth_events
        WHERE user_id=? AND event='login.blocked' AND created_at > datetime('now','-7 days')`).get(uid)).c;
      return c > 0 ? { label: `ถูกบล็อก login ${c} ครั้งใน 7 วัน`, detail: `blocked_7d=${c}` } : null;
    },
  },
  {
    code: 'many_ips', severity: 'medium', score: 20,
    async check(d, uid) {
      const c = (await d.prepare(`SELECT COUNT(DISTINCT ip) c FROM auth_events
        WHERE user_id=? AND ip IS NOT NULL AND created_at > datetime('now','-30 days')`).get(uid)).c;
      return c >= 5 ? { label: `เข้าใช้จาก ${c} IP ใน 30 วัน`, detail: `distinct_ips_30d=${c}` } : null;
    },
  },
  {
    code: 'withdraw_over_deposit', severity: 'medium', score: 30,
    async check(d, uid) {
      const fin = await d.prepare(`SELECT
        COALESCE(SUM(CASE WHEN kind='deposit' AND status='approved' THEN amount END),0) dep,
        COALESCE(SUM(CASE WHEN kind='withdraw' AND status='approved' THEN amount END),0) wd
        FROM payment_requests WHERE user_id=?`).get(uid);
      return fin.wd > fin.dep && fin.wd > 0
        ? { label: 'ถอนได้มากกว่าฝาก (possible promo abuse)', detail: `dep=${fin.dep} wd=${fin.wd}` } : null;
    },
  },
  {
    code: 'kyc_unverified_withdraw', severity: 'medium', score: 25,
    async check(d, uid) {
      const u = await d.prepare('SELECT kyc_status FROM users WHERE id=?').get(uid);
      if (!u || u.kyc_status === 'verified') return null;
      const wd = (await d.prepare(`SELECT COUNT(*) c FROM payment_requests
        WHERE user_id=? AND kind='withdraw' AND status='approved'`).get(uid)).c;
      return wd > 0 ? { label: `KYC ${u.kyc_status || 'none'} แต่มี withdraw ${wd} รายการ`, detail: `kyc=${u.kyc_status} approved_withdrawals=${wd}` } : null;
    },
  },
  {
    code: 'bet_velocity', severity: 'low', score: 15,
    async check(d, uid) {
      const c = (await d.prepare(`SELECT COUNT(*) c FROM bet_slips
        WHERE user_id=? AND created_at > datetime('now','-1 hour')`).get(uid)).c;
      return c >= 10 ? { label: `ส่งโพย ${c} รายการใน 1 ชม.`, detail: `slips_1h=${c}` } : null;
    },
  },
  {
    code: 'large_pending_exposure', severity: 'medium', score: 20,
    async check(d, uid) {
      const s = (await d.prepare(`SELECT COALESCE(SUM(bs.total_stake),0) s FROM bet_slips bs
        JOIN lottery_draws dr ON dr.id=bs.draw_id
        WHERE bs.user_id=? AND bs.status='pending' AND dr.draw_code NOT LIKE '%-STANDING'`).get(uid)).s;
      return s >= 1000000 ? { label: `โพยค้างเปิด ${(s / 100).toLocaleString('th-TH')} บาท`, detail: `pending_stake=${s}` } : null;
    },
  },
  {
    code: 'self_excluded', severity: 'info', score: 5,
    async check(d, uid) {
      const u = await d.prepare(`SELECT self_excluded_until FROM users WHERE id=?`).get(uid);
      return u?.self_excluded_until ? { label: 'RG: ระงับตัวเอง', detail: `until=${u.self_excluded_until}` } : null;
    },
  },
];

const SEV_ORDER = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

// compute flags สดสำหรับ member (ไม่แตะ DB) — ใช้ใน Member 360
export async function computeFlags(userId) {
  const d = { prepare: (sql) => ({ get: async (...a) => qGet(sql, a), all: async (...a) => q(sql, a) }) };
  const out = [];
  for (const r of RULES) {
    try {
      const res = await r.check(d, userId);
      if (res) out.push({ code: r.code, label: res.label, severity: r.severity, score: r.score, detail: res.detail });
    } catch { /* rule fail ไม่ block ทั้งหมด */ }
  }
  return out.sort((a, b) => (SEV_ORDER[b.severity] - SEV_ORDER[a.severity]) || (b.score - a.score));
}

// refresh flags ของ user เดียว — insert ใหม่ / update last_seen / auto-resolve ที่หายไป
export async function refreshUser(userId) {
  const computed = await computeFlags(userId);
  const open = await q(`SELECT id, code FROM risk_flags WHERE user_id=$1 AND status IN ('open','acknowledged')`, [userId]);
  const openCodes = new Set(open.map(f => f.code));
  const computedCodes = new Set(computed.map(f => f.code));
  let added = 0, resolved = 0;
  for (const f of computed) {
    const exist = open.find(o => o.code === f.code);
    if (exist) {
      await qRun(`UPDATE risk_flags SET score=$1, detail=$2, severity=$3, last_seen_at=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'), updated_at=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id=$4`,
        [f.score, f.detail, f.severity, exist.id]);
    } else {
      await qRun(`INSERT INTO risk_flags (user_id, code, severity, score, detail, status) VALUES ($1,$2,$3,$4,$5,'open')`,
        [userId, f.code, f.severity, f.score, f.detail]);
      added++;
    }
  }
  // auto-resolve flags ที่เงื่อนไขไม่ติดแล้ว (ยกเว้น self_excluded — เป็นสถานะไม่ใช่เหตุการณ์)
  for (const o of open) {
    if (!computedCodes.has(o.code) && o.code !== 'self_excluded') {
      await qRun(`UPDATE risk_flags SET status='resolved', resolved_at=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'), note='auto: เงื่อนไขไม่ติดแล้ว', updated_at=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id=$1`, [o.id]);
      resolved++;
    }
  }
  return { added, resolved, active: computed.length };
}

// daily scan — users ที่มี activity ใน 30 วันล่าสุด (login/bet/payment)
export async function maybeScanRisk() {
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  if (await getSetting('risk_last_scan') === today) return null;
  const cutoff = `to_char((now() AT TIME ZONE 'UTC') - interval '30 days','YYYY-MM-DD HH24:MI:SS')`;
  const users = await q(`SELECT DISTINCT user_id FROM (
      SELECT user_id FROM auth_events WHERE created_at > ${cutoff}
      UNION SELECT user_id FROM bet_slips WHERE created_at > ${cutoff}
      UNION SELECT user_id FROM payment_requests WHERE created_at > ${cutoff}
    ) t WHERE user_id IS NOT NULL LIMIT 500`);
  let flagged = 0;
  for (const u of users) {
    const r = await refreshUser(u.user_id);
    if (r.added) flagged++;
  }
  await setSetting('risk_last_scan', today, null);
  return { scanned: users.length, usersWithNewFlags: flagged, date: today };
}

export async function listFlags({ status = 'open', limit = 200 } = {}) {
  const st = ['open', 'acknowledged', 'resolved'].includes(status) ? status : 'open';
  return q(`SELECT rf.*, u.username, u.display_name FROM risk_flags rf
    JOIN users u ON u.id = rf.user_id WHERE rf.status = $1
    ORDER BY CASE rf.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, rf.id DESC LIMIT $2`,
    [st, Math.min(limit, 500)]);
}

export async function setFlagStatus(id, status, adminId, note = null) {
  const cur = await qGet('SELECT * FROM risk_flags WHERE id=$1', [id]);
  if (!cur) return null;
  const resolved = status === 'resolved';
  await qRun(`UPDATE risk_flags SET status=$1, note=COALESCE($2,note), resolved_by=$3,
    resolved_at=CASE WHEN $4 THEN to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') ELSE resolved_at END,
    updated_at=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id=$5`,
    [status, note, resolved ? adminId : null, resolved, id]);
  return { ...cur, status };
}
