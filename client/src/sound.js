// เสียง casino แบบ procedural — Web Audio API ไม่ต้องมีไฟล์เสียง
// เสียงทั้งหมด synthesize: chip clink / coin jingle / thud / crowd murmur
// เปิด-ปิดได้ (เก็บใน localStorage) — AudioContext resume ตอน user gesture แรก

const LS_KEY = 'lp:soundOn';
let ctx = null;
let master = null;
let ambience = null;
let enabled = typeof localStorage !== 'undefined' && localStorage.getItem(LS_KEY) !== '0';

export function isSoundOn() { return enabled; }

export function setSoundOn(v) {
  enabled = !!v;
  try { localStorage.setItem(LS_KEY, enabled ? '1' : '0'); } catch {}
  if (!enabled) stopAmbience();
  else startAmbience();
}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// resume context ตอน interaction แรก (browser autoplay policy)
if (typeof window !== 'undefined') {
  const kick = () => { if (enabled) { ac(); startAmbience(); } window.removeEventListener('pointerdown', kick); };
  window.addEventListener('pointerdown', kick);
}

function noiseBuffer(c, seconds = 1) {
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// เสียง chip ปะทะ — noise สั้น bandpass ~3kHz + ping เล็กน้อย
function chip(c, t, vol = 0.5) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.08);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 2800 + Math.random() * 1200; bp.Q.value = 9;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  src.connect(bp); bp.connect(g); g.connect(master);
  src.start(t); src.stop(t + 0.1);
  // metallic ping
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.value = 5200 + Math.random() * 1600;
  const og = c.createGain();
  og.gain.setValueAtTime(vol * 0.25, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(og); og.connect(master);
  o.start(t); o.stop(t + 0.13);
}

// เสียงเหรียญกระทบกัน — ping sine หลายตัวสั้นๆ
function coin(c, t, vol = 0.4) {
  for (let i = 0; i < 4; i++) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = 3800 + Math.random() * 2400;
    const g = c.createGain();
    const tt = t + i * 0.05 + Math.random() * 0.02;
    g.gain.setValueAtTime(0, tt);
    g.gain.linearRampToValueAtTime(vol * (1 - i * 0.18), tt + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, tt + 0.3);
    o.connect(g); g.connect(master);
    o.start(tt); o.stop(tt + 0.32);
  }
}

// เสียงแพ้/ปิด — thud ต่ำ + เสียงซ่าเบาๆ
function thud(c, t, vol = 0.5) {
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.25);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + 0.4);
}

// เสียงขูด — noise ยาว bandpass กลางๆ (สำหรับหวยขูด)
function scratch(c, t, vol = 0.4) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.5);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.05);
  g.gain.linearRampToValueAtTime(0, t + 0.45);
  src.connect(bp); bp.connect(g); g.connect(master);
  src.start(t); src.stop(t + 0.5);
}

// เสียงเต๋าทอย — noise สั้นหลายครั้ง (rattle)
function dice(c, t, vol = 0.5) {
  for (let i = 0; i < 5; i++) {
    const tt = t + i * 0.09 + Math.random() * 0.03;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 0.06);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 900;
    const g = c.createGain();
    g.gain.setValueAtTime(0, tt);
    g.gain.linearRampToValueAtTime(vol * (1 - i * 0.12), tt + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, tt + 0.08);
    src.connect(hp); hp.connect(g); g.connect(master);
    src.start(tt); src.stop(tt + 0.09);
  }
}

// เสียงคนพูดคุยในคาสิโน — pink-ish noise เบาๆ loop (ambience)
function startAmbience() {
  if (ambience || !enabled) return;
  const c = ac();
  if (!c) return;
  // brown noise → lowpass = เสียงฝูงชนเบาๆ
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  const src = c.createBufferSource();
  src.buffer = buf; src.loop = true;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
  const g = c.createGain(); g.gain.value = 0.035;
  // LFO ให้เสียงหายใจขึ้นลง
  const lfo = c.createOscillator(); lfo.frequency.value = 0.13;
  const lfoG = c.createGain(); lfoG.gain.value = 0.015;
  lfo.connect(lfoG); lfoG.connect(g.gain);
  src.connect(lp); lp.connect(g); g.connect(master);
  src.start(); lfo.start();
  ambience = { src, lfo, g };
}

function stopAmbience() {
  if (!ambience) return;
  try { ambience.src.stop(); ambience.lfo.stop(); } catch {}
  ambience = null;
}

// ---------- public API (เรียกจาก component) ----------
const play = (fn, vol) => {
  if (!enabled) return;
  const c = ac();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime + 0.01;
  try { fn(c, t, vol); } catch {}
};

export const sfx = {
  chip: () => play(chip, 0.55),
  bet: () => { play(chip, 0.5); setTimeout(() => play(chip, 0.4), 90); },
  coin: () => { play(coin, 0.5); setTimeout(() => play(coin, 0.35), 260); },
  win: () => { play(coin, 0.55); setTimeout(() => play(coin, 0.45), 200); setTimeout(() => play(coin, 0.35), 420); },
  lose: () => play(thud, 0.5),
  scratch: () => play(scratch, 0.4),
  dice: () => play(dice, 0.5),
};

// เริ่ม ambience เมื่อเปิดระบบ (หลัง gesture แรกเท่านั้น)
export function initSound() {
  if (!enabled) return;
  const c = ac();
  if (c && c.state === 'running') startAmbience();
}
