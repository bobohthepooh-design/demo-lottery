// One-off: retheme client to Midnight Gold (neutral near-black + gold primary)
import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = new URL('./src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(jsx|css|js)$/.test(f)) files.push(p);
  }
})(ROOT);

// ordered replacements — longest/most-specific first
const R = [
  // index.css tokens: red-warm surfaces -> neutral
  ['--color-navy-950: #070405;', '--color-navy-950: #0a0a0d;'],
  ['--color-navy-900: #140a0d;', '--color-navy-900: #141419;'],
  ['--color-navy-800: #1e1015;', '--color-navy-800: #1d1d23;'],
  ['--color-navy-700: #3d1620;', '--color-navy-700: #34343d;'],
  ['--color-navy-600: #5e232e;', '--color-navy-600: #4d4d58;'],
  ['--color-navy-500: #96606c;', '--color-navy-500: #7e7e8c;'],
  ['--color-navy-400: #c08f98;', '--color-navy-400: #aaaab8;'],
  ['--color-navy-300: #e3c4c7;', '--color-navy-300: #d6d6e0;'],
  ['--color-navy-200: #f1e3e4;', '--color-navy-200: #e9e9ef;'],
  ['--color-navy-100: #fbf4f5;', '--color-navy-100: #f7f7fa;'],
  ['background-color: #070405;', 'background-color: #0a0a0d;'],
  ['rgba(220, 38, 38, 0.18)', 'rgba(226, 168, 18, 0.14)'],
  ['rgba(190, 18, 60, 0.12)', 'rgba(226, 168, 18, 0.08)'],
  ['color: #e3c4c7;', 'color: #d6d6e0;'],
  ['.text-navy-950 { color: #fbf4f5 !important; }', '.text-navy-950 { color: #f7f7fa !important; }'],
  ['border-color: #3d1620; }\n.border-navy-600 { border-color: #5e232e; }', 'border-color: #34343d; }\n.border-navy-600 { border-color: #4d4d58; }'],
  ['background: #1e1015;\n  font-family: var(--font-display);\n  letter-spacing: .02em;\n  color: #e3c4c7;', 'background: #1d1d23;\n  font-family: var(--font-display);\n  letter-spacing: .02em;\n  color: #d6d6e0;'],
  ['background: #2a1017;', 'background: #26262e;'],
  ['border-color: #3d1620; }', 'border-color: #34343d; }'],
  ['::placeholder { color: #96606c; opacity: 1; }', '::placeholder { color: #7e7e8c; opacity: 1; }'],
  ['linear-gradient(90deg, #1e1015 25%, #38141d 50%, #1e1015 75%)', 'linear-gradient(90deg, #1d1d23 25%, #2e2e38 50%, #1d1d23 75%)'],
  ['::-webkit-scrollbar-track { background: #140a0d; }', '::-webkit-scrollbar-track { background: #141419; }'],
  ['::-webkit-scrollbar-thumb { background: #3d1620; border-radius: 8px; border: 2px solid #140a0d; }', '::-webkit-scrollbar-thumb { background: #34343d; border-radius: 8px; border: 2px solid #141419; }'],
  ['rgba(220, 38, 38, 0.22)', 'rgba(226, 168, 18, 0.20)'],
  ['rgba(190, 18, 60, 0.16)', 'rgba(226, 168, 18, 0.10)'],
  ['.casino-table {\n  background:\n    radial-gradient(130% 110% at 50% -10%, rgba(220, 38, 38, 0.20), transparent 55%),', '.casino-table {\n  background:\n    radial-gradient(130% 110% at 50% -10%, rgba(226, 168, 18, 0.16), transparent 55%),'],
  ['linear-gradient(165deg, #3d1420 0%, #1e0d13 52%, #2a1018 100%);', 'linear-gradient(165deg, #26262e 0%, #17171d 52%, #1d1d23 100%);'],
  ['0 0 26px rgba(220, 38, 38, 0.10);', '0 0 26px rgba(226, 168, 18, 0.12);'],
  ['background: linear-gradient(180deg, #070405 0%, #140a0d 100%);', 'background: linear-gradient(180deg, #0a0a0d 0%, #141419 100%);'],
  ['.kicker { color: #f87171 !important; text-shadow: 0 0 12px rgba(220,38,38,0.35); }', '.kicker { color: #ffe08a !important; text-shadow: 0 0 12px rgba(226,168,18,0.4); }'],
  ['.kicker::after { background: linear-gradient(90deg, rgba(220,38,38,0.7), transparent); }', '.kicker::after { background: linear-gradient(90deg, rgba(226,168,18,0.7), transparent); }'],
  ['main a.text-gold-400:hover, main a.text-gold-300:hover { color: #fda4af !important; }', 'main a.text-gold-400:hover, main a.text-gold-300:hover { color: #fff3c4 !important; }'],
  ['radial-gradient(110% 80% at 50% -12%, rgba(220, 38, 38, 0.24), transparent 55%),', 'radial-gradient(110% 80% at 50% -12%, rgba(226, 168, 18, 0.20), transparent 55%),'],
  ['linear-gradient(168deg, #3d1420 0%, #2a1018 42%, #241016 78%, #1e0d13 100%);\n  background-color: #140a0d;', 'linear-gradient(168deg, #26262e 0%, #1d1d23 42%, #191920 78%, #17171d 100%);\n  background-color: #121216;'],
  ['rgba(12,6,9,0) 0%,rgba(12,6,9,0.92) 30%,rgba(12,6,9,0.96)', 'rgba(10,10,13,0) 0%,rgba(10,10,13,0.92) 30%,rgba(10,10,13,0.96)'],
  // JSX/Tailwind arbitrary values: red accent -> gold
  ['#e11d48', '#e2a812'],
  ['#fda4af', '#ffe08a'],
  ['#160a0e', '#141419'],
  ['#0a0508', '#0d0d10'],
  ['from-[#1e1015]/95 to-[#160a0e]/95', 'from-[#1d1d23]/95 to-[#141419]/95'],
  ['border-red-500/40', 'border-gold-500/40'],
  ['border-red-500/30', 'border-gold-500/30'],
  ['border-red-500/25', 'border-gold-500/25'],
  ['bg-red-500/15', 'bg-gold-500/15'],
  ['from-red-950/80', 'from-[#2a2110]/80'],
  ['to-red-950/80', 'to-[#2a2110]/80'],
  ['text-red-300', 'text-gold-300'],
  ['bg-red-400', 'bg-gold-400'],
  // WinTicker done above via red-* classes
  ['from-red-800 to-rose-950', 'from-yellow-700 to-amber-900'],
  ['border-red-500/40 bg-gradient-to-r from-red-500/15', 'border-gold-500/40 bg-gradient-to-r from-gold-500/15'],
  ['text-red-200">โปรโมชั่น', 'text-gold-200">โปรโมชั่น'],
  // Kiwi machine
  ['from-[#3d1420] via-[#2a1018] to-[#1e0d13]', 'from-[#26262e] via-[#1d1d23] to-[#141419]'],
  ['from-[#2a1018] to-[#170a0e]', 'from-[#1d1d23] to-[#0d0d10]'],
  ['border-red-400/30', 'border-gold-400/30'],
  ['border-red-400/40', 'border-gold-400/40'],
  ['border-red-400/50', 'border-gold-400/50'],
  ['from-red-500 to-red-700 text-white border-red-300', 'from-gold-400 to-gold-600 text-navy-950 border-gold-200'],
  ['bg-red-500/20 border-red-400/70 text-red-300', 'bg-gold-500/20 border-gold-400/70 text-gold-300'],
  ['from-red-600 to-red-800 text-white font-black py-3.5 text-sm tracking-wide shadow-lg shadow-red-900/40', 'from-gold-500 to-gold-600 text-navy-950 font-black py-3.5 text-sm tracking-wide shadow-lg shadow-[0_0_24px_rgba(226,168,18,0.35)]'],
  ["'radial-gradient(circle at 35% 30%, #fca5a5, #dc2626 60%, #7f1d1d)'", "'radial-gradient(circle at 35% 30%, #fff3c4, #e2a812 60%, #92600a)'"],
  ['text-red-300/80', 'text-gold-300/80'],
  // CasinoIcons tones
  ["green: ['#ffd7d7', '#dc2626', '#991b1b'],", "green: ['#fff3c4', '#e2a812', '#b8860b'],"],
  ["gray: ['#e8d8da', '#96606c', '#5e232e'],", "gray: ['#e8e8ec', '#7e7e8c', '#4d4d58'],"],
  // GameArt body
  ["'#160a0e'", "'#121216'"],
  // machine bodies
  ['from-[#33141d] to-[#170a0e]', 'from-[#26262e] to-[#121216]'],
];

let changed = 0;
for (const f of files) {
  let s = readFileSync(f, 'utf8');
  const orig = s;
  for (const [a, b] of R) s = s.split(a).join(b);
  if (s !== orig) { writeFileSync(f, s); changed++; console.log('updated', f); }
}
console.log(`done — ${changed} files`);
