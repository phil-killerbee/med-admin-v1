/**
 * Logique métier des commandes, côté serveur.
 * Les routes HTTP ne font que : lire la requête → appeler ce service → répondre.
 * Le même service est utilisé par le script de données de test (db/init.js).
 *
 * Chaque fonction reçoit `conn` : la connexion de la TRANSACTION en cours.
 */
import { logAudit } from '../audit.js';
import { assertNoErrors, badRequest, forbidden, notFound } from '../errors.js';
import { toIsoDateTime } from '../db.js';
import { PERMISSIONS as P } from '../../src/config/roles.js';
import { hasPermission } from '../../src/domain/permissions.js';
import { allocateFefo } from '../../src/domain/stock.js';
import { todayIso } from '../../src/domain/dates.js';
import { chargerRetours } from './caisse.js';
import {
  STATUTS,
  calculerPaiement,
  canCancelCommande,
  computeTotal,
  hausseSurOrdonnance,
  libellePaiement,
  repartitionAssurance,
  resumerModification,
  validateInfosPatient,
} from '../../src/domain/commande.js';

const clean = (v) => String(v ?? '').trim() || null;

/**
 * Prépare les lignes d'une commande : contrôles, assurance, réservation du stock (FEFO).
 * Partagé par la CRÉATION (comptoir) et la MODIFICATION (caisse) → mêmes règles partout.
 *
 * @param anciennes  lignes avant modification (null pour une création)
 * @param fige       { assuranceId, taux } de la commande existante : taux conservé si l'assurance ne change pas
 */
async function preparerCommande(conn, user, body, { anciennes = null, fige = null } = {}) {
  const { lignes, ordonnanceRef, assuranceId, numeroAssure, patientId } = body ?? {};
  let { patientNom } = body ?? {};

  // Fiche patient (facultative) : si elle est choisie, son nom est repris dans la commande.
  let patient = null;
  if (patientId) {
    [[patient]] = await conn.query('SELECT id, nom FROM patients WHERE id = ?', [patientId]);
    if (!patient) throw badRequest('Patient introuvable', { patientId: 'Patient introuvable' });
    if (!String(patientNom ?? '').trim()) patientNom = patient.nom;
  }

  if (!Array.isArray(lignes) || lignes.length === 0) {
    throw badRequest(anciennes ? 'Une commande doit garder au moins une ligne (sinon, annulez-la)' : 'La commande est vide');
  }
  const ids = lignes.map((l) => Number(l.medicamentId));
  if (new Set(ids).size !== ids.length) throw badRequest('Un médicament apparaît deux fois');

  const [medicaments] = await conn.query('SELECT * FROM medicaments WHERE id IN (?)', [ids]);
  if (medicaments.length !== ids.length) throw notFound('Médicament introuvable');
  const byId = Object.fromEntries(medicaments.map((m) => [m.id, m]));

  // Permission MÉTIER : médicaments sur ordonnance.
  //  - création : tout médicament sur ordonnance exige ordonnance:delivrer
  //  - modification : seul AJOUTER ou AUGMENTER l'exige (réduire / retirer reste permis)
  if (!hasPermission(user, P.ORDONNANCE_DELIVRER)) {
    const bloques = anciennes
      ? hausseSurOrdonnance(lignes.map((l) => ({ ...l, medicamentId: Number(l.medicamentId) })), anciennes, byId)
      : medicaments.filter((m) => m.ordonnance).map((m) => m.nom);
    if (bloques.length) {
      throw forbidden(`« ${bloques[0]} » est soumis à ordonnance : ajout ou augmentation réservé au pharmacien / vendeur.`);
    }
  }
  // Patient et ordonnance facultatifs ; le n° d'assuré est exigé en cas d'assurance.
  assertNoErrors(validateInfosPatient({ assuranceId, numeroAssure }));

  // Assurance : le taux est FIGÉ dans la commande (s'il change demain, cette commande ne change pas).
  let taux = 0;
  let assuranceNom = null;
  if (assuranceId) {
    const [[assurance]] = await conn.query('SELECT * FROM assurances WHERE id = ?', [assuranceId]);
    const memeAssurance = fige && Number(assuranceId) === fige.assuranceId;
    if (!assurance || (!assurance.actif && !memeAssurance)) {
      throw badRequest('Assurance inconnue ou inactive', { assuranceId: 'Assurance invalide' });
    }
    taux = memeAssurance ? fige.taux : assurance.taux_couverture;
    assuranceNom = assurance.nom;
  }

  // Réservation du stock (FEFO) avec verrouillage des lots.
  const today = todayIso();
  const lignesCommande = [];
  for (const { medicamentId, quantite } of lignes) {
    const m = byId[Number(medicamentId)];
    // FOR UPDATE : si deux postes prennent la dernière boîte en même temps,
    // le 2e attend la fin de la 1re transaction puis voit le stock à jour.
    const [lots] = await conn.query(
      `SELECT id, quantite, date_peremption AS datePeremption
       FROM lots WHERE medicament_id = ? AND quantite > 0 FOR UPDATE`,
      [m.id],
    );
    let allocations;
    try {
      allocations = allocateFefo(lots, Number(quantite), today);
    } catch (e) {
      throw badRequest(`${m.nom} : ${e.message}`);
    }
    for (const a of allocations) {
      await conn.query('UPDATE lots SET quantite = quantite - ? WHERE id = ?', [a.quantite, a.lotId]);
    }
    // Prix figé : une ligne déjà présente garde son prix d'origine.
    const ancienne = anciennes?.find((a) => a.medicamentId === m.id);
    lignesCommande.push({
      medicamentId: m.id,
      nom: m.nom,
      quantite: Number(quantite),
      prixUnitaire: ancienne?.prixUnitaire ?? m.prix_vente,
      allocations,
    });
  }

  const total = computeTotal(lignesCommande);
  return {
    lignes: lignesCommande,
    patientId: patient?.id ?? null,
    patientNom: clean(patientNom),
    ordonnanceRef: clean(ordonnanceRef),
    assuranceId: assuranceId ? Number(assuranceId) : null,
    assuranceNom,
    numeroAssure: assuranceId ? clean(numeroAssure) : null,
    taux,
    total,
    ...repartitionAssurance(total, taux),
  };
}

