import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import { OFFICINE } from '../../config/officine';
import { MODES_PAIEMENT, especesRecues } from '../../domain/commande';
import { formatDateTime, formatMoney } from '../../utils/format';

/**
 * Ticket de caisse d'une commande PAYÉE.
 * Composant d'affichage pur : le même rendu sert à l'aperçu à l'écran et à l'impression.
 * `duplicata` : réimpression depuis l'historique (on ne doit pas pouvoir confondre avec l'original).
 */
/** En-tête commun à tous les documents imprimés (ticket, avoir, Z de caisse, bordereau…). */
export function EnteteOfficine() {
  return (
    <header className="ticket-center">
      <strong className="ticket-title">{OFFICINE.nom}</strong>
      <div>{OFFICINE.adresse}</div>
      <div>Tél. {OFFICINE.telephone}</div>
      <div>{OFFICINE.ninea}</div>
    </header>
  );
}

export function Ticket({ commande: c, duplicata = false }) {
  const p = c.paiement;
  return (
    <div className="ticket">
      <EnteteOfficine />

      <div className="ticket-sep" />
      <div className="ticket-center">
        <strong>{duplicata ? '*** DUPLICATA ***' : 'TICKET DE CAISSE'}</strong>
      </div>
      <div className="ticket-row">
        <span>Commande n°{c.id}</span>
        <span>{formatDateTime(p?.date ?? c.date)}</span>
      </div>
      <div>Vendeur : {c.vendeurNom}</div>
      {p && <div>Caisse : {p.caissierNom}</div>}
      {c.patientNom && <div>Patient : {c.patientNom}</div>}
      {c.ordonnanceRef && <div>Ordonnance : {c.ordonnanceRef}</div>}

      <div className="ticket-sep" />
      {c.lignes.map((l) => (
        <div key={l.medicamentId}>
          <div>{l.nom}</div>
          <div className="ticket-row">
            <span>
              {l.quantite} × {formatMoney(l.prixUnitaire)}
            </span>
            <span>{formatMoney(l.quantite * l.prixUnitaire)}</span>
          </div>
        </div>
      ))}

      <div className="ticket-sep" />
      <div className="ticket-row">
        <span>TOTAL</span>
        <strong>{formatMoney(c.total)}</strong>
      </div>
      {c.assurance && (
        <>
          <div className="ticket-row">
            <span>
              {c.assurance.nom} ({c.assurance.taux} %)
            </span>
            <span>− {formatMoney(c.partAssurance)}</span>
          </div>
          <div>N° assuré : {c.assurance.numeroAssure}</div>
        </>
      )}
      <div className="ticket-row ticket-big">
        <span>NET À PAYER</span>
        <strong>{formatMoney(c.partPatient)}</strong>
      </div>

      {p && (
        <>
          <div className="ticket-sep" />
          {p.lignes.length === 0 && <div>Pris en charge à 100 %</div>}
          {p.lignes.map((l) => (
            <div className="ticket-row" key={l.mode}>
              <span>{MODES_PAIEMENT[l.mode]}</span>
              <span>{formatMoney(l.montant)}</span>
            </div>
          ))}
          {p.monnaie > 0 && (
            <>
              <div className="ticket-row">
                <span>Espèces reçues</span>
                <span>{formatMoney(especesRecues(p))}</span>
              </div>
              <div className="ticket-row">
                <span>Monnaie rendue</span>
                <span>{formatMoney(p.monnaie)}</span>
              </div>
            </>
          )}
        </>
      )}

      <div className="ticket-sep" />
      <footer className="ticket-center">
        <div>Merci de votre confiance</div>
        <div>Prompt rétablissement !</div>
      </footer>
    </div>
  );
}

/**
 * Bouton d'impression. Au clic, le ticket est rendu (portail) dans une zone dédiée
 * directement sous <body> ; la feuille de style @media print n'affiche QUE cette zone.
 * → on imprime un ticket propre, sans le menu ni le reste de la page.
 *
 * Par défaut, imprime le ticket de `commande` ; avec `children`, imprime ce contenu
 * (avoir, Z de caisse, bordereau, bon de commande…).
 */
export function BoutonImprimer({
  commande,
  duplicata = false,
  className = 'btn',
  label = 'Imprimer le ticket',
  children,
}) {
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing) return undefined;
    const fin = () => setPrinting(false);
    window.addEventListener('afterprint', fin);
    // On laisse React insérer le ticket dans le DOM avant d'ouvrir la boîte d'impression.
    const timer = setTimeout(() => window.print(), 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', fin);
    };
  }, [printing]);

  return (
    <>
      <button type="button" className={className} onClick={() => setPrinting(true)} disabled={printing}>
        <Printer size={16} aria-hidden /> {label}
      </button>
      {printing &&
        createPortal(
          <div className="print-root">{children ?? <Ticket commande={commande} duplicata={duplicata} />}</div>,
          document.body,
        )}
    </>
  );
}
