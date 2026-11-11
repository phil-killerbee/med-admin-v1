import { useState } from 'react';
import { Alert, Field } from '../../components/ui';
import { validateMedicament } from '../../domain/medicament';

const EMPTY = { code: '', nom: '', dci: '', forme: '', prixVente: '', seuilAlerte: '10', ordonnance: false };

/**
 * Formulaire CONTRÔLÉ réutilisé pour la création et la modification.
 * La validation est faite ici (retour immédiat) ET dans le service (sécurité).
 */
export function MedicamentForm({ initial, onSubmit, onCancel }) {
  const [values, setValues] = useState(initial ?? EMPTY);
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field) => (e) =>
    setValues({ ...values, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    const clientErrors = validateMedicament(values);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length) return;

    setSubmitting(true);
    setGlobalError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setErrors(err.fields ?? {});
      setGlobalError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit} noValidate>
      <h2 className="span-2">{initial ? 'Modifier le médicament' : 'Nouveau médicament'}</h2>
      <div className="span-2">
        <Alert type="error">{globalError}</Alert>
      </div>
      <Field label="Nom commercial" error={errors.nom}>
        <input value={values.nom} onChange={set('nom')} />
      </Field>
      <Field label="DCI (dénomination commune)" error={errors.dci}>
        <input value={values.dci} onChange={set('dci')} />
      </Field>
      <Field label="Code CIP" error={errors.code}>
        <input value={values.code} onChange={set('code')} inputMode="numeric" />
      </Field>
      <Field label="Forme">
        <input value={values.forme} onChange={set('forme')} placeholder="Comprimé, gélule…" />
      </Field>
      <Field label="Prix de vente (FCFA)" error={errors.prixVente}>
        <input type="number" min="0" value={values.prixVente} onChange={set('prixVente')} />
      </Field>
      <Field label="Seuil d’alerte stock" error={errors.seuilAlerte}>
        <input type="number" min="0" value={values.seuilAlerte} onChange={set('seuilAlerte')} />
      </Field>
      <label className="checkbox span-2">
        <input type="checkbox" checked={values.ordonnance} onChange={set('ordonnance')} />
        Soumis à prescription médicale (ordonnance obligatoire)
      </label>
      <div className="span-2 form-actions">
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
