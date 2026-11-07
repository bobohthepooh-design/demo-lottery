import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, resetCsrf } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const me = await api('/auth/me');
      setUser(me.user);
      setBalance(me.balance);
      setMfaRequired(!me.user.mfaVerified);
    } catch {
      setUser(null); setBalance(0); setMfaRequired(false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    const onExpired = () => { setUser(null); setBalance(0); };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [refresh]);

  const login = async (username, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { username, password } });
    setMfaRequired(!!r.requiresMfa);
    if (!r.requiresMfa) await refresh();
    return r;
  };

  const verifyMfa = async (code) => {
    await api('/auth/mfa/verify', { method: 'POST', body: { code } });
    setMfaRequired(false);
    await refresh();
  };

  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    resetCsrf();
    setUser(null); setBalance(0); setMfaRequired(false);
  };

  const isAdmin = !!user && (user.roles || []).some(r => ['admin', 'super_admin'].includes(r));

  return (
    <AuthCtx.Provider value={{ user, balance, setBalance, loading, login, logout, refresh, verifyMfa, mfaRequired, isAdmin }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
