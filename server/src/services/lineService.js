import { config } from '../config.js';

// LINE Messaging API push — ต้องตั้ง LINE_CHANNEL_ACCESS_TOKEN (Messaging API channel)
// userId ของผู้ใช้ LINE Login เก็บใน email รูปแบบ line_<userId>@line.local

export function lineUserIdFromEmail(email) {
  const m = /^line_([A-Za-z0-9]+)@line\.local$/.exec(String(email || ''));
  return m ? m[1] : null;
}

export async function sendLineMessage(lineUserId, text) {
  if (!config.line.channelAccessToken) return { sent: false, reason: 'not-configured' };
  if (!lineUserId) return { sent: false, reason: 'no-user-id' };
  try {
    const r = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.line.channelAccessToken}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: 'text', text: String(text).slice(0, 4900) }],
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      // 403/404 = ผู้ใช้ยังไม่ add OA เป็นเพื่อน — ไม่ retry
      console.error(`[line] push failed ${r.status}: ${body.slice(0, 200)}`);
      return { sent: false, reason: `http-${r.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error('[line] push error:', e.message);
    return { sent: false, reason: e.message };
  }
}
