/**
 * Fiche patient — validation partagée par le formulaire et l'API.
 * Seul le nom est obligatoire ; le n° d'assuré est exigé si une assurance est choisie.
 */
export function validatePatient({ nom, telephone, assuranceId, numeroAssure }) {
  const errors = {};
  if (!String(nom ?? '').trim()) errors.nom = 'Le nom est obligatoire';
  const tel = String(telephone ?? '').replace(/[\s.-]/g, '');
  if (tel && !/^\+?\d{7,15}$/.test(tel)) errors.telephone = 'Numéro de téléphone invalide';
  if (assuranceId && !String(numeroAssure ?? '').trim()) errors.numeroAssure = 'Numéro d’assuré obligatoire';
  return errors;
}

export function normalizePatient({ nom, telephone, assuranceId, numeroAssure }) {
  return {
    nom: String(nom).trim(),
    telephone: String(telephone ?? '').replace(/[\s.-]/g, '') || null,
    assuranceId: assuranceId ? Number(assuranceId) : null,
    numeroAssure: assuranceId ? String(numeroAssure).trim() : null,
  };
}
