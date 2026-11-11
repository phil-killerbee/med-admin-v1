import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { MODES_PAIEMENT, canCancelCommande, especesRecues, libellePaiement } from '../../domain/commande';
import { canRetourCommande, quantitesRetournables } from '../../domain/caisse';
import { BoutonImprimer } from './Ticket';
import { formatDateTime, formatMoney } from '../../utils/format';
import { CommandeDetails, StatutBadge } from './CommandeDetails';

/**
 * Carte d'une commande. Le bouton « Annuler » dépend d'une règle MÉTIER partagée
 * avec le serveur (canCancelCommande) : rôle + propriétaire + statut.
 */
export function CommandeCard({ commande: c, onAnnuler, onRetour }) {
  const { user } = useAuth();
  const [showLots, setShowLots] = useState(false);
  // Une commande qui a déjà eu un retour ne s'annule plus : on fait un retour du reste.
  const annulable = canCancelCommande(user, c) && c.retours.length === 0;
  const retournable =
    canRetourCommande(user, c) && Object.values(quantitesRetournables(c.lignes, c.retours)).some((q) => q > 0);

  return (
    <article className={`item-card ${c.statut === 'ANNULEE' ? 'item-card-muted' : ''}`}>
      <header className="item-card-header">
        <h3 className="item-title">
          N°{c.id} · {formatDateTime(c.date)}
        </h3>
        <div className="item-icons">
          {c.ordonnanceRef && (
            <span className="item-icon-danger" title={`Ordonnance ${c.ordonnanceRef}`}>
              <FileText size={16} aria-label="Sur ordonnance" />
            </span>
          )}
          <StatutBadge statut={c.statut} />
        </div>
      </header>

      <div className="item-card-body">
        <div className="item-row small">
          <span>
            <b>Vendeur :</b> {c.vendeurNom}
          </span>
          {c.paiement && (
            <span>
              <b>Caisse :</b> {c.paiement.caissierNom}
            </span>
          )}
        </div>

        <CommandeDetails commande={c} showLots={showLots} />

        {c.paiement && (
          <div className="item-note item-note-success">
            Payée le {formatDateTime(c.paiement.date)} —{' '}
            {c.paiement.lignes.length > 0 ? libellePaiement(c.paiement.lignes) : 'pris en charge à 100 %'}
            {c.paiement.monnaie > 0 && (
              <>
                {' '}
                (espèces reçues {formatMoney(especesRecues(c.paiement))}, rendu {formatMoney(c.paiement.monnaie)})
              </>
            )}
          </div>
        )}
        {c.retours.map((r) => (
          <div key={r.id} className="item-note item-note-warning">
            Avoir n°{r.id} du {formatDateTime(r.date)} par {r.par} : {r.lignes.map((l) => `${l.nom} × ${l.quantite}`).join(', ')}
            {' — '}
            {r.partPatient > 0
              ? `${formatMoney(r.partPatient)} rendus (${MODES_PAIEMENT[r.modeRemboursement]})`
              : 'rien à rendre au patient'}
            {!r.remisEnStock && ' — non remis en stock'} — motif : {r.motif}
          </div>
        ))}
        {c.annulation && (
          <div className="item-note">
            Annulée par {c.annulation.par} — motif : {c.annulation.motif}
          </div>
        )}
      </div>

      <footer className="item-card-actions">
        <button className="split-btn split-btn-blue" onClick={() => setShowLots((s) => !s)} aria-expanded={showLots}>
          {showLots ? 'Masquer les lots' : 'Détail des lots'}
        </button>
        {c.statut === 'PAYEE' && (
          // Réimpression depuis l'historique → marquée « DUPLICATA »
          <BoutonImprimer commande={c} duplicata className="split-btn split-btn-green" label="Ticket" />
        )}
        {retournable && (
          <button className="split-btn split-btn-orange" onClick={() => onRetour(c)}>
            Retour
          </button>
        )}
        {annulable && (
          <button className="split-btn split-btn-red" onClick={() => onAnnuler(c)}>
            Annuler
          </button>
        )}
      </footer>
    </article>
  );
}
