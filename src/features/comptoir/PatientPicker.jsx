import { useState } from 'react';
import { ShieldCheck, UserPlus, X } from 'lucide-react';
import { listPatients } from '../../services/patientService';
import { useAsync } from '../../hooks/useAsync';
import { useDebounce } from '../../hooks/useDebounce';
import { useAuth } from '../../auth/useAuth';
import { PERMISSIONS } from '../../config/roles';
import { Field } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { PatientForm } from '../patients/PatientsPage';

/**
 * Choix du patient au comptoir : on tape le nom (ou le téléphone) → les fiches correspondantes
 * s'affichent ; en choisir une reprend son nom et son assurance. Sans fiche, le nom tapé suffit.
 */
export function PatientPicker({ cart, dispatch }) {
  const { can } = useAuth();
  const q = useDebounce(cart.patientNom.trim());
  const recherche = !cart.patientId && q.length >= 2;
  const { data: suggestions } = useAsync(() => (recherche ? listPatients(q) : Promise.resolve([])), [q, recherche]);
  const [creation, setCreation] = useState(false);

  if (cart.patientId) {
    return (
      <div className="field">
        <span className="field-label">Patient</span>
        <div className="patient-chip">
          <strong>{cart.patientNom}</strong>
          <span className="muted small">fiche n°{cart.patientId}</span>
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            onClick={() => dispatch({ type: 'CLEAR_PATIENT' })}
            aria-label="Retirer le patient"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  const exact = suggestions?.some((p) => p.nom.toLowerCase() === q.toLowerCase());
  return (
    <>
      <Field label="Patient (nom ou téléphone)">
        <input
          value={cart.patientNom}
          onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'patientNom', value: e.target.value })}
          placeholder="Facultatif — tapez pour retrouver une fiche"
          autoComplete="off"
        />
      </Field>
      {recherche && (suggestions?.length > 0 || can(PERMISSIONS.PATIENT_MANAGE)) && (
        <ul className="suggestions" aria-label="Fiches patients">
          {suggestions?.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => dispatch({ type: 'SELECT_PATIENT', patient: p })}>
                <strong>{p.nom}</strong>
                <span className="muted small">{p.telephone ?? ''}</span>
                {p.assuranceId && (
                  <span className="small">
                    <ShieldCheck size={13} aria-hidden /> {p.assuranceNom}
                  </span>
                )}
              </button>
            </li>
          ))}
          {!exact && can(PERMISSIONS.PATIENT_MANAGE) && (
            <li>
              <button type="button" onClick={() => setCreation(true)}>
                <UserPlus size={14} aria-hidden /> Créer la fiche « {q} »
              </button>
            </li>
          )}
        </ul>
      )}
      {creation && (
        <Modal title="Nouveau patient" onClose={() => setCreation(false)}>
          <PatientForm
            patient={{ nom: q }}
            onCancel={() => setCreation(false)}
            onSaved={(p) => {
              setCreation(false);
              dispatch({ type: 'SELECT_PATIENT', patient: p });
            }}
          />
        </Modal>
      )}
    </>
  );
}
