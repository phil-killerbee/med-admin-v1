/**
 * Logique métier de la caisse APRÈS l'encaissement : retours / avoirs et clôture de caisse.
 * Chaque fonction reçoit `conn` : la connexion de la TRANSACTION en cours.
 */
import { logAudit } from '../audit.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { toIsoDateTime } from '../db.js';
import { PERMISSIONS as P } from '../../src/config/roles.js';
import { hasPermission } from '../../src/domain/permissions.js';
import { MODES_PAIEMENT, STATUTS } from '../../src/domain/commande.js';
import { calculerCloture, calculerRetour, canRetourCommande, libelleEcart } from '../../src/domain/caisse.js';

const fmt = (n) => `${Number(n).toLocaleString('fr-FR')} F`;
/** JSON stocké : objet avec MySQL, chaîne avec MariaDB → on accepte les deux. */
const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

/** Retours déjà enregistrés pour une liste de commandes, au format du domaine. */
export async function chargerRetours(db, commandeIds) {
  if (commandeIds.length === 0) return [];
  const [retours] = await db.query(
    `SELECT r.*, u.nom AS user_nom FROM retours r JOIN users u ON u.id = r.user_id
     WHERE r.commande_id IN (?) ORDER BY r.id`,
    [commandeIds],
  );
  const [lignes] = await db.query(
    `SELECT rl.retour_id, rl.ligne_id AS ligneId, rl.quantite, cl.nom
     FROM retour_lignes rl JOIN commande_lignes cl ON cl.id = rl.ligne_id
     WHERE rl.retour_id IN (?)`,
    [retours.map((r) => r.id).concat(0)],
  );
  return retours.map((r) => ({
    id: r.id,
    commandeId: r.commande_id,
    date: toIsoDateTime(r.date),
    par: r.user_nom,
    motif: r.motif,
    montant: r.montant,
    partAssurance: r.part_assurance,
    partPatient: r.part_patient,
    modeRemboursement: r.mode_remboursement,
    remisEnStock: r.remis_en_stock,
    lignes: lignes.filter((l) => l.retour_id === r.id).map(({ retour_id: _r, ...l }) => l),
  }));
}

/**
 * RETOUR / AVOIR sur une commande payée.
 * On n'efface rien : la commande reste PAYÉE, le retour est une opération inverse tracée.
 *  - le patient récupère SA part (l'assurance ne sera pas facturée de la sienne) ;
 *  - les boîtes rendues retournent (si on le décide) dans les lots d'où elles venaient.
 */
