import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

// Vérifie la connexion MySQL au démarrage : on échoue tôt avec un message clair.
try {
  await pool.query('SELECT 1');
  console.log(`✅ MySQL connecté : ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}`);
} catch (err) {
  console.error(`❌ Connexion MySQL impossible (${err.code ?? err.message}). WAMP est-il démarré ? Avez-vous lancé "npm run db:init" ?`);
  process.exit(1);
}

app.listen(config.port, config.host, () => {
  console.log(`🚀 API PharmaCours sur http://${config.host}:${config.port}/api`);
});
