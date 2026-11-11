# PharmaCours — Logiciel de pharmacie en React + Node + MySQL (support de cours)

Application pédagogique de gestion d'officine : comptoir (commandes), caisse (encaissement),
assurances / tiers payant, catalogue, stock par lots (FEFO), utilisateurs et journal d'audit.
L'objectif est d'illustrer les **bonnes pratiques React** et une **gestion des rôles (RBAC)** propre,
appliquée à la fois dans l'interface et dans l'API.

## Prérequis

- Node.js 22 ou plus
- WAMP démarré (MySQL sur le port 3306), base **`mediciel-test`**

## Démarrage

```bash
npm install
cp server/.env.example server/.env   # puis renseigner JWT_SECRET (et DB_PASSWORD si besoin)
npm run db:init                       # crée les tables + données de test
npm run dev                           # API (port 3001) + interface (http://localhost:5173)
```

| Commande | Rôle |
|---|---|
| `npm run dev` | Lance l'API et le front ensemble |
| `npm run dev:reseau` | Idem, mais l'interface est accessible aux autres postes du réseau (voir ci-dessous) |
| `npm run db:init` | Crée les tables manquantes, applique les **migrations** (sans perte de données) et insère les données de test si la base est vide |
| `npm run db:reset` | ⚠️ **Supprime** toutes les tables puis recrée la base de test |
| `npm test` | Tests unitaires (règles métier, permissions, panier) |

### En réseau (salle de cours, comptoir + caisse sur deux PC)

```bash
npm run dev:reseau
```

Vite affiche une ligne `Network: http://192.168.x.x:5173/` : c'est l'adresse à ouvrir sur les autres postes
(même Wi-Fi / réseau local). Au premier lancement, autoriser Node.js dans le **pare-feu Windows** (réseau privé).

- Seule l'interface (port 5173) est exposée ; l'API (3001) et MySQL n'écoutent que la machine locale,
  le réseau passe par le proxy Vite.
- Le proxy transmet l'IP réelle de chaque poste (`X-Forwarded-For` + `trust proxy`) : la limite de
  10 tentatives de connexion s'applique par poste, pas à toute la classe.

## Comptes de test (mot de passe `demo123`)

| Identifiant | Nom | Rôle |
|---|---|---|
| `admin` | Awa Diop | Administrateur |
| `pharmacien` | Dr Moussa Fall | Pharmacien |
| `preparateur` | Fatou Ndiaye | Préparateur |
| `vendeuse` | Aminata Ba | Vendeur |
| `vendeur` | Cheikh Gueye | Vendeur |
| `caissier` | Ibrahima Sow | Caissier |
| `caissiere` | Mariama Diallo | Caissier |
| `ancien` | — | Caissier **désactivé** (connexion refusée) |

Données de test : 13 médicaments (dont un en rupture, un lot périmé, des stocks bas),
5 assurances (dont une résiliée), 5 fiches patients, et :
- **13 jours d'activité passée** (≈ 40 commandes, créées par les vrais services puis antidatées) avec
  une clôture de caisse chaque soir — dont une avec un **manque de 500 F** : les graphiques, le
  réapprovisionnement et les bordereaux ont de quoi afficher ;
- **aujourd'hui** : 7 commandes couvrant tous les cas (payées en espèces / Wave + espèces / Orange Money,
  en attente avec ou sans assurance, prise en charge à 100 %, modifiée en caisse, annulée), un **retour**
  (avoir de 800 F) et une clôture de la caissière.

> Base créée avant cette version ? `npm run db:init` ajoute les nouvelles tables **sans rien effacer**,
> mais n'ajoute pas les nouvelles données de test. Pour les avoir : `npm run db:reset` (⚠️ efface tout).

## Le circuit d'une commande

