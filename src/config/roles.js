/**
 * SOURCE UNIQUE DE VÉRITÉ pour les rôles et permissions (RBAC).
 * Ce fichier est utilisé À LA FOIS par le front (React) et par l'API (Node/Express).
 *
 * Bonne pratique n°1 : on ne teste JAMAIS un rôle directement dans le code
 * (ex: `if (user.role === 'ADMIN')`). On teste une PERMISSION
 * (ex: `can(PERMISSIONS.USER_MANAGE)`).
 * → Ajouter/modifier un rôle = modifier uniquement ce fichier.
 */

export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  PHARMACIEN: 'PHARMACIEN',
  PREPARATEUR: 'PREPARATEUR',
  VENDEUR: 'VENDEUR',
  CAISSIER: 'CAISSIER',
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.ADMIN]: 'Administrateur',
  [ROLES.PHARMACIEN]: 'Pharmacien',
  [ROLES.PREPARATEUR]: 'Préparateur',
  [ROLES.VENDEUR]: 'Vendeur',
  [ROLES.CAISSIER]: 'Caissier',
});

/** Convention de nommage : "ressource:action[:portée]" */
export const PERMISSIONS = Object.freeze({
  DASHBOARD_VIEW: 'dashboard:view',

  MEDICAMENT_READ: 'medicament:read',
  MEDICAMENT_CREATE: 'medicament:create',
  MEDICAMENT_UPDATE: 'medicament:update',
  MEDICAMENT_DELETE: 'medicament:delete',

  STOCK_READ: 'stock:read',
  STOCK_RECEIVE: 'stock:receive',

  COMMANDE_CREATE: 'commande:create', // enregistrer une commande au comptoir
  ORDONNANCE_DELIVRER: 'ordonnance:delivrer', // mettre un médicament sur ordonnance dans une commande
  COMMANDE_ENCAISSER: 'commande:encaisser', // valider et encaisser une commande à la caisse
  COMMANDE_UPDATE: 'commande:update', // modifier une commande en attente (tracé)
  COMMANDE_READ_OWN: 'commande:read:own', // portée : ses propres commandes
  COMMANDE_READ_ALL: 'commande:read:all', // portée : toutes les commandes
  COMMANDE_CANCEL: 'commande:cancel', // annuler n'importe quelle commande (même payée)
  COMMANDE_RETOUR: 'commande:retour', // retour produit / avoir sur une commande payée
  CAISSE_CLOTURE: 'caisse:cloture', // clôturer sa caisse (comptage de fin de journée)

  PATIENT_READ: 'patient:read', // consulter les fiches patients et leur historique
  PATIENT_MANAGE: 'patient:manage', // créer / modifier une fiche patient

  ASSURANCE_MANAGE: 'assurance:manage',
  ASSURANCE_FACTURER: 'assurance:facturer', // bordereaux mensuels à envoyer aux assurances
  USER_MANAGE: 'user:manage',
  AUDIT_READ: 'audit:read',
});

export const PERMISSION_LABELS = Object.freeze({
  [PERMISSIONS.DASHBOARD_VIEW]: 'Voir le tableau de bord',
  [PERMISSIONS.MEDICAMENT_READ]: 'Consulter le catalogue',
  [PERMISSIONS.MEDICAMENT_CREATE]: 'Ajouter un médicament',
  [PERMISSIONS.MEDICAMENT_UPDATE]: 'Modifier un médicament',
  [PERMISSIONS.MEDICAMENT_DELETE]: 'Supprimer un médicament',
  [PERMISSIONS.STOCK_READ]: 'Consulter le stock',
  [PERMISSIONS.STOCK_RECEIVE]: 'Réceptionner des lots',
  [PERMISSIONS.COMMANDE_CREATE]: 'Enregistrer une commande',
  [PERMISSIONS.ORDONNANCE_DELIVRER]: 'Délivrer sur ordonnance',
  [PERMISSIONS.COMMANDE_ENCAISSER]: 'Encaisser une commande',
  [PERMISSIONS.COMMANDE_UPDATE]: 'Modifier une commande en attente',
  [PERMISSIONS.COMMANDE_READ_OWN]: 'Voir ses propres commandes',
  [PERMISSIONS.COMMANDE_READ_ALL]: 'Voir toutes les commandes',
  [PERMISSIONS.COMMANDE_CANCEL]: 'Annuler toute commande',
  [PERMISSIONS.COMMANDE_RETOUR]: 'Retour produit / avoir',
  [PERMISSIONS.CAISSE_CLOTURE]: 'Clôturer sa caisse',
  [PERMISSIONS.PATIENT_READ]: 'Consulter les fiches patients',
  [PERMISSIONS.PATIENT_MANAGE]: 'Créer / modifier un patient',
  [PERMISSIONS.ASSURANCE_FACTURER]: 'Bordereaux assurances',
  [PERMISSIONS.ASSURANCE_MANAGE]: 'Gérer les assurances',
  [PERMISSIONS.USER_MANAGE]: 'Gérer les utilisateurs',
  [PERMISSIONS.AUDIT_READ]: "Consulter le journal d'audit",
});

