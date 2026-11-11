/**
 * Journal d'audit. À appeler avec la connexion de la transaction en cours :
 * si l'opération échoue, la ligne d'audit est annulée avec elle.
 */
export async function logAudit(conn, user, action, details = '') {
  await conn.query('INSERT INTO audit (user_id, user_nom, role, action, details) VALUES (?, ?, ?, ?, ?)', [
    user.id,
    user.nom,
    user.role,
    action,
    String(details).slice(0, 500),
  ]);
}
