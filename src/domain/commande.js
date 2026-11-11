import { PERMISSIONS } from '../config/roles.js';
import { hasPermission } from './permissions.js';

/**
 * Règles métier des commandes — fonctions PURES, partagées par le front et l'API.
 *
 * Circuit : EN_ATTENTE (vendeuse) → PAYEE (caisse)  ou  → ANNULEE
 */
export const STATUTS = Object.freeze({
  EN_ATTENTE: 'EN_ATTENTE',
  PAYEE: 'PAYEE',
  ANNULEE: 'ANNULEE',
});

export const STATUT_LABELS = Object.freeze({
  EN_ATTENTE: 'En attente de paiement',
  PAYEE: 'Payée',
  ANNULEE: 'Annulée',
});

export const MODES_PAIEMENT = Object.freeze({
  ESPECES: 'Espèces',
  WAVE: 'Wave',
  ORANGE_MONEY: 'Orange Money',
  CARTE: 'Carte bancaire',
});

/** Le total est TOUJOURS recalculé à partir des prix du catalogue. */
export function computeTotal(lignes) {
  return lignes.reduce((total, l) => total + l.prixUnitaire * l.quantite, 0);
}

/**
 * Prise en charge par l'assurance (tiers payant).
 * L'assurance paie `taux` % ; le patient paie le reste (ticket modérateur).
 * Arrondi au franc, et la part patient absorbe l'arrondi → la somme est toujours exacte.
 */
export function repartitionAssurance(total, taux = 0) {
  if (!Number.isInteger(taux) || taux < 0 || taux > 100) {
    throw new Error('Le taux de couverture doit être un entier entre 0 et 100');
  }
  const partAssurance = Math.round((total * taux) / 100);
  return { partAssurance, partPatient: total - partAssurance };
}

/**
 * Validation des informations patient / ordonnance / assurance.
 * Nom du patient et référence d'ordonnance sont FACULTATIFS.
 * Seule exigence : une prise en charge par l'assurance demande le n° d'assuré
 * (sans lui, impossible de facturer l'assurance).
 */
export function validateInfosPatient({ assuranceId, numeroAssure }) {
  const errors = {};
  if (assuranceId && !String(numeroAssure ?? '').trim()) {
    errors.numeroAssure = 'Numéro d’assuré obligatoire';
  }
  return errors;
}

const montantEntier = (v) => {
  const n = Number(v);
  return v !== '' && v !== null && v !== undefined && Number.isInteger(n) && n >= 0 ? n : NaN;
};

/**
 * Encaissement, simple OU MIXTE (ex. : Orange Money + espèces).
 *
 * paiements : [{ mode, montant }]
 *  - Wave / Orange Money / carte : `montant` = somme EXACTE payée par ce moyen (pas de monnaie) ;
 *  - Espèces (au plus une ligne) : `montant` = billets REÇUS ; les espèces couvrent le reste
 *    et la monnaie est rendue sur les espèces uniquement.
 *
 * Retourne { lignes: [{mode, montant}] (montant réellement affecté à la commande),
 *            mode ('MIXTE' si plusieurs moyens), montantRecu (total reçu), monnaie }.
 * Fonction pure : le front l'utilise pour l'aperçu, l'API pour décider — même règle des deux côtés.
 */
export function calculerPaiement(partPatient, paiements) {
  if (!Array.isArray(paiements)) throw new Error('Paiement invalide');
  const modes = paiements.map((p) => p?.mode);
  if (modes.some((m) => !MODES_PAIEMENT[m])) throw new Error('Mode de paiement invalide');
  if (new Set(modes).size !== modes.length) throw new Error('Chaque moyen de paiement ne peut apparaître qu’une fois');

  // Prise en charge à 100 % : rien à encaisser auprès du patient.
  if (partPatient === 0) return { lignes: [], mode: null, montantRecu: 0, monnaie: 0 };
  if (paiements.length === 0) throw new Error('Choisissez au moins un moyen de paiement');

  const electroniques = paiements.filter((p) => p.mode !== 'ESPECES');
  const especes = paiements.find((p) => p.mode === 'ESPECES');

  for (const p of electroniques) {
    const m = montantEntier(p.montant);
    if (!(m > 0)) throw new Error(`Montant ${MODES_PAIEMENT[p.mode]} invalide`);
  }
  const totalElectronique = electroniques.reduce((s, p) => s + Number(p.montant), 0);
  if (totalElectronique > partPatient) {
    throw new Error('Les paiements électroniques dépassent la part patient (pas de monnaie sur Wave, Orange Money ou carte)');
  }

  const resteEspeces = partPatient - totalElectronique;
  if (resteEspeces > 0 && !especes) {
    throw new Error(`Il reste ${resteEspeces.toLocaleString('fr-FR')} F à répartir`);
  }

  let recuEspeces = 0;
  if (especes) {
    recuEspeces = montantEntier(especes.montant);
    if (resteEspeces === 0) throw new Error('Tout est déjà payé : retirez les espèces');
    if (Number.isNaN(recuEspeces) || recuEspeces < resteEspeces) throw new Error('Montant reçu en espèces insuffisant');
  }

  const lignes = [
    ...electroniques.map((p) => ({ mode: p.mode, montant: Number(p.montant) })),
    ...(especes ? [{ mode: 'ESPECES', montant: resteEspeces }] : []),
  ];
  return {
    lignes,
    mode: lignes.length > 1 ? 'MIXTE' : lignes[0].mode,
    montantRecu: totalElectronique + recuEspeces,
    monnaie: especes ? recuEspeces - resteEspeces : 0,
  };
}

