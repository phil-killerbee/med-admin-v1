import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { badRequest, forbidden } from '../errors.js';
import { requireAnyPermission, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../../src/config/roles.js';
import { hasPermission } from '../../src/domain/permissions.js';
import { STATUTS } from '../../src/domain/commande.js';
import {
  annulerCommande,
  creerCommande,
  encaisserCommande,
  listerCommandes,
  modifierCommande,
} from '../services/commandes.js';
import { enregistrerRetour } from '../services/caisse.js';
import { publier } from '../events.js';

export const commandesRouter = Router();

/**
 * Filtrage par PORTÉE, calculé côté serveur :
 *  - commande:read:all                → tout
 *  - file d'attente de la caisse      → toutes les commandes EN_ATTENTE (pour pouvoir les encaisser)
 *  - commande:read:own                → celles que j'ai créées OU encaissées
 */
function portee(user, statut) {
  if (hasPermission(user, P.COMMANDE_READ_ALL)) return { portee: 'ALL', where: [], params: [] };
  if (statut === STATUTS.EN_ATTENTE && hasPermission(user, P.COMMANDE_ENCAISSER)) {
    return { portee: 'FILE_CAISSE', where: [], params: [] };
  }
  if (hasPermission(user, P.COMMANDE_READ_OWN)) {
    return { portee: 'OWN', where: ['(c.vendeur_id = ? OR c.caissier_id = ?)'], params: [user.id, user.id] };
  }
  throw forbidden();
}

// GET /api/commandes?statut=EN_ATTENTE
commandesRouter.get(
  '/',
  requireAnyPermission([P.COMMANDE_READ_ALL, P.COMMANDE_READ_OWN, P.COMMANDE_ENCAISSER]),
  async (req, res) => {
    const statut = req.query.statut;
    if (statut && !STATUTS[statut]) throw badRequest('Statut invalide');

    const scope = portee(req.user, statut);
    const where = [...scope.where];
    const params = [...scope.params];
    if (statut) {
      where.push('c.statut = ?');
      params.push(statut);
    }
    const commandes = await listerCommandes(pool, {
      where: where.length ? `WHERE ${where.join(' AND ')}` : '',
      params,
    });
    res.json({ portee: scope.portee, commandes });
  },
);

// POST /api/commandes — comptoir
commandesRouter.post('/', requirePermission(P.COMMANDE_CREATE), async (req, res) => {
  const result = await withTransaction((conn) => creerCommande(conn, req.user, req.body));
  publier('commande', { id: result.id, action: 'creee' }); // après le COMMIT : la commande existe vraiment
  res.status(201).json(result);
});

// PUT /api/commandes/:id — correction à la caisse (commande en attente, motif obligatoire, tracée)
commandesRouter.put('/:id', requirePermission(P.COMMANDE_UPDATE), async (req, res) => {
  const result = await withTransaction((conn) => modifierCommande(conn, req.user, Number(req.params.id), req.body));
  publier('commande', { id: result.id, action: 'modifiee' });
  res.json(result);
});

// POST /api/commandes/:id/encaissement — caisse
commandesRouter.post('/:id/encaissement', requirePermission(P.COMMANDE_ENCAISSER), async (req, res) => {
  const result = await withTransaction((conn) => encaisserCommande(conn, req.user, Number(req.params.id), req.body));
  publier('commande', { id: result.id, action: 'payee' });
  res.json(result);
});

// POST /api/commandes/:id/annulation — règle de propriété vérifiée dans le service
commandesRouter.post('/:id/annulation', async (req, res) => {
  await withTransaction((conn) => annulerCommande(conn, req.user, Number(req.params.id), req.body?.motif));
  publier('commande', { id: Number(req.params.id), action: 'annulee' });
  res.status(204).end();
});

// POST /api/commandes/:id/retours — retour produit / avoir (règle de propriété dans le service)
commandesRouter.post('/:id/retours', requirePermission(P.COMMANDE_RETOUR), async (req, res) => {
  const retour = await withTransaction((conn) => enregistrerRetour(conn, req.user, Number(req.params.id), req.body));
  publier('commande', { id: retour.commandeId, action: 'retour' });
  res.status(201).json(retour);
});
