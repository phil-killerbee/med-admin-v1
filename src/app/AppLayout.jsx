import { Suspense, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { CircleUserRound, Download, Menu, Plus, Power } from 'lucide-react';
import { useConnexionDirecte, useEvenements } from '../services/evenements';
import { useInstallation } from './pwa';
import { useAuth } from '../auth/useAuth';
import { Can } from '../auth/Can';
import { PERMISSIONS, ROLE_LABELS } from '../config/roles';
import { appRoutes } from './navigation';
import { Loading } from '../components/ui';

const isSmallScreen = () => window.matchMedia('(max-width: 760px)').matches;

export function AppLayout() {
  const { user, canAny, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(() => !isSmallScreen());
  const installer = useInstallation();
  // La barre du haut garde la connexion en direct ouverte tant qu'on est connecté.
  useEvenements(() => {});
  const enDirect = useConnexionDirecte();

  // Le menu est FILTRÉ par permissions : chacun ne voit que ce qu'il peut utiliser.
  const menu = appRoutes.filter((r) => canAny(r.anyOf));

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  // Sur mobile, on referme le menu après un clic sur un lien.
  const closeOnMobile = () => isSmallScreen() && setSidebarOpen(false);

  return (
    <div className={`layout ${sidebarOpen ? '' : 'sidebar-hidden'}`}>
      <aside className="sidebar">
        <div className="brand" title="PharmaCours">
          <span className="brand-cross">✚</span>
          <span className="brand-name">PharmaCours</span>
        </div>
        <nav>
          {menu.map(({ path, label, Icon }) => (
            <NavLink key={path} to={path} end={path === '/'} className="nav-link" onClick={closeOnMobile}>
              <Icon size={22} strokeWidth={1.8} aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button
            className="icon-btn"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={sidebarOpen ? 'Masquer le menu' : 'Afficher le menu'}
          >
            <Menu size={20} />
          </button>

          {/* Action rapide : n'apparaît que si l'utilisateur a le droit de vendre */}
          <Can permission={PERMISSIONS.COMMANDE_CREATE}>
            <Link to="/comptoir" className="btn btn-success btn-small">
              <Plus size={16} /> Nouvelle commande
            </Link>
          </Can>

          <div className="topbar-right">
            <span
              className={`live-dot ${enDirect ? 'on' : ''}`}
              title={enDirect ? 'Mises à jour en direct actives' : 'Connexion en direct interrompue (reconnexion…)'}
            >
              <span>{enDirect ? 'En direct' : 'Hors ligne'}</span>
            </span>
            {installer && (
              <button className="btn btn-small" onClick={installer} title="Installer PharmaCours sur ce poste">
                <Download size={15} /> Installer
              </button>
            )}
            <span className="user-chip">
              <CircleUserRound size={20} aria-hidden />
              <span className="user-chip-text">
                <strong>{user.nom}</strong>
                <span className={`role-pill role-${user.role}`}>{ROLE_LABELS[user.role]}</span>
              </span>
            </span>
            <button className="icon-btn icon-btn-danger" onClick={handleLogout} title="Se déconnecter" aria-label="Se déconnecter">
              <Power size={20} />
            </button>
          </div>
        </header>

        <main className="content">
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