/** Billets remis par le patient (la monnaie se rend toujours sur les espèces). */
export function especesRecues(paiement) {
  const electronique = paiement.lignes.filter((l) => l.mode !== 'ESPECES').reduce((s, l) => s + l.montant, 0);
  return paiement.montantRecu - electronique;
}

/** Libellé d'un paiement : « Orange Money 3 000 F + Espèces 1 500 F ». */
export function libellePaiement(lignes) {
  return lignes.map((l) => `${MODES_PAIEMENT[l.mode]} ${fmt(l.montant)}`).join(' + ');
}

/**
 * Modification d'une commande : quelles lignes AUGMENTENT un médicament sur ordonnance ?
 * Le caissier peut réduire ou retirer, mais ajouter/augmenter un produit sur ordonnance
 * exige la permission ordonnance:delivrer.
 */
export function hausseSurOrdonnance(nouvelles, anciennes, medicamentsById) {
  return nouvelles
    .filter((l) => {
      const m = medicamentsById[l.medicamentId];
      const avant = anciennes.find((a) => a.medicamentId === l.medicamentId)?.quantite ?? 0;
      return m?.ordonnance && Number(l.quantite) > avant;
    })
    .map((l) => medicamentsById[l.medicamentId].nom);
}

const fmt = (n) => `${Number(n).toLocaleString('fr-FR')} F`;

/**
 * Résumé lisible d'une modification (pour l'historique et le journal d'audit).
 * avant / apres : { lignes:[{medicamentId, nom, quantite}], patientNom, ordonnanceRef,
 *                   assuranceNom, numeroAssure, total, partPatient }
 */
export function resumerModification(avant, apres) {
  const changes = [];
  const qte = (lignes, id) => lignes.find((l) => l.medicamentId === id)?.quantite ?? 0;

  for (const l of avant.lignes) {
    const q = qte(apres.lignes, l.medicamentId);
    if (q === 0) changes.push(`Retrait ${l.nom} (× ${l.quantite})`);
    else if (q !== l.quantite) changes.push(`${l.nom} : ${l.quantite} → ${q}`);
  }
  for (const l of apres.lignes) {
    if (qte(avant.lignes, l.medicamentId) === 0) changes.push(`Ajout ${l.nom} × ${l.quantite}`);
  }

  const champs = [
    ['patientNom', 'Patient'],
    ['ordonnanceRef', 'Ordonnance'],
    ['assuranceNom', 'Assurance'],
    ['numeroAssure', 'N° assuré'],
  ];
  for (const [key, label] of champs) {
    if ((avant[key] ?? '') !== (apres[key] ?? '')) {
      changes.push(`${label} : ${avant[key] || 'aucun(e)'} → ${apres[key] || 'aucun(e)'}`);
    }
  }
  if (avant.partPatient !== apres.partPatient) {
    changes.push(`Part patient : ${fmt(avant.partPatient)} → ${fmt(apres.partPatient)}`);
  }
  return changes;
}

/**
 * Qui peut annuler ? Exemple de règle mêlant RÔLE et PROPRIÉTÉ (ABAC) :
 *  - avec la permission commande:cancel → n'importe quelle commande non annulée ;
 *  - sinon, l'auteur peut annuler SA commande tant qu'elle n'est pas payée.
 */
export function canCancelCommande(user, commande) {
  if (!user || !commande || commande.statut === STATUTS.ANNULEE) return false;
  if (hasPermission(user, PERMISSIONS.COMMANDE_CANCEL)) return true;
  return (
    hasPermission(user, PERMISSIONS.COMMANDE_CREATE) &&
    commande.statut === STATUTS.EN_ATTENTE &&
    commande.vendeurId === user.id
  );
}
