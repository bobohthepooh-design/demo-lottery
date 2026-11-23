// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Countdown from './Countdown.jsx';

afterEach(() => { cleanup(); vi.useRealTimers(); });

// เวลาปิดรับในอนาคต 2 ชม. จาก "ตอนนี้" ที่ fix ไว้
const CLOSE = '2025-06-15 14:30:00'; // UTC

describe('Countdown component', () => {
  it('แสดงเวลานับถอยหลังเมื่อยังไม่ปิด', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    render(<Countdown closeAt={CLOSE} />);
    expect(screen.getByText(/เหลืออีก 2 ชม/)).toBeTruthy();
  });

  it('แสดง "ปิดรับแล้ว" เมื่อเลยเวลา', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T15:00:00Z'));
    render(<Countdown closeAt={CLOSE} />);
    expect(screen.getByText(/ปิดรับแล้ว/)).toBeTruthy();
  });

  it('return null เมื่อ closeAt parse ไม่ได้', () => {
    const { container } = render(<Countdown closeAt="ไม่ใช่เวลา" />);
    expect(container.firstChild).toBeNull();
  });
});
