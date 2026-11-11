/**
 * Crée les tables et insère les données de test.
 *   npm run db:init    → crée ce qui manque, insère les données si la base est vide
 *   npm run db:reset   → SUPPRIME les tables et repart de zéro
 *
 * Les commandes de test passent par le VRAI service métier (FEFO, assurance, audit…) :
 * les données sont donc forcément cohérentes avec les règles de l'application.
 */
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { connectionOptions } from '../db.js';
import { addDays, todayIso } from '../../src/domain/dates.js';
import { annulerCommande, creerCommande, encaisserCommande, modifierCommande } from '../services/commandes.js';
import { cloturerCaisse, enregistrerRetour, etatCaisse } from '../services/caisse.js';
import { calculerCloture } from '../../src/domain/caisse.js';

const RESET = process.argv.includes('--reset');

const ACCOUNTS = [
  // login, nom, rôle, actif
  ['admin', 'Awa Diop', 'ADMIN', 1],
  ['pharmacien', 'Dr Moussa Fall', 'PHARMACIEN', 1],
  ['preparateur', 'Fatou Ndiaye', 'PREPARATEUR', 1],
  ['vendeuse', 'Aminata Ba', 'VENDEUR', 1],
  ['vendeur', 'Cheikh Gueye', 'VENDEUR', 1],
  ['caissier', 'Ibrahima Sow', 'CAISSIER', 1],
  ['caissiere', 'Mariama Diallo', 'CAISSIER', 1],
  ['ancien', 'Compte désactivé', 'CAISSIER', 0],
];
const TABLES = [
  'audit',
  'retour_allocations',
  'retour_lignes',
  'retours',
  'commande_paiements',
  'commande_modifications',
  'commande_allocations',
  'commande_lignes',
  'commandes',
  'clotures',
  'patients',
  'assurances',
  'lots',
  'medicaments',
  'users',
  // anciennes tables (version précédente du cours)
  'vente_allocations',
  'vente_lignes',
  'ventes',
];

/**
 * Migrations : faire évoluer une base EXISTANTE sans perdre ses données.
 * (CREATE TABLE IF NOT EXISTS ne modifie pas une table déjà créée.)
 * Chaque étape est idempotente : on peut relancer db:init sans risque.
 */
async function colonneExiste(conn, table, colonne) {
  const [[{ n }]] = await conn.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, colonne],
  );
  return n > 0;
}

async function migrer(conn) {
  // Fiche patient et clôture de caisse : nouvelles colonnes sur commandes
  if (!(await colonneExiste(conn, 'commandes', 'patient_id'))) {
    await conn.query(
      `ALTER TABLE commandes ADD COLUMN patient_id INT UNSIGNED NULL AFTER statut,
       ADD CONSTRAINT fk_cmd_patient FOREIGN KEY (patient_id) REFERENCES patients(id)`,
    );
  }
  if (!(await colonneExiste(conn, 'commandes', 'cloture_id'))) {
    await conn.query(
      `ALTER TABLE commandes ADD COLUMN cloture_id INT UNSIGNED NULL AFTER monnaie_rendue,
       ADD CONSTRAINT fk_cmd_cloture FOREIGN KEY (cloture_id) REFERENCES clotures(id)`,
    );
  }

  // Paiement mixte : nouvelle valeur MIXTE pour commandes.mode_paiement
  await conn.query(
    `ALTER TABLE commandes MODIFY mode_paiement ENUM('ESPECES','WAVE','ORANGE_MONEY','CARTE','MIXTE') NULL`,
  );
  // Les commandes payées AVANT le paiement mixte reçoivent leur ligne de détail
  await conn.query(
    `INSERT INTO commande_paiements (commande_id, mode, montant)
     SELECT c.id, c.mode_paiement, c.part_patient FROM commandes c
     WHERE c.mode_paiement IS NOT NULL AND c.mode_paiement <> 'MIXTE' AND c.part_patient > 0
       AND NOT EXISTS (SELECT 1 FROM commande_paiements p WHERE p.commande_id = c.id)`,
  );
}

