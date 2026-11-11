import { useContext } from 'react';
import { AuthContext } from './AuthContext';

/** Hook personnalisé : point d'accès unique au contexte d'authentification. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}
