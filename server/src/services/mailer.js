import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

// Mailer — ส่งอีเมลจริงผ่าน SMTP (Brevo/Resend/Gmail app password — ฟรี)
// ถ้าไม่ได้ตั้ง SMTP_HOST → dev mode: log อย่างเดียว + คืน devToken ให้ caller echo บน private IP
let _tx = null;
function transport() {
  if (!config.smtp.host) return null;
  if (!_tx) {
    _tx = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return _tx;
}

export const mailConfigured = () => !!config.smtp.host;

export async function sendMail({ to, subject, text, html }) {
  const tx = transport();
  if (!tx) {
    logger.info('mail(dev)', `to=${to} subject=${subject}\n${text}`);
    return { sent: false, dev: true };
  }
  await tx.sendMail({ from: config.smtp.from, to, subject, text, html });
  return { sent: true };
}
