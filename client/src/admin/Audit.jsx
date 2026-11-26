import { useEffect, useState } from 'react';
import { api, fmtDateTime } from '../api.js';
import { toast } from '../components/toast.js';
import { Card, CardBody, Input, Button } from '../components/ui/index.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/shadcn/select.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/shadcn/table.jsx';
import { exportCsv } from '../lib/exportCsv.js';

const ACTION_TH = {
  'user.login': 'เข้าสู่ระบบ', 'user.login_line': 'เข้าสู่ระบบ (LINE)',
  'user.logout': 'ออกจากระบบ', 'user.register': 'สมัครสมาชิก',
  'user.register_line': 'สมัครสมาชิก (LINE)', 'user.change_password': 'เปลี่ยนรหัสผ่าน',
  'user.password_reset_requested': 'ขอรีเซ็ตรหัสผ่าน',
  'user.mfa_enabled': 'เปิดใช้ MFA', 'user.mfa_verified': 'ยืนยัน MFA',
  'user.locked_bruteforce': 'บัญชีถูกล็อกจากการพยายามเข้าผิดบ่อย',
  'bet.place': 'ส่งโพยเดิมพัน', 'draw.settle': 'ออกผลรางวัล',
  'draw.auto_settle': 'ออกผลอัตโนมัติ', 'draw.result_update': 'แก้ไขผลย้อนหลัง',
  'draw.create': 'สร้างรอบหวย', 'draw.update': 'แก้ไขรอบหวย', 'draw.status': 'เปลี่ยนสถานะรอบ',
  'admin.member_update': 'แก้ไขข้อมูลสมาชิก', 'admin.member_delete': 'ลบสมาชิก',
  'admin.roles_update': 'แก้ไขสิทธิ์การใช้งาน',
  'admin.lottery_type_create': 'สร้างประเภทหวย', 'admin.lottery_type_update': 'แก้ไขประเภทหวย',
  'admin.rule_create': 'สร้างกติกาการแทง', 'admin.rule_update': 'แก้ไขกติกาการแทง',
  'admin.setting_update': 'แก้ไขการตั้งค่าระบบ',
  'wallet.deposit': 'เติมเครดิต', 'wallet.withdraw': 'ถอนเครดิต',
  'wallet.credit_adjust': 'แอดมินเพิ่มเครดิต', 'wallet.debit_adjust': 'แอดมินหักเครดิต',
};

// columns สำหรับ export CSV (label ไทย)
const AUDIT_CSV_COLS = [
  { key: 'created_at', label: 'เวลา' },
  { key: 'user', label: 'ผู้ใช้' },
  { key: 'action', label: 'Action' },
  { key: 'entity', label: 'Entity' },
  { key: 'ip', label: 'IP' },
  { key: 'detail', label: 'รายละเอียด' },
];

const auditCsvRows = (rows) => rows.map(l => ({
  created_at: l.created_at,
  user: l.username || `#${l.user_id}`,
  action: ACTION_TH[l.action] || l.action,
  entity: [l.entity_type, l.entity_id].filter(Boolean).join(' '),
  ip: l.ip,
  detail: l.detail,
}));

