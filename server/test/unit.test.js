// Unit tests — pure logic ไม่ต้อง DB (evaluateBet / validateWinningNumbers / validateBetNumber / annEntries)
import { describe, it, expect } from 'vitest';
import {
  evaluateBet, validateWinningNumbers, validateBetNumber, annEntries, mergeAnnounce,
} from '../src/services/lotteryService.js';

const rule = (match_config, extra = {}) => ({
  match_config: JSON.stringify(match_config),
  payout_multiplier: 100,
  bet_type: 'x',
  digits: 2,
  ...extra,
});

describe('evaluateBet — exact/tail/head', () => {
  it('exact: เลขตรงเป๊ะเท่านั้น', () => {
    const r = rule({ mode: 'exact', source: 'bottom2' });
    expect(evaluateBet(r, '42', { bottom2: '42' }).win).toBe(true);
    expect(evaluateBet(r, '24', { bottom2: '42' }).win).toBe(false);
  });
  it('tail: เทียบ n ตัวท้ายของ source', () => {
    const r = rule({ mode: 'tail', source: 'num4' });
    expect(evaluateBet(r, '5678', { num4: '12345678' }).win).toBe(true);
    expect(evaluateBet(r, '1234', { num4: '12345678' }).win).toBe(false);
  });
  it('head: เทียบ n ตัวหน้า', () => {
    const r = rule({ mode: 'head', source: 'num4' });
    expect(evaluateBet(r, '1234', { num4: '12345678' }).win).toBe(true);
    expect(evaluateBet(r, '5678', { num4: '12345678' }).win).toBe(false);
  });
  it('digit_contains: ทุกหลักของเลขแทงต้องอยู่ในผล', () => {
    const r = rule({ mode: 'digit_contains', source: 'top3' });
    expect(evaluateBet(r, '11', { top3: '123' }).win).toBe(true); // 1,1 อยู่ใน {1,2,3}
    expect(evaluateBet(r, '44', { top3: '123' }).win).toBe(false);
  });
  it('sorted: ไม่สนลำดับ', () => {
    const r = rule({ mode: 'sorted', source: 'bottom2' });
    expect(evaluateBet(r, '24', { bottom2: '42' }).win).toBe(true);
    expect(evaluateBet(r, '42', { bottom2: '42' }).win).toBe(true);
  });
  it('seq_tail: เลขวิ่ง — ท้าย n ตัวของ source sequence', () => {
    const r = rule({ mode: 'seq_tail', source: 'db5' });
    // db5 [1,2,3,4,5] → slice(-2) = '4-5'
    expect(evaluateBet(r, '4-5', { db5: [1, 2, 3, 4, 5] }).win).toBe(true);
    expect(evaluateBet(r, '5', { db5: [1, 2, 3, 4, 5] }).win).toBe(true);
    expect(evaluateBet(r, '3-4', { db5: [1, 2, 3, 4, 5] }).win).toBe(false);
  });
  it('contains: เลขอยู่ใน source list', () => {
    const r = rule({ mode: 'contains', source: 'zodiac' });
    expect(evaluateBet(r, '2024', { zodiac: ['2024', '2025'] }).win).toBe(true);
    expect(evaluateBet(r, '2023', { zodiac: ['2024', '2025'] }).win).toBe(false);
  });
});

describe('evaluateBet — โต๊ด (tod)', () => {
  const r = rule({ mode: 'tail', source: 'bottom2', tod: 60 }, { payout_multiplier: 90 });
  it('ตรงเป๊ะ = ชนะ (ได้อัตราโต๊ด)', () => {
    const res = evaluateBet(r, '24', { bottom2: '42' }, { todBet: true });
    expect(res.win).toBe(true);
    expect(res.multiplier).toBe(60);
  });
  it('สลับลำดับ = ชนะ', () => {
    expect(evaluateBet(r, '42', { bottom2: '42' }, { todBet: true }).win).toBe(true);
  });
  it('เลขไม่ตรงชุด = ไม่ชนะ', () => {
    expect(evaluateBet(r, '43', { bottom2: '42' }, { todBet: true }).win).toBe(false);
  });
  it('หลักไม่ครบจำนวน = ไม่ชนะ', () => {
    expect(evaluateBet(r, '2', { bottom2: '42' }, { todBet: true }).win).toBe(false);
  });
  it('กติกาไม่มี tod config = ไม่ชนะ', () => {
    const noTod = rule({ mode: 'tail', source: 'bottom2' });
    expect(evaluateBet(noTod, '42', { bottom2: '42' }, { todBet: true }).win).toBe(false);
  });
});

