import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { logAudit } from '../audit.js';
import { HttpError, badRequest } from '../errors.js';
import { COOKIE_NAME, authenticate, cookieOptions, createSessionToken } from '../middleware/auth.js';
import { config } from '../config.js';

export const authRouter = Router();

// Anti force brute : 10 tentatives de connexion par 15 minutes et par adresse IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Trop de tentatives. Réessayez dans quelques minutes.' },
});

// Hachage factice : on compare même si l'utilisateur n'existe pas,
// pour que le temps de réponse ne révèle pas quels identifiants existent.
const DUMMY_HASH = bcrypt.hashSync('pas-un-vrai-mot-de-passe', 10);

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { login = '', password = '' } = req.body ?? {};
  const [[user]] = await pool.query('SELECT * FROM users WHERE login = ?', [String(login).trim().toLowerCase()]);

  const ok = await bcrypt.compare(String(password), user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Identifiant ou mot de passe incorrect');
  if (!user.actif) throw badRequest('Ce compte est désactivé. Contactez un administrateur.');

  await logAudit(pool, user, 'CONNEXION');
  res.cookie(COOKIE_NAME, createSessionToken(user.id), {
    ...cookieOptions,
    maxAge: config.sessionHours * 3600 * 1000,
  });
  res.json({ id: user.id, login: user.login, nom: user.nom, role: user.role, actif: user.actif });
});

authRouter.post('/logout', async (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.status(204).end();
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json(req.user);
});
