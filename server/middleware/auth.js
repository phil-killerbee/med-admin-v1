import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { config } from '../config.js';
import { forbidden, unauthorized } from '../errors.js';
import { hasAnyPermission, hasPermission } from '../../src/domain/permissions.js';

export const COOKIE_NAME = 'pharmacours_session';

export const cookieOptions = {
  httpOnly: true, // inaccessible au JavaScript du navigateur → protège contre le vol par XSS
  sameSite: 'lax', // limite les requêtes cross-site (CSRF)
  secure: config.production, // HTTPS obligatoire en production
  path: '/',
};

export function createSessionToken(userId) {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
}

/**
 * Middleware d'AUTHENTIFICATION : qui est l'utilisateur ?
 * Le jeton ne contient que l'id ; on relit l'utilisateur en base À CHAQUE requête
 * → un compte désactivé ou un rôle modifié s'applique immédiatement.
 */
export async function authenticate(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next(unauthorized());

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    res.clearCookie(COOKIE_NAME, cookieOptions);
    return next(unauthorized());
  }

  const [[user]] = await pool.query('SELECT id, login, nom, role, actif FROM users WHERE id = ?', [payload.sub]);
  if (!user || !user.actif) {
    res.clearCookie(COOKIE_NAME, cookieOptions);
    return next(unauthorized());
  }
  req.user = user;
  next();
}

/** Middleware d'AUTORISATION : a-t-il le droit ? (mêmes règles que le front, même fichier) */
export const requirePermission = (permission) => (req, res, next) =>
  hasPermission(req.user, permission) ? next() : next(forbidden());

export const requireAnyPermission = (permissions) => (req, res, next) =>
  hasAnyPermission(req.user, permissions) ? next() : next(forbidden());
