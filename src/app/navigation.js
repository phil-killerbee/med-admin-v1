import { lazy } from 'react';
import {
  Banknote,
  Calculator,
  ClipboardPlus,
  Contact,
  FileSpreadsheet,
  Truck,
  LayoutDashboard,
  Package,
  Pill,
  Receipt,
  ScrollText,
  ShieldPlus,
  Users,
} from 'lucide-react';
import { PERMISSIONS as P } from '../config/roles';

/**
 * UNE SEULE configuration pour le menu ET les routes.
 * Chaque entrée déclare les permissions requises (au moins une).
 * → Impossible d'avoir un lien visible vers une page interdite, ou l'inverse.
 *
 * React.lazy : chaque page est chargée à la demande (code splitting).
 */
export const appRoutes = [
  {
    path: '/',
    label: 'Tableau de bord',
    Icon: LayoutDashboard,
    anyOf: [P.DASHBOARD_VIEW],
    Component: lazy(() => import('../features/dashboard/DashboardPage')),
  },
  {
    path: '/comptoir',
    label: 'Comptoir',
    Icon: ClipboardPlus,
    anyOf: [P.COMMANDE_CREATE],
    Component: lazy(() => import('../features/comptoir/ComptoirPage')),
  },
  {
    path: '/caisse',
    label: 'Caisse',
    Icon: Banknote,
    anyOf: [P.COMMANDE_ENCAISSER],
    Component: lazy(() => import('../features/caisse/CaissePage')),
  },
  {
    path: '/cloture',
    label: 'Clôture',
    Icon: Calculator,
    anyOf: [P.CAISSE_CLOTURE],
    Component: lazy(() => import('../features/cloture/CloturePage')),
  },
  {
    path: '/commandes',
    label: 'Commandes',
    Icon: Receipt,
    anyOf: [P.COMMANDE_READ_OWN, P.COMMANDE_READ_ALL],
    Component: lazy(() => import('../features/commandes/CommandesPage')),
  },
  {
    path: '/patients',
    label: 'Patients',
    Icon: Contact,
    anyOf: [P.PATIENT_READ],
    Component: lazy(() => import('../features/patients/PatientsPage')),
  },
  {
    path: '/medicaments',
    label: 'Médicaments',
    Icon: Pill,
    anyOf: [P.MEDICAMENT_READ],
    Component: lazy(() => import('../features/medicaments/MedicamentsPage')),
  },
  {
    path: '/stock',
    label: 'Stock',
    Icon: Package,
    anyOf: [P.STOCK_READ],
    Component: lazy(() => import('../features/stock/StockPage')),
  },
  {
    path: '/reapprovisionnement',
    label: 'Réappro',
    Icon: Truck,
    anyOf: [P.STOCK_READ],
    Component: lazy(() => import('../features/reappro/ReapproPage')),
  },
  {
    path: '/assurances',
    label: 'Assurances',
    Icon: ShieldPlus,
    anyOf: [P.ASSURANCE_MANAGE],
    Component: lazy(() => import('../features/assurances/AssurancesPage')),
  },
  {
    path: '/bordereaux',
    label: 'Bordereaux',
    Icon: FileSpreadsheet,
    anyOf: [P.ASSURANCE_FACTURER],
    Component: lazy(() => import('../features/bordereaux/BordereauxPage')),
  },
  {
    path: '/utilisateurs',
    label: 'Utilisateurs',
    Icon: Users,
    anyOf: [P.USER_MANAGE],
    Component: lazy(() => import('../features/users/UsersPage')),
  },
  {
    path: '/audit',
    label: 'Audit',
    Icon: ScrollText,
    anyOf: [P.AUDIT_READ],
    Component: lazy(() => import('../features/audit/AuditPage')),
  },
];

/** Première page autorisée : page d'accueil de ceux qui n'ont pas le tableau de bord. */
export function firstAllowedPath(canAny) {
  return appRoutes.find((r) => canAny(r.anyOf))?.path ?? null;
}