const P = PERMISSIONS;

/**
 * Matrice rôle → permissions.
 *
 * Bonne pratique n°2 : principe du MOINDRE PRIVILÈGE.
 * Bonne pratique n°3 : SÉPARATION DES TÂCHES
 *   - la vendeuse enregistre la commande mais ne touche pas l'argent ;
 *   - le caissier encaisse (et peut corriger une commande, avec traçabilité)
 *     mais ne crée pas de commande ;
 *   - l'administrateur gère comptes et assurances mais ne vend pas.
 *
 * Vendeur et caissier n'ont que les permissions de leur poste :
 *   - vendeur  → Comptoir + historique de SES commandes (commande:read:own,
 *                filtré en SQL côté serveur) + fiches patients ;
 *   - caissier → Caisse + historique des commandes qu'IL a encaissées
 *                + retours / avoirs sur SES encaissements + clôture de SA caisse.
 */
export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.ADMIN]: Object.freeze([
    P.DASHBOARD_VIEW,
    P.MEDICAMENT_READ,
    P.MEDICAMENT_CREATE,
    P.MEDICAMENT_UPDATE,
    P.MEDICAMENT_DELETE,
    P.STOCK_READ,
    P.COMMANDE_READ_ALL,
    P.PATIENT_READ,
    P.ASSURANCE_MANAGE,
    P.ASSURANCE_FACTURER,
    P.USER_MANAGE,
    P.AUDIT_READ,
  ]),
  [ROLES.PHARMACIEN]: Object.freeze([
    P.DASHBOARD_VIEW,
    P.MEDICAMENT_READ,
    P.MEDICAMENT_CREATE,
    P.MEDICAMENT_UPDATE,
    P.STOCK_READ,
    P.STOCK_RECEIVE,
    P.COMMANDE_CREATE,
    P.ORDONNANCE_DELIVRER,
    P.COMMANDE_ENCAISSER,
    P.COMMANDE_UPDATE,
    P.COMMANDE_READ_ALL,
    P.COMMANDE_CANCEL,
    P.COMMANDE_RETOUR,
    P.CAISSE_CLOTURE,
    P.PATIENT_READ,
    P.PATIENT_MANAGE,
    P.ASSURANCE_FACTURER,
  ]),
  [ROLES.PREPARATEUR]: Object.freeze([
    P.DASHBOARD_VIEW,
    P.MEDICAMENT_READ,
    P.STOCK_READ,
    P.STOCK_RECEIVE,
  ]),
  [ROLES.VENDEUR]: Object.freeze([
    P.COMMANDE_CREATE,
    P.ORDONNANCE_DELIVRER,
    P.COMMANDE_READ_OWN,
    P.PATIENT_READ,
    P.PATIENT_MANAGE,
  ]),
  [ROLES.CAISSIER]: Object.freeze([
    P.COMMANDE_ENCAISSER,
    P.COMMANDE_UPDATE,
    P.COMMANDE_READ_OWN,
    P.COMMANDE_RETOUR,
    P.CAISSE_CLOTURE,
  ]),
});
