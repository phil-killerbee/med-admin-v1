import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool, toIsoDateTime, withTransaction } from '../db.js';
import { logAudit } from '../audit.js';
import { assertNoErrors, badRequest, notFound } from '../errors.js';
import { requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P, ROLES, ROLE_LABELS } from '../../src/config/roles.js';

export const usersRouter = Router();
export const auditRouter = Router();

const PUBLIC_FIELDS = 'id, login, nom, role, actif'; // jamais password_hash

usersRouter.use(requirePermission(P.USER_MANAGE)); // toutes les routes de ce routeur

usersRouter.get('/', async (req, res) => {
  const [rows] = await pool.query(`SELECT ${PUBLIC_FIELDS} FROM users ORDER BY nom`);
  res.json(rows);
});

usersRouter.post('/', async (req, res) => {
  const body = req.body ?? {};
  const login = String(body.login ?? '').trim().toLowerCase();
  const errors = {};
  if (!/^[a-z0-9._-]{3,30}$/.test(login)) errors.login = '3 à 30 caractères : a-z, 0-9, . _ -';
  if (!String(body.nom ?? '').trim()) errors.nom = 'Nom obligatoire';
  if (!Object.values(ROLES).includes(body.role)) errors.role = 'Rôle invalide';
  if (String(body.password ?? '').length < 8) errors.password = '8 caractères minimum';
  if (!errors.login) {
    const [[exists]] = await pool.query('SELECT id FROM users WHERE login = ?', [login]);
    if (exists) errors.login = 'Identifiant déjà utilisé';
  }
  assertNoErrors(errors);

  const hash = await bcrypt.hash(String(body.password), 10); // coût 10 : bon compromis sécurité / rapidité
  const user = await withTransaction(async (conn) => {
    const [r] = await conn.query('INSERT INTO users (login, nom, role, actif, password_hash) VALUES (?, ?, ?, 1, ?)', [
      login,
      body.nom.trim(),
      body.role,
      hash,
    ]);
    await logAudit(conn, req.user, 'UTILISATEUR_CREE', `${login} (${ROLE_LABELS[body.role]})`);
    return { id: r.insertId, login, nom: body.nom.trim(), role: body.role, actif: true };
  });
  res.status(201).json(user);
});

/** Garde-fou : un admin ne peut ni changer son propre rôle, ni se désactiver. */
usersRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { role, actif } = req.body ?? {};

  const user = await withTransaction(async (conn) => {
    const [[u]] = await conn.query(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ? FOR UPDATE`, [id]);
    if (!u) throw notFound('Utilisateur introuvable');
    if (u.id === req.user.id && (actif === false || (role && role !== u.role))) {
      throw badRequest('Vous ne pouvez pas modifier votre propre rôle ni vous désactiver.');
    }
    if (role !== undefined && !Object.values(ROLES).includes(role)) throw badRequest('Rôle invalide');
    if (actif !== undefined && typeof actif !== 'boolean') throw badRequest('Statut invalide');

    const changes = [];
    if (role !== undefined && role !== u.role) {
      changes.push(`rôle ${ROLE_LABELS[u.role]} → ${ROLE_LABELS[role]}`);
      u.role = role;
    }
    if (actif !== undefined && actif !== u.actif) {
      changes.push(actif ? 'réactivé' : 'désactivé');
      u.actif = actif;
    }
    if (changes.length) {
      await conn.query('UPDATE users SET role = ?, actif = ? WHERE id = ?', [u.role, u.actif, id]);
      await logAudit(conn, req.user, 'UTILISATEUR_MODIFIE', `${u.login} : ${changes.join(', ')}`);
    }
    return u;
  });
  res.json(user);
});

auditRouter.get('/', requirePermission(P.AUDIT_READ), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, date, user_id AS userId, user_nom AS userNom, role, action, details
     FROM audit ORDER BY id DESC LIMIT 500`,
  );
  res.json(rows.map((r) => ({ ...r, date: toIsoDateTime(r.date) })));
});
