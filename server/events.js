/**
 * Mise à jour EN DIRECT avec les Server-Sent Events (SSE).
 *
 * Le navigateur ouvre une connexion HTTP qui reste ouverte (GET /api/evenements) ;
 * le serveur y écrit une ligne à chaque événement (« commande créée », « commande payée »…).
 * → la caisse voit arriver une commande du comptoir immédiatement, sans recharger toutes les 15 s.
 *
 * Bonne pratique : l'événement ne contient AUCUNE donnée sensible (juste le type et un id).
 * Chaque écran recharge ensuite ses données par l'API normale, qui applique les permissions.
 */
const clients = new Set();

export function abonner(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n'); // reconnexion automatique après 3 s en cas de coupure

  const client = { res, userId: req.user.id };
  clients.add(client);
  // Commentaire envoyé régulièrement : empêche proxys et navigateurs de couper une connexion « muette ».
  const battement = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(battement);
    clients.delete(client);
  });
}

/** À appeler APRÈS la fin de la transaction (on n'annonce que ce qui est réellement enregistré). */
export function publier(type, data = {}) {
  const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const { res } of clients) res.write(message);
}
