import { useEffect, useState } from 'react';

/**
 * Application installable (PWA).
 * Le navigateur n'accepte un service worker que dans un « contexte sécurisé » :
 * https://…, ou http://localhost. Sur http://192.168.x.x (réseau local sans HTTPS),
 * il n'y a donc pas d'installation possible : on n'insiste pas.
 */
export function enregistrerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker non enregistré', err));
  });
}

/**
 * Bouton « Installer » : Chrome / Edge émettent `beforeinstallprompt` quand l'application
 * est installable ; on garde l'événement pour afficher la boîte d'installation au clic.
 */
export function useInstallation() {
  const [invite, setInvite] = useState(null);

  useEffect(() => {
    const garder = (e) => {
      e.preventDefault();
      setInvite(e);
    };
    const installee = () => setInvite(null);
    window.addEventListener('beforeinstallprompt', garder);
    window.addEventListener('appinstalled', installee);
    return () => {
      window.removeEventListener('beforeinstallprompt', garder);
      window.removeEventListener('appinstalled', installee);
    };
  }, []);

  if (!invite) return null;
  return async () => {
    await invite.prompt();
    setInvite(null);
  };
}
