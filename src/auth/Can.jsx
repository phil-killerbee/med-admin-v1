import { useAuth } from './useAuth';

/**
 * Affichage conditionnel déclaratif selon les permissions.
 *
 *   <Can permission={PERMISSIONS.MEDICAMENT_DELETE}>
 *     <button>Supprimer</button>
 *   </Can>
 *
 * Rappel : c'est du CONFORT d'interface. La vraie protection est dans les services.
 */
export function Can({ permission, anyOf, fallback = null, children }) {
  const { can, canAny } = useAuth();
  const allowed = permission ? can(permission) : canAny(anyOf ?? []);
  return allowed ? children : fallback;
}
