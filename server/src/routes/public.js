import { Router } from 'express';
import { getDb } from '../db/index.js';

const router = Router();

// slug ของ lotterychecks.com → [type_code, category_code|null] ของเรา
// (รองรับทั้ง slug ภายนอกและรหัสตลาดภายใน เช่น TH, LA.LAM, GS)
const SLUG_TO_MARKET = {
  'thai-government': ['TH', null],
  'lao-lottery': ['LA', 'LA'], 'lao-union': ['LA', 'LA'], 'lao-morning': ['LA', 'LAM'],
  'lao-development-morning': ['LA', 'LADAM'], 'lao-development-midday': ['LA', 'LADT'],
  'hanoi-morning': ['HN', 'HNM'], 'hanoi-normal': ['HN', 'HNN'], 'hanoi-adhoc': ['HN', 'HNS'],
  'hanoi-special': ['HN', 'HNP'], 'hanoi-vip': ['HN', 'HNV'],
  'gsb-lottery': ['GS', null],
};

function resolveMarket(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (SLUG_TO_MARKET[key]) return { type: SLUG_TO_MARKET[key][0], cat: SLUG_TO_MARKET[key][1], slug: key };
  // รองรับ "TYPE" หรือ "TYPE.CAT" (เช่น TH, LA.LAM, HN.HNN)
  const [t, c] = key.toUpperCase().split('.');
  if (!/^[A-Z]{2,4}$/.test(t)) return null;
  return { type: t, cat: c || null, slug: c ? `${t}.${c}` : t };
}

const asNums = (v) => (Array.isArray(v) ? v : [v]).filter(x => x != null && /^\d+$/.test(String(x))).map(String);

// แปลง winning_numbers ของเรา → prize list รูปแบบ lotterychecks.com
function prizesFor(typeCode, w) {
  if (!w || typeof w !== 'object') return [];
  const P = [];
  const add = (slug, name, v) => {
    const nums = asNums(v);
    if (nums.length) P.push({ slug, name, numbers: nums });
  };
  if (typeCode === 'GS') {
    add('first-prize', 'อันดับที่ 1', w.p1);
    add('second-prize', 'อันดับที่ 2', w.p2);
    add('third-prize', 'อันดับที่ 3', w.p3);
    add('fourth-prize', 'อันดับที่ 4', w.p4);
    add('fifth-prize', 'อันดับที่ 5', w.p5);
    add('last-four-digit', 'เลขท้าย 4 ตัว', w.last4);
    add('last-three-digit', 'เลขท้าย 3 ตัว', w.last3);
    return P;
  }
  if (typeCode === 'TH') {
    add('first-prize', 'รางวัลที่ 1', w.first);
    add('three-digit-front', 'เลขหน้า 3 ตัว', w.front3);
    add('three-digit-top', 'เลขท้าย 3 ตัวบน', w.top3);
    add('two-digit-bottom', 'เลขท้าย 2 ตัว', w.bottom2);
    return P;
  }
  // ลาว/ฮานอย — ใช้ slug มาตรฐาน lotterychecks
  add('special-prize', 'เลขพิเศษ', w.db5 || w.num4);
  add('three-digit-top', 'เลข 3 ตัวบน', w.top3);
  add('two-digit-bottom', 'เลข 2 ตัวล่าง', w.bottom2);
  if (!P.length) {
    // fallback: ส่ง field เลขทั้งหมดดิบๆ
    for (const [k, v] of Object.entries(w)) {
      if (['zodiac', 'seq', 'numbers'].includes(k)) continue;
      add(k, k, v);
    }
  }
  return P;
}

const MONTH_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const DAY_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
function thaiDisplay(dateStr) {
  // parse 'YYYY-MM-DD' ตรงๆ — หลีกเลี่ยง timezone shift ของ new Date()
  const [y, mo, d] = dateStr.split('-').map(Number);
  return `งวดวันที่ ${d} ${MONTH_TH[mo - 1]} ${y + 543}`;
}

// GET /api/public/results?lottery=<slug|TYPE[.CAT]>&limit=30
// รูปแบบ response อ้างอิง lotterychecks.com — ใช้ embed/เชื่อมต่อภายนอกได้
router.get('/results', async (req, res, next) => {
  try {
    const m = resolveMarket(req.query.lottery);
    if (!m) return res.status(400).json({ success: false, error: 'lottery ไม่ถูกต้อง — ใช้ slug เช่น lao-morning, hanoi-vip, gsb-lottery หรือรหัส TYPE[.CAT]' });
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const rows = await getDb().prepare(`
      SELECT d.draw_code, d.draw_at, d.status, lt.name_th AS type_name_th, c.name_th AS cat_name_th,
             lr.winning_numbers, lr.source AS result_source, lr.published_at
      FROM lottery_results lr
      JOIN lottery_draws d ON d.id = lr.draw_id
      JOIN lottery_types lt ON lt.id = d.lottery_type_id
      LEFT JOIN lottery_categories c ON c.id = d.category_id
      WHERE lt.code = $1 AND (($2::text IS NULL AND c.code IS NULL) OR c.code = $2)
      ORDER BY d.draw_at DESC
      LIMIT $3`).all(m.type, m.cat, limit);
    const data = rows.map(r => {
      let w = null;
      try { w = r.winning_numbers ? JSON.parse(r.winning_numbers) : null; } catch {}
      return {
        lottery: m.slug,
        lotteryName: r.cat_name_th || r.type_name_th,
        drawCode: r.draw_code,
        drawDate: String(r.draw_at).slice(0, 10),
        displayName: thaiDisplay(String(r.draw_at).slice(0, 10)),
        status: 'complete',
        publishedAt: r.published_at || null,
        source: r.result_source || null,
        prizes: prizesFor(m.type, w),
      };
    });
    res.json({
      success: true,
      attribution: {
        source: 'DemoLottery',
        url: '/',
        note: 'ผลรางวัล demo/การศึกษา — แหล่งผลระบุใน field source ของแต่ละงวด',
      },
      data,
    });
  } catch (e) { next(e); }
});

export default router;
