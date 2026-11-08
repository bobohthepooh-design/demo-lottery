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
import Wallet from './pages/Wallet.jsx';
import MyBets from './pages/MyBets.jsx';
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

function Protected({ children, admin = false }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div className="p-10 text-center text-navy-300">กำลังโหลด...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
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
            <Route path="reports" element={<AdminReports />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="security" element={<AdminSecurity />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="banner" element={<AdminBanner />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
