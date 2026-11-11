import { ROLE_PERMISSIONS } from '../config/roles.js';

/**
 * Fonctions PURES (sans React, sans stockage) → faciles à tester
 * et réutilisables côté "serveur" (services) comme côté interface.
 */

export function getPermissions(user) {
  if (!user || !user.actif) return [];
  return ROLE_PERMISSIONS[user.role] ?? [];
}

export function hasPermission(user, permission) {
  return getPermissions(user).includes(permission);
}

export function hasAnyPermission(user, permissions = []) {
  return permissions.some((p) => hasPermission(user, p));
}
