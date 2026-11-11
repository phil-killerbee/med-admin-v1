import { History, ShieldCheck } from 'lucide-react';
import { Badge } from '../../components/ui';
import { ROLE_LABELS } from '../../config/roles';
import { STATUT_LABELS } from '../../domain/commande';
import { formatDateTime, formatMoney } from '../../utils/format';

const STATUT_TONE = { EN_ATTENTE: 'warning', PAYEE: 'success', ANNULEE: 'danger' };

export function StatutBadge({ statut }) {
  return <Badge tone={STATUT_TONE[statut]}>{STATUT_LABELS[statut]}</Badge>;
}

/** Lignes + assurance + répartition des montants. Réutilisé par la caisse et l'historique. */
export function CommandeDetails({ commande: c, showLots = false }) {
  return (
    <>
      {(c.patientNom || c.ordonnanceRef) && (
        <div className="item-row">
          <span>
            <b>Patient :</b> {c.patientNom ?? '—'}
          </span>
          <span className="muted">{c.ordonnanceRef ? `Ord. ${c.ordonnanceRef}` : 'Sans ordonnance'}</span>
        </div>
      )}
      {c.assurance && (
        <div className="assurance-tag">
          <ShieldCheck size={15} aria-hidden />
          <span>
            {c.assurance.nom} — {c.assurance.taux} % · n° {c.assurance.numeroAssure}
          </span>
        </div>
      )}

      <ul className="item-lines">
        {c.lignes.map((l) => (
          <li key={l.medicamentId}>
            <div className="item-row">
              <span>
                {l.quantite} × {l.nom}
              </span>
              <span>{formatMoney(l.prixUnitaire * l.quantite)}</span>
            </div>
            {showLots && (
              <div className="muted small">
                Lots (FEFO) : {l.allocations.map((a) => `${a.numeroLot} × ${a.quantite}`).join(', ')}
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="item-row">
        <span className="muted">Total</span>
        <span>{formatMoney(c.total)}</span>
      </div>
      {c.partAssurance > 0 && (
        <div className="item-row">
          <span className="muted">Part assurance</span>
          <span>{formatMoney(c.partAssurance)}</span>
        </div>
      )}
      <div className="item-row">
        <b>Part patient</b>
        <span className="item-price">{formatMoney(c.partPatient)}</span>
      </div>

      <HistoriqueModifications modifications={c.modifications} />
    </>
  );
}

/** Traçabilité : qui a modifié quoi, quand et pourquoi. */
export function HistoriqueModifications({ modifications }) {
  if (!modifications?.length) return null;
  return (
    <details className="history" open>
      <summary>
        <History size={14} aria-hidden /> {modifications.length} modification(s)
      </summary>
      <ol>
        {modifications.map((m) => (
          <li key={m.id}>
            <div className="small">
              <b>{m.par}</b> ({ROLE_LABELS[m.role] ?? m.role}) — {formatDateTime(m.date)}
            </div>
            <ul className="small">
              {m.changements.map((ch) => (
                <li key={ch}>{ch}</li>
              ))}
            </ul>
            <div className="small muted">Motif : {m.motif}</div>
          </li>
        ))}
      </ol>
    </details>
  );
}