// 1. Création de la base si besoin (connexion sans base sélectionnée)
const admin = await mysql.createConnection({ ...config.db, database: undefined });
await admin.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4`);
await admin.end();

// 2. Tables + données
const conn = await mysql.createConnection({ ...connectionOptions, multipleStatements: true });
try {
  if (RESET) {
    console.log('🗑  Suppression des tables…');
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query(`DROP TABLE IF EXISTS ${TABLES.map((t) => `\`${t}\``).join(', ')}`);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  const schema = await fs.readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await conn.query(schema);
  await migrer(conn);
  console.log('✅ Tables prêtes');

  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM users');
  if (n > 0) {
    console.log('ℹ️  Données déjà présentes (npm run db:reset pour repartir de zéro)');
  } else {
    await conn.beginTransaction();
    await seed(conn);
    await conn.commit();
    printAccounts();
  }
} catch (err) {
  await conn.rollback().catch(() => {});
  console.error('❌', err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}

async function seed(conn) {
  const today = todayIso();

  // --- Comptes (mot de passe haché, identique pour tous en démo) -------------
  const hash = await bcrypt.hash('demo123', 10);
  await conn.query('INSERT INTO users (login, nom, role, actif, password_hash) VALUES ?', [
    ACCOUNTS.map(([login, nom, role, actif]) => [login, nom, role, actif, hash]),
  ]);
  const [users] = await conn.query('SELECT id, login, nom, role, actif FROM users');
  const u = Object.fromEntries(users.map((x) => [x.login, x]));

  // --- Assurances ---------------------------------------------------------------
  await conn.query('INSERT INTO assurances (nom, taux_couverture, actif) VALUES ?', [[
    ['IPM Santé Plus', 80, 1],
    ['Mutuelle Teranga', 70, 1],
    ['Assurance Santé Horizon', 100, 1],
    ['Mutuelle des Enseignants', 50, 1],
    ['Ancienne Mutuelle (résiliée)', 60, 0],
  ]]);
  const [assurances] = await conn.query('SELECT id, nom FROM assurances');
  const a = Object.fromEntries(assurances.map((x) => [x.nom, x.id]));

  // --- Médicaments ---------------------------------------------------------------
  await conn.query(
    'INSERT INTO medicaments (code, nom, dci, forme, prix_vente, seuil_alerte, ordonnance) VALUES ?',
    [[
      ['3400930000011', 'Paracétamol 500 mg', 'Paracétamol', 'Comprimé', 1000, 50, 0],
      ['3400930000028', 'Amoxicilline 500 mg', 'Amoxicilline', 'Gélule', 2500, 20, 1],
      ['3400930000035', 'Ibuprofène 400 mg', 'Ibuprofène', 'Comprimé', 1500, 30, 0],
      ['3400930000042', 'Artéméther/Luméfantrine 20/120', 'Artéméther + Luméfantrine', 'Comprimé', 3500, 20, 1],
      ['3400930000059', 'Metformine 850 mg', 'Metformine', 'Comprimé', 2000, 15, 1],
      ['3400930000066', 'Sérum physiologique 0,9 %', 'Chlorure de sodium', 'Unidose', 1200, 20, 0],
      ['3400930000073', 'Oméprazole 20 mg', 'Oméprazole', 'Gélule', 2200, 15, 1],
      ['3400930000080', 'Vitamine C 500 mg', 'Acide ascorbique', 'Comprimé', 800, 25, 0],
      ['3400930000097', 'Salbutamol 100 µg', 'Salbutamol', 'Inhalateur', 4500, 10, 1],
      ['3400930000103', 'Ciprofloxacine 500 mg', 'Ciprofloxacine', 'Comprimé', 3000, 10, 1],
      ['3400930000110', 'Loratadine 10 mg', 'Loratadine', 'Comprimé', 1300, 15, 0],
      ['3400930000127', 'Amlodipine 5 mg', 'Amlodipine', 'Comprimé', 2800, 15, 1],
      ['3400930000134', 'Diosmectite 3 g', 'Diosmectite', 'Sachet', 1800, 20, 0],
    ]],
  );
  const [meds] = await conn.query('SELECT id, nom FROM medicaments');
  const m = (debut) => meds.find((x) => x.nom.startsWith(debut)).id;

  // --- Lots (dates relatives à aujourd'hui) ----------------------------------------
  const reception = addDays(today, -30);
  const lot = (med, numero, qte, jours) => [m(med), numero, qte, addDays(today, jours), reception];
  await conn.query(
    'INSERT INTO lots (medicament_id, numero_lot, quantite, date_peremption, date_reception) VALUES ?',
    [[
      lot('Paracétamol', 'PAR-2401', 40, 45), // périme bientôt → sort en premier (FEFO)
      lot('Paracétamol', 'PAR-2405', 120, 400),
      lot('Amoxicilline', 'AMX-2402', 40, 300),
      lot('Ibuprofène', 'IBU-2311', 10, -5), // PÉRIMÉ : non vendable
      lot('Ibuprofène', 'IBU-2406', 20, 250), // sous le seuil
      lot('Artéméther', 'ART-2403', 60, 500),
      lot('Metformine', 'MET-2404', 12, 200), // sous le seuil
      lot('Sérum', 'SER-2407', 80, 60),
      lot('Oméprazole', 'OME-2402', 25, 365),
      lot('Vitamine C', 'VIT-2405', 100, 600),
      // Salbutamol : aucun lot → RUPTURE
      lot('Ciprofloxacine', 'CIP-2408', 30, 420),
      lot('Loratadine', 'LOR-2409', 45, 80),
      lot('Amlodipine', 'AML-2410', 50, 540),
      lot('Diosmectite', 'DIO-2411', 35, 330),
    ]],
  );

  // --- Patients -------------------------------------------------------------------------
  await conn.query('INSERT INTO patients (nom, telephone, assurance_id, numero_assure) VALUES ?', [[
    ['Khady Sarr', '771234567', a['IPM Santé Plus'], 'IPM-558821'],
    ['Alioune Ndao', '776543210', null, null],
    ['Ousmane Diagne', '781112233', a['Mutuelle Teranga'], 'MT-20931'],
    ['Ndeye Fatou Mbaye', '709998877', a['Assurance Santé Horizon'], 'ASH-77120'],
    ['Mame Diarra Fall', '765554433', a['Mutuelle des Enseignants'], 'MDE-4410'],
  ]]);
  const [patients] = await conn.query('SELECT id, nom FROM patients');
  const p = (nom) => patients.find((x) => x.nom === nom).id;

  // --- Commandes de test : tous les cas du circuit -----------------------------------
  const ligne = (debut, quantite) => ({ medicamentId: m(debut), quantite });

  // --- Historique : 13 jours de ventes passées (graphiques, réappro, clôtures, bordereaux) ---
  await seedHistorique(conn, { u, a, m, p, ligne, today });

  // 1. Sans ordonnance, payée en espèces
  const c1 = await creerCommande(conn, u.vendeuse, { lignes: [ligne('Paracétamol', 2), ligne('Vitamine C', 1)] });
  await encaisserCommande(conn, u.caissier, c1.id, { paiements: [{ mode: 'ESPECES', montant: 5000 }] });

  // 2. Ordonnance + assurance 80 % (part patient 1 300 F)
  const c2 = await creerCommande(conn, u.vendeuse, {
    lignes: [ligne('Amoxicilline', 2), ligne('Ibuprofène', 1)],
    patientId: p('Khady Sarr'),
    ordonnanceRef: 'ORD-2026-0142',
    assuranceId: a['IPM Santé Plus'],
    numeroAssure: 'IPM-558821',
  });
  // 2 bis. PAIEMENT MIXTE : 1 000 F sur Wave, le reste (300 F) en espèces, 500 F reçus
  await encaisserCommande(conn, u.caissiere, c2.id, {
    paiements: [
      { mode: 'WAVE', montant: 1000 },
      { mode: 'ESPECES', montant: 500 },
    ],
  });

  // 3. Ordonnance sans assurance, payée par Orange Money
  const c3 = await creerCommande(conn, u.vendeur, {
    lignes: [ligne('Oméprazole', 1)],
    patientId: p('Alioune Ndao'),
    ordonnanceRef: 'ORD-2026-0139',
  });
  await encaisserCommande(conn, u.caissier, c3.id, { paiements: [{ mode: 'ORANGE_MONEY', montant: 2200 }] });

  // 4. EN ATTENTE : ordonnance + mutuelle 70 %
  await creerCommande(conn, u.vendeur, {
    lignes: [ligne('Artéméther', 1), ligne('Paracétamol', 1)],
    patientId: p('Ousmane Diagne'),
    ordonnanceRef: 'ORD-2026-0143',
    assuranceId: a['Mutuelle Teranga'],
    numeroAssure: 'MT-20931',
  });

  // 5. EN ATTENTE : sans ordonnance, CORRIGÉE à la caisse (exemple de traçabilité)
  const c5 = await creerCommande(conn, u.vendeuse, { lignes: [ligne('Paracétamol', 3), ligne('Diosmectite', 2)] });
  await modifierCommande(conn, u.caissiere, c5.id, {
    lignes: [ligne('Paracétamol', 2), ligne('Diosmectite', 2)],
    motif: 'Le patient ne prend que 2 boîtes de paracétamol',
  });

  // 6. EN ATTENTE : prise en charge à 100 % (le patient ne paie rien)
  await creerCommande(conn, u.pharmacien, {
    lignes: [ligne('Metformine', 2), ligne('Amlodipine', 1)],
    patientId: p('Ndeye Fatou Mbaye'),
    ordonnanceRef: 'ORD-2026-0144',
    assuranceId: a['Assurance Santé Horizon'],
    numeroAssure: 'ASH-77120',
  });

  // 7. ANNULÉE par la vendeuse elle-même (commande en attente → autorisé)
  const c7 = await creerCommande(conn, u.vendeuse, { lignes: [ligne('Sérum', 2)] });
  await annulerCommande(conn, u.vendeuse, c7.id, 'Client parti sans payer');

  // 8. RETOUR : 1 Vitamine C rapportée sur la commande 1 → avoir de 800 F en espèces
  const [[ligneVitC]] = await conn.query(
    "SELECT id FROM commande_lignes WHERE commande_id = ? AND nom LIKE 'Vitamine C%'",
    [c1.id],
  );
  await enregistrerRetour(conn, u.caissier, c1.id, {
    lignes: [{ ligneId: ligneVitC.id, quantite: 1 }],
    motif: 'Doublon : le patient en avait déjà',
    modeRemboursement: 'ESPECES',
    remettreEnStock: true,
  });

  // 9. CLÔTURE de la caissière : 300 F d'espèces attendus (commande 2), 300 comptés → caisse juste
  await cloturerCaisse(conn, u.caissiere, { especesComptees: 300, commentaire: 'Fin de service du matin' });
}

/**
 * 13 jours d'activité passée, créés par les VRAIS services (comme le reste des données),
 * puis « antidatés ». Chaque soir, le caissier clôture sa caisse (un soir, il manque 500 F).
 * Les ventes passées puisent dans des lots dédiés, entièrement vendus : le stock du jour
 * (alertes, ruptures) reste celui décrit plus haut.
 */
async function seedHistorique(conn, { u, a, m, p, ligne, today }) {
  const PANIERS = [
    [[['Paracétamol', 2], ['Vitamine C', 1]], {}],
    [[['Amoxicilline', 1], ['Paracétamol', 1]], { patient: 'Khady Sarr', assurance: 'IPM Santé Plus', numero: 'IPM-558821', ordonnance: 'ORD-H-' }],
    [[['Sérum', 3]], {}],
    [[['Loratadine', 1], ['Vitamine C', 2]], {}],
    [[['Artéméther', 1]], { patient: 'Mame Diarra Fall', assurance: 'Mutuelle des Enseignants', numero: 'MDE-4410', ordonnance: 'ORD-H-' }],
    [[['Diosmectite', 2], ['Paracétamol', 1]], {}],
    [[['Ciprofloxacine', 1]], { patient: 'Alioune Ndao', ordonnance: 'ORD-H-' }],
    [[['Amlodipine', 1]], { patient: 'Ousmane Diagne', assurance: 'Mutuelle Teranga', numero: 'MT-20931', ordonnance: 'ORD-H-' }],
    [[['Paracétamol', 3]], {}],
  ];
  const MODES_HISTO = ['ESPECES', 'WAVE', 'ORANGE_MONEY', 'ESPECES', 'CARTE'];

  // 1. Le plan des ventes (déterministe : mêmes données à chaque db:reset)
  const plan = [];
  for (let jour = 13; jour >= 1; jour--) {
    const nb = 2 + ((jour * 7) % 3);
    for (let k = 0; k < nb; k++) {
      plan.push({ jour, k, panier: PANIERS[(jour * 3 + k) % PANIERS.length], mode: MODES_HISTO[(jour + k) % MODES_HISTO.length] });
    }
  }

  // 2. Lots dédiés à l'historique : exactement la quantité vendue, péremption la plus proche (FEFO → servis en premier)
  const besoins = {};
  for (const { panier } of plan) for (const [nom, q] of panier[0]) besoins[nom] = (besoins[nom] ?? 0) + q;
  await conn.query('INSERT INTO lots (medicament_id, numero_lot, quantite, date_peremption, date_reception) VALUES ?', [
    Object.entries(besoins).map(([nom, q]) => [m(nom), `${nom.slice(0, 3).toUpperCase()}-HIST`, q, addDays(today, 20), addDays(today, -60)]),
  ]);

  // 3. Ventes jour par jour, clôture chaque soir, puis on antidate
  for (let jour = 13; jour >= 1; jour--) {
    const date = addDays(today, -jour);
    const [[{ auditMax }]] = await conn.query('SELECT COALESCE(MAX(id), 0) AS auditMax FROM audit');

    for (const { k, panier, mode } of plan.filter((x) => x.jour === jour)) {
      const [lignes, o] = panier;
      const c = await creerCommande(conn, k % 2 ? u.vendeur : u.vendeuse, {
        lignes: lignes.map(([nom, q]) => ligne(nom, q)),
        patientId: o.patient ? p(o.patient) : null,
        ordonnanceRef: o.ordonnance ? `${o.ordonnance}${String(jour).padStart(2, '0')}${k}` : null,
        assuranceId: o.assurance ? a[o.assurance] : null,
        numeroAssure: o.numero ?? null,
      });
      const montant = mode === 'ESPECES' ? Math.ceil(c.partPatient / 1000) * 1000 : c.partPatient;
      await encaisserCommande(conn, u.caissier, c.id, { paiements: c.partPatient ? [{ mode, montant }] : [] });
      const heure = `${String(9 + k * 2).padStart(2, '0')}:${String(10 + jour).padStart(2, '0')}:00`;
      await conn.query(
        'UPDATE commandes SET created_at = ?, paye_le = ? + INTERVAL 4 MINUTE WHERE id = ?',
        [`${date} ${heure}`, `${date} ${heure}`, c.id],
      );
    }

    const z = calculerCloture(await etatCaisse(conn, u.caissier.id));
    const manque = jour === 4 && z.especesAttendues >= 500 ? 500 : 0;
    const cloture = await cloturerCaisse(conn, u.caissier, {
      especesComptees: z.especesAttendues - manque,
      commentaire: manque ? 'Écart constaté : un billet de 500 F introuvable' : null,
    });
    await conn.query('UPDATE clotures SET date = ? WHERE id = ?', [`${date} 19:30:00`, cloture.id]);
    await conn.query('UPDATE audit SET date = ? WHERE id > ?', [`${date} 19:30:00`, auditMax]);
  }
}

function printAccounts() {
  console.log('✅ Données de test insérées. Comptes (mot de passe : demo123) :');
  console.table(ACCOUNTS.map(([login, nom, role, actif]) => ({ login, nom, role, actif: actif ? 'oui' : 'NON' })));
}
