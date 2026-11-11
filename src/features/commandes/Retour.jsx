import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { enregistrerRetour } from '../../services/caisseService';
import { MODES_PAIEMENT } from '../../domain/commande';
import { calculerRetour, quantitesRetournables } from '../../domain/caisse';
import { Alert, ErrorMessage, Field } from '../../components/ui';
import { formatDateTime, formatMoney } from '../../utils/format';
import { BoutonImprimer, EnteteOfficine } from './Ticket';

/**
 * RETOUR / AVOIR — le patient rapporte tout ou partie d'une commande payée.
 * L'aperçu utilise calculerRetour : la MÊME fonction que le serveur.
 */
export function RetourForm({ commande: c, onCancel, onDone }) {
  const restant = quantitesRetournables(c.lignes, c.retours);
  const [quantites, setQuantites] = useState({});
  const [motif, setMotif] = useState('');
  const [mode, setMode] = useState('ESPECES');
  const [remettre, setRemettre] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [avoir, setAvoir] = useState(null);

  const demande = Object.entries(quantites).map(([ligneId, quantite]) => ({ ligneId: Number(ligneId), quantite }));
  let apercu = null;
  let probleme = null;
  try {
    apercu = calculerRetour({ lignes: c.lignes, retours: c.retours, taux: c.assurance?.taux ?? 0 }, demande);
  } catch (e) {
    probleme = e.message;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const r = await enregistrerRetour(c.id, {
        lignes: demande,
        motif,
        modeRemboursement: apercu?.partPatient > 0 ? mode : null,
        remettreEnStock: remettre,
      });
      setAvoir(r);
      onDone(r);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (avoir) {
    return (
      <div className="modal-body">
        <Alert type="success">
          Avoir n°{avoir.id} enregistré.{' '}
          {avoir.partPatient > 0 ? (
            <strong>
              À rendre au patient : {formatMoney(avoir.partPatient)} ({MODES_PAIEMENT[avoir.modeRemboursement]})
            </strong>
          ) : (
            'Rien à rendre au patient.'
          )}
        </Alert>
        <div className="ticket-preview">
          <TicketAvoir commande={c} avoir={avoir} />
        </div>
        <div className="form-actions">
          <button className="btn" onClick={onCancel}>
            Fermer
          </button>
          <BoutonImprimer className="btn btn-primary" label="Imprimer l’avoir">
            <TicketAvoir commande={c} avoir={avoir} />
          </BoutonImprimer>
        </div>
      </div>
    );
  }

  return (
    <form className="modal-body" onSubmit={handleSubmit} noValidate>
      <p className="muted small">
        Payée le {formatDateTime(c.paiement.date)} — part patient {formatMoney(c.partPatient)}
        {c.assurance && <> · {c.assurance.nom} ({c.assurance.taux} %)</>}
      </p>
      <table>
        <thead>
          <tr>
            <th>Produit</th>
            <th className="num">Vendu</th>
            <th className="num">Retournable</th>
            <th className="num">À retourner</th>
          </tr>
        </thead>
        <tbody>
          {c.lignes.map((l) => (
            <tr key={l.id} className={restant[l.id] === 0 ? 'row-muted' : ''}>
              <td>{l.nom}</td>
              <td className="num">{l.quantite}</td>
              <td className="num">{restant[l.id]}</td>
              <td className="num">
                <input
                  className="qty"
                  type="number"
                  min="0"
                  max={restant[l.id]}
                  disabled={restant[l.id] === 0}
                  value={quantites[l.id] ?? ''}
                  onChange={(e) => setQuantites((q) => ({ ...q, [l.id]: e.target.value }))}
                  aria-label={`Quantité retournée ${l.nom}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Field label="Motif du retour (obligatoire)" error={error?.fields?.motif}>
        <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. : erreur de produit, doublon…" />
      </Field>
      <label className="checkbox">
        <input type="checkbox" checked={remettre} onChange={(e) => setRemettre(e.target.checked)} />
        Remettre les boîtes en stock (décocher si le produit est abîmé ou ouvert)
      </label>

      {apercu && (
        <div className="totals">
          <div className="item-row">
            <span>Valeur des produits rendus</span>
            <strong>{formatMoney(apercu.montant)}</strong>
          </div>
          {apercu.partAssurance > 0 && (
            <div className="item-row muted">
              <span>Ne sera pas facturé à l’assurance</span>
              <span>− {formatMoney(apercu.partAssurance)}</span>
            </div>
          )}
          <div className="item-row cart-total">
            <span>À rendre au patient</span>
            <strong>{formatMoney(apercu.partPatient)}</strong>
          </div>
        </div>
      )}
      {apercu?.partPatient > 0 && (
        <div className="pay-modes" role="radiogroup" aria-label="Mode de remboursement">
          {Object.entries(MODES_PAIEMENT).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              className={`pay-mode ${mode === value ? 'active' : ''}`}
              onClick={() => setMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {probleme && demande.some((d) => Number(d.quantite)) && <p className="muted small">{probleme}</p>}
      <ErrorMessage error={error} />

      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Annuler
        </button>
        <button className="btn btn-success" disabled={submitting || !apercu || !motif.trim()}>
          <Undo2 size={16} /> {submitting ? 'Enregistrement…' : 'Valider le retour'}
        </button>
      </div>
    </form>
  );
}

/** Ticket d'avoir : remis au patient avec son remboursement. */
export function TicketAvoir({ commande: c, avoir: r }) {
  return (
    <div className="ticket">
      <EnteteOfficine />
      <div className="ticket-sep" />
      <div className="ticket-center">
        <strong>AVOIR n°{r.id}</strong>
      </div>
      <div className="ticket-row">
        <span>Sur commande n°{c.id}</span>
        <span>{formatDateTime(r.date)}</span>
      </div>
      <div>Par : {r.par}</div>
      {c.patientNom && <div>Patient : {c.patientNom}</div>}
      <div>Motif : {r.motif}</div>
      <div className="ticket-sep" />
      {r.lignes.map((l) => (
        <div key={l.ligneId}>
          <div>{l.nom}</div>
          <div className="ticket-row">
            <span>
              {l.quantite} × {formatMoney(l.prixUnitaire)}
            </span>
            <span>− {formatMoney(l.quantite * l.prixUnitaire)}</span>
          </div>
        </div>
      ))}
      <div className="ticket-sep" />
      <div className="ticket-row">
        <span>Valeur rendue</span>
        <span>{formatMoney(r.montant)}</span>
      </div>
      {r.partAssurance > 0 && (
        <div className="ticket-row">
          <span>Part assurance annulée</span>
          <span>{formatMoney(r.partAssurance)}</span>
        </div>
      )}
      <div className="ticket-row ticket-big">
        <span>REMBOURSÉ</span>
        <strong>{formatMoney(r.partPatient)}</strong>
      </div>
      {r.modeRemboursement && <div>Par : {MODES_PAIEMENT[r.modeRemboursement]}</div>}
      <div className="ticket-sep" />
      <footer className="ticket-center">Signature du patient :</footer>
      <br />
      <br />
    </div>
  );
}
