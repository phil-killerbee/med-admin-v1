import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { logAudit } from '../audit.js';
import { assertNoErrors, notFound } from '../errors.js';
import { requireAnyPermission, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../../src/config/roles.js';
import { hasPermission } from '../../src/domain/permissions.js';

export const assurancesRouter = Router();

const SELECT = 'SELECT id, nom, taux_couverture AS taux, actif FROM assurances';

function validate(body, partial = false) {
  const errors = {};
  if (!partial || body.nom !== undefined) {
    if (!String(body.nom ?? '').trim()) errors.nom = 'Nom obligatoire';
  }
  if (!partial || body.taux !== undefined) {
    const taux = Number(body.taux);
    if (!Number.isInteger(taux) || taux < 0 || taux > 100) errors.taux = 'Entier entre 0 et 100';
  }
  if (body.actif !== undefined && typeof body.actif !== 'boolean') errors.actif = 'Valeur invalide';
  assertNoErrors(errors);
}

// Lecture : le gestionnaire voit tout ; comptoir et caisse ne voient que les assurances actives.
assurancesRouter.get(
  '/',
  requireAnyPermission([P.ASSURANCE_MANAGE, P.COMMANDE_CREATE, P.COMMANDE_ENCAISSER]),
  async (req, res) => {
    const toutes = hasPermission(req.user, P.ASSURANCE_MANAGE);
    const [rows] = await pool.query(`${SELECT} ${toutes ? '' : 'WHERE actif = 1'} ORDER BY nom`);
    res.json(rows);
  },
);

assurancesRouter.post('/', requirePermission(P.ASSURANCE_MANAGE), async (req, res) => {
  const body = req.body ?? {};
  validate(body);
  const created = await withTransaction(async (conn) => {
    const [r] = await conn.query('INSERT INTO assurances (nom, taux_couverture) VALUES (?, ?)', [body.nom.trim(), Number(body.taux)]);
    await logAudit(conn, req.user, 'ASSURANCE_CREEE', `${body.nom.trim()} (${body.taux} %)`);
    return { id: r.insertId, nom: body.nom.trim(), taux: Number(body.taux), actif: true };
  });
  res.status(201).json(created);
});

// Modifier le taux n'affecte PAS les commandes passées (le taux y est figé).
assurancesRouter.patch('/:id', requirePermission(P.ASSURANCE_MANAGE), async (req, res) => {
  const body = req.body ?? {};
  validate(body, true);
  const id = Number(req.params.id);
  const updated = await withTransaction(async (conn) => {
    const [[before]] = await conn.query(`${SELECT} WHERE id = ? FOR UPDATE`, [id]);
    if (!before) throw notFound('Assurance introuvable');
    const after = {
      ...before,
      ...(body.nom !== undefined && { nom: body.nom.trim() }),
      ...(body.taux !== undefined && { taux: Number(body.taux) }),
      ...(body.actif !== undefined && { actif: body.actif }),
    };
    await conn.query('UPDATE assurances SET nom = ?, taux_couverture = ?, actif = ? WHERE id = ?', [after.nom, after.taux, after.actif, id]);
    const changes = [];
    if (before.taux !== after.taux) changes.push(`taux ${before.taux} % → ${after.taux} %`);
    if (before.actif !== after.actif) changes.push(after.actif ? 'réactivée' : 'désactivée');
    if (before.nom !== after.nom) changes.push(`renommée « ${after.nom} »`);
    if (changes.length) await logAudit(conn, req.user, 'ASSURANCE_MODIFIEE', `${before.nom} : ${changes.join(', ')}`);
    return after;
  });
  res.json(updated);
});
