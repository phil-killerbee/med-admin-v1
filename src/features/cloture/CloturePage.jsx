import { useState } from 'react';
import { Lock } from 'lucide-react';
import { cloturerCaisse, getEtatCaisse, listClotures } from '../../services/caisseService';
import { useEvenements } from '../../services/evenements';
import { useAsync } from '../../hooks/useAsync';
import { MODES_PAIEMENT } from '../../domain/commande';
import { libelleEcart } from '../../domain/caisse';
import { Alert, Badge, EmptyState, ErrorMessage, Field, Loading, PageHeader } from '../../components/ui';
import { formatDateTime, formatMoney } from '../../utils/format';
import { BoutonImprimer, EnteteOfficine } from '../commandes/Ticket';
import { useAuth } from '../../auth/useAuth';

const MODES = Object.keys(MODES_PAIEMENT);
const ecartTone = (ecart) => (ecart === 0 ? 'success' : ecart > 0 ? 'warning' : 'danger');

/**
 * CLÔTURE DE CAISSE (« Z ») — en fin de service, le caissier compte son tiroir.
 * Le logiciel connaît ce qui DEVRAIT s'y trouver (encaissements − avoirs en espèces) ;
 * l'écart est calculé, enregistré et FIGÉ : on ne peut plus le modifier ensuite.
 */
