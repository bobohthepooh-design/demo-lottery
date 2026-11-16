import { getSetting } from './settingsService.js';

// ส่งข้อความไป Telegram — ตั้งค่าใน system_settings:
//   telegram_bot_token  (จาก @BotFather)
//   telegram_chat_id    (group/channel id หรือ user id — สำหรับ @myidbot หาได้)
// ถ้าไม่ได้ตั้งค่าจะ no-op (ไม่ throw)
export async function sendTelegram(text) {
  const token = await getSetting('telegram_bot_token', null);
  const chatId = await getSetting('telegram_chat_id', null);
  if (!token || !chatId || !text) return { sent: false };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) { console.error('[telegram] HTTP', r.status); return { sent: false }; }
    return { sent: true };
  } catch (e) {
    console.error('[telegram] send failed:', e.message);
    return { sent: false };
  }
}
