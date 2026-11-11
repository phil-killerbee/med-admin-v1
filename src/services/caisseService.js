import { api } from './http';

/** Retour / avoir : { lignes:[{ligneId, quantite}], motif, modeRemboursement, remettreEnStock } */
export const enregistrerRetour = (commandeId, retour) =>
  api(`/commandes/${commandeId}/retours`, { method: 'POST', body: retour });

/** Clôture de caisse */
export const getEtatCaisse = () => api('/caisse/etat');
export const listClotures = () => api('/caisse/clotures');
export const cloturerCaisse = (data) => api('/caisse/clotures', { method: 'POST', body: data });

/** Bordereau mensuel des assurances : mois = "AAAA-MM" */
export const getBordereau = (mois) => api(`/bordereaux?mois=${encodeURIComponent(mois)}`);

/** Réapprovisionnement : stock, ventes 30 j, proposition de commande */
export const getReappro = () => api('/reappro');
