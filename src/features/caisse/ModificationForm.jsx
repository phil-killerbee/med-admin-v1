import { useMemo, useReducer, useState } from 'react';
import { History, ShieldCheck } from 'lucide-react';
import { listMedicaments } from '../../services/medicamentService';
import { listAssurances } from '../../services/assuranceService';
import { modifierCommande } from '../../services/commandeService';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../auth/useAuth';
import { PERMISSIONS } from '../../config/roles';
import { repartitionAssurance } from '../../domain/commande';
import { Alert, ErrorMessage, Field, Loading } from '../../components/ui';
import { formatMoney } from '../../utils/format';
import { cartReducer, cartTotal, toCommandePayload } from '../comptoir/cartReducer';

/**
 * Construit l'état d'édition à partir d'une commande existante.
 * - le stock "disponible" inclut ce que la commande a déjà réservé ;
 * - les lignes existantes gardent leur prix d'origine (prix figé) ;
 * - sans la permission ordonnance:delivrer, un médicament sur ordonnance
 *   ne peut pas dépasser sa quantité d'origine (on peut réduire, pas augmenter).
 */
function cartFromCommande(commande, medsById, peutOrdonnance) {
  return {
    lignes: commande.lignes.map((l) => {
      const m = medsById[l.medicamentId] ?? { id: l.medicamentId, nom: l.nom, stock: 0, ordonnance: false };
      const stockDisponible = m.stock + l.quantite;
      return {
        medicament: {
          ...m,
          prixVente: l.prixUnitaire,
          stock: m.ordonnance && !peutOrdonnance ? l.quantite : stockDisponible,
        },
        quantite: l.quantite,
      };
    }),
    patientNom: commande.patientNom ?? '',
    ordonnanceRef: commande.ordonnanceRef ?? '',
    assure: Boolean(commande.assurance),
    assuranceId: commande.assurance ? String(commande.assurance.id) : '',
    numeroAssure: commande.assurance?.numeroAssure ?? '',
  };
}

