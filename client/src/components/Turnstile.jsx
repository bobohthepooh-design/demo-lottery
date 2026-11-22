import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// Cloudflare Turnstile widget — โหลด client-config ครั้งเดียว (module cache)
// ถ้า server ไม่ได้ตั้ง TURNSTILE_SITE_KEY → return null (ไม่แสดง widget, server ก็ไม่บังคับ)
let cfgPromise = null;
function loadClientConfig() {
  if (!cfgPromise) cfgPromise = api('/auth/client-config').catch(() => ({ turnstileSiteKey: '', mailConfigured: false }));
  return cfgPromise;
}

export function useClientConfig() {
  const [cfg, setCfg] = useState({ turnstileSiteKey: '', mailConfigured: false });
  useEffect(() => { loadClientConfig().then(setCfg); }, []);
  return cfg;
}

export default function Turnstile({ onVerify }) {
  const cfg = useClientConfig();
  const ref = useRef(null);
  const [token, setToken] = useState('');

  useEffect(() => {
    if (!cfg.turnstileSiteKey || !ref.current) return;
    const id = `ts-${Math.random().toString(36).slice(2)}`;
    window.turnstile?.remove?.(ref.current);
    const render = () => {
      if (!window.turnstile || !ref.current) return;
      window.turnstile.render(ref.current, {
        sitekey: cfg.turnstileSiteKey,
        callback: (t) => { setToken(t); onVerify?.(t); },
        'expired-callback': () => setToken(''),
        'error-callback': () => setToken(''),
      });
    };
    if (window.turnstile) { render(); return; }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true; s.defer = true;
    s.onload = render;
    document.head.appendChild(s);
    return () => { try { window.turnstile?.remove?.(ref.current); } catch {} };
  }, [cfg.turnstileSiteKey]);

  if (!cfg.turnstileSiteKey) return null;
  return <div ref={ref} className="flex justify-center" data-token={token} />;
}
