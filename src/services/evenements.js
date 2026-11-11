import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Mise à jour EN DIRECT (Server-Sent Events).
 *
 * UNE seule connexion EventSource pour toute l'application, partagée par les écrans abonnés :
 * ouverte au premier abonné, fermée quand plus personne n'écoute.
 * Le serveur n'envoie que { type, id } : chaque écran recharge ensuite ses données par l'API,
 * qui applique les permissions habituelles.
 */
const TYPES = ['commande', 'caisse:cloturee'];
const abonnes = new Set();
const ecouteursStatut = new Set();
let source = null;
let connecte = false;

function setConnecte(valeur) {
  if (connecte === valeur) return;
  connecte = valeur;
  ecouteursStatut.forEach((f) => f());
}

function ouvrir() {
  source = new EventSource('/api/evenements');
  source.onopen = () => setConnecte(true);
  source.onerror = () => setConnecte(false); // le navigateur se reconnecte tout seul
  for (const type of TYPES) {
    source.addEventListener(type, (e) => {
      const data = JSON.parse(e.data);
      abonnes.forEach((f) => f(type, data));
    });
  }
}

function fermer() {
  source?.close();
  source = null;
  setConnecte(false);
}

/** S'abonne aux événements tant que le composant est affiché. */
export function useEvenements(onEvenement) {
  // useRef : on appelle toujours la DERNIÈRE version du callback, sans se réabonner à chaque rendu.
  const ref = useRef(onEvenement);
  ref.current = onEvenement;

  useEffect(() => {
    const f = (type, data) => ref.current(type, data);
    abonnes.add(f);
    if (!source) ouvrir();
    return () => {
      abonnes.delete(f);
      if (abonnes.size === 0) fermer();
    };
  }, []);
}

/** true quand la connexion en direct est établie (indicateur dans la barre du haut). */
export function useConnexionDirecte() {
  return useSyncExternalStore(
    (f) => {
      ecouteursStatut.add(f);
      return () => ecouteursStatut.delete(f);
    },
    () => connecte,
  );
}
