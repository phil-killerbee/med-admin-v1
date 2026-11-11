import { Router } from 'express';
import { pool, toIsoDateTime, withTransaction } from '../db.js';
import { logAudit } from '../audit.js';
import { assertNoErrors, badRequest, notFound } from '../errors.js';
import { requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../../src/config/roles.js';
import { normalizePatient, validatePatient } from '../../src/domain/patient.js';

export const patientsRouter = Router();

const SELECT_PATIENTS = `
  SELECT p.id, p.nom, p.telephone, p.assurance_id AS assuranceId, p.numero_assure AS numeroAssure,
         a.nom AS assuranceNom, a.taux_couverture AS assuranceTaux, a.actif AS assuranceActive,
         (SELECT COUNT(*) FROM commandes c WHERE c.patient_id = p.id AND c.statut <> 'ANNULEE') AS nbCommandes,
         (SELECT MAX(c.created_at) FROM commandes c WHERE c.patient_id = p.id) AS derniereVisite
  FROM patients p LEFT JOIN assurances a ON a.id = p.assurance_id`;

const format = (p) => ({ ...p, derniereVisite: toIsoDateTime(p.derniereVisite) });

// GET /api/patients?q=khady — recherche par nom, téléphone ou n° d'assuré
patientsRouter.get('/', requirePermission(P.PATIENT_READ), async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const like = `%${q}%`; // requête paramétrée : la saisie n'est jamais concaténée au SQL
  const [rows] = await pool.query(
    `${SELECT_PATIENTS} ${q ? 'WHERE p.nom LIKE ? OR p.telephone LIKE ? OR p.numero_assure LIKE ?' : ''}
     ORDER BY p.nom LIMIT 100`,
    q ? [like, like, like] : [],
  );
  res.json(rows.map(format));
});

// GET /api/patients/:id/commandes — historique des achats du patient
patientsRouter.get('/:id/commandes', requirePermission(P.PATIENT_READ), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.id, c.created_at AS date, c.statut, c.total, c.part_patient AS partPatient,
            c.part_assurance AS partAssurance, c.ordonnance_ref AS ordonnanceRef,
            (SELECT GROUP_CONCAT(CONCAT(l.nom, ' × ', l.quantite) SEPARATOR ', ')
             FROM commande_lignes l WHERE l.commande_id = c.id) AS produits
     FROM commandes c WHERE c.patient_id = ? ORDER BY c.created_at DESC LIMIT 100`,
    [req.params.id],
  );
  res.json(rows.map((c) => ({ ...c, date: toIsoDateTime(c.date) })));
});

async function valider(conn, body) {
  assertNoErrors(validatePatient(body ?? {}));
  const p = normalizePatient(body);
  if (p.assuranceId) {
    const [[a]] = await conn.query('SELECT id FROM assurances WHERE id = ?', [p.assuranceId]);
    if (!a) throw badRequest('Assurance inconnue', { assuranceId: 'Assurance invalide' });
  }
  return p;
}

patientsRouter.post('/', requirePermission(P.PATIENT_MANAGE), async (req, res) => {
  const patient = await withTransaction(async (conn) => {
    const p = await valider(conn, req.body);
    const [r] = await conn.query('INSERT INTO patients (nom, telephone, assurance_id, numero_assure) VALUES (?, ?, ?, ?)', [
      p.nom,
      p.telephone,
      p.assuranceId,
      p.numeroAssure,
    ]);
    await logAudit(conn, req.user, 'PATIENT_CREE', `${p.nom} (n°${r.insertId})`);
    const [[created]] = await conn.query(`${SELECT_PATIENTS} WHERE p.id = ?`, [r.insertId]);
    return format(created);
  });
  res.status(201).json(patient);
});

patientsRouter.put('/:id', requirePermission(P.PATIENT_MANAGE), async (req, res) => {
  const patient = await withTransaction(async (conn) => {
    const [[existe]] = await conn.query('SELECT id FROM patients WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!existe) throw notFound('Patient introuvable');
    const p = await valider(conn, req.body);
    await conn.query('UPDATE patients SET nom = ?, telephone = ?, assurance_id = ?, numero_assure = ? WHERE id = ?', [
      p.nom,
      p.telephone,
      p.assuranceId,
      p.numeroAssure,
      existe.id,
    ]);
    await logAudit(conn, req.user, 'PATIENT_MODIFIE', `${p.nom} (n°${existe.id})`);
    const [[updated]] = await conn.query(`${SELECT_PATIENTS} WHERE p.id = ?`, [existe.id]);
    return format(updated);
  });
  res.json(patient);
});
