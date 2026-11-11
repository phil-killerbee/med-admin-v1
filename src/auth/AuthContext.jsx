import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import * as authService from '../services/authService';
import { AUTH_EXPIRED_EVENT } from '../services/http';
import { getPermissions } from '../domain/permissions';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  // Au démarrage : restaurer la session existante.
  useEffect(() => {
    authService.fetchCurrentUser().then((u) => {
      setUser(u);
      setInitializing(false);
    });
  }, []);

  // Si le "serveur" invalide la session (compte désactivé...), on déconnecte l'UI.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (loginName, password) => {
    const u = await authService.login(loginName, password);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  }, []);

  // useMemo : la valeur du contexte ne change que si l'utilisateur change
  // → évite de re-rendre toute l'application inutilement.
  const value = useMemo(() => {
    const permissions = getPermissions(user);
    return {
      user,
      initializing,
      permissions,
      login,
      logout,
      can: (permission) => permissions.includes(permission),
      canAny: (list) => list.some((p) => permissions.includes(p)),
    };
  }, [user, initializing, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
