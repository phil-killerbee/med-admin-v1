import { Link } from 'react-router-dom';
import { FileText, Trash2 } from 'lucide-react';
import { Can } from '../../auth/Can';
import { useAuth } from '../../auth/useAuth';
import { PERMISSIONS } from '../../config/roles';
import { Badge } from '../../components/ui';
import { formatMoney } from '../../utils/format';

function StockValue({ medicament }) {
  if (medicament.stock === 0) return <Badge tone="danger">Rupture</Badge>;
  if (medicament.stock <= medicament.seuilAlerte) return <Badge tone="warning">{medicament.stock}</Badge>;
  return <strong>{medicament.stock}</strong>;
}

/**
 * Carte d'un médicament. Les boutons d'action dépendent des permissions :
 * chaque rôle voit une carte différente, sans aucun `if (role === …)`.
 */
export function MedicamentCard({ medicament: m, onEdit, onDelete }) {
  const { can } = useAuth();
  const hasActions =
    can(PERMISSIONS.MEDICAMENT_UPDATE) || can(PERMISSIONS.STOCK_READ) || can(PERMISSIONS.COMMANDE_CREATE);

  return (
    <article className="item-card">
      <header className="item-card-header">
        <h3 className="item-title">{m.nom}</h3>
        <div className="item-icons">
          {m.ordonnance && (
            <span className="item-icon-danger" title="Soumis à ordonnance">
              <FileText size={16} aria-label="Ordonnance" />
            </span>
          )}
          <Can permission={PERMISSIONS.MEDICAMENT_DELETE}>
            <button className="icon-btn icon-btn-sm icon-btn-danger" onClick={() => onDelete(m)} aria-label={`Supprimer ${m.nom}`} title="Supprimer">
              <Trash2 size={15} />
            </button>
          </Can>
        </div>
      </header>

      <div className="item-card-body">
        <div className="item-row">
          <span>
            <b>CIP :</b> <span className="mono">{m.code}</span>
          </span>
          <span className="muted">{m.forme}</span>
        </div>
        <div className="item-row">
          <span>
            <b>DCI :</b> {m.dci}
          </span>
          <span>
            Stock : <StockValue medicament={m} />
          </span>
        </div>
        <div className="item-row">
          <span className="item-price">{formatMoney(m.prixVente)}</span>
          {m.ordonnance ? <Badge tone="info">Ordonnance</Badge> : <Badge>Libre</Badge>}
        </div>
      </div>

      {hasActions && (
        <footer className="item-card-actions">
          <Can permission={PERMISSIONS.MEDICAMENT_UPDATE}>
            <button className="split-btn split-btn-blue" onClick={() => onEdit(m)}>
              Modifier
            </button>
          </Can>
          <Can
            permission={PERMISSIONS.STOCK_READ}
            fallback={
              <Can permission={PERMISSIONS.COMMANDE_CREATE}>
                <Link className="split-btn split-btn-green" to="/comptoir">
                  Commander
                </Link>
              </Can>
            }
          >
            <Link className="split-btn split-btn-green" to="/stock">
              Voir le stock
            </Link>
          </Can>
        </footer>
      )}
    </article>
  );
}
