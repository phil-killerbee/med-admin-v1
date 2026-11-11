import crypto from 'node:crypto';

/**
 * Configuration lue depuis les variables d'environnement (fichier server/.env).
 * Bonne pratique : AUCUN secret dans le code source, valeurs par défaut sûres pour le dev.
 */
const env = process.env;

export const config = {
  port: Number(env.API_PORT ?? 3001),
  // L'API n'écoute que la machine locale : le réseau passe par le proxy Vite.
  host: env.API_HOST ?? '127.0.0.1',
  production: env.NODE_ENV === 'production',
  db: {
    host: env.DB_HOST ?? '127.0.0.1',
    port: Number(env.DB_PORT ?? 3306),
    user: env.DB_USER ?? 'root',
    password: env.DB_PASSWORD ?? '',
    database: env.DB_NAME ?? 'mediciel-test',
  },
  jwtSecret: env.JWT_SECRET ?? crypto.randomBytes(32).toString('hex'),
  sessionHours: 8, // durée d'une "garde" en officine
};

if (!env.JWT_SECRET) {
  if (config.production) throw new Error('JWT_SECRET est obligatoire en production');
  console.warn('⚠️  JWT_SECRET absent : secret temporaire (les sessions sont perdues au redémarrage)');
}
