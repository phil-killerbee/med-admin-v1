import { ShieldCheck } from 'lucide-react';
import { ROLES, ROLE_LABELS } from '../../config/roles';
import { getPermissions } from '../../domain/permissions';
import { Badge } from '../../components/ui';

/**
 * Carte d'un utilisateur.
 * Garde-fou visible dans l'interface (et revérifié dans le service) :
 * on ne peut ni changer son propre rôle ni se désactiver.
 */
export function UserCard({ user: u, isMe, onUpdate }) {
  const nbPermissions = getPermissions({ ...u, actif: true }).length;

  return (
    <article className={`item-card ${u.actif ? '' : 'item-card-muted'}`}>
      <header className="item-card-header">
        <h3 className="item-title">
          {u.nom} {isMe && <Badge tone="info">vous</Badge>}
        </h3>
        <span className={`role-pill role-${u.role}`}>{ROLE_LABELS[u.role]}</span>
      </header>

      <div className="item-card-body">
        <div className="item-row">
          <span>
            <b>Identifiant :</b> <span className="mono">{u.login}</span>
          </span>
          {u.actif ? <Badge tone="success">Actif</Badge> : <Badge tone="danger">Désactivé</Badge>}
        </div>
        <div className="item-row">
          <span className="muted">
            <ShieldCheck size={14} aria-hidden /> {nbPermissions} permission(s)
          </span>
        </div>
        <label className="item-row">
          <b>Rôle</b>
          <select
            className="item-select"
            value={u.role}
            disabled={isMe}
            onChange={(e) => onUpdate(u, { role: e.target.value })}
            aria-label={`Rôle de ${u.login}`}
          >
            {Object.values(ROLES).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <footer className="item-card-actions">
        {isMe ? (
          <span className="split-btn split-btn-disabled">Votre propre compte</span>
        ) : u.actif ? (
          <button className="split-btn split-btn-red" onClick={() => onUpdate(u, { actif: false })}>
            Désactiver
          </button>
        ) : (
          <button className="split-btn split-btn-green" onClick={() => onUpdate(u, { actif: true })}>
            Réactiver
          </button>
        )}
      </footer>
    </article>
  );
}
