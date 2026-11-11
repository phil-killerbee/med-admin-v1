import { useEffect, useState } from 'react';
import { ArrowRight, Pencil, RefreshCw } from 'lucide-react';
import { encaisserCommande, listCommandes } from '../../services/commandeService';
import { useAsync } from '../../hooks/useAsync';
import { useEvenements } from '../../services/evenements';
import { Can } from '../../auth/Can';
import { PERMISSIONS } from '../../config/roles';
import { MODES_PAIEMENT, calculerPaiement, libellePaiement } from '../../domain/commande';
import { Alert, Badge, EmptyState, ErrorMessage, Field, Loading, PageHeader } from '../../components/ui';
import { formatDateTime, formatMoney } from '../../utils/format';
import { CommandeDetails } from '../commandes/CommandeDetails';
import { BoutonImprimer, Ticket } from '../commandes/Ticket';
import { ModificationForm } from './ModificationForm';

// Filet de sécurité : les mises à jour arrivent EN DIRECT (SSE) ; ce rechargement
// périodique ne sert que si la connexion en direct est coupée.
const REFRESH_MS = 60_000;
const MODES = Object.keys(MODES_PAIEMENT);

/**
 * CAISSE — le caissier voit les commandes en attente, en sélectionne une,
 * peut la CORRIGER (tracé : motif + avant/après), la VALIDE et encaisse la part patient
 * (paiement simple ou mixte), puis imprime le ticket.
 */
