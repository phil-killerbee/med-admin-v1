import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { HttpError } from './errors.js';
import { authenticate } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { medicamentsRouter } from './routes/medicaments.js';
import { stockRouter } from './routes/stock.js';
import { commandesRouter } from './routes/commandes.js';
import { assurancesRouter } from './routes/assurances.js';
import { dashboardRouter } from './routes/dashboard.js';
import { auditRouter, usersRouter } from './routes/users.js';
import { patientsRouter } from './routes/patients.js';
import { bordereauxRouter, caisseRouter, reapproRouter } from './routes/caisse.js';
import { abonner } from './events.js';

export const app = express();

app.disable('x-powered-by');
// Derrière le proxy Vite (local) : req.ip = vraie IP du poste client (lue dans X-Forwarded-For).
app.set('trust proxy', 'loopback');
app.use(helmet()); // en-têtes HTTP de sécurité
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Routes publiques
app.use('/api/auth', authRouter);

// Tout ce qui suit exige une session valide.
app.use('/api', authenticate);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/medicaments', medicamentsRouter);
app.use('/api/lots', stockRouter);
app.use('/api/commandes', commandesRouter);
app.use('/api/assurances', assurancesRouter);
app.use('/api/users', usersRouter);
app.use('/api/audit', auditRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/caisse', caisseRouter);
app.use('/api/bordereaux', bordereauxRouter);
app.use('/api/reappro', reapproRouter);
// Flux d'événements en direct (SSE) : réservé aux utilisateurs connectés (authenticate ci-dessus)
app.get('/api/evenements', abonner);

app.use('/api', (req, res) => res.status(404).json({ message: 'Route inconnue' }));

/**
 * Gestionnaire d'erreurs CENTRALISÉ (Express 5 y envoie aussi les erreurs des fonctions async).
 * - Erreurs prévues (HttpError) → message clair pour l'utilisateur
 * - Erreurs imprévues → message générique ; le détail technique reste dans les logs du serveur
 */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, fields: err.fields });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'Cet élément existe déjà' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Requête invalide' });
  }
  console.error(err);
  res.status(500).json({ message: 'Erreur interne du serveur' });
});
