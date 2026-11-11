import { useEffect, useState } from 'react';

/**
 * Comme useState, mais mémorisé dans le navigateur (préférence d'affichage).
 * Uniquement pour du confort : jamais pour des données sensibles.
 */
export function usePersistentState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? defaultValue : JSON.parse(raw);
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // stockage indisponible (navigation privée) : on ignore
    }
  }, [key, value]);

  return [value, setValue];
}