export default function CaissePage() {
  const { data, loading, error, reload } = useAsync(() => listCommandes('EN_ATTENTE'));
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [recu, setRecu] = useState(null); // commande qui vient d'être payée → ticket
  const [modifInfo, setModifInfo] = useState(null);

  // EN DIRECT : une commande enregistrée au comptoir apparaît immédiatement dans la file.
  // Suspendu pendant une modification, pour ne pas perturber la saisie.
  useEvenements(() => {
    if (!editing) reload();
  });

  useEffect(() => {
    if (editing) return undefined;
    const timer = setInterval(reload, REFRESH_MS);
    return () => clearInterval(timer); // nettoyage : pas de fuite quand on quitte la page
  }, [reload, editing]);

  const commandes = data?.commandes ?? [];
  const selected = commandes.find((c) => c.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="Caisse"
        subtitle="Commandes transmises par le comptoir, en attente de paiement"
        actions={
          <button className="btn" onClick={reload}>
            <RefreshCw size={16} /> Actualiser
          </button>
        }
      />

      {recu && (
        <Alert type="success">
          Commande n°{recu.id} encaissée : {formatMoney(recu.partPatient)}
          {recu.paiement.lignes.length > 0 && <> ({libellePaiement(recu.paiement.lignes)})</>}
          {recu.paiement.monnaie > 0 && (
            <>
              {' '}
              — <strong>monnaie à rendre : {formatMoney(recu.paiement.monnaie)}</strong>
            </>
          )}
          {recu.partAssurance > 0 && <> — {formatMoney(recu.partAssurance)} à facturer à l’assurance</>}
        </Alert>
      )}
      {modifInfo && (
        <Alert type="info">
          Commande n°{modifInfo.id} modifiée : {modifInfo.changements.join(' · ')}. Nouvelle part patient :{' '}
          <strong>{formatMoney(modifInfo.partPatient)}</strong>
        </Alert>
      )}

      <div className="pos">
        <section>
          {loading && !data && <Loading />}
          <ErrorMessage error={error} />
          {data && commandes.length === 0 && (
            <div className="card">
              <EmptyState>Aucune commande en attente.</EmptyState>
            </div>
          )}
          <div className="queue">
            {commandes.map((c) => (
              <button
                key={c.id}
                className={`queue-item ${c.id === selectedId ? 'active' : ''}`}
                disabled={editing && c.id !== selectedId}
                onClick={() => {
                  setRecu(null);
                  setModifInfo(null);
                  setSelectedId(c.id);
                }}
              >
                <span className="queue-head">
                  <strong>
                    Commande n°{c.id}{' '}
                    {c.modifications.length > 0 && <Badge tone="info">Modifiée</Badge>}
                  </strong>
                  <span className="muted small">{formatDateTime(c.date)}</span>
                </span>
                <span className="queue-body">
                  <span className="small">
                    {c.vendeurNom}
                    {c.patientNom && <> · {c.patientNom}</>}
                    {c.assurance && <> · {c.assurance.nom}</>}
                  </span>
                  <strong>{formatMoney(c.partPatient)}</strong>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="card cart">
          {selected && editing ? (
            <ModificationForm
              commande={selected}
              onCancel={() => setEditing(false)}
              onSaved={(result) => {
                setModifInfo(result);
                setEditing(false);
                reload(); // la commande reste sélectionnée, prête à être encaissée
              }}
            />
          ) : selected ? (
            <EncaissementForm
              // la clé change après une modification → formulaire de paiement réinitialisé
              key={`${selected.id}-${selected.modifications.length}`}
              commande={selected}
              onEdit={() => {
                setModifInfo(null);
                setEditing(true);
              }}
              onDone={(result) => {
                // Ticket = commande affichée + réponse de l'API (pas besoin de la recharger).
                setRecu({ ...selected, statut: 'PAYEE', ...result });
                setSelectedId(null);
                reload();
              }}
            />
          ) : recu ? (
            <>
              <h2>Ticket — commande n°{recu.id}</h2>
              <div className="ticket-preview">
                <Ticket commande={recu} />
              </div>
              <div className="form-actions">
                <button className="btn" onClick={() => setRecu(null)}>
                  Commande suivante <ArrowRight size={16} />
                </button>
                <BoutonImprimer commande={recu} className="btn btn-primary" />
              </div>
            </>
          ) : (
            <EmptyState>Sélectionnez une commande à encaisser.</EmptyState>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * Paiement simple (un moyen) ou MIXTE (ex. : Orange Money + espèces).
 * - Wave / Orange Money / carte : montant exact ;
 * - Espèces : on saisit les billets reçus ; elles couvrent le reste et la monnaie est calculée.
 * L'aperçu utilise calculerPaiement, la MÊME fonction que le serveur.
 */
function EncaissementForm({ commande, onDone, onEdit }) {
  const du = commande.partPatient;
  const [mixte, setMixte] = useState(false);
  const [modes, setModes] = useState(['ESPECES']);
  const [montants, setMontants] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  function choisirMode(mode) {
    setSubmitError(null);
    if (!mixte) {
      setModes([mode]);
      return;
    }
    // En mode mixte, chaque bouton s'active / se désactive (au moins un moyen reste choisi).
    setModes((prev) => {
      if (prev.includes(mode)) return prev.length > 1 ? prev.filter((m) => m !== mode) : prev;
      return MODES.filter((m) => prev.includes(m) || m === mode);
    });
  }

  function basculerMixte(checked) {
    setMixte(checked);
    setMontants({});
    if (!checked) setModes((prev) => [prev[0]]);
  }

  const setMontant = (mode) => (e) => setMontants((m) => ({ ...m, [mode]: e.target.value }));

  // Un seul moyen électronique : il paie tout, pas besoin de saisir le montant.
  const paiements =
    du === 0
      ? []
      : modes.map((mode) => ({
          mode,
          montant: mode !== 'ESPECES' && modes.length === 1 ? du : (montants[mode] ?? ''),
        }));

  let apercu = null;
  let probleme = null;
  try {
    apercu = calculerPaiement(du, paiements);
  } catch (e) {
    probleme = e.message;
  }

  const electronique = paiements
    .filter((p) => p.mode !== 'ESPECES')
    .reduce((s, p) => s + (Number(p.montant) || 0), 0);
  const resteEspeces = Math.max(du - electronique, 0);
  const suggestions = [resteEspeces, 1000, 2000, 5000, 10000]
    .filter((v, i, arr) => v >= resteEspeces && v > 0 && arr.indexOf(v) === i)
    .slice(0, 4);

  async function handleEncaisser() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      onDone(await encaisserCommande(commande.id, { paiements }));
    } catch (err) {
      setSubmitError(err);
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="item-row">
        <h2>Commande n°{commande.id}</h2>
        <Can permission={PERMISSIONS.COMMANDE_UPDATE}>
          <button className="btn btn-small" onClick={onEdit}>
            <Pencil size={14} /> Modifier
          </button>
        </Can>
      </div>
      <p className="muted small">
        Préparée par {commande.vendeurNom} — {formatDateTime(commande.date)}
      </p>
      <CommandeDetails commande={commande} />

      {du > 0 && (
        <fieldset className="patient-box">
          <legend>Paiement</legend>
          <label className="checkbox">
            <input type="checkbox" checked={mixte} onChange={(e) => basculerMixte(e.target.checked)} />
            Paiement mixte (ex. : Orange Money + espèces)
          </label>

          <div className="pay-modes" role={mixte ? 'group' : 'radiogroup'} aria-label="Mode de paiement">
            {MODES.map((value) => (
              <button
                key={value}
                type="button"
                role={mixte ? undefined : 'radio'}
                aria-checked={mixte ? undefined : modes.includes(value)}
                aria-pressed={mixte ? modes.includes(value) : undefined}
                className={`pay-mode ${modes.includes(value) ? 'active' : ''}`}
                onClick={() => choisirMode(value)}
              >
                {MODES_PAIEMENT[value]}
              </button>
            ))}
          </div>

          {modes.length > 1 &&
            modes
              .filter((m) => m !== 'ESPECES')
              .map((m) => (
                <Field key={m} label={`Montant ${MODES_PAIEMENT[m]} (FCFA)`}>
                  <input type="number" min="1" max={du} value={montants[m] ?? ''} onChange={setMontant(m)} />
                </Field>
              ))}

          {modes.includes('ESPECES') && (
            <>
              <Field
                label={
                  modes.length > 1
                    ? `Espèces reçues (reste à payer : ${formatMoney(resteEspeces)})`
                    : 'Montant reçu (FCFA)'
                }
              >
                <input
                  type="number"
                  min={resteEspeces}
                  value={montants.ESPECES ?? ''}
                  onChange={setMontant('ESPECES')}
                />
              </Field>
              <div className="demo-buttons">
                {suggestions.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="btn btn-small"
                    onClick={() => setMontants((m) => ({ ...m, ESPECES: String(v) }))}
                  >
                    {formatMoney(v)}
                  </button>
                ))}
              </div>
            </>
          )}

          {apercu?.lignes.length > 1 && <p className="small">Répartition : {libellePaiement(apercu.lignes)}</p>}
          {probleme && <p className="small muted">{probleme}</p>}
        </fieldset>
      )}

      <div className="item-row cart-total">
        <span>Monnaie à rendre</span>
        <strong>{apercu ? formatMoney(apercu.monnaie) : '—'}</strong>
      </div>

      <ErrorMessage error={submitError} />

      <button className="btn btn-success btn-block" disabled={submitting || !apercu} onClick={handleEncaisser}>
        {submitting ? 'Encaissement…' : `Valider et encaisser ${formatMoney(du)}`}
      </button>
    </>
  );
}
