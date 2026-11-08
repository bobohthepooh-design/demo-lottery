import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
import WinningBoard from '../components/WinningBoard.jsx';
import { useAuth } from '../auth.jsx';

export default function Home() {
  const { user, balance } = useAuth();
  const [types, setTypes] = useState([]);
  const [draws, setDraws] = useState([]);
  const [results, setResults] = useState([]);

  useEffect(() => {
    api('/lottery/types').then(r => setTypes(r.types)).catch(() => {});
    api('/lottery/draws?upcoming=1').then(r => setDraws(r.draws.slice(0, 6))).catch(() => {});
    if (user) api('/lottery/results').then(r => setResults(r.results.slice(0, 5))).catch(() => {});
  }, [user]);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 border border-gold-500/30 p-8 md:p-12">
        <div className="absolute -right-10 -top-10 w-64 h-64 rounded-full bg-gold-500/10 blur-3xl" />
        <div className="relative">
          <div className="inline-block text-xs bg-gold-500/20 text-gold-300 border border-gold-500/40 rounded-full px-3 py-1 mb-4">DEMO ONLY — ระบบจำลองเพื่อการศึกษา</div>
          <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">
            ทดลองระบบหวย<span className="text-gold-400">ออนไลน์</span><br />อย่างปลอดภัย
          </h1>
          <p className="mt-3 text-navy-200 max-w-xl">
            ระบบจำลองสำหรับการศึกษา รองรับหวยไทย หวยลาว และหวยฮานอย
            ใช้เครดิตเสมือนเท่านั้น ไม่มีการใช้เงินจริง
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {user ? (
              <Link to="/lotteries" className="bg-gold-500 text-navy-950 font-bold px-6 py-3 rounded-xl hover:bg-gold-400">เริ่มแทงหวย</Link>
            ) : (
              <>
                <Link to="/register" className="bg-gold-500 text-navy-950 font-bold px-6 py-3 rounded-xl hover:bg-gold-400">สมัครสมาชิกฟรี</Link>
                <Link to="/login" className="border border-navy-600 text-navy-100 px-6 py-3 rounded-xl hover:bg-navy-800">เข้าสู่ระบบ</Link>
              </>
            )}
          </div>
          {user && (
            <div className="mt-6 inline-flex items-center gap-3 bg-navy-900/70 border border-gold-500/30 rounded-xl px-5 py-3">
              <span className="text-sm text-navy-300">เครดิตจำลองของคุณ</span>
              <span className="text-2xl font-bold text-gold-400">฿{satang(balance)}</span>
            </div>
          )}
        </div>
      </section>

      {/* Lottery types */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">ประเภทหวยที่รองรับ</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {types.map(t => (
            <Link key={t.id} to={`/lotteries?type=${t.id}`}
              className="bg-navy-800 border border-navy-700 rounded-xl p-5 hover:border-gold-500/50 transition group">
              <div className="text-3xl mb-2">{t.code === 'TH' ? '🇹🇭' : t.code === 'LA' ? '🇱🇦' : '🇻🇳'}</div>
              <div className="font-bold text-white group-hover:text-gold-300">{t.name_th}</div>
              <div className="text-xs text-navy-300 mt-1">{t.description}</div>
            </Link>
          ))}
          {!types.length && <div className="text-navy-300">กำลังโหลด...</div>}
        </div>
      </section>

      {/* Upcoming draws */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">รอบหวยที่เปิดรับ</h2>
          <Link to="/lotteries" className="text-sm text-gold-400 hover:underline">ดูทั้งหมด →</Link>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {draws.map(d => (
            <div key={d.id} className="bg-navy-800 border border-navy-700 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">{d.type_name_th} — {d.draw_code}</div>
                <div className="text-xs text-navy-300 mt-1">
                  ออกรางวัล: {fmtDateTime(d.draw_at)} • ปิดรับ: {fmtDateTime(d.close_at)}
                </div>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded ${d.status === 'open' ? 'bg-green-500/20 text-green-300' : 'bg-navy-700 text-navy-300'}`}>
                {d.status === 'open' ? 'เปิดรับ' : d.status}
              </span>
            </div>
          ))}
          {!draws.length && <div className="text-navy-300">ยังไม่มีรอบหวยที่เปิดรับ</div>}
        </div>
      </section>

      {/* Recent results */}
      {results.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-white mb-4">ผลรางวัลล่าสุด</h2>
          <div className="bg-navy-800 border border-navy-700 rounded-xl divide-y divide-navy-700">
            {results.map(r => (
              <div key={r.id} className="px-4 py-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-semibold text-white">{r.type_name_th}</span>
                    <span className="text-navy-300 text-sm ml-2">{r.draw_code}</span>
                  </div>
                  <span className="text-xs text-navy-400">{fmtDateTime(r.draw_at)}</span>
                </div>
                <WinningBoard winningNumbers={r.winning_numbers} typeCode={r.type_code} compact />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
