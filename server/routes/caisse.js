import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { badRequest } from '../errors.js';
import { requirePermission } from '../middleware/auth.js';
import { publier } from '../events.js';
import { PERMISSIONS as P } from '../../src/config/roles.js';
import { hasPermission } from '../../src/domain/permissions.js';
import { calculerCloture } from '../../src/domain/caisse.js';
import { quantiteAReapprovisionner, SEUIL_PEREMPTION_PROCHE_JOURS } from '../../src/domain/stock.js';
import { cloturerCaisse, etatCaisse, listerClotures } from '../services/caisse.js';
import { toIsoDateTime } from '../db.js';

/* ------------------------------------------------------------------------------------
 * Clôture de caisse
 * ---------------------------------------------------------------------------------- */
export const caisseRouter = Router();

// GET /api/caisse/etat — ce que MA caisse doit contenir depuis ma dernière clôture
caisseRouter.get('/etat', requirePermission(P.CAISSE_CLOTURE), async (req, res) => {
  const etat = await etatCaisse(pool, req.user.id);
  res.json({
    depuis: etat.depuis,
    nbCommandes: etat.commandeIds.length,
    nbRetours: etat.retourIds.length,
    ...calculerCloture(etat),
  });
});

// GET /api/caisse/clotures — les miennes ; toutes si je vois toutes les commandes (pharmacien)
caisseRouter.get('/clotures', requirePermission(P.CAISSE_CLOTURE), async (req, res) => {
  const toutes = hasPermission(req.user, P.COMMANDE_READ_ALL);
  const [clotures] = await listerClotures(
    pool,
    toutes ? {} : { where: 'WHERE z.caissier_id = ?', params: [req.user.id] },
  );
  res.json({ portee: toutes ? 'ALL' : 'OWN', clotures });
});

caisseRouter.post('/clotures', requirePermission(P.CAISSE_CLOTURE), async (req, res) => {
  const cloture = await withTransaction((conn) => cloturerCaisse(conn, req.user, req.body));
  publier('caisse:cloturee', { id: cloture.id });
  res.status(201).json(cloture);
});

/* ------------------------------------------------------------------------------------
 * Bordereau mensuel des assurances (tiers payant)
 * ---------------------------------------------------------------------------------- */
export const bordereauxRouter = Router();

// GET /api/bordereaux?mois=2026-11
bordereauxRouter.get('/', requirePermission(P.ASSURANCE_FACTURER), async (req, res) => {
  const mois = String(req.query.mois ?? '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) throw badRequest('Mois invalide (format AAAA-MM)');

  // Commandes PAYÉES dans le mois avec une part assurance ; les retours viennent en déduction.
  const [lignes] = await pool.query(
    `SELECT c.id, c.paye_le AS date, c.assurance_id AS assuranceId, a.nom AS assuranceNom,
            c.patient_nom AS patientNom, c.numero_assure AS numeroAssure, c.ordonnance_ref AS ordonnanceRef,
            c.total, c.taux_couverture AS taux, c.part_assurance AS partAssurance,
            COALESCE((SELECT SUM(r.part_assurance) FROM retours r WHERE r.commande_id = c.id), 0) AS retours
     FROM commandes c JOIN assurances a ON a.id = c.assurance_id
     WHERE c.statut = 'PAYEE' AND c.part_assurance > 0
       AND c.paye_le >= ? AND c.paye_le < ? + INTERVAL 1 MONTH
     ORDER BY a.nom, c.paye_le`,
    [`${mois}-01`, `${mois}-01`],
  );
  res.json({
    mois,
    lignes: lignes.map((l) => ({ ...l, date: toIsoDateTime(l.date), net: l.partAssurance - l.retours })),
  });
});

/* ------------------------------------------------------------------------------------
 * Réapprovisionnement : alertes + proposition de commande fournisseur
 * ---------------------------------------------------------------------------------- */
export const reapproRouter = Router();

reapproRouter.get('/', requirePermission(P.STOCK_READ), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT m.id, m.code, m.nom, m.forme, m.seuil_alerte AS seuil,
            COALESCE((SELECT SUM(l.quantite) FROM lots l
                      WHERE l.medicament_id = m.id AND l.date_peremption > CURDATE()), 0) AS stock,
            COALESCE((SELECT SUM(l.quantite) FROM lots l
                      WHERE l.medicament_id = m.id AND l.quantite > 0 AND l.date_peremption > CURDATE()
                        AND l.date_peremption <= CURDATE() + INTERVAL ? DAY), 0) AS stockProchePeremption,
            COALESCE((SELECT SUM(l.quantite) FROM lots l
                      WHERE l.medicament_id = m.id AND l.quantite > 0 AND l.date_peremption <= CURDATE()), 0) AS stockPerime,
            COALESCE((SELECT SUM(cl.quantite) FROM commande_lignes cl JOIN commandes c ON c.id = cl.commande_id
                      WHERE cl.medicament_id = m.id AND c.statut = 'PAYEE'
                        AND c.paye_le >= CURDATE() - INTERVAL 29 DAY), 0) AS ventes30j
     FROM medicaments m ORDER BY m.nom`,
    [SEUIL_PEREMPTION_PROCHE_JOURS],
  );
  res.json(rows.map((m) => ({ ...m, proposition: quantiteAReapprovisionner(m) })));
});
