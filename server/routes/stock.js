import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { logAudit } from '../audit.js';
import { assertNoErrors, notFound } from '../errors.js';
import { requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../../src/config/roles.js';
import { lotStatus } from '../../src/domain/stock.js';
import { todayIso } from '../../src/domain/dates.js';

export const stockRouter = Router();

stockRouter.get('/', requirePermission(P.STOCK_READ), async (req, res) => {
  const [rows] = await pool.query(`
    SELECT l.id, l.medicament_id AS medicamentId, l.numero_lot AS numeroLot, l.quantite,
           l.date_peremption AS datePeremption, l.date_reception AS dateReception,
           m.nom AS medicamentNom
    FROM lots l JOIN medicaments m ON m.id = l.medicament_id
    ORDER BY l.date_peremption`);
  const today = todayIso();
  res.json(rows.map((lot) => ({ ...lot, statut: lotStatus(lot, today) })));
});

stockRouter.post('/', requirePermission(P.STOCK_RECEIVE), async (req, res) => {
  const body = req.body ?? {};
  const today = todayIso();
  const quantite = Number(body.quantite);

  const errors = {};
  if (!body.medicamentId) errors.medicamentId = 'Choisissez un médicament';
  if (!String(body.numeroLot ?? '').trim()) errors.numeroLot = 'Numéro de lot obligatoire';
  if (!Number.isInteger(quantite) || quantite <= 0) errors.quantite = 'Entier positif requis';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.datePeremption ?? '')) errors.datePeremption = 'Date obligatoire';
  else if (body.datePeremption <= today) errors.datePeremption = 'On ne réceptionne pas un lot périmé';
  assertNoErrors(errors);

  const lot = await withTransaction(async (conn) => {
    const [[m]] = await conn.query('SELECT id, nom FROM medicaments WHERE id = ?', [body.medicamentId]);
    if (!m) throw notFound('Médicament introuvable');
    const numeroLot = body.numeroLot.trim().toUpperCase();
    const [result] = await conn.query(
      'INSERT INTO lots (medicament_id, numero_lot, quantite, date_peremption, date_reception) VALUES (?, ?, ?, ?, ?)',
      [m.id, numeroLot, quantite, body.datePeremption, today],
    );
    await logAudit(conn, req.user, 'LOT_RECEPTIONNE', `${m.nom} – lot ${numeroLot} × ${quantite}`);
    return { id: result.insertId, medicamentId: m.id, numeroLot, quantite, datePeremption: body.datePeremption, dateReception: today };
  });
  res.status(201).json(lot);
});
