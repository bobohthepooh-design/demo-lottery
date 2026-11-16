import { Component } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Profile from './pages/Profile.jsx';
import Lotteries from './pages/Lotteries.jsx';
import PlaceBet from './pages/PlaceBet.jsx';
import Winners from './pages/Winners.jsx';
import Results from './pages/Results.jsx';
import EmbedResults from './pages/EmbedResults.jsx';
import Wallet from './pages/Wallet.jsx';
import MyBets from './pages/MyBets.jsx';
import Scratch from './pages/Scratch.jsx';
import Hilo from './pages/Hilo.jsx';
import Kiwi from './pages/Kiwi.jsx';
import Performance from './pages/Performance.jsx';
import AdminLayout from './admin/AdminLayout.jsx';
import AdminOverview from './admin/Overview.jsx';
import AdminMembers from './admin/Members.jsx';
import AdminRoles from './admin/Roles.jsx';
import AdminLotteries from './admin/Lotteries.jsx';
import AdminDraws from './admin/Draws.jsx';
import AdminWallet from './admin/WalletAdmin.jsx';
import AdminBets from './admin/Bets.jsx';
import AdminReports from './admin/Reports.jsx';
import AdminAudit from './admin/Audit.jsx';
import AdminSecurity from './admin/Security.jsx';
import AdminSettings from './admin/Settings.jsx';
import AdminBanner from './admin/Banner.jsx';
import AdminChat from './admin/Chat.jsx';
import AdminBroadcast from './admin/Broadcast.jsx';

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
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
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
            <Route path="bets" element={<AdminBets />} />
            <Route path="my-bets" element={<MyBets />} />
            <Route path="reports" element={<AdminReports />} />
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
    </AuthProvider>
    </ErrorBoundary>
  );
}
