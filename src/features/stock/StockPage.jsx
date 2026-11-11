import { useState } from 'react';
import { listLots, receptionnerLot } from '../../services/stockService';
import { listMedicaments } from '../../services/medicamentService';
import { useAsync } from '../../hooks/useAsync';
import { Can } from '../../auth/Can';
import { PERMISSIONS } from '../../config/roles';
import { Alert, Badge, ErrorMessage, Field, Loading, PageHeader } from '../../components/ui';
import { formatDate } from '../../utils/format';

const STATUT_BADGE = {
  PERIME: <Badge tone="danger">Périmé</Badge>,
  PROCHE: <Badge tone="warning">&lt; 90 jours</Badge>,
  OK: <Badge tone="success">OK</Badge>,
};

export default function StockPage() {
  const { data: lots, loading, error, reload } = useAsync(listLots);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState(null);

  return (
    <>
      <PageHeader
        title="Stock & lots"
        subtitle="Triés par date de péremption (règle FEFO : premier périmé, premier sorti)"
        actions={
          <Can permission={PERMISSIONS.STOCK_RECEIVE}>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              + Réceptionner un lot
            </button>
          </Can>
        }
      />
      <Alert type="success">{message}</Alert>

      {showForm && (
        <ReceptionForm
          onDone={() => {
            setShowForm(false);
            setMessage('Lot réceptionné et ajouté au stock');
            reload();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <section className="card">
        {loading && <Loading />}
        <ErrorMessage error={error} />
        {lots && (
          <table>
            <thead>
              <tr>
                <th>Médicament</th>
                <th>N° lot</th>
                <th className="num">Quantité</th>
                <th>Reçu le</th>
                <th>Péremption</th>
                <th>État</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((l) => (
                <tr key={l.id} className={l.quantite === 0 ? 'row-muted' : ''}>
                  <td>{l.medicamentNom}</td>
                  <td className="mono">{l.numeroLot}</td>
                  <td className="num">{l.quantite}</td>
                  <td>{formatDate(l.dateReception)}</td>
                  <td>{formatDate(l.datePeremption)}</td>
                  <td>{STATUT_BADGE[l.statut]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function ReceptionForm({ onDone, onCancel }) {
  const { data: medicaments } = useAsync(listMedicaments);
  const [values, setValues] = useState({ medicamentId: '', numeroLot: '', quantite: '', datePeremption: '' });
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field) => (e) => setValues({ ...values, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setGlobalError(null);
    try {
      await receptionnerLot(values);
      onDone();
    } catch (err) {
      setErrors(err.fields ?? {});
      setGlobalError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit} noValidate>
      <h2 className="span-2">Réception d’un lot fournisseur</h2>
      <div className="span-2">
        <Alert type="error">{globalError}</Alert>
      </div>
      <Field label="Médicament" error={errors.medicamentId}>
        <select value={values.medicamentId} onChange={set('medicamentId')}>
          <option value="">— Choisir —</option>
          {medicaments?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nom}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Numéro de lot" error={errors.numeroLot}>
        <input value={values.numeroLot} onChange={set('numeroLot')} />
      </Field>
      <Field label="Quantité reçue" error={errors.quantite}>
        <input type="number" min="1" value={values.quantite} onChange={set('quantite')} />
      </Field>
      <Field label="Date de péremption" error={errors.datePeremption}>
        <input type="date" value={values.datePeremption} onChange={set('datePeremption')} />
      </Field>
      <div className="span-2 form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Annuler
        </button>
        <button className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Enregistrement…' : 'Valider la réception'}
        </button>
      </div>
    </form>
  );
}
