// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Results from './Results.jsx';

const apiMock = vi.fn();
vi.mock('../api.js', async (importOriginal) => {
  const orig = await importOriginal();
  return { ...orig, api: (...args) => apiMock(...args) };
});
vi.mock('../auth.jsx', () => ({ useAuth: () => ({ user: null, setBalance: () => {} }) }));

// วันที่ไทยแบบเดียวกับ component (UTC+7)
const bkkToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const shiftDayStr = (s, n) => {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const TODAY = bkkToday();
const YEST = shiftDayStr(TODAY, -1);

const mkDraw = (id, code, date) => ({
  id, draw_code: code, draw_at: `${date} 10:00:00`, close_at: `${date} 09:30:00`,
  status: 'settled', type_code: 'TH', type_name_th: 'หวยไทย',
  category_code: 'gov', category_name_th: 'รัฐบาล',
  result_source: 'demo', winning: { first: '123' }, source_checks: [],
});

const DRAWS = {
  [TODAY]: [mkDraw(1, 'DD-TODAY-001', TODAY)],
  [YEST]: [mkDraw(2, 'DD-YEST-001', YEST)],
};

const LATEST_RESULT = {
  type_code: 'TH', category_code: 'gov', category_name_th: 'รัฐบาล', type_name_th: 'หวยไทย',
  draw_code: 'LATEST-001', draw_at: `${TODAY} 10:00:00`, winning: { first: '999' }, source: 'demo',
};

function mockApi({ pendingDates = [] } = {}) {
  apiMock.mockImplementation((path) => {
    if (path.startsWith('/lottery/today')) {
      const date = new URLSearchParams(path.split('?')[1]).get('date');
      if (pendingDates.includes(date)) return new Promise(() => {}); // ไม่ resolve — จำลองกำลังโหลด
      return Promise.resolve({ date, draws: DRAWS[date] || [] });
    }
    if (path.startsWith('/lottery/results')) return Promise.resolve({ results: [LATEST_RESULT] });
    if (path.startsWith('/lottery/winners')) return Promise.resolve({ winners: [] });
    if (path.startsWith('/lottery/history')) return Promise.resolve({ draws: [] });
    if (path.startsWith('/lottery/stats')) return Promise.reject(new Error('no stats'));
    return Promise.resolve({});
  });
}

const renderPage = () => render(<MemoryRouter><Results /></MemoryRouter>);

afterEach(() => { cleanup(); apiMock.mockReset(); });

describe('Results — เลือกวัน', () => {
  it('กดปุ่มวันแล้วเรียก API ด้วยวันที่ใหม่และแสดงผลของวันนั้น', async () => {
    mockApi();
    renderPage();
    await screen.findByText('DD-TODAY-001');

    fireEvent.click(screen.getByRole('button', { name: /เมื่อวาน/ }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith(`/lottery/today?date=${YEST}`));
    await screen.findByText('DD-YEST-001');
    expect(screen.queryByText('DD-TODAY-001')).toBeNull();
  });

  it('เปลี่ยนวันแล้วล้างข้อมูลวันเก่าทิ้งและแสดงสถานะกำลังโหลดทันที', async () => {
    mockApi({ pendingDates: [YEST] }); // fetch ของเมื่อวานค้างไว้
    renderPage();
    await screen.findByText('DD-TODAY-001');

    fireEvent.click(screen.getByRole('button', { name: /เมื่อวาน/ }));

    // ต้องไม่แสดงผลของวันเก่าค้างไว้ระหว่างรอ fetch ใหม่
    await waitFor(() => expect(screen.queryByText('DD-TODAY-001')).toBeNull());
    expect(screen.getAllByText('กำลังโหลด…').length).toBeGreaterThan(0);
  });

  it('การ์ดผลล่าสุดทุกตลาดอยู่เหนือตารางออกรางวัล (layout LC)', async () => {
    mockApi();
    renderPage();
    const tableHeader = await screen.findByText(/ตารางออกรางวัล.*รอบ/);
    const latestHeader = await screen.findByText(/ผลล่าสุดทุกตลาด/);
    // DOCUMENT_POSITION_FOLLOWING = latestHeader อยู่ก่อน tableHeader ใน DOM
    expect(latestHeader.compareDocumentPosition(tableHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
