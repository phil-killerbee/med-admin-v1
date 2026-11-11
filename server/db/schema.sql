-- ============================================================================
-- Schéma MySQL de PharmaCours (base : mediciel-test)
-- Bonnes pratiques illustrées :
--   * clés étrangères (intégrité référentielle)
--   * contraintes UNIQUE / CHECK (la base protège aussi les règles métier)
--   * montants en entiers (FCFA, pas de centimes → pas d'erreurs d'arrondi)
--   * mots de passe HACHÉS (bcrypt), jamais en clair
--   * historique conservé : on n'efface pas une commande, on change son statut
--   * valeurs "figées" au moment de l'opération (prix, taux d'assurance…)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  login         VARCHAR(30)  NOT NULL UNIQUE,
  nom           VARCHAR(100) NOT NULL,
  role          ENUM('ADMIN','PHARMACIEN','PREPARATEUR','VENDEUR','CAISSIER') NOT NULL,
  actif         TINYINT(1)   NOT NULL DEFAULT 1,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS medicaments (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(13)  NOT NULL UNIQUE,
  nom          VARCHAR(150) NOT NULL,
  dci          VARCHAR(150) NOT NULL,
  forme        VARCHAR(50)  NOT NULL DEFAULT '',
  prix_vente   INT UNSIGNED NOT NULL,
  seuil_alerte INT UNSIGNED NOT NULL DEFAULT 0,
  ordonnance   TINYINT(1)   NOT NULL DEFAULT 0,
  CONSTRAINT chk_prix_positif CHECK (prix_vente > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lots (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  medicament_id   INT UNSIGNED NOT NULL,
  numero_lot      VARCHAR(50)  NOT NULL,
  quantite        INT UNSIGNED NOT NULL,           -- UNSIGNED : un stock ne peut pas être négatif
  date_peremption DATE         NOT NULL,
  date_reception  DATE         NOT NULL,
  CONSTRAINT fk_lot_medicament FOREIGN KEY (medicament_id) REFERENCES medicaments(id),
  INDEX idx_lot_fefo (medicament_id, date_peremption)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Organismes de prise en charge (IPM, mutuelles, assurances privées…)
CREATE TABLE IF NOT EXISTS assurances (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nom             VARCHAR(100) NOT NULL UNIQUE,
  taux_couverture TINYINT UNSIGNED NOT NULL,       -- % payé par l'assurance
  actif           TINYINT(1)   NOT NULL DEFAULT 1,
  CONSTRAINT chk_taux CHECK (taux_couverture BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Fiche patient (facultative) : historique, assurance enregistrée une fois pour toutes.
CREATE TABLE IF NOT EXISTS patients (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nom           VARCHAR(100) NOT NULL,
  telephone     VARCHAR(20)  NULL,
  assurance_id  INT UNSIGNED NULL,
  numero_assure VARCHAR(50)  NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_patient_assurance FOREIGN KEY (assurance_id) REFERENCES assurances(id),
  INDEX idx_patient_nom (nom),
  INDEX idx_patient_tel (telephone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Clôture de caisse (« Z ») : ce que le caissier a compté en fin de service.
-- Les montants théoriques sont FIGÉS ici ; encaissements et avoirs pointent vers leur clôture.
CREATE TABLE IF NOT EXISTS clotures (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  caissier_id      INT UNSIGNED NOT NULL,
  date             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  nb_commandes     INT UNSIGNED NOT NULL,
  nb_retours       INT UNSIGNED NOT NULL,
  detail           JSON         NOT NULL,          -- par moyen : encaissé, remboursé, net
  total_net        INT          NOT NULL,
  especes_attendues INT         NOT NULL,
  especes_comptees INT UNSIGNED NOT NULL,
  ecart            INT          NOT NULL,          -- compté − attendu (négatif = manque)
  commentaire      VARCHAR(255) NULL,
  CONSTRAINT fk_cloture_caissier FOREIGN KEY (caissier_id) REFERENCES users(id),
  INDEX idx_cloture_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Une commande est créée au comptoir (vendeuse), puis encaissée à la caisse.
CREATE TABLE IF NOT EXISTS commandes (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  vendeur_id       INT UNSIGNED NOT NULL,
  statut           ENUM('EN_ATTENTE','PAYEE','ANNULEE') NOT NULL DEFAULT 'EN_ATTENTE',

  -- Patient / ordonnance / assurance
  patient_id       INT UNSIGNED NULL,                 -- fiche patient (facultative)
  patient_nom      VARCHAR(100) NULL,
  ordonnance_ref   VARCHAR(50)  NULL,
  assurance_id     INT UNSIGNED NULL,
  numero_assure    VARCHAR(50)  NULL,
  taux_couverture  TINYINT UNSIGNED NOT NULL DEFAULT 0, -- figé au moment de la commande

  -- Montants (FCFA)
  total            INT UNSIGNED NOT NULL,
  part_assurance   INT UNSIGNED NOT NULL DEFAULT 0,
  part_patient     INT UNSIGNED NOT NULL,

  -- Encaissement
  caissier_id      INT UNSIGNED NULL,
  paye_le          DATETIME     NULL,
  mode_paiement    ENUM('ESPECES','WAVE','ORANGE_MONEY','CARTE','MIXTE') NULL, -- MIXTE : détail dans commande_paiements
  montant_recu     INT UNSIGNED NULL,                 -- total reçu (tous moyens confondus)
  monnaie_rendue   INT UNSIGNED NULL,                 -- toujours rendue en espèces
  cloture_id       INT UNSIGNED NULL,                 -- clôture de caisse qui inclut cet encaissement

  -- Annulation
  annule_par       INT UNSIGNED NULL,
  annule_le        DATETIME     NULL,
  motif_annulation VARCHAR(255) NULL,

  CONSTRAINT fk_cmd_vendeur   FOREIGN KEY (vendeur_id)   REFERENCES users(id),
  CONSTRAINT fk_cmd_caissier  FOREIGN KEY (caissier_id)  REFERENCES users(id),
  CONSTRAINT fk_cmd_annuleur  FOREIGN KEY (annule_par)   REFERENCES users(id),
  CONSTRAINT fk_cmd_assurance FOREIGN KEY (assurance_id) REFERENCES assurances(id),
  CONSTRAINT fk_cmd_patient   FOREIGN KEY (patient_id)   REFERENCES patients(id),
  CONSTRAINT fk_cmd_cloture   FOREIGN KEY (cloture_id)   REFERENCES clotures(id),
  CONSTRAINT chk_parts CHECK (part_assurance + part_patient = total),
  INDEX idx_cmd_statut (statut, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS commande_lignes (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  commande_id   INT UNSIGNED NOT NULL,
  medicament_id INT UNSIGNED NOT NULL,
  nom           VARCHAR(150) NOT NULL,             -- copie : le nom au moment de la commande
  quantite      INT UNSIGNED NOT NULL,
  prix_unitaire INT UNSIGNED NOT NULL,             -- copie : le prix au moment de la commande
  CONSTRAINT fk_ligne_commande FOREIGN KEY (commande_id) REFERENCES commandes(id),
  CONSTRAINT fk_ligne_medicament FOREIGN KEY (medicament_id) REFERENCES medicaments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Traçabilité : quel lot a servi pour quelle ligne
CREATE TABLE IF NOT EXISTS commande_allocations (
  id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ligne_id INT UNSIGNED NOT NULL,
  lot_id   INT UNSIGNED NOT NULL,
  quantite INT UNSIGNED NOT NULL,
  CONSTRAINT fk_alloc_ligne FOREIGN KEY (ligne_id) REFERENCES commande_lignes(id),
  CONSTRAINT fk_alloc_lot FOREIGN KEY (lot_id) REFERENCES lots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Historique des modifications d'une commande (faites à la caisse).
-- On garde l'état COMPLET avant et après (JSON) : on peut toujours prouver ce qui a changé.
-- Table en ajout seul : on n'y fait jamais d'UPDATE ni de DELETE.
CREATE TABLE IF NOT EXISTS commande_modifications (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  commande_id INT UNSIGNED NOT NULL,
  date        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id     INT UNSIGNED NOT NULL,
  user_nom    VARCHAR(100) NOT NULL,
  role        VARCHAR(20)  NOT NULL,
  motif       VARCHAR(255) NOT NULL,
  resume      VARCHAR(1000) NOT NULL,
  avant       JSON         NOT NULL,
  apres       JSON         NOT NULL,
  CONSTRAINT fk_modif_commande FOREIGN KEY (commande_id) REFERENCES commandes(id),
  CONSTRAINT fk_modif_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_modif_commande (commande_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Détail de l'encaissement : une ligne par moyen de paiement (paiement mixte possible).
-- montant = somme affectée à la commande par ce moyen ; la somme des lignes = part_patient.
CREATE TABLE IF NOT EXISTS commande_paiements (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  commande_id INT UNSIGNED NOT NULL,
  mode        ENUM('ESPECES','WAVE','ORANGE_MONEY','CARTE') NOT NULL,
  montant     INT UNSIGNED NOT NULL,
  CONSTRAINT fk_paiement_commande FOREIGN KEY (commande_id) REFERENCES commandes(id),
  CONSTRAINT uq_paiement_mode UNIQUE (commande_id, mode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Retour produit / avoir sur une commande PAYÉE.
-- On ne modifie pas la commande d'origine : on enregistre une opération inverse, tracée.
CREATE TABLE IF NOT EXISTS retours (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  commande_id        INT UNSIGNED NOT NULL,
  date               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id            INT UNSIGNED NOT NULL,         -- qui a remboursé (sa caisse)
  motif              VARCHAR(255) NOT NULL,
  montant            INT UNSIGNED NOT NULL,         -- valeur des produits rendus
  part_assurance     INT UNSIGNED NOT NULL,         -- à déduire du bordereau de l'assurance
  part_patient       INT UNSIGNED NOT NULL,         -- rendu au patient
  mode_remboursement ENUM('ESPECES','WAVE','ORANGE_MONEY','CARTE') NULL,
  remis_en_stock     TINYINT(1)   NOT NULL,
  cloture_id         INT UNSIGNED NULL,
  CONSTRAINT fk_retour_commande FOREIGN KEY (commande_id) REFERENCES commandes(id),
  CONSTRAINT fk_retour_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_retour_cloture FOREIGN KEY (cloture_id) REFERENCES clotures(id),
  CONSTRAINT chk_retour_parts CHECK (part_assurance + part_patient = montant)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS retour_lignes (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  retour_id INT UNSIGNED NOT NULL,
  ligne_id  INT UNSIGNED NOT NULL,                 -- ligne de la commande d'origine
  quantite  INT UNSIGNED NOT NULL,
  CONSTRAINT fk_rl_retour FOREIGN KEY (retour_id) REFERENCES retours(id),
  CONSTRAINT fk_rl_ligne FOREIGN KEY (ligne_id) REFERENCES commande_lignes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Traçabilité : dans quel lot chaque boîte rendue a été remise en stock
CREATE TABLE IF NOT EXISTS retour_allocations (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  retour_ligne_id INT UNSIGNED NOT NULL,
  lot_id          INT UNSIGNED NOT NULL,
  quantite        INT UNSIGNED NOT NULL,
  CONSTRAINT fk_ra_ligne FOREIGN KEY (retour_ligne_id) REFERENCES retour_lignes(id),
  CONSTRAINT fk_ra_lot FOREIGN KEY (lot_id) REFERENCES lots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit (
  id       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  date     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id  INT UNSIGNED NOT NULL,
  user_nom VARCHAR(100) NOT NULL,                  -- copie : historique fidèle même si l'utilisateur change
  role     VARCHAR(20)  NOT NULL,
  action   VARCHAR(50)  NOT NULL,
  details  VARCHAR(500) NOT NULL DEFAULT '',
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_audit_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
