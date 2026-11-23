import { describe, it, expect, beforeEach } from 'vitest';
import { isBettingOpen, bettingOpenAtSql, windowHoursFor, BETTING_WINDOW_HOURS, MONTHLY_WINDOW_HOURS } from '../src/bettingWindow.js';
import { sourceBadge, kindBadge } from '../src/resultSource.js';
import { cn } from '../src/lib/utils.js';

// เวลาอ้างอิงคงที่: 2025-06-15 12:00:00 UTC
const NOW = '2025-06-15 12:00:00';

describe('bettingWindow — ต้องตรงกับ BETTING_WINDOW_HOURS ฝั่ง server', () => {
  it('daily market window = 24h, monthly = 14 days', () => {
    expect(windowHoursFor('TH')).toBe(MONTHLY_WINDOW_HOURS);
    expect(windowHoursFor('GS')).toBe(MONTHLY_WINDOW_HOURS);
    expect(windowHoursFor('lao-morning')).toBe(BETTING_WINDOW_HOURS);
    expect(windowHoursFor('hanoi-quick')).toBe(BETTING_WINDOW_HOURS);
  });

  it('bettingOpenAtSql = close_at - window', () => {
    // close 2025-06-16 12:00 UTC, daily → open 2025-06-15 12:00
    expect(bettingOpenAtSql('2025-06-16 12:00:00', 'lao-morning')).toBe('2025-06-15 12:00:00');
    // monthly TH: close 2025-06-30 12:00 → open 2025-06-16 12:00
    expect(bettingOpenAtSql('2025-06-30 12:00:00', 'TH')).toBe('2025-06-16 12:00:00');
  });

  it('isBettingOpen: ปิดเมื่อเลย close_at / status ไม่ใช่ open / ยังไม่ถึงเวลาเปิด', () => {
    const base = { status: 'open', type_code: 'lao-morning', close_at: '2025-06-16 12:00:00' };
    expect(isBettingOpen(base, '2025-06-15 11:59:59')).toBe(false); // ยังไม่เปิด
    expect(isBettingOpen(base, NOW)).toBe(true);                  // เปิดอยู่
    expect(isBettingOpen({ ...base, close_at: '2025-06-15 11:00:00' }, NOW)).toBe(false); // เลยปิดรับ
    expect(isBettingOpen({ ...base, status: 'closed' }, NOW)).toBe(false);
    expect(isBettingOpen(null, NOW)).toBe(false);
  });
});

describe('resultSource badges — แยกผลจริง/DEMO/กรอกเองชัดเจน', () => {
  it('manual → กรอกเอง, gen/demo → DEMO, เว็บจริง → ชื่อเว็บ', () => {
    expect(sourceBadge('manual').short).toContain('กรอกเอง');
    expect(sourceBadge('lao-dev-gen').short).toContain('DEMO');
    expect(sourceBadge('demo').short).toContain('DEMO');
    expect(sourceBadge('auto(laodl.com)').short).toContain('laodl');
    expect(sourceBadge('auto(GLO)').short).toContain('glo');
    expect(sourceBadge('auto(lotterychecks)').short).toContain('lotterychecks');
    expect(sourceBadge(null)).toBeNull();
  });

  it('kindBadge ตาม result_kind', () => {
    expect(kindBadge('manual').short).toContain('กรอกเอง');
    expect(kindBadge('demo').short).toContain('DEMO');
    expect(kindBadge('auto').short).toContain('เว็บจริง');
  });
});

describe('cn util', () => {
  it('merge tailwind classes', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('a', false && 'b', 'c')).toBe('a c');
  });
});
