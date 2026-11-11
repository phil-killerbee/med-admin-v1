import { daysBetween } from './dates.js';

/** Un lot est périmé le jour même de sa date de péremption. */
export const SEUIL_PEREMPTION_PROCHE_JOURS = 90;

export function isExpired(lot, today) {
  return lot.datePeremption <= today;
}

export function lotStatus(lot, today) {
  if (isExpired(lot, today)) return 'PERIME';
  if (daysBetween(today, lot.datePeremption) <= SEUIL_PEREMPTION_PROCHE_JOURS) return 'PROCHE';
  return 'OK';
}

/** Quantité vendable = somme des lots NON périmés. */
export function quantiteDisponible(lots, today) {
  return lots
    .filter((lot) => !isExpired(lot, today))
    .reduce((total, lot) => total + lot.quantite, 0);
}

/**
 * Règle FEFO (First Expired, First Out) : on sort d'abord
 * les lots qui périment le plus tôt. Règle d'or en pharmacie.
 *
 * @returns {{lotId: string, quantite: number}[]} répartition par lot
 * @throws Error si le stock vendable est insuffisant
 */
export function allocateFefo(lots, quantiteDemandee, today) {
  if (!Number.isInteger(quantiteDemandee) || quantiteDemandee <= 0) {
    throw new Error('La quantité doit être un entier positif');
  }

  const vendables = lots
    .filter((lot) => !isExpired(lot, today) && lot.quantite > 0)
    .sort((a, b) => a.datePeremption.localeCompare(b.datePeremption));

  const allocations = [];
  let reste = quantiteDemandee;

  for (const lot of vendables) {
    if (reste === 0) break;
    const prise = Math.min(lot.quantite, reste);
    allocations.push({ lotId: lot.id, quantite: prise });
    reste -= prise;
  }

  if (reste > 0) {
    throw new Error(`Stock insuffisant : ${quantiteDemandee - reste} disponible(s)`);
  }
  return allocations;
}

/**
 * Proposition de réapprovisionnement (bon de commande fournisseur).
 *
 * On commande quand le stock vendable est au seuil d'alerte, OU qu'il ne couvre plus
 * 15 jours de ventes. On commande alors de quoi tenir 30 jours + le stock de sécurité (seuil),
 * et au minimum 2 × le seuil.
 *
 * @param {{stock:number, seuil:number, ventes30j:number}} m
 * @returns {number} quantité à commander (0 = rien à commander)
 */
export function quantiteAReapprovisionner({ stock, seuil, ventes30j = 0 }) {
  const aCommander = stock <= seuil || stock < ventes30j / 2;
  if (!aCommander) return 0;
  const cible = Math.max(ventes30j + seuil, 2 * seuil);
  return Math.max(Math.ceil(cible - stock), 0);
}
