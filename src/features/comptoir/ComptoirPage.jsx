import { useMemo, useReducer, useRef, useState } from 'react';
import { ScanBarcode, ShieldCheck } from 'lucide-react';
import { listMedicaments } from '../../services/medicamentService';
import { listAssurances } from '../../services/assuranceService';
import { creerCommande } from '../../services/commandeService';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../auth/useAuth';
import { PERMISSIONS } from '../../config/roles';
import { repartitionAssurance } from '../../domain/commande';
import { trouverParCode } from '../../domain/medicament';
import { useEvenements } from '../../services/evenements';
import { PatientPicker } from './PatientPicker';
import { Alert, Badge, EmptyState, ErrorMessage, Field, Loading, PageHeader } from '../../components/ui';
import { formatMoney } from '../../utils/format';
import { cartReducer, cartTotal, initialCart, toCommandePayload } from './cartReducer';

/**
 * COMPTOIR — la vendeuse compose la commande et la transmet à la caisse.
 * Elle ne touche pas l'argent : c'est le caissier qui encaissera.
 */
export default function ComptoirPage() {
  const { can } = useAuth();
  const { data: medicaments, loading, error, reload } = useAsync(listMedicaments);
  const { data: assurances } = useAsync(listAssurances);
  const [cart, dispatch] = useReducer(cartReducer, initialCart);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [scanInfo, setScanInfo] = useState(null);
  const searchRef = useRef(null);

  // En direct : une vente ou un retour ailleurs change le stock → on recharge le catalogue.
  useEvenements(() => reload());

  const peutDelivrerOrdonnance = can(PERMISSIONS.ORDONNANCE_DELIVRER);
  const assurance = assurances?.find((a) => String(a.id) === String(cart.assuranceId));
  const total = cartTotal(cart);
  // Aperçu calculé avec la MÊME fonction que le serveur (domain/commande.js).
  const { partAssurance, partPatient } = repartitionAssurance(total, cart.assure && assurance ? assurance.taux : 0);

  const resultats = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (medicaments ?? []).filter(
      (m) => !q || m.nom.toLowerCase().includes(q) || m.dci.toLowerCase().includes(q) || m.code.includes(q),
    );
  }, [medicaments, search]);

  const set = (field) => (e) => dispatch({ type: 'SET_FIELD', field, value: e.target.value });

  function ajouter(m) {
    setConfirmation(null);
    if (m.stock === 0 || (m.ordonnance && !peutDelivrerOrdonnance)) {
      setScanInfo(`${m.nom} : ${m.stock === 0 ? 'rupture de stock' : 'sur ordonnance, non autorisé'}`);
      return;
    }
    setScanInfo(null);
    dispatch({ type: 'ADD', medicament: m });
  }

  // Lecteur de code-barres : il « tape » le code puis Entrée, comme un clavier.
  // Entrée = code exact trouvé, ou un seul résultat de recherche → ajouté au panier.
  function handleSearchKey(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const m = trouverParCode(medicaments ?? [], search) ?? (resultats.length === 1 ? resultats[0] : null);
    if (m) {
      ajouter(m);
      setSearch('');
    } else if (/^\d{7,13}$/.test(search.trim())) {
      setScanInfo(`Code ${search.trim()} inconnu`);
      setSearch('');
    }
  }
  const fieldErrors = submitError?.fields ?? {};

  async function handleEnregistrer() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await creerCommande(toCommandePayload(cart));
      setConfirmation(result);
      setScanInfo(null);
      dispatch({ type: 'CLEAR' });
      reload(); // le stock a été réservé
      searchRef.current?.focus(); // prêt pour le client suivant (scan)
    } catch (err) {
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  }

  // Patient et ordonnance sont facultatifs ; seule l'assurance demande organisme + n° d'assuré.
  const manqueInfos = cart.assure && (!cart.assuranceId || !cart.numeroAssure.trim());

  return (
    <>
      <PageHeader title="Comptoir — nouvelle commande" subtitle="La commande est transmise à la caisse pour encaissement" />

      {confirmation && (
        <Alert type="success">
          Commande <strong>n°{confirmation.id}</strong> transmise à la caisse — à payer par le patient :{' '}
          <strong>{formatMoney(confirmation.partPatient)}</strong>
          {confirmation.partAssurance > 0 && <> (assurance : {formatMoney(confirmation.partAssurance)})</>}
        </Alert>
      )}

      <div className="pos">
        <section className="card">
          <div className="search-box search scan-box">
            <ScanBarcode size={18} aria-hidden />
            <input
              ref={searchRef}
              type="search"
              placeholder="Rechercher ou scanner un code-barres…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKey}
              autoFocus
              aria-label="Rechercher ou scanner un médicament"
            />
          </div>
          {scanInfo && <Alert type="error">{scanInfo}</Alert>}
          {loading && !medicaments && <Loading />}
          <ErrorMessage error={error} />
          <ul className="product-list">
            {resultats.map((m) => {
              const bloque = m.ordonnance && !peutDelivrerOrdonnance;
              return (
                <li key={m.id}>
                  <button
                    className="product"
                    disabled={m.stock === 0 || bloque}
                    onClick={() => ajouter(m)}
                  >
                    <span>
                      <strong>{m.nom}</strong>
                      <span className="muted small"> · stock {m.stock}</span>
                    </span>
                    <span className="product-right">
                      {m.ordonnance && <Badge tone="info">Ordonnance</Badge>}
                      {bloque && <Badge tone="danger">Non autorisé</Badge>}
                      {m.stock === 0 && <Badge tone="danger">Rupture</Badge>}
                      <strong>{formatMoney(m.prixVente)}</strong>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card cart">
          <h2>Commande</h2>
          {cart.lignes.length === 0 ? (
            <EmptyState>Cliquez sur un médicament pour l’ajouter.</EmptyState>
          ) : (
            <table>
              <tbody>
                {cart.lignes.map(({ medicament, quantite }) => (
                  <tr key={medicament.id}>
                    <td>
                      {medicament.nom}
                      {medicament.ordonnance && <div className="small muted">sur ordonnance</div>}
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
          )}

          <fieldset className="patient-box">
            <legend>Patient & ordonnance</legend>
            {can(PERMISSIONS.PATIENT_READ) ? (
              <PatientPicker cart={cart} dispatch={dispatch} />
            ) : (
              <Field label="Nom du patient" error={fieldErrors.patientNom}>
                <input value={cart.patientNom} onChange={set('patientNom')} placeholder="Facultatif" />
              </Field>
            )}
            <Field
              label="Référence de l’ordonnance"
              error={fieldErrors.ordonnanceRef}
            >
              <input value={cart.ordonnanceRef} onChange={set('ordonnanceRef')} placeholder="Facultatif — ORD-…" />
            </Field>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={cart.assure}
                onChange={(e) => dispatch({ type: 'SET_ASSURE', value: e.target.checked })}
              />
              <ShieldCheck size={16} aria-hidden /> Patient assuré (tiers payant)
            </label>

            {cart.assure && (
              <div className="form-grid-2">
                <Field label="Assurance" error={fieldErrors.assuranceId}>
                  <select value={cart.assuranceId} onChange={set('assuranceId')}>
                    <option value="">— Choisir —</option>
                    {assurances?.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nom} ({a.taux} %)
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
              <strong>{formatMoney(total)}</strong>
            </div>
            {partAssurance > 0 && (
              <div className="item-row muted">
                <span>Part assurance ({assurance?.taux} %)</span>
                <span>− {formatMoney(partAssurance)}</span>
              </div>
            )}
            <div className="item-row cart-total">
              <span>À payer par le patient</span>
              <strong>{formatMoney(partPatient)}</strong>
            </div>
          </div>

          <ErrorMessage error={submitError} />

          <button
            className="btn btn-success btn-block"
            disabled={submitting || cart.lignes.length === 0 || manqueInfos}
            onClick={handleEnregistrer}
          >
            {submitting ? 'Enregistrement…' : 'Enregistrer et envoyer à la caisse'}
          </button>
        </section>
      </div>
    </>
  );
}