describe('evaluateBet — เลขอั้น', () => {
  it('เลขตรง ann → จ่ายครึ่งหนึ่งของ payout ปกติ', () => {
    const r = rule({ mode: 'tail', source: 'bottom2' }, { payout_multiplier: 90 });
    const res = evaluateBet(r, '55', { bottom2: '55', ann_bottom: ['55'] });
    expect(res.win).toBe(true);
    expect(res.multiplier).toBe(45); // floor(90/2)
  });
  it('เลขไม่อยู่ใน ann → จ่ายเต็ม', () => {
    const r = rule({ mode: 'tail', source: 'bottom2' }, { payout_multiplier: 90 });
    const res = evaluateBet(r, '55', { bottom2: '55', ann_bottom: ['66'] });
    expect(res.multiplier).toBe(90);
  });
  it('admin custom rate ชนะการหาร 2', () => {
    const r = rule({ mode: 'tail', source: 'bottom2' }, { payout_multiplier: 90 });
    const res = evaluateBet(r, '55', { bottom2: '55', ann_bottom: ['55'], ann_bottom_pay: { '55': 60 } });
    expect(res.multiplier).toBe(60);
  });
  it('กติกา ann_* ไม่หาร 2 ซ้ำ', () => {
    const r = rule({ mode: 'tail', source: 'bottom2' }, { payout_multiplier: 45, bet_type: 'ann_bottom' });
    const res = evaluateBet(r, '55', { bottom2: '55', ann_bottom: ['55'] });
    expect(res.multiplier).toBe(45);
  });
  it('เลข 3 หลักเช็ค ann_top', () => {
    const r = rule({ mode: 'exact', source: 'top3' }, { payout_multiplier: 850 });
    const res = evaluateBet(r, '123', { top3: '123', ann_top: ['123'] });
    expect(res.multiplier).toBe(425);
  });
});

describe('evaluateBet — edge cases', () => {
  it('ไม่มี source ในผล = ไม่ชนะ', () => {
    const r = rule({ mode: 'exact', source: 'bottom2' });
    const res = evaluateBet(r, '42', {});
    expect(res.win).toBe(false);
    expect(res.detail.reason).toBe('no_source');
  });
  it('raw เป็น array', () => {
    const r = rule({ mode: 'contains', source: 'zodiac' });
    expect(evaluateBet(r, '2024', { zodiac: ['2024', '2025'] }).win).toBe(true);
    expect(evaluateBet(r, '2024', { zodiac: '2024,2025' }).win).toBe(false); // string ไม่ split ใน contains mode
  });
});

describe('validateWinningNumbers', () => {
  it('accept ผลมาตรฐาน', () => {
    expect(() => validateWinningNumbers({ first: '123456', main: '654321', db5: '12345', num4: '1234', bottom2: '45' })).not.toThrow();
  });
  it('reject field ไม่รู้จัก', () => {
    expect(() => validateWinningNumbers({ bogus: 'x' })).toThrow();
  });
  it('reject ann_top_pay ผิด format', () => {
    expect(() => validateWinningNumbers({ ann_top_pay: 'notobject' })).toThrow();
  });
});

describe('validateBetNumber', () => {
  const r2 = { digits: 2, bet_type: '2bottom' };
  const r1 = { digits: 1, bet_type: 'run_bottom' };
  it('2 หลัก ต้องเป็นตัวเลข 2 หลัก', () => {
    expect(validateBetNumber(r2, '42')).toBe('42');
    expect(() => validateBetNumber(r2, '4')).toThrow();
    expect(() => validateBetNumber(r2, '4a')).toThrow();
    expect(() => validateBetNumber(r2, '123')).toThrow();
  });
  it('1 หลัก (วิ่ง) รับ 0-9', () => {
    expect(validateBetNumber(r1, '7')).toBe('7');
    expect(() => validateBetNumber(r1, '77')).toThrow();
  });
});

describe('annEntries / mergeAnnounce', () => {
  it('annEntries แยก top/bottom และ normalize', () => {
    const ann = { top: ['123', ' 456 '], bottom: ['55', '66'] };
    expect(annEntries(ann, 'top').map(e => e.num)).toEqual(['123', '456']);
    expect(annEntries(ann, 'bottom').map(e => e.num)).toEqual(['55', '66']);
    expect(annEntries(null, 'top')).toEqual([]);
    // format "เลข:อัตรา" → แยก mult
    expect(annEntries({ bottom: ['55:60'] }, 'bottom')).toEqual([{ num: '55', mult: 60 }]);
  });
  it('mergeAnnounce ย้าย announce เข้า winning_numbers (mutate in place)', () => {
    const w = { bottom2: '55' };
    mergeAnnounce(w, JSON.stringify({ top: ['123:600'], bottom: ['55'] }));
    expect(w.ann_top).toEqual(['123']);
    expect(w.ann_top_pay).toEqual({ '123': 600 });
    expect(w.ann_bottom).toEqual(['55']);
    expect(w.ann_bottom_pay).toBeUndefined();
  });
});
