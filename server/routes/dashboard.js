import { Router } from 'express';
import { pool } from '../db.js';
import { requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../../src/config/roles.js';
import { hasPermission } from '../../src/domain/permissions.js';
import { lotStatus } from '../../src/domain/stock.js';
import { addDays, todayIso } from '../../src/domain/dates.js';

export const dashboardRouter = Router();

/** Le serveur construit un tableau de bord adapté aux permissions de l'utilisateur. */
dashboardRouter.get('/', requirePermission(P.DASHBOARD_VIEW), async (req, res) => {
  const user = req.user;
  const result = { utilisateur: user.nom };

  const toutes = hasPermission(user, P.COMMANDE_READ_ALL);
  if (toutes || hasPermission(user, P.COMMANDE_READ_OWN)) {
    const [[stats]] = await pool.query(
      `SELECT COUNT(*) AS nombre, COALESCE(SUM(part_patient), 0) AS encaisse,
              COALESCE(SUM(part_assurance), 0) AS assurances
       FROM commandes
       WHERE statut = 'PAYEE' AND DATE(paye_le) = CURDATE()
       ${toutes ? '' : 'AND (vendeur_id = ? OR caissier_id = ?)'}`,
      toutes ? [] : [user.id, user.id],
    );
    result.ventes = { portee: toutes ? 'ALL' : 'OWN', ...stats };
  }

  // Graphiques : réservés à ceux qui voient TOUTE l'activité de l'officine
  if (toutes) {
    const [jours] = await pool.query(
      `SELECT DATE_FORMAT(paye_le, '%Y-%m-%d') AS jour, COUNT(*) AS nombre,
              SUM(part_patient) AS patient, SUM(part_assurance) AS assurance
       FROM commandes WHERE statut = 'PAYEE' AND paye_le >= CURDATE() - INTERVAL 13 DAY
       GROUP BY jour`,
    );
    const today = todayIso();
    result.ventes14j = Array.from({ length: 14 }, (_, i) => {
      const jour = addDays(today, i - 13);
      return jours.find((j) => j.jour === jour) ?? { jour, nombre: 0, patient: 0, assurance: 0 };
    });

    const [modes] = await pool.query(
      `SELECT p.mode, SUM(p.montant) AS montant FROM commande_paiements p JOIN commandes c ON c.id = p.commande_id
       WHERE c.statut = 'PAYEE' AND c.paye_le >= CURDATE() - INTERVAL 29 DAY
       GROUP BY p.mode ORDER BY montant DESC`,
    );
    result.modes30j = modes;

    const [top] = await pool.query(
      `SELECT l.nom, SUM(l.quantite) AS quantite, SUM(l.quantite * l.prix_unitaire) AS montant
       FROM commande_lignes l JOIN commandes c ON c.id = l.commande_id
       WHERE c.statut = 'PAYEE' AND c.paye_le >= CURDATE() - INTERVAL 29 DAY
       GROUP BY l.medicament_id, l.nom ORDER BY montant DESC LIMIT 5`,
    );
    result.top30j = top;
  }

  if (hasPermission(user, P.COMMANDE_ENCAISSER) || toutes) {
    const [[attente]] = await pool.query(
      `SELECT COUNT(*) AS nombre, COALESCE(SUM(part_patient), 0) AS montant FROM commandes WHERE statut = 'EN_ATTENTE'`,
    );
    result.enAttente = attente;
  }

  if (hasPermission(user, P.STOCK_READ)) {
    const today = todayIso();
    const [stock] = await pool.query(`
      SELECT m.id, m.nom, m.seuil_alerte AS seuil,
             COALESCE(SUM(CASE WHEN l.date_peremption > CURDATE() THEN l.quantite END), 0) AS stock
      FROM medicaments m LEFT JOIN lots l ON l.medicament_id = m.id
      GROUP BY m.id HAVING stock <= seuil ORDER BY stock`);
    result.alertesStock = stock;

    const [lots] = await pool.query(`
      SELECT l.id, l.numero_lot AS numeroLot, l.quantite, l.date_peremption AS datePeremption, m.nom AS medicamentNom
      FROM lots l JOIN medicaments m ON m.id = l.medicament_id
      WHERE l.quantite > 0 ORDER BY l.date_peremption`);
    result.alertesPeremption = lots
      .map((l) => ({ ...l, statut: lotStatus(l, today) }))
      .filter((l) => l.statut !== 'OK');
  }

  res.json(result);
});
