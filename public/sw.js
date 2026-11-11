/**
 * Service worker de PharmaCours (application installable).
 *
 * Stratégie volontairement PRUDENTE pour un logiciel de caisse :
 *  - /api/… : JAMAIS mis en cache → on ne montre jamais un stock ou un prix périmé ;
 *  - pages et fichiers de l'application : réseau d'abord, copie en cache en secours
 *    → si le réseau tombe, l'application s'ouvre quand même et affiche « Serveur injoignable »
 *      au lieu d'une page d'erreur du navigateur.
 */
const CACHE = 'pharmacours-v1';
const COQUILLE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(COQUILLE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Supprime les caches des versions précédentes
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // données : toujours le serveur

  const estPage = request.mode === 'navigate';
  const estFichierApp = url.pathname.startsWith('/assets/') || COQUILLE.includes(url.pathname);
  if (!estPage && !estFichierApp) return; // (en dev, les modules Vite ne sont pas mis en cache)

  event.respondWith(
    fetch(request)
      .then((reponse) => {
        if (reponse.ok) {
          const copie = reponse.clone();
          caches.open(CACHE).then((cache) => cache.put(estPage ? '/' : request, copie));
        }
        return reponse;
      })
      .catch(() => caches.match(estPage ? '/' : request)),
  );
});
