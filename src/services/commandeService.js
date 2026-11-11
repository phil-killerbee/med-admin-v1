import { api } from './http';

/** @param {string} [statut] EN_ATTENTE | PAYEE | ANNULEE */
export const listCommandes = (statut) => api(`/commandes${statut ? `?statut=${statut}` : ''}`);

/** Le front n'envoie que des identifiants et quantités : prix et parts sont calculés par l'API. */
export const creerCommande = (commande) => api('/commandes', { method: 'POST', body: commande });

/** Correction en caisse : { lignes, patientNom, ordonnanceRef, assuranceId, numeroAssure, motif } */
export const modifierCommande = (id, modification) => api(`/commandes/${id}`, { method: 'PUT', body: modification });

export const encaisserCommande = (id, paiement) =>
  api(`/commandes/${id}/encaissement`, { method: 'POST', body: paiement });

export const annulerCommande = (id, motif) => api(`/commandes/${id}/annulation`, { method: 'POST', body: { motif } });

export const getDashboard = () => api('/dashboard');