export async function enregistrerRetour(conn, user, commandeId, body) {
  const [[c]] = await conn.query('SELECT * FROM commandes WHERE id = ? FOR UPDATE', [commandeId]);
  if (!c) throw notFound('Commande introuvable');
  if (c.statut !== STATUTS.PAYEE) throw badRequest('Seule une commande payée peut faire l’objet d’un retour');
  if (!canRetourCommande(user, { statut: c.statut, paiement: { caissierId: c.caissier_id } })) {
    throw forbidden('Retour réservé au caissier qui a encaissé la commande, ou au pharmacien');
  }

  const motif = String(body?.motif ?? '').trim();
  if (!motif) throw badRequest('Le motif du retour est obligatoire', { motif: 'Motif obligatoire' });

  const [lignes] = await conn.query(
    `SELECT id, medicament_id AS medicamentId, nom, quantite, prix_unitaire AS prixUnitaire
     FROM commande_lignes WHERE commande_id = ?`,
    [commandeId],
  );
  const retours = await chargerRetours(conn, [commandeId]);

  let r;
  try {
    r = calculerRetour({ lignes, retours, taux: c.taux_couverture }, body?.lignes);
  } catch (e) {
    throw badRequest(e.message, { lignes: e.message });
  }

  const mode = r.partPatient > 0 ? body?.modeRemboursement : null;
  if (r.partPatient > 0 && !MODES_PAIEMENT[mode]) {
    throw badRequest('Choisissez le mode de remboursement', { modeRemboursement: 'Mode obligatoire' });
  }
  const remettre = body?.remettreEnStock !== false;

  const [ins] = await conn.query(
    `INSERT INTO retours (commande_id, user_id, motif, montant, part_assurance, part_patient, mode_remboursement, remis_en_stock)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [commandeId, user.id, motif.slice(0, 255), r.montant, r.partAssurance, r.partPatient, mode, remettre],
  );
  const retourId = ins.insertId;

  for (const l of r.lignes) {
    const [rl] = await conn.query('INSERT INTO retour_lignes (retour_id, ligne_id, quantite) VALUES (?, ?, ?)', [
      retourId,
      l.ligneId,
      l.quantite,
    ]);
    if (!remettre) continue; // produit abîmé / non revendable : il ne revient pas en stock

    // Les boîtes retournent dans les lots d'origine (ceux qui périment le plus tard d'abord),
    // sans dépasser ce que chaque lot avait fourni moins ce qui y est déjà revenu.
    const [lots] = await conn.query(
      `SELECT ca.lot_id AS lotId, ca.quantite - COALESCE((
                SELECT SUM(ra.quantite) FROM retour_allocations ra
                JOIN retour_lignes x ON x.id = ra.retour_ligne_id
                WHERE x.ligne_id = ca.ligne_id AND ra.lot_id = ca.lot_id AND x.id <> ?), 0) AS dispo
       FROM commande_allocations ca JOIN lots l ON l.id = ca.lot_id
       WHERE ca.ligne_id = ? ORDER BY l.date_peremption DESC`,
      [rl.insertId, l.ligneId],
    );
    let reste = l.quantite;
    for (const lot of lots) {
      if (reste === 0) break;
      const q = Math.min(Number(lot.dispo), reste);
      if (q <= 0) continue;
      await conn.query('UPDATE lots SET quantite = quantite + ? WHERE id = ?', [q, lot.lotId]);
      await conn.query('INSERT INTO retour_allocations (retour_ligne_id, lot_id, quantite) VALUES (?, ?, ?)', [
        rl.insertId,
        lot.lotId,
        q,
      ]);
      reste -= q;
    }
  }

  const detail = r.lignes.map((l) => `${l.nom} × ${l.quantite}`).join(', ');
  const rembourse = r.partPatient > 0 ? `${fmt(r.partPatient)} rendus (${MODES_PAIEMENT[mode]})` : 'rien à rendre';
  const assurance = r.partAssurance > 0 ? ` ; ${fmt(r.partAssurance)} en moins pour l’assurance` : '';
  await logAudit(
    conn,
    user,
    'RETOUR_ENREGISTRE',
    `n°${commandeId} – ${detail} – ${rembourse}${assurance}${remettre ? '' : ' – NON remis en stock'} – motif : ${motif}`,
  );

  const [[{ date }]] = await conn.query('SELECT date FROM retours WHERE id = ?', [retourId]);
  return {
    id: retourId,
    commandeId,
    date: toIsoDateTime(date),
    par: user.nom,
    motif,
    ...r,
    modeRemboursement: mode,
    remisEnStock: remettre,
  };
}

/**
 * État de la caisse d'un utilisateur : tout ce qu'il a encaissé ou remboursé
 * depuis sa dernière clôture.
 * `verrouiller` : FOR UPDATE pendant la clôture (personne ne peut encaisser « entre » le calcul et l'enregistrement).
 */
export async function etatCaisse(db, userId, { verrouiller = false } = {}) {
  const lock = verrouiller ? 'FOR UPDATE' : '';
  const [commandes] = await db.query(
    `SELECT id FROM commandes WHERE caissier_id = ? AND paye_le IS NOT NULL AND cloture_id IS NULL ${lock}`,
    [userId],
  );
  const ids = commandes.map((c) => c.id);
  const [paiements] = ids.length
    ? await db.query('SELECT mode, montant FROM commande_paiements WHERE commande_id IN (?)', [ids])
    : [[]];
  const [retours] = await db.query(
    `SELECT id, part_patient AS montant, mode_remboursement AS mode FROM retours
     WHERE user_id = ? AND cloture_id IS NULL ${lock}`,
    [userId],
  );
  const [[derniere]] = await db.query('SELECT MAX(date) AS date FROM clotures WHERE caissier_id = ?', [userId]);

  return {
    depuis: toIsoDateTime(derniere?.date ?? null),
    commandeIds: ids,
    retourIds: retours.map((r) => r.id),
    paiements,
    remboursements: retours.filter((r) => r.mode && r.montant > 0).map(({ mode, montant }) => ({ mode, montant })),
  };
}

/** CLÔTURE DE CAISSE : le caissier compte son tiroir, l'écart est calculé et figé. */
export async function cloturerCaisse(conn, user, body) {
  if (!hasPermission(user, P.CAISSE_CLOTURE)) throw forbidden();
  const especesComptees = Number(body?.especesComptees);
  if (body?.especesComptees === '' || !Number.isInteger(especesComptees) || especesComptees < 0) {
    throw badRequest('Saisissez le montant des espèces comptées', { especesComptees: 'Montant obligatoire' });
  }

  const etat = await etatCaisse(conn, user.id, { verrouiller: true });
  if (etat.commandeIds.length === 0 && etat.retourIds.length === 0) {
    throw badRequest('Rien à clôturer : aucun encaissement ni avoir depuis la dernière clôture');
  }
  const z = calculerCloture({ ...etat, especesComptees });
  const commentaire = String(body?.commentaire ?? '').trim().slice(0, 255) || null;

  const [ins] = await conn.query(
    `INSERT INTO clotures (caissier_id, nb_commandes, nb_retours, detail, total_net, especes_attendues,
                           especes_comptees, ecart, commentaire)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.id,
      etat.commandeIds.length,
      etat.retourIds.length,
      JSON.stringify(z.parMode),
      z.totalNet,
      z.especesAttendues,
      especesComptees,
      z.ecart,
      commentaire,
    ],
  );
  const id = ins.insertId;
  if (etat.commandeIds.length) {
    await conn.query('UPDATE commandes SET cloture_id = ? WHERE id IN (?)', [id, etat.commandeIds]);
  }
  if (etat.retourIds.length) {
    await conn.query('UPDATE retours SET cloture_id = ? WHERE id IN (?)', [id, etat.retourIds]);
  }
  await logAudit(
    conn,
    user,
    'CAISSE_CLOTUREE',
    `Z n°${id} – ${etat.commandeIds.length} encaissement(s), total net ${fmt(z.totalNet)} – espèces attendues ${fmt(z.especesAttendues)}, comptées ${fmt(especesComptees)} : ${libelleEcart(z.ecart)}`,
  );
  const [[cloture]] = await listerClotures(conn, { where: 'WHERE z.id = ?', params: [id] });
  return cloture;
}

export async function listerClotures(db, { where = '', params = [] } = {}) {
  const [rows] = await db.query(
    `SELECT z.*, u.nom AS caissier_nom FROM clotures z JOIN users u ON u.id = z.caissier_id
     ${where} ORDER BY z.date DESC, z.id DESC LIMIT 200`,
    params,
  );
  return [
    rows.map((z) => ({
      id: z.id,
      date: toIsoDateTime(z.date),
      caissierId: z.caissier_id,
      caissierNom: z.caissier_nom,
      nbCommandes: z.nb_commandes,
      nbRetours: z.nb_retours,
      parMode: json(z.detail),
      totalNet: z.total_net,
      especesAttendues: z.especes_attendues,
      especesComptees: z.especes_comptees,
      ecart: z.ecart,
      commentaire: z.commentaire,
    })),
  ];
}
