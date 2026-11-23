// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getTz, setTz, fmtDateTime, thaiDate, thaiTime, drawLabel } from '../src/time.js';

beforeEach(() => { localStorage.clear(); });

describe('time utils — timezone handling', () => {
  it('getTz default undefined, setTz persist + เคลียร์ได้', () => {
    expect(getTz()).toBeUndefined();
    setTz('Asia/Bangkok');
    expect(getTz()).toBe('Asia/Bangkok');
    setTz('');
    expect(getTz()).toBeUndefined();
  });

  it('fmtDateTime แปลง UTC sql → local ตาม tz ที่เลือก', () => {
    // 2025-06-15 12:00:00 UTC = 19:00 Bangkok
    setTz('Asia/Bangkok');
    const out = fmtDateTime('2025-06-15 12:00:00');
    expect(out).toContain('19:');
    expect(out).toContain('2568'); // พ.ศ. ใน locale th-TH
  });

  it('fmtDateTime input ว่าง/invalid → safe', () => {
    expect(fmtDateTime('')).toBe('');
    expect(fmtDateTime('garbage')).toBe('garbage');
  });

  it('thaiDate/thaiTime คืนรูปแบบไทย', () => {
    setTz('Asia/Bangkok');
    expect(thaiDate('2025-06-15 12:00:00')).toBeTruthy();
    expect(thaiTime('2025-06-15 12:00:00')).toMatch(/\d/);
  });
});
