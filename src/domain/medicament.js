/**
 * Validation métier d'un médicament.
 * Retourne un objet { champ: message } — vide si tout est valide.
 * Utilisée à la fois par le formulaire (UX) ET par le service (sécurité) :
 * on ne fait jamais confiance aux seules validations côté interface.
 */
export function validateMedicament(data) {
  const errors = {};

  if (!data.nom?.trim()) errors.nom = 'Le nom est obligatoire';
  if (!data.dci?.trim()) errors.dci = 'La DCI est obligatoire';
  if (!/^\d{7,13}$/.test(data.code ?? '')) errors.code = 'Code CIP : 7 à 13 chiffres';

  const prix = Number(data.prixVente);
  if (!Number.isFinite(prix) || prix <= 0) errors.prixVente = 'Le prix doit être supérieur à 0';

  const seuil = Number(data.seuilAlerte);
  if (!Number.isInteger(seuil) || seuil < 0) errors.seuilAlerte = 'Seuil : entier positif ou nul';

  return errors;
}

/**
 * Lecteur de code-barres : un lecteur USB « tape » le code puis la touche Entrée,
 * comme un clavier. On cherche le médicament dont le code CIP / EAN correspond EXACTEMENT.
 */
export function trouverParCode(medicaments, saisie) {
  const code = String(saisie ?? '').replace(/\s/g, '');
  if (!/^\d{7,13}$/.test(code)) return null;
  return medicaments.find((m) => m.code === code) ?? null;
}

export function normalizeMedicament(data) {
  return {
    code: data.code.trim(),
    nom: data.nom.trim(),
    dci: data.dci.trim(),
    forme: data.forme?.trim() ?? '',
    prixVente: Number(data.prixVente),
    seuilAlerte: Number(data.seuilAlerte),
    ordonnance: Boolean(data.ordonnance),
  };
}
