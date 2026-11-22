import { Component, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import { appMode, MODE_HOME } from './appMode.js';
// code splitting — หน้าอื่นโหลดเป็น chunk แยก (bundle หลักเล็กลง ~40%)
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Lotteries = lazy(() => import('./pages/Lotteries.jsx'));
const PlaceBet = lazy(() => import('./pages/PlaceBet.jsx'));
const Winners = lazy(() => import('./pages/Winners.jsx'));
const Results = lazy(() => import('./pages/Results.jsx'));
const Check = lazy(() => import('./pages/Check.jsx'));
const EmbedResults = lazy(() => import('./pages/EmbedResults.jsx'));
const Wallet = lazy(() => import('./pages/Wallet.jsx'));
const MyBets = lazy(() => import('./pages/MyBets.jsx'));
const Scratch = lazy(() => import('./pages/Scratch.jsx'));
const Hilo = lazy(() => import('./pages/Hilo.jsx'));
const Kiwi = lazy(() => import('./pages/Kiwi.jsx'));
const Legal = lazy(() => import('./pages/Legal.jsx'));
const Performance = lazy(() => import('./pages/Performance.jsx'));
const AdminLayout = lazy(() => import('./admin/AdminLayout.jsx'));
const AdminOverview = lazy(() => import('./admin/Overview.jsx'));
const AdminMembers = lazy(() => import('./admin/Members.jsx'));
const AdminRoles = lazy(() => import('./admin/Roles.jsx'));
const AdminLotteries = lazy(() => import('./admin/Lotteries.jsx'));
const AdminDraws = lazy(() => import('./admin/Draws.jsx'));
const AdminWallet = lazy(() => import('./admin/WalletAdmin.jsx'));
const AdminPayments = lazy(() => import('./admin/Payments.jsx'));
const AdminBets = lazy(() => import('./admin/Bets.jsx'));
const AdminReports = lazy(() => import('./admin/Reports.jsx'));
const AdminHealth = lazy(() => import('./admin/Health.jsx'));
const AdminAudit = lazy(() => import('./admin/Audit.jsx'));
const AdminSecurity = lazy(() => import('./admin/Security.jsx'));
const AdminSettings = lazy(() => import('./admin/Settings.jsx'));
const AdminBanner = lazy(() => import('./admin/Banner.jsx'));
const AdminChat = lazy(() => import('./admin/Chat.jsx'));
const AdminBroadcast = lazy(() => import('./admin/Broadcast.jsx'));
const BetHub = lazy(() => import('./pages/BetHub.jsx'));
const GamesHub = lazy(() => import('./pages/GamesHub.jsx'));

// หน้าแรกตาม "โดเมน" (port): portal → Home, bet → /play, games → /games
function ModeHome() {
  const mode = appMode();
  if (mode === 'portal') return <Home />;
  return <Navigate to={MODE_HOME[mode]} replace />;
}

function Protected({ children, admin = false }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div className="p-10"><div className="skeleton h-8 w-48 mx-auto mb-6" /><div className="skeleton h-64 w-full max-w-3xl mx-auto" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

class ErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) return (
      <div className="min-h-screen bg-navy-950 text-white p-6">
        <div className="max-w-xl mx-auto mt-10 bg-red-500/10 border border-red-500/40 rounded-2xl p-6">
          <h1 className="text-xl font-bold text-gold-300 mb-2">เกิดข้อผิดพลาดของหน้าเว็บ</h1>
          <pre className="text-xs text-navy-200 whitespace-pre-wrap break-all">{String(this.state.err?.message || this.state.err)}</pre>
          <button onClick={() => { this.setState({ err: null }); window.location.reload(); }}
            className="mt-4 bg-gold-500 text-navy-950 font-bold px-4 py-2 rounded-lg">โหลดหน้าใหม่</button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <Suspense fallback={<div className="p-10"><div className="skeleton h-8 w-48 mx-auto mb-6" /><div className="skeleton h-64 w-full max-w-3xl mx-auto" /></div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<ModeHome />} />
          <Route path="/play" element={<BetHub />} />
          <Route path="/games" element={<GamesHub />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/lotteries" element={<Lotteries />} />
          <Route path="/profile" element={<Protected><Profile /></Protected>} />
          <Route path="/bet/:drawId" element={<Protected><PlaceBet /></Protected>} />
          <Route path="/wallet" element={<Protected><Wallet /></Protected>} />
          <Route path="/my-bets" element={<Protected><MyBets /></Protected>} />
          <Route path="/winners" element={<Winners />} />
          <Route path="/results" element={<Results />} />
          <Route path="/check" element={<Check />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="/scratch" element={<Protected><Scratch /></Protected>} />
          <Route path="/hilo" element={<Protected><Hilo /></Protected>} />
          <Route path="/kiwi" element={<Protected><Kiwi /></Protected>} />
          <Route path="/performance" element={<Protected><Performance /></Protected>} />
          <Route path="/admin" element={<Protected admin><AdminLayout /></Protected>}>
            <Route index element={<AdminOverview />} />
            <Route path="members" element={<AdminMembers />} />
            <Route path="roles" element={<AdminRoles />} />
            <Route path="lotteries" element={<AdminLotteries />} />
            <Route path="draws" element={<AdminDraws />} />
            <Route path="settle" element={<Navigate to="/admin/lotteries?tab=settle" replace />} />
            <Route path="wallet" element={<AdminWallet />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="bets" element={<AdminBets />} />
            <Route path="my-bets" element={<MyBets />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="health" element={<AdminHealth />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="security" element={<AdminSecurity />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="banner" element={<AdminBanner />} />
            <Route path="chat" element={<AdminChat />} />
            <Route path="broadcast" element={<AdminBroadcast />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        {/* embed widget — ไม่มี Layout สำหรับใช้ใน iframe */}
        <Route path="/embed/results" element={<EmbedResults />} />
      </Routes>
      </Suspense>
    </AuthProvider>
    </ErrorBoundary>
  );
}