```
 COMPTOIR (vendeuse)                  CAISSE (caissier)
 ───────────────────                  ─────────────────
 1. compose la commande               3. voit la file d'attente
 2. patient / ordonnance /            4. sélectionne la commande
    assurance                         5. (si besoin) la MODIFIE — tracé
    → stock RÉSERVÉ (FEFO)            6. choisit le(s) mode(s) de paiement
    → statut EN_ATTENTE               7. valide et encaisse la PART PATIENT
                                         → statut PAYEE
                                      8. imprime le ticket de caisse
```

**Chacun son poste** : la vendeuse voit le **Comptoir** et l'**historique de ses propres commandes**
(`commande:read:own`, filtré en SQL : jamais celles des collègues) ; le caissier voit la **Caisse** et l'**historique des commandes qu'il a encaissées** (plus la file d'attente complète avec le filtre « En attente »).
À la connexion, chacun arrive directement sur son poste ; toute autre page renvoie une erreur 403
(et l'API refuse aussi les appels correspondants).

**Modification en caisse (traçabilité)** : tant que la commande n'est pas payée, le caissier peut
changer les quantités, retirer ou ajouter des produits, et corriger patient / ordonnance / assurance.
- **Motif obligatoire** ;
- l'état **complet avant et après** (lignes, lots, montants, assurance) est stocké en JSON dans
  `commande_modifications`, une table où l'on n'efface et ne modifie jamais rien ;
- un résumé lisible (« Paracétamol : 3 → 2 ; Ajout Vitamine C × 1 ; Part patient : 6 600 F → 6 400 F »)
  est affiché dans l'historique de la commande et écrit dans le journal d'audit ;
- le caissier peut **réduire ou retirer** un médicament sur ordonnance, mais pas en **ajouter ou augmenter**
  (réservé à ceux qui ont `ordonnance:delivrer`) ;
- les lignes déjà présentes gardent leur prix d'origine, et l'assurance garde son taux d'origine.

**Paiement mixte** : en cochant « Paiement mixte », le caissier combine plusieurs moyens
(ex. : 3 000 F sur Orange Money + le reste en espèces). Wave, Orange Money et carte sont payés au montant
**exact** ; les espèces couvrent le reste et c'est sur elles qu'est rendue la monnaie. La règle
(`calculerPaiement`) est une fonction pure partagée : l'aperçu à l'écran et la décision du serveur sont identiques.
Le détail est stocké dans `commande_paiements` (une ligne par moyen, somme = part patient) et la commande
porte le mode `MIXTE`.

**Ticket de caisse** : après le paiement, le ticket s'affiche dans la caisse avec un bouton « Imprimer »
(format 80 mm, seul le ticket est imprimé grâce à `@media print`). Depuis l'historique *Commandes*,
le bouton « Ticket » réimprime une commande payée, marquée **DUPLICATA**. Les coordonnées de la pharmacie
sont dans `src/config/officine.js`.

**Patient & ordonnance** : le nom du patient et la référence d'ordonnance sont **facultatifs**, même
pour un médicament sur ordonnance ou une prise en charge par l'assurance.

**Assurance (tiers payant)** : si le patient présente une carte d'assuré, la vendeuse coche
« Patient assuré », choisit l'organisme et saisit le **n° d'assuré** (seul champ exigé : il sert à facturer l'assurance). Exemple avec une IPM à 80 % sur 5 000 FCFA :
l'assurance paie 4 000, le patient paie 1 000 à la caisse. Le taux est **figé** dans la commande :
s'il change demain, les commandes passées ne bougent pas.

**Annulation** : la vendeuse peut annuler *sa* commande tant qu'elle n'est pas payée ; le pharmacien
peut annuler n'importe quelle commande, même payée. Le stock retourne dans les lots d'origine.
Une commande qui a déjà eu un retour ne s'annule plus : on fait un retour du reste.

## Après la vente

**Retour / avoir** (menu *Commandes*, bouton « Retour » sur une commande payée) : le patient rapporte
tout ou partie de ses produits.
- On choisit les quantités (jamais plus que ce qui reste), un **motif** obligatoire et le mode de remboursement ;
- le patient récupère **sa part** ; la part de l'assurance est retirée du **bordereau** ;
- les boîtes reviennent **dans les lots d'où elles sont sorties** (case à décocher si le produit est abîmé) ;
- la commande d'origine n'est pas modifiée : le retour est une **opération inverse tracée**
  (`retours`, `retour_lignes`, `retour_allocations`, journal d'audit), avec un ticket d'avoir à faire signer.
- Règle de propriété (`canRetourCommande`) : un caissier ne traite que **ses** encaissements ; le pharmacien, tous.
- Arrondis : la répartition assurance / patient est calculée sur le **cumul** des retours, donc rendre une
  commande en plusieurs fois rend exactement les montants d'origine (testé).

**Clôture de caisse** (menu *Clôture*) : en fin de service, le caissier compte son tiroir.
- Le logiciel affiche, par moyen de paiement, ce qui a été encaissé et remboursé **depuis sa dernière clôture**,
  et donc les **espèces attendues** ;
- le caissier saisit les espèces comptées → l'**écart** (« Caisse juste », « Manque de 500 F »…) est calculé,
  **figé** et imprimé sur le ticket « Z » à signer ;
- chaque encaissement et chaque avoir est rattaché à **une seule** clôture (`cloture_id`), sous verrou
  (`FOR UPDATE`) : rien ne peut être compté deux fois ni oublié.

**Bordereaux assurances** (menu *Bordereaux*, admin et pharmacien) : pour un mois donné, la liste des
ordonnances prises en charge par chaque assurance, retours déduits, avec le total à facturer et une
version imprimable à envoyer.

**Réapprovisionnement** (menu *Réappro*) : stock vendable, seuil, ventes des 30 derniers jours, lots proches
de la péremption ou périmés, et une **quantité proposée** : on commande quand le stock est au seuil ou ne couvre
plus 15 jours de ventes, de quoi tenir 30 jours + le seuil (règle pure `quantiteAReapprovisionner`, testée).
Les quantités sont modifiables avant d'imprimer le **bon de commande**.

**Fiches patients** (menu *Patients*, et au comptoir) : facultatives — on peut toujours vendre sans fiche.
Au comptoir, taper le nom ou le téléphone propose les fiches ; en choisir une reprend son nom et son
**assurance** (si elle est encore active). « Créer la fiche » crée un patient sans quitter la vente.
La fiche affiche l'historique des achats.

## Au quotidien

**Lecteur de code-barres** : un lecteur USB se comporte comme un clavier (il tape le code puis Entrée).
Au comptoir, la recherche a le focus : scanner une boîte l'ajoute au panier ; un code inconnu est signalé.
Entrée ajoute aussi le produit quand la recherche ne donne qu'un seul résultat.

**Mise à jour en direct** : une commande enregistrée au comptoir apparaît **immédiatement** à la caisse
(et les stocks, l'historique, le tableau de bord, la clôture se mettent à jour). Technique :
**Server-Sent Events** (`GET /api/evenements`, `server/events.js`) — une connexion HTTP qui reste ouverte.
Le message ne contient que `{ id, action }` : chaque écran recharge ses données par l'API normale, qui
applique les permissions. La pastille « En direct » en haut à droite montre l'état de la connexion.

**Application installable (PWA)** : `public/manifest.webmanifest` + `public/sw.js`. Dans Chrome / Edge, le bouton
« Installer » (ou l'icône dans la barre d'adresse) installe PharmaCours comme un logiciel, avec son icône.
Le service worker ne met **jamais** en cache les données `/api` (pas de prix ou de stock périmé) ; il garde
seulement l'application pour qu'elle s'ouvre même si le serveur est coupé.
⚠️ Le navigateur n'autorise l'installation que sur `http://localhost` ou en **HTTPS** : depuis un autre poste en
`http://192.168.x.x`, l'application fonctionne mais ne s'installe pas.

**Tableau de bord** (admin, pharmacien) : ventes des 14 derniers jours (part patients / part assurances),
encaissements par moyen de paiement et top 5 des produits sur 30 jours. Graphiques en SVG, sans librairie,
avec infobulle au survol et une **vue tableau** (accessibilité).

## Les rôles

| Rôle | Ce qu'il fait |
|---|---|
| **Administrateur** | Comptes, assurances, **bordereaux**, catalogue, audit, consultation des patients. **Ne vend pas et n'encaisse pas.** |
| **Pharmacien** | Tout le circuit : commande, ordonnances, encaissement, **retours**, **clôture**, annulation, stock, **réappro**, catalogue, **patients**, **bordereaux**. |
| **Préparateur** | Consulte le catalogue, réceptionne et consulte le stock, **réapprovisionnement**. |
| **Vendeur** | **Comptoir** (avec **fiches patients** et lecteur de code-barres) ; historique de **ses** commandes (annulation possible tant qu'elles ne sont pas payées). N'encaisse pas. |
| **Caissier** | **Caisse** : corrige (avec traçabilité), valide, encaisse et imprime le ticket ; **retours / avoirs** sur **ses** encaissements ; **clôture de sa caisse** ; historique de ses encaissements. Ne crée pas et n'annule pas de commande. |

La matrice complète est affichée dans *Utilisateurs*, générée depuis `src/config/roles.js`.

## Architecture

```
src/                         ← FRONT (React)
├── config/roles.js          ← SOURCE UNIQUE des rôles et permissions (partagée avec l'API)
├── domain/                  ← règles métier PURES, partagées avec l'API + tests
│   ├── permissions.js         hasPermission
│   ├── commande.js            total, part assurance, paiement mixte, qui peut annuler
│   ├── caisse.js              retour / avoir, clôture (écart), qui peut faire un retour
│   ├── patient.js             validation d'une fiche patient
│   ├── medicament.js          validation, recherche par code-barres
│   └── stock.js               FEFO, péremption, quantité à réapprovisionner
├── services/                ← appels HTTP à l'API (fetch), un fichier par ressource
│   └── evenements.js          connexion EN DIRECT (SSE) partagée + hook useEvenements
├── auth/                    ← AuthContext, useAuth, <Can>, gardes de routes
├── app/navigation.js        ← UNE config pour le menu ET les routes
├── app/pwa.js               ← service worker + bouton « Installer »
└── features/                ← comptoir/ caisse/ cloture/ commandes/ patients/ reappro/ bordereaux/ dashboard/ …

server/                      ← API (Node + Express + MySQL)
├── db/schema.sql            ← tables, clés étrangères, contraintes
├── db/init.js               ← création + données de test
├── middleware/auth.js       ← authenticate + requirePermission
├── services/commandes.js    ← logique métier (transactions, verrous)
├── services/caisse.js       ← retours / avoirs, clôture de caisse
├── events.js                ← diffusion des événements en direct (SSE)
└── routes/                  ← une route par ressource
```

Flux : **Composant React → service (fetch) → route Express → `requirePermission` → service métier → MySQL (transaction) → audit**.

## Les bonnes pratiques illustrées

1. **Permissions, pas rôles** — `can(PERMISSIONS.COMMANDE_ENCAISSER)`, jamais `role === 'CAISSIER'`.
2. **Un seul fichier de règles pour le front et l'API** — `config/roles.js` et `domain/` sont importés des deux côtés : impossible d'avoir un bouton visible que le serveur refuse (ou l'inverse).
3. **Le front n'est pas une sécurité** — chaque route API vérifie la permission. *Exercice : connecté en vendeuse, exécutez dans la console*
   `fetch('/api/commandes/5/encaissement',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"modePaiement":"WAVE"}'})` *→ 403.*
4. **Séparation des tâches** — celui qui compose la commande n'encaisse pas.
5. **Règles de propriété (ABAC)** — `canCancelCommande` combine rôle, auteur et statut.
6. **Portée des données** — `commande:read:own` vs `read:all`, filtré en SQL côté serveur.
7. **Ne jamais faire confiance au client** — le front n'envoie que des id et quantités ; prix, total et parts d'assurance sont recalculés par l'API.
8. **Transactions + verrous** — `withTransaction` (tout ou rien) et `SELECT … FOR UPDATE` : deux postes ne peuvent pas vendre la même dernière boîte.
9. **Sécurité de l'authentification** — mots de passe hachés (bcrypt), session en cookie `HttpOnly`, limitation des tentatives de connexion, droits relus en base à chaque requête.
10. **SQL sûr** — requêtes paramétrées (`?`), jamais de concaténation de valeurs saisies.
11. **Traçabilité** — journal d'audit, commandes jamais supprimées, valeurs figées (prix, taux), historique avant/après de chaque modification avec motif ; un retour est une **opération inverse** (on ne réécrit pas la vente) ; une clôture fige l'écart de caisse.
12. **Qualité React** — hooks personnalisés (`useAsync`, `useDebounce`, `useEvenements`), `useReducer`, `useMemo`, `useSyncExternalStore`, formulaires contrôlés, `React.lazy`, `ErrorBoundary`, états chargement / erreur / vide.
13. **Événements sans données** — le flux en direct annonce seulement « la commande 12 a changé » ; les données passent toujours par l'API et ses contrôles de permissions.

## Scénarios de démonstration

1. **Vendeuse** : Comptoir → 2 × Amoxicilline → cocher « Patient assuré » → IPM 80 % → la part patient s'affiche. Enregistrer.
2. **Caissier** (sur un autre PC ou un autre navigateur) : Caisse → la commande apparaît **instantanément** → Espèces, 5 000 reçus → monnaie calculée → Valider → **Imprimer le ticket**.
   Variante : cocher « Paiement mixte », Orange Money + Espèces, 3 000 F sur Orange Money, le reste en espèces.
3. **Caissier** : « Modifier » une commande → passer une quantité de 3 à 2, ajouter un produit, saisir le motif → l'historique apparaît sous la commande, avec auteur, date et détail. Essayer d'augmenter un médicament sur ordonnance → refusé.
4. **Vendeuse** : menu *Commandes* → seules ses commandes apparaissent (comparer avec le compte `vendeur`). Taper `/medicaments` dans l'URL → page 403. Le caissier, lui, voit dans *Commandes* uniquement ce qu'il a encaissé.
5. **Admin** : changer le taux d'une assurance → les anciennes commandes gardent leur taux. Consulter l'audit.
   Puis *Bordereaux* : choisir le mois → montant à facturer par assurance → imprimer.
7. **Vendeuse** : Comptoir → taper « khady » dans *Patient* → choisir la fiche → l'assurance IPM est pré-remplie.
   Scanner (ou taper puis Entrée) le code `3400930000011` → Paracétamol ajouté.
8. **Caissier** : *Commandes* → « Retour » sur une commande payée → 1 boîte, motif → ticket d'avoir.
   Puis *Clôture* : saisir un montant différent des espèces attendues → l'écart s'affiche → clôturer → ticket Z.
9. **Pharmacien** : tableau de bord (graphiques) → *Réappro* → ajuster une quantité → imprimer le bon de commande.
6. **Admin** : désactiver le compte `caissier` pendant qu'il est connecté dans un autre navigateur → sa prochaine action le déconnecte.

## Pistes d'exercices

- Plafond annuel de prise en charge par assuré.
- Couverture par l'assurance uniquement des lignes sur ordonnance.
- Tracer chaque réimpression de ticket dans le journal d'audit (qui, quand).
- Fond de caisse : saisir le montant de départ du tiroir et l'intégrer au calcul de la clôture.
- Marquer un bordereau comme « envoyé » puis « payé » par l'assurance (suivi des impayés).
- Réception d'un bon de commande : transformer la proposition de réappro en lots réceptionnés.
- Faire passer le remboursement d'une commande payée puis **annulée** par la clôture de caisse.
- Interdire au pharmacien d'encaisser une commande qu'il a lui-même composée.
