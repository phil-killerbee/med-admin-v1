import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { firstAllowedPath } from '../app/navigation';

/** Garde de route n°1 : utilisateur connecté ? Sinon → /login (en mémorisant la page demandée). */
export function RequireAuth() {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <div className="page-loading">Chargement…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/**
 * Garde de route n°2 : l'utilisateur a-t-il AU MOINS UNE des permissions requises ?
 * Sur la page d'accueil (`home`), on redirige vers le poste de l'utilisateur
 * (ex. Comptoir pour la vendeuse, Caisse pour le caissier) au lieu d'afficher 403.
 */
export function RequirePermission({ anyOf, home = false, children }) {
  const { canAny } = useAuth();
  if (canAny(anyOf)) return children;

  const fallback = home ? firstAllowedPath(canAny) : null;
  return <Navigate to={fallback ?? '/403'} replace />;
}
