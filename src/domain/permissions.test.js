import { describe, expect, it } from 'vitest';
import { getPermissions, hasAnyPermission, hasPermission } from './permissions';
import { PERMISSIONS as P, ROLES } from '../config/roles';

const user = (role, actif = true) => ({ id: 'x', role, actif });

describe('RBAC — séparation des tâches', () => {
  it('la vendeuse enregistre les commandes mais ne peut pas encaisser', () => {
    expect(hasPermission(user(ROLES.VENDEUR), P.COMMANDE_CREATE)).toBe(true);
    expect(hasPermission(user(ROLES.VENDEUR), P.COMMANDE_ENCAISSER)).toBe(false);
  });

  it('le caissier encaisse mais ne compose pas de commande', () => {
    expect(hasPermission(user(ROLES.CAISSIER), P.COMMANDE_ENCAISSER)).toBe(true);
    expect(hasPermission(user(ROLES.CAISSIER), P.COMMANDE_CREATE)).toBe(false);
  });

  it("l'admin gère comptes et assurances mais ne vend pas", () => {
    expect(hasPermission(user(ROLES.ADMIN), P.USER_MANAGE)).toBe(true);
    expect(hasPermission(user(ROLES.ADMIN), P.ASSURANCE_MANAGE)).toBe(true);
    expect(hasPermission(user(ROLES.ADMIN), P.COMMANDE_CREATE)).toBe(false);
    expect(hasPermission(user(ROLES.ADMIN), P.COMMANDE_ENCAISSER)).toBe(false);
  });

  it('le préparateur réceptionne le stock mais ne modifie pas le catalogue', () => {
    expect(hasPermission(user(ROLES.PREPARATEUR), P.STOCK_RECEIVE)).toBe(true);
    expect(hasPermission(user(ROLES.PREPARATEUR), P.MEDICAMENT_UPDATE)).toBe(false);
  });
});

describe('RBAC — chacun son poste', () => {
  it('la vendeuse a le comptoir et l’historique de SES commandes seulement', () => {
    expect(getPermissions(user(ROLES.VENDEUR))).toEqual([
      P.COMMANDE_CREATE,
      P.ORDONNANCE_DELIVRER,
      P.COMMANDE_READ_OWN,
      P.PATIENT_READ,
      P.PATIENT_MANAGE,
    ]);
    expect(hasPermission(user(ROLES.VENDEUR), P.COMMANDE_READ_ALL)).toBe(false);
  });

  it('le caissier a la caisse (encaisser + corriger) et l’historique de SES encaissements', () => {
    expect(getPermissions(user(ROLES.CAISSIER))).toEqual([
      P.COMMANDE_ENCAISSER,
      P.COMMANDE_UPDATE,
      P.COMMANDE_READ_OWN,
      P.COMMANDE_RETOUR,
      P.CAISSE_CLOTURE,
    ]);
    expect(hasPermission(user(ROLES.CAISSIER), P.COMMANDE_READ_ALL)).toBe(false);
  });

  it('le caissier ne peut pas délivrer sur ordonnance', () => {
    expect(hasPermission(user(ROLES.CAISSIER), P.ORDONNANCE_DELIVRER)).toBe(false);
  });
});

describe('RBAC — refus par défaut', () => {

  it("un compte désactivé n'a AUCUNE permission", () => {
    expect(hasPermission(user(ROLES.PHARMACIEN, false), P.DASHBOARD_VIEW)).toBe(false);
  });

  it('utilisateur absent ou rôle inconnu → refus par défaut', () => {
    expect(hasPermission(null, P.DASHBOARD_VIEW)).toBe(false);
    expect(hasPermission(user('PIRATE'), P.DASHBOARD_VIEW)).toBe(false);
  });

  it('hasAnyPermission', () => {
    expect(hasAnyPermission(user(ROLES.PHARMACIEN), [P.COMMANDE_READ_ALL, P.COMMANDE_READ_OWN])).toBe(true);
    expect(hasAnyPermission(user(ROLES.PREPARATEUR), [P.COMMANDE_READ_ALL, P.COMMANDE_READ_OWN])).toBe(false);
  });
});
