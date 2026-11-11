import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { logAudit } from '../audit.js';
import { assertNoErrors, badRequest, notFound } from '../errors.js';
import { requireAnyPermission, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../../src/config/roles.js';
import { normalizeMedicament, validateMedicament } from '../../src/domain/medicament.js';

export const medicamentsRouter = Router();

// Les alias SQL renvoient directement le format attendu par le front (camelCase).
// Stock vendable = somme des lots NON périmés (même règle que domain/stock.js).
const SELECT_MEDICAMENTS = `
  SELECT m.id, m.code, m.nom, m.dci, m.forme,
         m.prix_vente AS prixVente, m.seuil_alerte AS seuilAlerte, m.ordonnance,
         COALESCE(SUM(CASE WHEN l.date_peremption > CURDATE() THEN l.quantite END), 0) AS stock
  FROM medicaments m
  LEFT JOIN lots l ON l.medicament_id = m.id`;

// Lecture du catalogue : page Médicaments, mais aussi comptoir et caisse (pour composer/corriger une commande).
medicamentsRouter.get('/', requireAnyPermission([P.MEDICAMENT_READ, P.COMMANDE_CREATE, P.COMMANDE_UPDATE]), async (req, res) => {
  const [rows] = await pool.query(`${SELECT_MEDICAMENTS} GROUP BY m.id ORDER BY m.nom`);
  res.json(rows);
});

async function validate(conn, body, excludeId = 0) {
  const errors = validateMedicament(body ?? {});
  if (!errors.code) {
    const [[doublon]] = await conn.query('SELECT id FROM medicaments WHERE code = ? AND id <> ?', [
      String(body.code).trim(),
      excludeId,
    ]);
    if (doublon) errors.code = 'Ce code CIP existe déjà';
  }
  assertNoErrors(errors);
  return normalizeMedicament(body);
}

medicamentsRouter.post('/', requirePermission(P.MEDICAMENT_CREATE), async (req, res) => {
  const created = await withTransaction(async (conn) => {
    const m = await validate(conn, req.body);
    // Requêtes PARAMÉTRÉES (?) : jamais de concaténation → pas d'injection SQL.
    const [result] = await conn.query(
      `INSERT INTO medicaments (code, nom, dci, forme, prix_vente, seuil_alerte, ordonnance)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [m.code, m.nom, m.dci, m.forme, m.prixVente, m.seuilAlerte, m.ordonnance],
    );
    await logAudit(conn, req.user, 'MEDICAMENT_CREE', m.nom);
    return { id: result.insertId, ...m };
  });
  res.status(201).json(created);
});

medicamentsRouter.put('/:id', requirePermission(P.MEDICAMENT_UPDATE), async (req, res) => {
  const id = Number(req.params.id);
  const updated = await withTransaction(async (conn) => {
    const [[before]] = await conn.query('SELECT * FROM medicaments WHERE id = ? FOR UPDATE', [id]);
    if (!before) throw notFound('Médicament introuvable');
    const m = await validate(conn, req.body, id);
    await conn.query(
      `UPDATE medicaments SET code = ?, nom = ?, dci = ?, forme = ?, prix_vente = ?, seuil_alerte = ?, ordonnance = ?
       WHERE id = ?`,
      [m.code, m.nom, m.dci, m.forme, m.prixVente, m.seuilAlerte, m.ordonnance, id],
    );
    const prix = before.prix_vente !== m.prixVente ? ` (prix ${before.prix_vente} → ${m.prixVente})` : '';
    await logAudit(conn, req.user, 'MEDICAMENT_MODIFIE', m.nom + prix);
    return { id, ...m };
  });
  res.json(updated);
});

medicamentsRouter.delete('/:id', requirePermission(P.MEDICAMENT_DELETE), async (req, res) => {
  const id = Number(req.params.id);
  await withTransaction(async (conn) => {
    const [[m]] = await conn.query('SELECT * FROM medicaments WHERE id = ? FOR UPDATE', [id]);
    if (!m) throw notFound('Médicament introuvable');

    // Règle métier : on ne supprime pas ce qui a un historique (traçabilité).
    const [[{ stock }]] = await conn.query('SELECT COALESCE(SUM(quantite), 0) AS stock FROM lots WHERE medicament_id = ?', [id]);
    const [[vendu]] = await conn.query('SELECT id FROM commande_lignes WHERE medicament_id = ? LIMIT 1', [id]);
    if (stock > 0 || vendu) {
      throw badRequest('Suppression impossible : ce médicament a du stock ou un historique de ventes.');
    }

    await conn.query('DELETE FROM lots WHERE medicament_id = ?', [id]);
    await conn.query('DELETE FROM medicaments WHERE id = ?', [id]);
    await logAudit(conn, req.user, 'MEDICAMENT_SUPPRIME', m.nom);
  });
  res.status(204).end();
});
