import { useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { createAssurance, listAssurances, updateAssurance } from '../../services/assuranceService';
import { useAsync } from '../../hooks/useAsync';
import { Alert, Badge, EmptyState, ErrorMessage, Field, Loading, PageHeader } from '../../components/ui';

/**
 * Gestion des organismes de prise en charge (réservé à assurance:manage).
 * Modifier un taux n'affecte pas les commandes passées : le taux y est figé.
 */
export default function AssurancesPage() {
  const { data: assurances, loading, error, reload } = useAsync(listAssurances);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState(null);
  const [actionError, setActionError] = useState(null);

  async function handleUpdate(a, changes, texte) {
    setActionError(null);
    try {
      await updateAssurance(a.id, changes);
      setMessage(texte);
      reload();
    } catch (err) {
      setActionError(err);
    }
  }

  function handleTaux(a) {
    const saisie = window.prompt(`Nouveau taux de couverture pour « ${a.nom} » (0 à 100) :`, String(a.taux));
    if (saisie === null) return;
    handleUpdate(a, { taux: Number(saisie) }, `Taux de ${a.nom} modifié (les commandes passées ne changent pas)`);
  }

  return (
    <>
      <PageHeader
        title="Assurances & mutuelles"
        subtitle="Organismes acceptés en tiers payant sur présentation d’une ordonnance"
        actions={
          <button className="btn btn-success" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Nouvelle assurance
          </button>
        }
      />
      <Alert type="success">{message}</Alert>
      <ErrorMessage error={actionError} />

      {showForm && (
        <AssuranceForm
          onDone={() => {
            setShowForm(false);
            setMessage('Assurance ajoutée');
            reload();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading && <Loading />}
      <ErrorMessage error={error} />
      {assurances?.length === 0 && <EmptyState>Aucune assurance.</EmptyState>}

      <div className="item-grid">
        {assurances?.map((a) => (
          <article key={a.id} className={`item-card ${a.actif ? '' : 'item-card-muted'}`}>
            <header className="item-card-header">
              <h3 className="item-title">
                <ShieldCheck size={16} aria-hidden /> {a.nom}
              </h3>
              {a.actif ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>}
            </header>
            <div className="item-card-body">
              <div className="item-row">
                <span>Part assurance</span>
                <span className="item-price">{a.taux} %</span>
              </div>
              <div className="taux-bar" aria-hidden>
                <span style={{ width: `${a.taux}%` }} />
              </div>
              <div className="item-row muted small">
                <span>Part patient</span>
                <span>{100 - a.taux} %</span>
              </div>
            </div>
            <footer className="item-card-actions">
              <button className="split-btn split-btn-blue" onClick={() => handleTaux(a)}>
                Modifier le taux
              </button>
              {a.actif ? (
                <button className="split-btn split-btn-red" onClick={() => handleUpdate(a, { actif: false }, `${a.nom} désactivée`)}>
                  Désactiver
                </button>
              ) : (
                <button className="split-btn split-btn-green" onClick={() => handleUpdate(a, { actif: true }, `${a.nom} réactivée`)}>
                  Réactiver
                </button>
              )}
            </footer>
          </article>
        ))}
      </div>
    </>
  );
}

function AssuranceForm({ onDone, onCancel }) {
  const [values, setValues] = useState({ nom: '', taux: '80' });
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setGlobalError(null);
    try {
      await createAssurance({ nom: values.nom, taux: Number(values.taux) });
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
      <h2 className="span-2">Nouvelle assurance</h2>
      <div className="span-2">
        <Alert type="error">{globalError}</Alert>
      </div>
      <Field label="Nom de l’organisme" error={errors.nom}>
        <input value={values.nom} onChange={(e) => setValues({ ...values, nom: e.target.value })} />
      </Field>
      <Field label="Taux de couverture (%)" error={errors.taux}>
        <input type="number" min="0" max="100" value={values.taux} onChange={(e) => setValues({ ...values, taux: e.target.value })} />
      </Field>
      <div className="span-2 form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Annuler
        </button>
        <button className="btn btn-primary" disabled={submitting}>
          Enregistrer
        </button>
      </div>
    </form>
  );
}
