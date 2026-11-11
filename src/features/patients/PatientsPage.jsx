import { useState } from 'react';
import { History, Pencil, Phone, Plus, ShieldCheck } from 'lucide-react';
import { createPatient, getPatientCommandes, listPatients, updatePatient } from '../../services/patientService';
import { listAssurances } from '../../services/assuranceService';
import { useAsync } from '../../hooks/useAsync';
import { useDebounce } from '../../hooks/useDebounce';
import { Can } from '../../auth/Can';
import { PERMISSIONS } from '../../config/roles';
import { validatePatient } from '../../domain/patient';
import { Alert, EmptyState, ErrorMessage, Field, Loading, PageHeader } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { formatDateTime, formatMoney } from '../../utils/format';
import { StatutBadge } from '../commandes/CommandeDetails';

/**
 * FICHES PATIENTS — facultatives : on peut toujours vendre sans fiche.
 * Avec une fiche, l'assurance est enregistrée une fois pour toutes et l'historique est consultable.
 */
export default function PatientsPage() {
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim());
  const { data: patients, loading, error, reload } = useAsync(() => listPatients(q), [q]);
  const [edition, setEdition] = useState(null); // {} = nouveau, sinon le patient modifié
  const [historique, setHistorique] = useState(null);
  const [message, setMessage] = useState(null);

  return (
    <>
      <PageHeader
        title="Patients"
        subtitle="Fiches facultatives : assurance enregistrée et historique des achats"
        actions={
          <Can permission={PERMISSIONS.PATIENT_MANAGE}>
            <button className="btn btn-primary" onClick={() => setEdition({})}>
              <Plus size={16} /> Nouveau patient
            </button>
          </Can>
        }
      />
      <Alert type="success">{message}</Alert>

      <input
        className="search"
        type="search"
        placeholder="Rechercher par nom, téléphone ou n° d’assuré…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {loading && !patients && <Loading />}
      <ErrorMessage error={error} />
      {patients?.length === 0 && <EmptyState>Aucun patient trouvé.</EmptyState>}

      <div className="item-grid">
        {patients?.map((p) => (
          <article key={p.id} className="item-card">
            <header className="item-card-header">
              <h3 className="item-title">{p.nom}</h3>
              <span className="muted small">{p.nbCommandes} commande(s)</span>
            </header>
            <div className="item-card-body">
              <div className="item-row">
                <span>
                  <Phone size={14} aria-hidden /> {p.telephone ?? '—'}
                </span>
                <span className="muted small">
                  {p.derniereVisite ? `Vu le ${formatDateTime(p.derniereVisite)}` : 'Jamais venu'}
                </span>
              </div>
              {p.assuranceId ? (
                <div className="assurance-tag">
                  <ShieldCheck size={15} aria-hidden />
                  <span>
                    {p.assuranceNom} — {p.assuranceTaux} % · n° {p.numeroAssure}
                    {!p.assuranceActive && ' (assurance inactive)'}
                  </span>
                </div>
              ) : (
                <span className="muted small">Sans assurance</span>
              )}
            </div>
            <footer className="item-card-actions">
              <button className="split-btn split-btn-blue" onClick={() => setHistorique(p)}>
                <History size={15} aria-hidden /> Historique
              </button>
              <Can permission={PERMISSIONS.PATIENT_MANAGE}>
                <button className="split-btn split-btn-green" onClick={() => setEdition(p)}>
                  <Pencil size={15} aria-hidden /> Modifier
                </button>
              </Can>
            </footer>
          </article>
        ))}
      </div>

      {edition && (
        <Modal title={edition.id ? `Modifier — ${edition.nom}` : 'Nouveau patient'} onClose={() => setEdition(null)}>
          <PatientForm
            patient={edition}
            onCancel={() => setEdition(null)}
            onSaved={(p) => {
              setEdition(null);
              setMessage(`Fiche de ${p.nom} enregistrée`);
              reload();
            }}
          />
        </Modal>
      )}
      {historique && (
        <Modal title={`Historique — ${historique.nom}`} onClose={() => setHistorique(null)}>
          <HistoriquePatient patient={historique} />
        </Modal>
      )}
    </>
  );
}

/** Formulaire réutilisé ici et au comptoir (création rapide d'une fiche). */
export function PatientForm({ patient, onCancel, onSaved }) {
  const { data: assurances } = useAsync(listAssurances);
  const [values, setValues] = useState({
    nom: patient.nom ?? '',
    telephone: patient.telephone ?? '',
    assuranceId: patient.assuranceId ?? '',
    numeroAssure: patient.numeroAssure ?? '',
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    const local = validatePatient(values); // même validation que le serveur
    setErrors(local);
    if (Object.keys(local).length) return;
    setSubmitting(true);
    setError(null);
    try {
      onSaved(patient.id ? await updatePatient(patient.id, values) : await createPatient(values));
    } catch (err) {
      setErrors(err.fields ?? {});
      setError(err);
      setSubmitting(false);
    }
  }

  return (
    <form className="modal-body" onSubmit={handleSubmit} noValidate>
      <ErrorMessage error={error} />
      <Field label="Nom et prénom" error={errors.nom}>
        <input value={values.nom} onChange={set('nom')} autoFocus />
      </Field>
      <Field label="Téléphone" error={errors.telephone}>
        <input value={values.telephone} onChange={set('telephone')} placeholder="Facultatif" inputMode="tel" />
      </Field>
      <div className="form-grid-2">
        <Field label="Assurance" error={errors.assuranceId}>
          <select value={values.assuranceId} onChange={set('assuranceId')}>
            <option value="">— Aucune —</option>
            {assurances?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nom} ({a.taux} %)
              </option>
            ))}
          </select>
        </Field>
        <Field label="N° d’assuré" error={errors.numeroAssure}>
          <input value={values.numeroAssure} onChange={set('numeroAssure')} disabled={!values.assuranceId} />
        </Field>
      </div>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Annuler
        </button>
        <button className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

function HistoriquePatient({ patient }) {
  const { data, loading, error } = useAsync(() => getPatientCommandes(patient.id), [patient.id]);
  if (loading) return <Loading />;
  if (error) return <ErrorMessage error={error} />;
  if (data.length === 0) return <EmptyState>Aucune commande pour ce patient.</EmptyState>;
  return (
    <div className="modal-body table-scroll">
      <table>
        <thead>
          <tr>
            <th>N°</th>
            <th>Date</th>
            <th>Produits</th>
            <th className="num">Payé patient</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.id}>
              <td>{c.id}</td>
              <td>{formatDateTime(c.date)}</td>
              <td className="small">
                {c.produits}
                {c.ordonnanceRef && <div className="muted">Ord. {c.ordonnanceRef}</div>}
              </td>
              <td className="num">{formatMoney(c.partPatient)}</td>
              <td>
                <StatutBadge statut={c.statut} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
