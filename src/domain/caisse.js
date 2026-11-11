import { PERMISSIONS } from '../config/roles.js';
import { hasPermission } from './permissions.js';
import { MODES_PAIEMENT, STATUTS } from './commande.js';

/**
 * Règles de la CAISSE après l'encaissement : retours / avoirs et clôture.
 * Fonctions PURES, partagées par le front (aperçu) et l'API (décision).
 */

/**
 * Qui peut faire un retour ? (rôle + propriété, comme l'annulation)
 *  - il faut la permission commande:retour ;
 *  - la commande doit être PAYÉE ;
 *  - un caissier ne traite que les commandes qu'IL a encaissées ;
 *    celui qui voit toutes les commandes (pharmacien) peut traiter toutes les autres.
 */
export function canRetourCommande(user, commande) {
  if (!user || !commande || commande.statut !== STATUTS.PAYEE) return false;
  if (!hasPermission(user, PERMISSIONS.COMMANDE_RETOUR)) return false;
  return hasPermission(user, PERMISSIONS.COMMANDE_READ_ALL) || commande.paiement?.caissierId === user.id;
}

/** Quantité encore retournable pour chaque ligne : vendu − déjà retourné. */
export function quantitesRetournables(lignes, retours = []) {
  const deja = {};
  for (const r of retours) for (const l of r.lignes) deja[l.ligneId] = (deja[l.ligneId] ?? 0) + l.quantite;
  return Object.fromEntries(lignes.map((l) => [l.id, l.quantite - (deja[l.id] ?? 0)]));
}

/**
 * Calcule un retour (avoir).
 *
 * @param commande { lignes:[{id, nom, quantite, prixUnitaire}], taux (assurance, figé), retours:[…] }
 * @param demande  [{ ligneId, quantite }]
 *
 * Répartition assurance / patient : on calcule sur le CUMUL des retours puis on retire ce qui
 * a déjà été rendu. Ainsi, rendre tout en plusieurs fois rend EXACTEMENT les montants d'origine
 * (aucun franc perdu ou gagné à cause des arrondis).
 */
export function calculerRetour(commande, demande) {
  if (!Array.isArray(demande)) throw new Error('Retour invalide');
  const restant = quantitesRetournables(commande.lignes, commande.retours);
  const lignes = [];
  for (const d of demande) {
    const quantite = Number(d.quantite);
    if (!quantite) continue;
    const ligne = commande.lignes.find((l) => l.id === Number(d.ligneId));
    if (!ligne) throw new Error('Ligne inconnue');
    if (!Number.isInteger(quantite) || quantite < 0) throw new Error(`${ligne.nom} : quantité invalide`);
    if (quantite > restant[ligne.id]) {
      throw new Error(`${ligne.nom} : ${restant[ligne.id]} boîte(s) au plus peuvent être retournées`);
    }
    lignes.push({ ligneId: ligne.id, nom: ligne.nom, quantite, prixUnitaire: ligne.prixUnitaire });
  }
  if (lignes.length === 0) throw new Error('Indiquez au moins une quantité à retourner');

  const montant = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);
  const deja = (commande.retours ?? []).reduce(
    (acc, r) => ({ montant: acc.montant + r.montant, partAssurance: acc.partAssurance + r.partAssurance }),
    { montant: 0, partAssurance: 0 },
  );
  const partAssurance = Math.round(((deja.montant + montant) * (commande.taux ?? 0)) / 100) - deja.partAssurance;
  return { lignes, montant, partAssurance, partPatient: montant - partAssurance };
}

/**
 * Clôture de caisse (« Z de caisse »).
 * @param paiements       [{mode, montant}] encaissés depuis la dernière clôture
 * @param remboursements  [{mode, montant}] avoirs remboursés depuis la dernière clôture
 * @param especesComptees billets et pièces comptés dans le tiroir
 */
export function calculerCloture({ paiements = [], remboursements = [], especesComptees }) {
  const parMode = Object.fromEntries(
    Object.keys(MODES_PAIEMENT).map((mode) => [mode, { encaisse: 0, rembourse: 0, net: 0 }]),
  );
  for (const p of paiements) parMode[p.mode].encaisse += p.montant;
  for (const r of remboursements) parMode[r.mode].rembourse += r.montant;
  for (const m of Object.values(parMode)) m.net = m.encaisse - m.rembourse;

  const especesAttendues = parMode.ESPECES.net;
  const totalNet = Object.values(parMode).reduce((s, m) => s + m.net, 0);
  const compte = especesComptees === '' || especesComptees === undefined ? NaN : Number(especesComptees);
  const ecart = Number.isInteger(compte) && compte >= 0 ? compte - especesAttendues : null;
  return { parMode, especesAttendues, totalNet, ecart };
}

/** Libellé d'un écart de caisse : « Caisse juste », « Excédent de 500 F », « Manque de 1 000 F ». */
export function libelleEcart(ecart) {
  if (ecart === null) return '';
  if (ecart === 0) return 'Caisse juste';
  const montant = `${Math.abs(ecart).toLocaleString('fr-FR')} F`;
  return ecart > 0 ? `Excédent de ${montant}` : `Manque de ${montant}`;
}
