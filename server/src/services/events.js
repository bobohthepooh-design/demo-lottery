// Server-Sent Events — broadcast ให้ client ทุกคนรู้ทันทีเมื่อแอดมินเปลี่ยนแปลง
// หรือเมื่อระบบออกผลรางวัล/สร้างรอบใหม่ โดยไม่ต้องรอ polling
const clients = new Set();

export function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  clients.add(res);
  const drop = () => clients.delete(res);
  req.on('close', drop);
  res.on('close', drop);
  res.on('error', drop); // client หลุดแบบไม่สมบูรณ์ — กัน uncaughtException ทำ server ดับ
}

const alive = (c) => !c.destroyed && !c.writableEnded;

// kind: 'settings' | 'results' | 'draws' | 'bets' — client ใช้ตัดสินใจว่าจะ refetch อะไร
export function broadcast(kind = 'update', data = {}) {
  if (!clients.size) return;
  const msg = `event: update\ndata: ${JSON.stringify({ kind, ...data })}\n\n`;
  for (const c of clients) {
    if (!alive(c)) { clients.delete(c); continue; }
    try { c.write(msg); } catch { clients.delete(c); }
  }
}

// heartbeat กัน proxy/browser ตัด connection เฉียบๆ
setInterval(() => {
  for (const c of clients) {
    if (!alive(c)) { clients.delete(c); continue; }
    try { c.write(': ping\n\n'); } catch { clients.delete(c); }
  }
}, 30000).unref();
