import mysql from 'mysql2/promise';
import { config } from './config.js';

/** Options communes à toutes les connexions (pool de l'API et script d'initialisation). */
export const connectionOptions = {
  ...config.db,
  dateStrings: true, // DATE → "AAAA-MM-JJ" (pas de décalage de fuseau horaire)
  decimalNumbers: true, // SUM() renvoie un nombre, pas une chaîne
  typeCast(field, next) {
    // TINYINT(1) → booléen JavaScript
    if (field.type === 'TINY' && field.length === 1) {
      const value = field.string();
      return value === null ? null : value === '1';
    }
    return next();
  },
};

/** Pool de connexions : on réutilise les connexions au lieu d'en ouvrir une par requête. */
export const pool = mysql.createPool({ ...connectionOptions, connectionLimit: 10 });

/**
 * Exécute `work` dans une TRANSACTION : tout réussit, ou rien n'est enregistré.
 * Toutes les requêtes doivent utiliser la connexion `conn` reçue.
 */
export async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** "2026-11-09 03:20:00" (MySQL) → "2026-11-09T03:20:00" (lisible par new Date()) */
export const toIsoDateTime = (value) => (value ? value.replace(' ', 'T') : value);