export default function AdminAudit() {
  const [logs, setLogs] = useState([]);
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [corr, setCorr] = useState('');
  const [verify, setVerify] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const PAGE_SIZE = 50;

  const load = (f = from, t = to, c = corr) => {
    const p = new URLSearchParams({ limit: '200' });
    if (f) p.set('from', f);
    if (t) p.set('to', t.length === 10 ? `${t} 23:59:59` : t);
    if (c.trim()) p.set('correlation_id', c.trim());
    api(`/admin/audit?${p}`).then(r => setLogs(r.logs)).catch(e => toast(e.message, 'error'));
  };
  useEffect(() => { load(); }, []);

  const runVerify = async () => {
    setVerifying(true); setVerify(null);
    try {
      const r = await api('/admin/audit/verify');
      setVerify(r);
      if (r.ok) toast(`Hash chain ถูกต้อง — ตรวจ ${r.hashed} รายการ`, 'success');
      else toast(`พบความผิดปกติที่ id ${r.firstBreak?.id} (${r.firstBreak?.reason})`, 'error');
    } catch (e) { toast(e.message, 'error'); }
    setVerifying(false);
  };

  const actionKeys = [...new Set(logs.map(l => l.action))].sort();
  const filtered = logs.filter(l => {
    if (action && l.action !== action) return false;
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase();
    return [l.username, l.entity_type, l.entity_id, l.ip, l.detail, ACTION_TH[l.action]]
      .filter(Boolean).some(v => String(v).toLowerCase().includes(t));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold [color:var(--white)]">Audit Log</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Input value={q} onChange={e => { setQ(e.target.value); setPage(0); }}
            placeholder="ค้นหา ผู้ใช้ / entity / IP / รายละเอียด..."
            inputClassName="w-64 py-2 text-sm" className="[background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]" />
          <Select value={action || 'all'} onValueChange={v => { setAction(v === 'all' ? '' : v); setPage(0); }}>
            <SelectTrigger className="w-44 py-2 text-sm [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]">
              <SelectValue placeholder="ทุก action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุก action</SelectItem>
              {actionKeys.map(k => <SelectItem key={k} value={k}>{ACTION_TH[k] || k}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(0); load(e.target.value, to, corr); }}
            inputClassName="w-36 py-2 text-sm" title="จากวันที่" className="[background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]" />
          <Input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(0); load(from, e.target.value, corr); }}
            inputClassName="w-36 py-2 text-sm" title="ถึงวันที่" className="[background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]" />
          <Input value={corr} onChange={e => { setCorr(e.target.value); }}
            onKeyDown={e => e.key === 'Enter' && load(from, to, corr)}
            placeholder="correlation id..." inputClassName="w-44 py-2 text-sm" className="[background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]" />
          <Button variant="ghost" size="sm" onClick={() => load(from, to, corr)} className="[color:var(--gold-primary)] [border:1px_solid_var(--border-light)]">ค้นหา</Button>
          <Button variant="ghost" size="sm" onClick={runVerify} disabled={verifying}
            title="ตรวจสอบ hash-chain ว่าไม่มีการแก้ไข/ลบ audit log ย้อนหลัง"
            className="[color:var(--gold-primary)] [border:1px_solid_var(--border-light)]">
            {verifying ? 'กำลังตรวจ...' : 'ตรวจ hash chain'}
          </Button>
          <Button variant="ghost" size="sm"
            onClick={() => exportCsv(`audit-${new Date().toISOString().slice(0, 10)}.csv`, auditCsvRows(filtered), AUDIT_CSV_COLS)}
            disabled={!filtered.length}
            title="ดาวน์โหลดผลลัพธ์ที่กรองอยู่ทั้งหมดเป็น CSV (สูงสุด 200 รายการที่โหลดมา)"
            className="[color:var(--gold-primary)] [border:1px_solid_var(--border-light)]">
            ส่งออก CSV (ข้อมูลที่แสดง)
          </Button>
        </div>
      </div>
      {verify && (
        <Card className="py-3 text-sm [background:var(--bg-card)] [border:1px_solid_var(--border-light)] [border-radius:var(--radius-xl)]">
          <CardBody className="py-3">
            {verify.ok
              ? <span className="[color:var(--success-green)]">✓ Hash chain ถูกต้อง — ตรวจสอบ {verify.hashed} รายการที่มี hash (ทั้งหมด {verify.checked} แถว)</span>
              : <span className="[color:var(--danger-red)]">✗ พบความผิดปกติที่ id {verify.firstBreak?.id}: {verify.firstBreak?.reason}</span>}
          </CardBody>
        </Card>
      )}
      <Card className="[background:var(--bg-card)] [border:1px_solid_var(--border-light)] [border-radius:var(--radius-xl)]">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent [border-color:var(--border-light)]">
              <TableHead className="[color:var(--muted-gray)]">เวลา</TableHead>
              <TableHead className="[color:var(--muted-gray)]">ผู้ใช้</TableHead>
              <TableHead className="[color:var(--muted-gray)]">Action</TableHead>
              <TableHead className="[color:var(--muted-gray)]">Entity</TableHead>
              <TableHead className="[color:var(--muted-gray)]">IP</TableHead>
              <TableHead className="[color:var(--muted-gray)]">รายละเอียด</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map(l => (
              <TableRow key={l.id} className="[border-color:var(--border-light)]">
                <TableCell className="whitespace-nowrap [color:var(--muted-gray)]">{fmtDateTime(l.created_at)}</TableCell>
                <TableCell className="[color:var(--white)]">{l.username || `#${l.user_id}`}</TableCell>
                <TableCell>
                  <div className="[color:var(--white)]">{ACTION_TH[l.action] || l.action}</div>
                  {ACTION_TH[l.action] && <code className="[color:var(--dark-gray)] [font-size:10px]">{l.action}</code>}
                </TableCell>
                <TableCell className="[color:var(--muted-gray)]">{l.entity_type} {l.entity_id}</TableCell>
                <TableCell className="[color:var(--muted-gray)]">{l.ip}</TableCell>
                <TableCell className="max-w-[300px] truncate font-mono [color:var(--muted-gray)]">{l.detail || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!filtered.length && <div className="text-center py-8 text-sm [color:var(--muted-gray)]">{logs.length ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ไม่มีรายการ'}</div>}
      </Card>
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="[color:var(--muted-gray)]">หน้า {page + 1}/{pageCount} • {filtered.length} รายการ</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="[color:var(--gold-primary)] [border:1px_solid_var(--border-light)]">← ก่อนหน้า</Button>
            <Button variant="ghost" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage(p => p + 1)} className="[color:var(--gold-primary)] [border:1px_solid_var(--border-light)]">ถัดไป →</Button>
          </div>
        </div>
      )}
    </div>
  );
}