export function ModificationForm({ commande, onSaved, onCancel }) {
  const { data: medicaments, loading } = useAsync(listMedicaments);
  const { data: assurances } = useAsync(listAssurances);

  if (loading || !medicaments) return <Loading />;
  return (
    <ModificationEditor
      commande={commande}
      medicaments={medicaments}
      assurances={assurances ?? []}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}

function ModificationEditor({ commande, medicaments, assurances, onSaved, onCancel }) {
  const { can } = useAuth();
  const peutOrdonnance = can(PERMISSIONS.ORDONNANCE_DELIVRER);
  const medsById = useMemo(() => Object.fromEntries(medicaments.map((m) => [m.id, m])), [medicaments]);

  // useReducer avec fonction d'initialisation : l'état initial est calculé UNE seule fois.
  const [cart, dispatch] = useReducer(cartReducer, null, () => cartFromCommande(commande, medsById, peutOrdonnance));
  const [motif, setMotif] = useState('');
  const [ajout, setAjout] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // L'assurance d'origine reste proposée (avec son taux figé) même si elle a été désactivée depuis.
  const options = useMemo(() => {
    const list = [...assurances];
    if (commande.assurance && !list.some((a) => a.id === commande.assurance.id)) {
      list.unshift({ id: commande.assurance.id, nom: commande.assurance.nom, taux: commande.assurance.taux });
    }
    return list;
  }, [assurances, commande.assurance]);

  const assurance = options.find((a) => String(a.id) === String(cart.assuranceId));
  const taux =
    cart.assure && assurance
      ? assurance.id === commande.assurance?.id
        ? commande.assurance.taux // taux figé de la commande
        : assurance.taux
      : 0;
  const total = cartTotal(cart);
  const { partAssurance, partPatient } = repartitionAssurance(total, taux);

  const ajoutables = medicaments.filter(
    (m) => m.stock > 0 && !cart.lignes.some((l) => l.medicament.id === m.id) && (!m.ordonnance || peutOrdonnance),
  );

  const set = (field) => (e) => dispatch({ type: 'SET_FIELD', field, value: e.target.value });
  const fieldErrors = submitError?.fields ?? {};

  async function handleSave() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await modifierCommande(commande.id, { ...toCommandePayload(cart), motif });
      onSaved(result);
    } catch (err) {
      setSubmitError(err);
      setSubmitting(false);
    }
  }

  return (
    <>
      <h2>Modifier la commande n°{commande.id}</h2>
      <Alert type="info">
        <History size={15} aria-hidden /> Chaque modification est enregistrée (avant / après, auteur, motif) et
        visible dans l’historique de la commande.
      </Alert>

      <table>
        <tbody>
          {cart.lignes.map(({ medicament, quantite }) => (
            <tr key={medicament.id}>
              <td>
                {medicament.nom}
                {medicament.ordonnance && !peutOrdonnance && (
                  <div className="small muted">sur ordonnance : réduction uniquement</div>
                )}
              </td>
              <td>
                <input
                  className="qty"
                  type="number"
                  min="0"
                  max={medicament.stock}
                  value={quantite}
                  onChange={(e) => dispatch({ type: 'SET_QTY', id: medicament.id, quantite: e.target.value })}
                  aria-label={`Quantité ${medicament.nom}`}
                />
              </td>
              <td className="num">{formatMoney(medicament.prixVente * quantite)}</td>
              <td>
                <button
                  className="btn btn-small btn-ghost"
                  onClick={() => dispatch({ type: 'REMOVE', id: medicament.id })}
                  aria-label={`Retirer ${medicament.nom}`}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="add-line">
        <select value={ajout} onChange={(e) => setAjout(e.target.value)} aria-label="Ajouter un produit">
          <option value="">+ Ajouter un produit…</option>
          {ajoutables.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nom} — {formatMoney(m.prixVente)}
            </option>
          ))}
        </select>
        <button
          className="btn btn-small"
          disabled={!ajout}
          onClick={() => {
            dispatch({ type: 'ADD', medicament: medsById[Number(ajout)] });
            setAjout('');
          }}
        >
          Ajouter
        </button>
      </div>

      <fieldset className="patient-box">
        <legend>Patient, ordonnance & assurance</legend>
        <Field label="Nom du patient" error={fieldErrors.patientNom}>
          <input value={cart.patientNom} onChange={set('patientNom')} placeholder="Facultatif" />
        </Field>
        <Field
          label="Référence de l’ordonnance (facultatif)"
          error={fieldErrors.ordonnanceRef}
        >
          <input value={cart.ordonnanceRef} onChange={set('ordonnanceRef')} />
        </Field>
        <label className="checkbox">
          <input type="checkbox" checked={cart.assure} onChange={(e) => dispatch({ type: 'SET_ASSURE', value: e.target.checked })} />
          <ShieldCheck size={16} aria-hidden /> Patient assuré (tiers payant)
        </label>
        {cart.assure && (
          <div className="form-grid-2">
            <Field label="Assurance" error={fieldErrors.assuranceId}>
              <select value={cart.assuranceId} onChange={set('assuranceId')}>
                <option value="">— Choisir —</option>
                {options.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nom} ({a.id === commande.assurance?.id ? commande.assurance.taux : a.taux} %)
                  </option>
                ))}
              </select>
            </Field>
            <Field label="N° d’assuré" error={fieldErrors.numeroAssure}>
              <input value={cart.numeroAssure} onChange={set('numeroAssure')} />
            </Field>
          </div>
        )}
      </fieldset>

      <div className="totals">
        <div className="item-row">
          <span>Total</span>
          <span>
            <span className="muted strike">{formatMoney(commande.total)}</span> <strong>{formatMoney(total)}</strong>
          </span>
        </div>
        {partAssurance > 0 && (
          <div className="item-row muted">
            <span>Part assurance ({taux} %)</span>
            <span>− {formatMoney(partAssurance)}</span>
          </div>
        )}
        <div className="item-row cart-total">
          <span>Part patient</span>
          <span>
            <span className="muted strike small">{formatMoney(commande.partPatient)}</span> <strong>{formatMoney(partPatient)}</strong>
          </span>
        </div>
      </div>

      <Field label="Motif de la modification (obligatoire)" error={fieldErrors.motif}>
        <textarea
          rows={2}
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Ex. : le patient ne prend que 2 boîtes"
        />
      </Field>

      <ErrorMessage error={submitError} />

      <div className="form-actions">
        <button className="btn" onClick={onCancel} disabled={submitting}>
          Abandonner
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={submitting || cart.lignes.length === 0 || !motif.trim()}
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer la modification'}
        </button>
      </div>
      {cart.lignes.length === 0 && (
        <p className="muted small">Une commande doit garder au moins une ligne. Pour tout retirer, faites-la annuler par le pharmacien.</p>
      )}
    </>
  );
}
