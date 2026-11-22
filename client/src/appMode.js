// "โดเมน" จำลองด้วย port — รอ domain จริงแล้วค่อยแยกเป็น subdomain
// :80 / :4000 → portal (หน้าหลัก ผลรางวัล กระเป๋า)
// :8083        → bet    (provider — เลือกหวย/รอบแทง)
// :8084        → games  (เกมด่วน)
// override ทดสอบ: ?app=bet|games|portal
export function appMode() {
  try {
    const q = new URLSearchParams(window.location.search).get('app');
    if (q === 'bet' || q === 'games' || q === 'portal') return q;
  } catch {}
  const p = window.location.port;
  if (p === '8083') return 'bet';
  if (p === '8084') return 'games';
  return 'portal';
}

// path หน้าแรกของแต่ละโหมด
export const MODE_HOME = { portal: '/', bet: '/play', games: '/games' };
