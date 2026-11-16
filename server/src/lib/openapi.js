// OpenAPI 3.0 spec สำหรับ Demo Lottery API — serve ที่ /api/openapi.json และ /api/v1/openapi.json
// ครอบคลุม endpoint หลัก; รายละเอียด field ย่อยดูจาก zod schemas ใน routes/* และ code
const bearerOrSession = {
  type: 'apiKey', in: 'cookie', name: 'sid', description: 'Session cookie (HttpOnly) — หรือส่ง CSRF token ใน header x-csrf-token สำหรับ state-changing requests',
};
const jsonErr = { type: 'object', properties: { error: { type: 'string' }, code: { type: 'string' } } };
const ok = (schema, description = 'OK') => ({ description, content: { 'application/json': { schema } } });
const err = (description = 'Error') => ({ description, content: { 'application/json': { schema: jsonErr } } });

const Money = { type: 'integer', description: 'สตางค์ (1 บาท = 100)' };
const Draw = {
  type: 'object',
  properties: {
    id: { type: 'integer' }, draw_code: { type: 'string' }, status: { type: 'string', enum: ['scheduled', 'open', 'closed', 'settled', 'cancelled'] },
    draw_at: { type: 'string', format: 'date-time' }, close_at: { type: 'string', format: 'date-time' },
    lottery_type_id: { type: 'integer' }, category_id: { type: ['integer', 'null'] },
    winning_numbers: { type: ['object', 'null'] }, announce: { type: ['object', 'null'], description: 'เลขอั้น {top:[],bottom:[]}' },
  },
};
const BetItem = {
  type: 'object', required: ['ruleId', 'number', 'amount'],
  properties: {
    ruleId: { type: 'integer' }, number: { type: 'string', description: 'เลขตาม digits ของกติกา' },
    amount: Money, tod: { type: 'boolean', description: 'true = ซื้อแพ็กเกจ เต็ง+โต๊ด (เสียเงิน ×2)' },
  },
};

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Demo Lottery API', version: '1.0.0',
    description: 'ระบบหวย/เกมด่วนแบบ Virtual Credit เพื่อการศึกษา — ยังไม่รองรับเงินจริง ใช้ /api/v1 เป็น canonical, /api เป็น alias',
  },
  servers: [{ url: '/api/v1' }, { url: '/api' }],
  tags: [
    { name: 'health' }, { name: 'auth' }, { name: 'lottery' }, { name: 'bets' },
    { name: 'wallet' }, { name: 'instant-games' }, { name: 'notifications' }, { name: 'admin' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['health'], summary: 'Health check', security: [],
        parameters: [{ name: 'deep', in: 'query', schema: { type: 'string', enum: ['1'] }, description: 'เช็ค DB ด้วย' }],
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, db: { type: 'string' } } }), 503: err('DB down') },
      },
    },
    '/csrf-token': {
      get: { tags: ['auth'], summary: 'CSRF token + cookie', security: [], responses: { 200: ok({ type: 'object' }) } },
    },
    '/auth/register': {
      post: {
        tags: ['auth'], summary: 'สมัครสมาชิก (อายุ 20+)', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['username', 'password'],
          properties: { username: { type: 'string' }, password: { type: 'string' }, email: { type: 'string' }, displayName: { type: 'string' } },
        } } } },
        responses: { 201: ok({ type: 'object' }, 'registered'), 400: err(), 409: err('username/email ซ้ำ') },
      },
    },
    '/auth/login': {
      post: {
        tags: ['auth'], summary: 'เข้าสู่ระบบ (username+password → session cookie; อาจขอ MFA/OTP ตาม config)', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['username', 'password'], properties: { username: { type: 'string' }, password: { type: 'string' } },
        } } } },
        responses: { 200: ok({ type: 'object' }), 401: err('credentials ไม่ถูกต้อง'), 403: err('MFA/OTP required') },
      },
    },
    '/auth/logout': { post: { tags: ['auth'], summary: 'ออกจากระบบ', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/auth/me': { get: { tags: ['auth'], summary: 'โปรไฟล์ + balance + สิทธิ์', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/auth/me/prefs': { patch: { tags: ['auth'], summary: 'ตั้งค่า member (sound/notifications ฯลฯ)', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/auth/me/responsible-gambling': {
      patch: {
        tags: ['auth'], summary: 'ขีดจำกัดส่วนตัว (self-exclusion / daily / monthly limit)', security: [bearerOrSession],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
          self_excluded_until: { type: ['string', 'null'], description: "'permanent' | ISO datetime | null" },
          daily_limit_satang: { type: ['integer', 'null'] }, monthly_limit_satang: { type: ['integer', 'null'] },
        } } } } },
        responses: { 200: ok({ type: 'object' }) },
      },
    },
    '/auth/mfa/setup': { post: { tags: ['auth'], summary: 'เริ่มตั้ง MFA (admin บังคับ)', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/auth/mfa/verify': { post: { tags: ['auth'], summary: 'ยืนยัน MFA code', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/auth/mfa/enable': { post: { tags: ['auth'], summary: 'เปิดใช้ MFA', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/auth/change-password': { post: { tags: ['auth'], summary: 'เปลี่ยนรหัสผ่าน', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/auth/otp/request': { post: { tags: ['auth'], summary: 'ขอ OTP (dev: OTP_DEV_ECHO)', security: [], responses: { 200: ok({ type: 'object' }) } } },
    '/auth/otp/verify': { post: { tags: ['auth'], summary: 'ยืนยัน OTP', security: [], responses: { 200: ok({ type: 'object' }) } } },
    '/auth/public-config': { get: { tags: ['auth'], summary: 'feature flags + initial credit (public)', security: [], responses: { 200: ok({ type: 'object' }) } } },

    '/lottery/types': { get: { tags: ['lottery'], summary: 'ประเภทหวยทั้งหมด', security: [], responses: { 200: ok({ type: 'object' }) } } },
    '/lottery/categories': { get: { tags: ['lottery'], summary: 'หมวดหวย', security: [], responses: { 200: ok({ type: 'object' }) } } },
    '/lottery/rules': {
      get: { tags: ['lottery'], summary: 'กติกาการแทง (payout/เลขอั้น)', security: [],
        parameters: [{ name: 'type', in: 'query', schema: { type: 'integer' } }],
        responses: { 200: ok({ type: 'object' }) } },
      post: { tags: ['admin', 'lottery'], summary: 'สร้าง/แก้กติกา (admin)', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }), 403: err('ไม่มีสิทธิ์') } },
    },
    '/lottery/markets': { get: { tags: ['lottery'], summary: 'ตลาดหวยที่เปิด + รอบถัดไป', security: [], responses: { 200: ok({ type: 'object' }) } } },
    '/lottery/draws': {
      get: { tags: ['lottery'], summary: 'รายการรอบหวย (filter: type/category/status/upcoming)', security: [],
        parameters: [
          { name: 'lottery_type_id', in: 'query', schema: { type: 'integer' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'upcoming', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: ok({ type: 'array', items: Draw }) } },
    },
    '/lottery/draws/{id}': { get: { tags: ['lottery'], summary: 'รายละเอียดรอบ', security: [], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: ok(Draw), 404: err() } } },
    '/lottery/draws/{id}/rules': { get: { tags: ['lottery'], summary: 'กติกาที่ใช้ได้ของรอบนี้', security: [], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: ok({ type: 'object' }) } } },
    '/lottery/draws/{id}/fairness': { get: { tags: ['lottery'], summary: 'commit-reveal seed ของรอบ gen', security: [], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: ok({ type: 'object' }) } } },
    '/lottery/results': { get: { tags: ['lottery'], summary: 'ผลรางวัลที่ผ่านมา', security: [], responses: { 200: ok({ type: 'object' }) } } },
    '/lottery/results/status': { get: { tags: ['lottery'], summary: 'สถานะการดึงผล (source health)', security: [], responses: { 200: ok({ type: 'object' }) } } },
    '/lottery/winners': { get: { tags: ['lottery'], summary: 'ผู้ถูกรางวัลล่าสุด', security: [], responses: { 200: ok({ type: 'object' }) } } },

    '/bets': {
      post: {
        tags: ['bets'], summary: 'แทงหวย (เขียนครั้งเดียว + idempotency)', security: [bearerOrSession],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['drawId', 'items'],
          properties: { drawId: { type: 'integer' }, items: { type: 'array', items: BetItem, maxItems: 50 }, idempotencyKey: { type: 'string', maxLength: 64 } },
        } } } },
        responses: {
          201: ok({ type: 'object', properties: { slipRef: { type: 'string' }, slipId: { type: 'integer' }, totalStake: Money, balance: Money, duplicate: { type: 'boolean' } } }),
          400: err('DRAW_CLOSED / เลขผิด / เงินไม่พอ / LIMIT_*'), 401: err(), 403: err('SELF_EXCLUDED'),
        },
      },
    },
    '/bets/mine': { get: { tags: ['bets'], summary: 'โพยของฉัน', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/bets/mine/export': { get: { tags: ['bets'], summary: 'export โพย (CSV)', security: [bearerOrSession], responses: { 200: { description: 'text/csv', content: { 'text/csv': { schema: { type: 'string' } } } } } } },
    '/bets/stats': { get: { tags: ['bets'], summary: 'สถิติเดิมพันของฉัน', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/bets/slips/{ref}': { get: { tags: ['bets'], summary: 'ดูโพยตาม slip_ref', security: [bearerOrSession], parameters: [{ name: 'ref', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: ok({ type: 'object' }), 404: err() } } },
    '/bets/{id}/cancel': { post: { tags: ['bets'], summary: 'ยกเลิกโพย (คืนเครดิต — ต้องสถานะยกเลิกได้)', security: [bearerOrSession], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: ok({ type: 'object' }), 400: err('ยกเลิกไม่ได้แล้ว') } } },

    '/wallet': { get: { tags: ['wallet'], summary: 'ยอดเงิน + transactions', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/wallet/transactions': { get: { tags: ['wallet'], summary: 'ประวัติธุรกรรม (demo wallet)', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/bets/wallet/deposit': {
      post: {
        tags: ['wallet'], summary: 'ฝากเงินเข้า demo wallet', security: [bearerOrSession],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['direction', 'amount'], properties: { direction: { type: 'string', enum: ['deposit'] }, amount: Money, paymentMethod: { type: 'string' }, accountNo: { type: 'string' }, idempotencyKey: { type: 'string' } } } } } },
        responses: { 200: ok({ type: 'object' }), 400: err() },
      },
    },
    '/bets/wallet/withdraw': {
      post: {
        tags: ['wallet'], summary: 'ถอนเงิน (กันถ้ามีโพยค้าง + เฉพาะเครดิตฝาก/ถูกรางวัล ไม่ใช่โปรโมชัน)', security: [bearerOrSession],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['direction', 'amount'], properties: { direction: { type: 'string', enum: ['withdraw'] }, amount: Money, paymentMethod: { type: 'string' }, accountNo: { type: 'string' }, idempotencyKey: { type: 'string' } } } } } },
        responses: { 200: ok({ type: 'object' }), 400: err('มีโพยค้าง / เครดิตไม่พอ / ยอดไม่ผ่าน') },
      },
    },

    '/scratch/buy': { post: { tags: ['instant-games'], summary: 'ซื้อหวยขูด (scratch)', security: [bearerOrSession], responses: { 201: ok({ type: 'object' }) } } },
    '/scratch/{id}/reveal': { post: { tags: ['instant-games'], summary: 'เปิดไพ่ขูด', security: [bearerOrSession], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: ok({ type: 'object' }) } } },
    '/scratch/mine': { get: { tags: ['instant-games'], summary: 'ประวัติ scratch ของฉัน', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/hilo/play': { post: { tags: ['instant-games'], summary: 'เล่นไฮโลเต๋า', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/hilo/mine': { get: { tags: ['instant-games'], summary: 'ประวัติไฮโลของฉัน', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/kiwi/play': { post: { tags: ['instant-games'], summary: 'เล่นยี่กี/น้ำเต้าปูปลา', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/kiwi/mine': { get: { tags: ['instant-games'], summary: 'ประวัติยี่กีของฉัน', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },

    '/notifications': { get: { tags: ['notifications'], summary: 'การแจ้งเตือนของฉัน', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/events': { get: { tags: ['notifications'], summary: 'SSE real-time events', security: [bearerOrSession], responses: { 200: { description: 'text/event-stream' } } } },
    '/push/vapid-key': { get: { tags: ['notifications'], summary: 'VAPID public key สำหรับ web push', security: [], responses: { 200: ok({ type: 'object' }) } } },

    '/admin/overview': { get: { tags: ['admin'], summary: 'Dashboard สรุป', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }), 403: err() } } },
    '/admin/members': { get: { tags: ['admin'], summary: 'จัดการสมาชิก', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }), 403: err() } } },
    '/admin/roles': { get: { tags: ['admin'], summary: 'จัดการ role/permission', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }), 403: err() } } },
    '/admin/draws': {
      get: { tags: ['admin'], summary: 'ทุกรอบหวย (รวมที่ยังไม่เปิด)', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }), 403: err() } },
      post: { tags: ['admin'], summary: 'สร้างรอบ (คำนวณ status จากเวลา)', security: [bearerOrSession], responses: { 201: ok(Draw), 403: err() } },
    },
    '/admin/draws/{id}': { patch: { tags: ['admin'], summary: 'แก้รอบ (draw_code/draw_at/close_at/announce — snake_case)', security: [bearerOrSession], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: ok(Draw), 403: err() } } },
    '/admin/draws/{id}/status': { patch: { tags: ['admin'], summary: 'เปลี่ยนสถานะ (settled/cancelled → refund อัตโนมัติ)', security: [bearerOrSession], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: ok({ type: 'object' }), 403: err() } } },
    '/admin/draws/{id}/settle': {
      post: {
        tags: ['admin'], summary: 'settle รอบด้วยผลที่กรอก (ต้องผ่านเงื่อนไขเวลา + กัน settle ซ้ำ)', security: [bearerOrSession],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['winning_numbers'], properties: { winning_numbers: { type: 'object' }, source_label: { type: 'string' } } } } } },
        responses: { 200: ok({ type: 'object' }), 400: err('เวลาไม่ถึง / settle แล้ว'), 403: err() },
      },
    },
    '/admin/draws/{id}/settle-preview': { post: { tags: ['admin'], summary: 'ดูผล settle ก่อน commit', security: [bearerOrSession], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: ok({ type: 'object' }) } } },
    '/admin/draws/{id}/result': { post: { tags: ['admin'], summary: 'บันทึกผลรางวัล (เขียนครั้งเดียว)', security: [bearerOrSession], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: ok({ type: 'object' }) } } },
    '/admin/draws/{id}/fetch-result': { post: { tags: ['admin'], summary: 'ดึงผลจาก source ภายนอกทันที', security: [bearerOrSession], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: ok({ type: 'object' }) } } },
    '/admin/draws/auto-settle': { post: { tags: ['admin'], summary: 'สั่ง auto-settle ทันที', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/admin/bets': { get: { tags: ['admin'], summary: 'ค้นหาโพยทั้งหมด', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }), 403: err() } } },
    '/admin/wallet/adjust': {
      post: {
        tags: ['admin'], summary: 'ปรับเครดิตสมาชิก (audit + wallet version check)', security: [bearerOrSession],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['userId', 'direction', 'amount'], properties: { userId: { type: 'integer' }, direction: { type: 'string', enum: ['credit', 'debit'] }, amount: Money, description: { type: 'string' }, idempotencyKey: { type: 'string' } } } } } },
        responses: { 200: ok({ type: 'object' }), 403: err() },
      },
    },
    '/admin/settings': { get: { tags: ['admin'], summary: 'ตั้งค่าระบบ', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }), 403: err() } } },
    '/admin/audit': { get: { tags: ['admin'], summary: 'audit log', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }), 403: err() } } },
    '/admin/security-events': { get: { tags: ['admin'], summary: 'security events', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }), 403: err() } } },
    '/admin/reports/summary': { get: { tags: ['admin'], summary: 'รายงานสรุป', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }), 403: err() } } },
    '/admin/promotions/cashback/preview': { get: { tags: ['admin'], summary: 'preview cashback', security: [bearerOrSession], responses: { 200: ok({ type: 'object' }) } } },
    '/admin/members/{id}': { patch: { tags: ['admin'], summary: 'แก้ไขสมาชิก', security: [bearerOrSession], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: ok({ type: 'object' }), 403: err() } }, delete: { tags: ['admin'], summary: 'ลบสมาชิก', security: [bearerOrSession], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: ok({ type: 'object' }), 403: err() } } },
  },
  components: {
    securitySchemes: { sessionCookie: { type: 'apiKey', in: 'cookie', name: 'sid' } },
    schemas: { Error: jsonErr, Money, Draw, BetItem },
  },
};
