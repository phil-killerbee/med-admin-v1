import { useEffect, useState } from 'react';

/**
 * Valeur « retardée » : ne change qu'après `delai` ms sans nouvelle frappe.
 * Évite d'envoyer une requête à l'API à chaque lettre tapée dans une recherche.
 */
export function useDebounce(valeur, delai = 250) {
  const [retardee, setRetardee] = useState(valeur);
  useEffect(() => {
    const timer = setTimeout(() => setRetardee(valeur), delai);
    return () => clearTimeout(timer);
  }, [valeur, delai]);
  return retardee;
}
