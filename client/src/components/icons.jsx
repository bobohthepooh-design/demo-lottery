// Stroke icons สำหรับ admin — สไตล์ minimal 24x24 (แทน emoji ให้ดู professional)
const PATHS = {
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9.5V20h11V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" />
      <path d="M15.5 9.5a4 4 0 0 1 0 5M18 7a7.5 7.5 0 0 1 0 10" />
    </>
  ),
  volumeOff: (
    <>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  reports: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M7 20.5v-6M12 20.5V7M17 20.5v-9.5" />
    </>
  ),
  members: (
    <>
      <circle cx="9" cy="8.5" r="3.25" />
      <path d="M3.5 19.5c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5" />
      <path d="M15.5 5.6a3.25 3.25 0 0 1 0 5.8M17.8 14.9c1.7.8 2.9 2.5 3.2 4.6" />
    </>
  ),
  lotteries: (
    <>
      <path d="M3.5 8.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v1.8a2.2 2.2 0 0 0 0 4.4V16a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-1.3a2.2 2.2 0 0 0 0-4.4V8.5Z" />
      <path d="M13.5 6.5v3M13.5 11v3M13.5 15.5v3" />
    </>
  ),
  draws: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v3.5M16 3v3.5" />
    </>
  ),
  bets: (
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5a3 3 0 0 1 6 0" />
      <path d="M9 11.5l2 2 4-4.5" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11V8" />
      <rect x="4" y="7.5" width="16.5" height="12" rx="2" />
      <circle cx="16.8" cy="13.5" r="1.1" />
    </>
  ),
  banner: (
    <>
      <path d="M4 10.5v3a1 1 0 0 0 1 1h2.2l4.3 3.8V5.7L7.2 9.5H5a1 1 0 0 0-1 1Z" />
      <path d="M14.5 9.5a4 4 0 0 1 0 5M17.3 7a7.5 7.5 0 0 1 0 10" />
    </>
  ),
  audit: (
    <>
      <path d="M7 3.5h6.5L18 8v12.5H7z" />
      <path d="M13.5 3.5V8H18M10 12.5h6M10 16h6" />
    </>
  ),
  security: (
    <>
      <path d="M12 3.5l6.5 2.6v5.4c0 4.3-2.7 7.3-6.5 8.5-3.8-1.2-6.5-4.2-6.5-8.5V6.1L12 3.5Z" />
      <path d="M9.2 12l2 2 3.6-4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" />
    </>
  ),
  roles: (
    <>
      <circle cx="8.5" cy="14.5" r="3.5" />
      <path d="M11.3 11.7 19 4M16 7l2.5 2.5M13.5 9.5 16 12" />
    </>
  ),
  chat: (
    <>
      <path d="M4 5.5h16v11H9l-5 4v-15Z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </>,
  ),
  // player nav icons
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H4.5a3.5 3.5 0 0 0 3.6 3.5M16 5h3.5a3.5 3.5 0 0 1-3.6 3.5" />
      <path d="M12 13v3M8.5 20h7M10 16h4l.8 4H9.2L10 16Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  ticket: (
    <>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z" />
      <path d="M14 7v2M14 11v2M14 15v2" strokeDasharray="1 2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1.5-3.5 4.5-5 7.5-5s6 1.5 7.5 5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9.5a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13.5 6 9.5" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4.5h3.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H14" />
      <path d="m10 8-4 4 4 4M6 12h9.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  bank: (
    <>
      <path d="M3.5 9.5 12 4l8.5 5.5" />
      <path d="M5 9.5V18M9.5 9.5V18M14.5 9.5V18M19 9.5V18" />
      <path d="M3.5 18.5h17M12 4v14.5" />
    </>
  ),
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M18 18h2v2h-2z" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3.5" width="10" height="17" rx="2.5" />
      <path d="M11 17.5h2" />
    </>
  ),
  // lottery type icons — stroke style เดียวกับ nav icons
  th: ( // หวยรัฐบาลไทย — ธงริ้ว
    <>
      <path d="M8 3.5v17" />
      <path d="M8 4.5h12.5l-3 3.75 3 3.75H8z" />
      <path d="M8 8.25h11.6M8 12h11.6" />
    </>
  ),
  la: ( // หวยลาว — ธงแถบ + วงกลมขาว
    <>
      <path d="M8 3.5v17" />
      <path d="M8 4.5h12.5v15H8z" />
      <path d="M8 8h12.5M8 16h12.5" />
      <circle cx="14.25" cy="12" r="2.75" />
    </>
  ),
  hn: ( // หวยฮานอย — ธงดาว
    <>
      <path d="M8 3.5v17" />
      <path d="M8 4.5h12.5l-3 3.5 3 3.5H8z" />
      <path d="M14 6l.5 1.1 1.2.1-1 .9.3 1.2-1-.6-.9.6.3-1.2-.9-.9 1.2-.1z" />
    </>
  ),
  hr: ( // หวยราศี — วงล้อนักษัตร
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="2.2" />
    </>
  ),
  ki: ( // เกมยี่กี — ผลกีวี
    <>
      <ellipse cx="12" cy="12" rx="8" ry="9" />
      <ellipse cx="12" cy="12" rx="4.5" ry="6" />
      <circle cx="10" cy="9" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="14" cy="9" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="10" cy="12" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="14" cy="12" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="10" cy="15" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="14" cy="15" r="0.55" fill="currentColor" stroke="none" />
    </>
  ),
  sc: ( // หวยขูด — ตั๋ว
    <>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z" />
      <path d="M14 7v2M14 11v2M14 15v2" strokeDasharray="1 2" />
    </>
  ),
  hl: ( // ไฮโล — ลูกเต๋า
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1" fill="currentColor" stroke="none" />
    </>
  ),
};

export function Icon({ name, className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