async function insererLignes(conn, commandeId, lignes) {
  for (const l of lignes) {
    const [rl] = await conn.query(
      'INSERT INTO commande_lignes (commande_id, medicament_id, nom, quantite, prix_unitaire) VALUES (?, ?, ?, ?, ?)',
      [commandeId, l.medicamentId, l.nom, l.quantite, l.prixUnitaire],
    );
    for (const a of l.allocations) {
      await conn.query('INSERT INTO commande_allocations (ligne_id, lot_id, quantite) VALUES (?, ?, ?)', [rl.insertId, a.lotId, a.quantite]);
    }
  }
}

/** 1. COMPTOIR — la vendeuse enregistre la commande (le stock est réservé immédiatement). */
export async function creerCommande(conn, user, body) {
  if (!hasPermission(user, P.COMMANDE_CREATE)) throw forbidden();
  const c = await preparerCommande(conn, user, body);

  const [r] = await conn.query(
    `INSERT INTO commandes (vendeur_id, patient_id, patient_nom, ordonnance_ref, assurance_id, numero_assure,
                            taux_couverture, total, part_assurance, part_patient)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.id, c.patientId, c.patientNom, c.ordonnanceRef, c.assuranceId, c.numeroAssure, c.taux, c.total, c.partAssurance, c.partPatient],
  );
  const id = r.insertId;
  await insererLignes(conn, id, c.lignes);

  const { total, taux, partAssurance, partPatient } = c;
  await logAudit(conn, user, 'COMMANDE_CREEE', `n°${id} – ${total} FCFA${taux ? ` (assurance ${taux} %)` : ''}`);
  return { id, total, partAssurance, partPatient };
}

/** 2. CAISSE — le caissier valide la commande et encaisse la PART PATIENT. */
export async function encaisserCommande(conn, user, id, body) {
  if (!hasPermission(user, P.COMMANDE_ENCAISSER)) throw forbidden();

  const [[c]] = await conn.query('SELECT * FROM commandes WHERE id = ? FOR UPDATE', [id]);
  if (!c) throw notFound('Commande introuvable');
  if (c.statut !== STATUTS.EN_ATTENTE) {
    throw badRequest(c.statut === STATUTS.PAYEE ? 'Commande déjà encaissée' : 'Commande annulée');
  }

  // Paiement simple ou MIXTE : la répartition est recalculée ici, avec la même règle que le front.
  let paiement;
  try {
    paiement = calculerPaiement(c.part_patient, body?.paiements);
  } catch (e) {
    throw badRequest(e.message, { paiements: e.message });
  }

  await conn.query(
    `UPDATE commandes SET statut = 'PAYEE', caissier_id = ?, paye_le = NOW(),
            mode_paiement = ?, montant_recu = ?, monnaie_rendue = ?
     WHERE id = ?`,
    [user.id, paiement.mode, paiement.montantRecu, paiement.monnaie, id],
  );
  if (paiement.lignes.length > 0) {
    await conn.query('INSERT INTO commande_paiements (commande_id, mode, montant) VALUES ?', [
      paiement.lignes.map((l) => [id, l.mode, l.montant]),
    ]);
  }

  const detail = paiement.lignes.length ? libellePaiement(paiement.lignes) : 'pris en charge à 100 %';
  const assurance = c.part_assurance ? ` + ${c.part_assurance} FCFA à facturer à l'assurance` : '';
  await logAudit(conn, user, 'COMMANDE_ENCAISSEE', `n°${id} – ${c.part_patient} FCFA (${detail})${assurance}`);
  const [[{ paye_le: payeLe }]] = await conn.query('SELECT paye_le FROM commandes WHERE id = ?', [id]);
  return {
    id,
    partPatient: c.part_patient,
    partAssurance: c.part_assurance,
    // le front s'en sert pour imprimer le ticket sans recharger la commande
    paiement: { caissierId: user.id, caissierNom: user.nom, date: toIsoDateTime(payeLe), ...paiement },
  };
}

/**
 * 2 bis. CAISSE — correction d'une commande EN ATTENTE (quantités, lignes, patient, assurance).
 *
 * Traçabilité :
 *  - motif obligatoire ;
 *  - état COMPLET avant / après enregistré en JSON dans commande_modifications (jamais modifié ensuite) ;
 *  - résumé lisible + motif dans le journal d'audit.
 * Tout se fait dans la transaction : si une étape échoue, rien n'est modifié (ni le stock, ni l'historique).
 */
export async function modifierCommande(conn, user, id, body) {
  if (!hasPermission(user, P.COMMANDE_UPDATE)) throw forbidden();
  const motif = clean(body?.motif);
  if (!motif) throw badRequest('Le motif de la modification est obligatoire', { motif: 'Motif obligatoire' });

  const [[c]] = await conn.query('SELECT * FROM commandes WHERE id = ? FOR UPDATE', [id]);
  if (!c) throw notFound('Commande introuvable');
  if (c.statut !== STATUTS.EN_ATTENTE) throw badRequest('Seule une commande en attente de paiement peut être modifiée');

  // --- État AVANT ------------------------------------------------------------
  const [anciennes] = await conn.query(
    `SELECT id, medicament_id AS medicamentId, nom, quantite, prix_unitaire AS prixUnitaire
     FROM commande_lignes WHERE commande_id = ?`,
    [id],
  );
  const ligneIds = anciennes.map((l) => l.id).concat(0);
  const [allocs] = await conn.query(
    `SELECT ca.ligne_id, ca.lot_id AS lotId, ca.quantite, l.numero_lot AS numeroLot
     FROM commande_allocations ca JOIN lots l ON l.id = ca.lot_id WHERE ca.ligne_id IN (?)`,
    [ligneIds],
  );
  const [[assuranceAvant]] = c.assurance_id
    ? await conn.query('SELECT nom FROM assurances WHERE id = ?', [c.assurance_id])
    : [[null]];

  const avant = {
    lignes: anciennes.map(({ id: ligneId, ...l }) => ({
      ...l,
      allocations: allocs.filter((a) => a.ligne_id === ligneId).map(({ ligne_id: _x, ...a }) => a),
    })),
    patientNom: c.patient_nom,
    ordonnanceRef: c.ordonnance_ref,
    assuranceNom: assuranceAvant?.nom ?? null,
    numeroAssure: c.numero_assure,
    taux: c.taux_couverture,
    total: c.total,
    partAssurance: c.part_assurance,
    partPatient: c.part_patient,
  };

  // --- 1. On libère le stock réservé, puis on retire les anciennes lignes --------
  for (const a of allocs) {
    await conn.query('UPDATE lots SET quantite = quantite + ? WHERE id = ?', [a.quantite, a.lotId]);
  }
  await conn.query('DELETE FROM commande_allocations WHERE ligne_id IN (?)', [ligneIds]);
  await conn.query('DELETE FROM commande_lignes WHERE commande_id = ?', [id]);

  // --- 2. On reconstruit avec les MÊMES règles que la création -------------------
  const n = await preparerCommande(conn, user, body, {
    anciennes: avant.lignes,
    fige: { assuranceId: c.assurance_id, taux: c.taux_couverture },
  });
  await insererLignes(conn, id, n.lignes);
  await conn.query(
    `UPDATE commandes SET patient_nom = ?, ordonnance_ref = ?, assurance_id = ?, numero_assure = ?,
            taux_couverture = ?, total = ?, part_assurance = ?, part_patient = ?
     WHERE id = ?`,
    [n.patientNom, n.ordonnanceRef, n.assuranceId, n.numeroAssure, n.taux, n.total, n.partAssurance, n.partPatient, id],
  );

  const apres = {
    lignes: n.lignes,
    patientNom: n.patientNom,
    ordonnanceRef: n.ordonnanceRef,
    assuranceNom: n.assuranceNom,
    numeroAssure: n.numeroAssure,
    taux: n.taux,
    total: n.total,
    partAssurance: n.partAssurance,
    partPatient: n.partPatient,
  };

  // --- 3. Traçabilité --------------------------------------------------------------
  const changements = resumerModification(avant, apres);
  if (changements.length === 0) throw badRequest('Aucun changement à enregistrer'); // → rollback complet
  const resume = changements.join(' ; ');

  await conn.query(
    `INSERT INTO commande_modifications (commande_id, user_id, user_nom, role, motif, resume, avant, apres)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, user.id, user.nom, user.role, motif.slice(0, 255), resume.slice(0, 1000), JSON.stringify(avant), JSON.stringify(apres)],
  );
  await logAudit(conn, user, 'COMMANDE_MODIFIEE', `n°${id} – ${resume} – motif : ${motif}`);

  return { id, changements, total: n.total, partAssurance: n.partAssurance, partPatient: n.partPatient };
}

/** 3. ANNULATION — le stock retourne dans les lots d'origine. On n'efface jamais. */
export async function annulerCommande(conn, user, id, motif) {
  const [[c]] = await conn.query('SELECT * FROM commandes WHERE id = ? FOR UPDATE', [id]);
  if (!c) throw notFound('Commande introuvable');
  if (!canCancelCommande(user, { statut: c.statut, vendeurId: c.vendeur_id })) throw forbidden();
  const raison = String(motif ?? '').trim();
  if (!raison) throw badRequest("Le motif d'annulation est obligatoire");
  const [[{ n: nbRetours }]] = await conn.query('SELECT COUNT(*) AS n FROM retours WHERE commande_id = ?', [id]);
  if (nbRetours > 0) {
    throw badRequest('Cette commande a déjà fait l’objet d’un retour : utilisez un retour pour le reste des produits');
  }

  const [allocs] = await conn.query(
    `SELECT ca.lot_id, ca.quantite FROM commande_allocations ca
     JOIN commande_lignes cl ON cl.id = ca.ligne_id WHERE cl.commande_id = ?`,
    [id],
  );
  for (const a of allocs) {
    await conn.query('UPDATE lots SET quantite = quantite + ? WHERE id = ?', [a.quantite, a.lot_id]);
  }
  await conn.query(
    `UPDATE commandes SET statut = 'ANNULEE', annule_par = ?, annule_le = NOW(), motif_annulation = ? WHERE id = ?`,
    [user.id, raison.slice(0, 255), id],
  );
  const remboursement = c.statut === STATUTS.PAYEE ? ` – à rembourser : ${c.montant_recu - c.monnaie_rendue} FCFA` : '';
  await logAudit(conn, user, 'COMMANDE_ANNULEE', `n°${id} – motif : ${raison}${remboursement}`);
}

/** Lecture : commandes + lignes + lots, au format attendu par le front. */
export async function listerCommandes(db, { where = '', params = [] } = {}) {
  const [rows] = await db.query(
    `SELECT c.*, v.nom AS vendeur_nom, k.nom AS caissier_nom, x.nom AS annuleur_nom, a.nom AS assurance_nom
     FROM commandes c
     JOIN users v ON v.id = c.vendeur_id
     LEFT JOIN users k ON k.id = c.caissier_id
     LEFT JOIN users x ON x.id = c.annule_par
     LEFT JOIN assurances a ON a.id = c.assurance_id
     ${where}
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT 500`,
    params,
  );
  if (rows.length === 0) return [];

  const [lignes] = await db.query(
    `SELECT id, commande_id, medicament_id AS medicamentId, nom, quantite, prix_unitaire AS prixUnitaire
     FROM commande_lignes WHERE commande_id IN (?)`,
    [rows.map((c) => c.id)],
  );
  const [allocs] = await db.query(
    `SELECT ca.ligne_id, ca.lot_id AS lotId, ca.quantite, l.numero_lot AS numeroLot
     FROM commande_allocations ca JOIN lots l ON l.id = ca.lot_id WHERE ca.ligne_id IN (?)`,
    [lignes.map((l) => l.id).concat(0)],
  );
  const [paiements] = await db.query(
    'SELECT commande_id, mode, montant FROM commande_paiements WHERE commande_id IN (?) ORDER BY id',
    [rows.map((c) => c.id)],
  );
  const [modifications] = await db.query(
    `SELECT id, commande_id, date, user_nom AS par, role, motif, resume
     FROM commande_modifications WHERE commande_id IN (?) ORDER BY id`,
    [rows.map((c) => c.id)],
  );
  const retours = await chargerRetours(db, rows.map((c) => c.id));

  return rows.map((c) => ({
    id: c.id,
    date: toIsoDateTime(c.created_at),
    statut: c.statut,
    vendeurId: c.vendeur_id,
    vendeurNom: c.vendeur_nom,
    patientId: c.patient_id,
    patientNom: c.patient_nom,
    ordonnanceRef: c.ordonnance_ref,
    assurance: c.assurance_id
      ? { id: c.assurance_id, nom: c.assurance_nom, taux: c.taux_couverture, numeroAssure: c.numero_assure }
      : null,
    total: c.total,
    partAssurance: c.part_assurance,
    partPatient: c.part_patient,
    paiement: c.caissier_id
      ? {
          caissierId: c.caissier_id,
          caissierNom: c.caissier_nom,
          date: toIsoDateTime(c.paye_le),
          mode: c.mode_paiement,
          montantRecu: c.montant_recu,
          monnaie: c.monnaie_rendue,
          lignes: paiements.filter((p) => p.commande_id === c.id).map(({ mode, montant }) => ({ mode, montant })),
        }
      : null,
    clotureId: c.cloture_id,
    retours: retours.filter((r) => r.commandeId === c.id),
    annulation: c.annule_par
      ? { par: c.annuleur_nom, date: toIsoDateTime(c.annule_le), motif: c.motif_annulation }
      : null,
    modifications: modifications
      .filter((m) => m.commande_id === c.id)
      .map((m) => ({
        id: m.id,
        date: toIsoDateTime(m.date),
        par: m.par,
        role: m.role,
        motif: m.motif,
        changements: m.resume.split(' ; '),
      })),
    lignes: lignes
      .filter((l) => l.commande_id === c.id)
      .map(({ id, commande_id: _c, ...l }) => ({
        id,
        ...l,
        allocations: allocs.filter((a) => a.ligne_id === id).map(({ ligne_id: _l, ...a }) => a),
      })),
  }));
}