export default function CloturePage() {
  const etat = useAsync(getEtatCaisse);
  const historique = useAsync(listClotures);
  const [especes, setEspeces] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [derniere, setDerniere] = useState(null);

  // En direct : un encaissement ou un avoir fait sur ce poste ou ailleurs → les totaux se mettent à jour.
  useEvenements(() => etat.reload());

  const e = etat.data;
  // Aperçu de l'écart (le serveur le recalcule lui-même avec calculerCloture)
  const compte = especes === '' ? NaN : Number(especes);
  const ecart = e && Number.isInteger(compte) && compte >= 0 ? compte - e.especesAttendues : null;
  const rien = e && e.nbCommandes === 0 && e.nbRetours === 0;

  async function handleCloturer(ev) {
    ev.preventDefault();
    const confirmation = `Clôturer la caisse ?\n\nEspèces attendues : ${formatMoney(e.especesAttendues)}\nEspèces comptées : ${formatMoney(Number(especes))}\n${libelleEcart(ecart)}\n\nLa clôture ne pourra plus être modifiée.`;
    if (!window.confirm(confirmation)) return;
    setSubmitting(true);
    setError(null);
    try {
      setDerniere(await cloturerCaisse({ especesComptees: Number(especes), commentaire }));
      setEspeces('');
      setCommentaire('');
      etat.reload();
      historique.reload();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader title="Clôture de caisse" subtitle="Comptez votre tiroir en fin de service : l’écart est calculé et enregistré" />

      {derniere && (
        <Alert type={derniere.ecart === 0 ? 'success' : 'info'}>
          Clôture n°{derniere.id} enregistrée — {libelleEcart(derniere.ecart)}.{' '}
          <BoutonImprimer className="btn btn-small" label="Imprimer le Z">
            <TicketZ cloture={derniere} />
          </BoutonImprimer>
        </Alert>
      )}

      <div className="pos">
        <section className="card">
          <h2>Ma caisse en cours</h2>
          {etat.loading && !e && <Loading />}
          <ErrorMessage error={etat.error} />
          {e && (
            <>
              <p className="muted small">
                {e.depuis ? `Depuis la clôture du ${formatDateTime(e.depuis)}` : 'Aucune clôture précédente'} —{' '}
                {e.nbCommandes} encaissement(s), {e.nbRetours} avoir(s)
              </p>
              <TableModes parMode={e.parMode} totalNet={e.totalNet} />
            </>
          )}
        </section>

        <form className="card cart" onSubmit={handleCloturer} noValidate>
          <h2>Comptage</h2>
          {e && (
            <>
              <div className="item-row">
                <span>Espèces attendues dans le tiroir</span>
                <strong>{formatMoney(e.especesAttendues)}</strong>
              </div>
              <p className="muted small">Wave, Orange Money et carte sont contrôlés sur les relevés, pas dans le tiroir.</p>
              <Field label="Espèces comptées (FCFA)" error={error?.fields?.especesComptees}>
                <input
                  type="number"
                  min="0"
                  value={especes}
                  onChange={(ev) => setEspeces(ev.target.value)}
                  disabled={rien}
                />
              </Field>
              {ecart !== null && (
                <div className="item-row cart-total">
                  <span>Écart</span>
                  <Badge tone={ecartTone(ecart)}>{libelleEcart(ecart)}</Badge>
                </div>
              )}
              <Field label="Commentaire (facultatif, utile en cas d’écart)">
                <input value={commentaire} onChange={(ev) => setCommentaire(ev.target.value)} disabled={rien} />
              </Field>
              <ErrorMessage error={error} />
              {rien && <EmptyState>Rien à clôturer : aucun encaissement depuis la dernière clôture.</EmptyState>}
              <button className="btn btn-success btn-block" disabled={rien || submitting || ecart === null}>
                <Lock size={16} /> {submitting ? 'Clôture…' : 'Clôturer ma caisse'}
              </button>
            </>
          )}
        </form>
      </div>

      <section className="card">
        <h2>
          Clôtures précédentes{' '}
          {historique.data?.portee === 'ALL' && <span className="muted small">(tous les caissiers)</span>}
        </h2>
        {historique.loading && !historique.data && <Loading />}
        <ErrorMessage error={historique.error} />
        {historique.data?.clotures.length === 0 && <EmptyState>Aucune clôture.</EmptyState>}
        {historique.data?.clotures.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Date</th>
                  <th>Caissier</th>
                  <th className="num">Encaissements</th>
                  <th className="num">Total net</th>
                  <th className="num">Espèces attendues</th>
                  <th className="num">Comptées</th>
                  <th>Écart</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {historique.data.clotures.map((c) => (
                  <tr key={c.id}>
                    <td>{c.id}</td>
                    <td>{formatDateTime(c.date)}</td>
                    <td>{c.caissierNom}</td>
                    <td className="num">{c.nbCommandes}</td>
                    <td className="num">{formatMoney(c.totalNet)}</td>
                    <td className="num">{formatMoney(c.especesAttendues)}</td>
                    <td className="num">{formatMoney(c.especesComptees)}</td>
                    <td title={c.commentaire ?? ''}>
                      <Badge tone={ecartTone(c.ecart)}>{libelleEcart(c.ecart)}</Badge>
                    </td>
                    <td>
                      <BoutonImprimer className="btn btn-small" label="Z">
                        <TicketZ cloture={c} duplicata />
                      </BoutonImprimer>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function TableModes({ parMode, totalNet }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Moyen</th>
          <th className="num">Encaissé</th>
          <th className="num">Avoirs</th>
          <th className="num">Net</th>
        </tr>
      </thead>
      <tbody>
        {MODES.map((mode) => (
          <tr key={mode} className={parMode[mode].encaisse || parMode[mode].rembourse ? '' : 'row-muted'}>
            <td>{MODES_PAIEMENT[mode]}</td>
            <td className="num">{formatMoney(parMode[mode].encaisse)}</td>
            <td className="num">{parMode[mode].rembourse ? `− ${formatMoney(parMode[mode].rembourse)}` : '—'}</td>
            <td className="num">
              <strong>{formatMoney(parMode[mode].net)}</strong>
            </td>
          </tr>
        ))}
        <tr>
          <td>
            <strong>Total</strong>
          </td>
          <td colSpan={2} />
          <td className="num">
            <strong>{formatMoney(totalNet)}</strong>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Ticket « Z » imprimé et signé par le caissier en fin de service. */
function TicketZ({ cloture: c, duplicata = false }) {
  const { user } = useAuth();
  return (
    <div className="ticket">
      <EnteteOfficine />
      <div className="ticket-sep" />
      <div className="ticket-center">
        <strong>CLÔTURE DE CAISSE (Z) n°{c.id}</strong>
        {duplicata && <div>*** DUPLICATA ***</div>}
      </div>
      <div className="ticket-row">
        <span>{c.caissierNom}</span>
        <span>{formatDateTime(c.date)}</span>
      </div>
      <div>
        {c.nbCommandes} encaissement(s), {c.nbRetours} avoir(s)
      </div>
      <div className="ticket-sep" />
      {MODES.filter((m) => c.parMode[m].encaisse || c.parMode[m].rembourse).map((m) => (
        <div key={m}>
          <div className="ticket-row">
            <span>{MODES_PAIEMENT[m]}</span>
            <span>{formatMoney(c.parMode[m].net)}</span>
          </div>
          {c.parMode[m].rembourse > 0 && (
            <div className="ticket-row small">
              <span> dont avoirs</span>
              <span>− {formatMoney(c.parMode[m].rembourse)}</span>
            </div>
          )}
        </div>
      ))}
      <div className="ticket-row ticket-big">
        <span>TOTAL NET</span>
        <strong>{formatMoney(c.totalNet)}</strong>
      </div>
      <div className="ticket-sep" />
      <div className="ticket-row">
        <span>Espèces attendues</span>
        <span>{formatMoney(c.especesAttendues)}</span>
      </div>
      <div className="ticket-row">
        <span>Espèces comptées</span>
        <span>{formatMoney(c.especesComptees)}</span>
      </div>
      <div className="ticket-row ticket-big">
        <span>ÉCART</span>
        <strong>{libelleEcart(c.ecart)}</strong>
      </div>
      {c.commentaire && <div>Note : {c.commentaire}</div>}
      <div className="ticket-sep" />
      <div>Imprimé par {user.nom}</div>
      <div>Signature du caissier :</div>
      <br />
      <br />
    </div>
  );
}
