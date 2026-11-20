# DentaClinic — Guide développeur

Ce guide présente l'architecture observée dans le dépôt, les principaux flux
métier et les règles à connaître avant de modifier l'application. Il complète
le code source : en cas de divergence, le code exécuté reste la référence.

## 1. Présentation

DentaClinic est une application web de gestion de cabinet dentaire. Elle couvre
le suivi des patients et des soins, l'organisation du cabinet et plusieurs
fonctions administratives. L'application est multi-tenant : les données
appartiennent à un cabinet (`tenant_id`) et ne doivent pas être accessibles
depuis un autre cabinet.

Les modules visibles dans l'application sont :

- accueil et tableau de bord ;
- agenda, rendez-vous, praticiens et fauteuils ;
- patients, dossier médical, documents et recherche ;
- consultations cliniques et enregistrements audio ;
- odontogramme et traitements ;
- devis, factures, trésorerie et rapports ;
- laboratoire, stock et fournisseurs ;
- équipe, groupes et permissions ;
- notifications ;
- paramètres du cabinet, apparence, langue et exports.

L'interface existe en français et en arabe, avec direction RTL pour l'arabe.

## 2. Stack technique

| Technologie | Rôle |
|---|---|
| Next.js 16.4.2 | App Router, pages React et routes API |
| React 19.3 | Composants d'interface |
| TypeScript 5 | Typage strict |
| Tailwind CSS 4 | Styles |
| MariaDB | Persistance métier |
| `mariadb` | Pool de connexions SQL côté serveur |
| Zod | Validation des entrées et des formulaires API |
| `jsonwebtoken` | Jetons de session |
| Node.js `crypto` | Hachage des mots de passe et UUID de fichiers |

Les versions exactes et les commandes sont définies dans `package.json` et
`package-lock.json`. Les alias TypeScript `@/*` pointent vers `src/*`.

## 3. Démarrage local

Prérequis : Node.js/npm compatibles avec Next.js et une base MariaDB joignable.

Depuis la racine du projet (`C:\dentalflow\dentaflow` sous Windows) :

```powershell
npm.cmd install
npm.cmd run dev
```

L'application de développement est généralement disponible sur
`http://localhost:3000`.

Commandes disponibles :

```powershell
npm.cmd run dev
npm.cmd run lint
npm.cmd run build
npm.cmd run start
npm.cmd exec next -- --version
```

`start` sert le build de production : exécuter `build` avant. Le dépôt ne
déclare pas de commande `test` dédiée.

### Variables d'environnement

Créer/configurer `.env.local` localement, sans copier ses secrets dans le
dépôt ni dans ce guide.

| Variable | Usage |
|---|---|
| `DATABASE_URL` | URL de connexion MariaDB, requise pour les fonctions métier |
| `JWT_SECRET` | Secret de signature de session ; au moins 32 caractères aléatoires |
| `PATIENT_DOCUMENTS_STORAGE_DIR` | Répertoire privé facultatif pour documents et audio |

En l'absence de `PATIENT_DOCUMENTS_STORAGE_DIR`, les fichiers sont enregistrés
sous `storage/patient-documents` dans le répertoire de travail.
`scripts/create-admin.mjs` et `scripts/create-user.mjs` utilisent
`DATABASE_URL` pour créer des comptes.

## 4. Organisation du code

```text
src/
├── app/
│   ├── (app)/                 Pages de l'application authentifiée
│   ├── (auth)/                Pages d'authentification
│   ├── api/                   Route Handlers Next.js
│   ├── globals.css            Styles globaux
│   └── layout.tsx             Layout racine / providers
├── components/
│   ├── layout/                AppShell, Sidebar, Topbar, navigation
│   └── ui/                    Composants d'interface partagés
├── features/                  Écrans et logique côté client, par domaine
├── lib/                       i18n, formatage, dates et utilitaires
└── server/
    ├── auth/                  Session, mots de passe, accès
    ├── modules/               Logique métier et stockage serveur
    ├── db.ts                  Pool MariaDB
    ├── http.ts                Wrapper API et transactions
    ├── audit.ts               Journal d'audit
    └── numbering.ts           Numérotation des documents
```

Les groupes de routes entre parenthèses de l'App Router organisent les pages
sans ajouter ces noms à l'URL. Chaque `page.tsx` d'un domaine monte généralement
le composant de `src/features/<domaine>`. Les Route Handlers sont dans
`src/app/api/**/route.ts`.

### Conventions de couches

Pour une fonction métier persistée, le flux attendu est :

```text
Page / composant React
  → fetch ou client API
  → route API (Route Handler)
  → authentification + autorisation
  → validation de l'entrée
  → service métier
  → repository / requête MariaDB
  → réponse JSON
  → état React et affichage
```

Les modules agenda et patients ont des couches serveur dédiées
(`appointments.schema.ts`, `appointments.service.ts`,
`appointments.repository.ts`, `patients.schema.ts`, etc.). Certains domaines
conservent encore directement leur logique SQL dans les Route Handlers.

## 5. Pages et modules

| URL | Domaine | Repères de code |
|---|---|---|
| `/` et `/dashboard` | Accueil / indicateurs | `features/home`, `features/dashboard` |
| `/agenda` | Agenda et rendez-vous | `features/agenda`, `server/modules/appointments` |
| `/patients` | Liste, recherche, création, import/export | `features/patients` |
| `/patients/[id]` | Dossier médical patient | `PatientDetailView.tsx` |
| `/consultations` | Chronologie des rendez-vous et visites cliniques | `features/consultations` |
| `/odontogram` | Odontogramme | `features/odontogram` |
| `/treatments` | Plans et actes de traitement | `features/treatments` |
| `/quotes` | Devis et conversion | `features/quotes` |
| `/invoices` | Factures et filtres | `features/invoices` |
| `/treasury` | Encaissements et dépenses | `features/treasury` |
| `/laboratory` | Commandes et suivi laboratoire | `features/laboratory` |
| `/stock` | Produits et seuils de stock | `features/stock` |
| `/suppliers` | Fournisseurs et dépenses liées | `features/suppliers` |
| `/reports` | Rapports | `features/reports` |
| `/team` | Utilisateurs, groupes et droits | `features/team` |
| `/notifications` | Centre de notifications et historique | `features/notifications` |
| `/settings` | Paramètres du cabinet | `features/settings` |

La navigation est définie dans `src/components/layout/nav.ts`, rendue par
`Sidebar.tsx` et encadrée par `AppShell.tsx`. Les pages serveur et le menu
doivent rester cohérents avec les autorisations API.

## 6. Principaux parcours métier

### Agenda

Les rendez-vous sont validés côté serveur par Zod. Le service vérifie que le
patient et le praticien appartiennent au tenant, refuse une date antérieure à
aujourd'hui et contrôle les conflits de praticien/fauteuil dans une
transaction. Les changements d'état, reports et annulations sont journalisés.

Repères : `src/features/agenda/`,
`src/app/api/appointments/route.ts`,
`src/server/modules/appointments/`.

### Patients et dossier clinique

Les données patients comprennent l'identité, les coordonnées, les
informations médicales et des notes. La recherche et les opérations de liste
sont limitées au tenant. Le dossier patient réunit les informations
cliniques, les actes, l'odontogramme, les ordonnances et les pièces médicales.
Les pièces stockent des métadonnées en base et les octets dans un répertoire
privé ; l'accès passe par une API authentifiée plutôt que par une URL de fichier
publique.

### Consultations et audio

Une consultation clinique persistée dans `patient_consultations` est
différente d'un rendez-vous venant d'`appointments`. L'enregistrement audio
est disponible pour les consultations cliniques : le navigateur utilise
`getUserMedia` et `MediaRecorder`, demande une confirmation de consentement,
puis téléverse un fichier audio. Il n'y a pas de transcription.

Contraintes implémentées : WebM ou MP4, 50 Mo maximum, durée de 30 minutes
maximum. Les métadonnées (tenant, consultation, durée, type, taille,
consentement et utilisateur) sont enregistrées en base ; le fichier est écrit
dans le stockage privé des documents médicaux. Les routes de lecture et
d'upload vérifient l'authentification et le tenant.

Repères : `src/features/consultations/ConsultationsView.tsx`,
`src/app/api/consultations/`,
`src/server/modules/consultations/recordings.ts`,
`src/server/modules/patients/medical-documents.ts`.

Le stockage local n'est pas automatiquement durable sur toutes les plateformes
de déploiement. En production, configurer `PATIENT_DOCUMENTS_STORAGE_DIR` sur
un volume persistant ; avec plusieurs instances, le stockage doit être partagé
ou remplacé par un stockage objet privé. Prévoir aussi sauvegarde, rétention et
procédure de suppression adaptées aux obligations du cabinet.

### Traitements, devis, factures et trésorerie

Les actes sont liés aux patients et peuvent être regroupés dans un plan de
traitement. Les devis peuvent être convertis en actes/factures selon les flux
du domaine. Les factures ont des filtres et exportations ; les mouvements
financiers sont stockés dans les tables métier de trésorerie. Toute nouvelle
opération financière doit conserver les liens patient/document, les montants
et la trace d'audit appropriés.

### Notifications

Le centre agrège les éléments à suivre depuis l'agenda, le stock et le
laboratoire. `notification_history` conserve par utilisateur et tenant un
instantané des notifications observées ; `notification_states` et `read_at`
conservent l'état lu. Les vues du centre séparent les notifications actives et
terminées. L'historique n'est constitué qu'à partir du moment où les
notifications sont observées par l'API ; les anciens événements disparus
avant la mise en place de la persistance ne peuvent pas être reconstruits.

## 7. API

Toutes les routes métier se trouvent sous `/api`. Principaux groupes :

| Domaine | Routes principales |
|---|---|
| Auth | `/api/auth/login`, `/logout`, `/me` |
| Agenda | `/api/appointments`, `/api/appointments/[id]` |
| Patients | `/api/patients`, `/api/patients/[id]`, `import`, `receivables` |
| Documents patient | `/api/patients/[id]/documents` et `[documentId]` |
| Soins patient | sous-routes `odontogram`, `treatments`, `finances`, `prescriptions` |
| Consultations | `/api/consultations` et `/api/consultations/[id]/recordings` |
| Devis | `/api/quotes`, `/api/quotes/[id]`, `/convert` |
| Factures / trésorerie | `/api/invoices`, `/api/treasury` |
| Stocks / fournisseurs | `/api/stock`, `/api/suppliers` |
| Laboratoire | `/api/laboratory` et `/api/laboratory/[id]` |
| Équipe / accès | `/api/team`, `/api/access` et sous-routes |
| Notifications | `/api/notifications` |

Les méthodes HTTP déterminent les actions d'accès par défaut dans
`resolveRoutePermission` : GET/HEAD = consulter, POST = créer,
PUT/PATCH = modifier, DELETE = supprimer. Les réponses d'erreur utilisent
normalement `{ error: "..." }` et les réponses de lecture des données utilisent
souvent `{ data: ... }`.

## 8. Base de données et persistance

MariaDB est accessible par le pool singleton de `src/server/db.ts`. Le pool
lit `DATABASE_URL`; les requêtes utilisent des paramètres `?`. Le dépôt ne
contient pas actuellement de système centralisé de migrations SQL : plusieurs
tables de fonctionnalités sont créées à la demande par des fonctions
`CREATE TABLE IF NOT EXISTS` dans le serveur. Le dossier `database/migrations`
existe mais ne contient pas de scripts visibles.

Cela signifie qu'un changement de schéma doit être pensé pour les bases déjà
existantes, déployé sans hypothèse sur une base neuve et vérifié sur MariaDB.
Pour une évolution importante, mettre en place des migrations versionnées est
préférable à une nouvelle modification de schéma à la volée.

Tables repérées par domaine (les tables exactes et colonnes doivent toujours
être vérifiées dans le SQL courant) :

- Fondations : `tenants`, `users`, `patients`, `appointments`, `audit_logs`.
- Clinique : `patient_consultations`, `patient_odontogram`,
  `patient_odontogram_settings`, `tenant_clinical_statuses`,
  `patient_treatments`, `treatment_finances`, `treatment_payments`,
  `treatment_price_history`, `patient_prescriptions`, `patient_documents`,
  `consultation_recordings`.
- Agenda : notamment `appointment_day_locks` et les journaux d'audit associés.
- Accès : `access_groups`, `access_group_members`,
  `access_group_permissions`, `user_access_permissions`.
- Notifications : `notification_states`, `notification_history`.
- Gestion : `quotes`, `invoices`, `invoice_payments`, `treasury_entries`,
  `stock_products`, les entités fournisseur/laboratoire et leurs commandes.

Ne pas déduire une colonne d'un nom de table : le schéma historique peut varier
entre environnements. Vérifier les requêtes et la base cible avant d'ajouter
une dépendance SQL.

## 9. Authentification, autorisations et sécurité

### Session

- Le cookie de session est `dentaclinic_session` (avec compatibilité de transition `dentaflow_session`).
- Le JWT contient `userId`, `tenantId` et `role`, expire après 8 heures et est
  marqué `httpOnly`, `SameSite=Lax`, `Secure` en production.
- `JWT_SECRET` doit contenir au moins 32 caractères.
- Les mots de passe sont hachés avec `scrypt`, sel aléatoire et comparaison en
  temps constant.
- Le rôle actif est rechargé depuis la base par le wrapper API : ne pas
  considérer le rôle du JWT comme seule source d'autorité.

Repères : `src/server/auth/session.ts`, `password.ts`,
`src/app/api/auth/login/route.ts`.

### Routes API protégées

Toute route privée doit passer par `withAuth` (`src/server/http.ts`) ou mettre
en place un contrôle équivalent clairement justifié. Ce wrapper :

1. vérifie la session ;
2. vérifie que l'utilisateur est actif ;
3. déduit un droit module/action de l'URL et de la méthode HTTP ;
4. vérifie les permissions configurées ;
5. renvoie des erreurs HTTP explicites et journalise les erreurs inattendues.

`WRITE_ROLES` et `DELETE_ROLES` existent pour les contrôles par rôle. Certains
handlers précisent aussi une liste de rôles.

### Groupes et droits

Les permissions sont définies par module (`agenda`, `patients`,
`consultations`, etc.) et action (`view`, `create`, `edit`, `delete`).
Les autorisations de groupe s'additionnent ; une exception individuelle
(`allowed`) prévaut pour la paire module/action concernée. Les administrateurs
ont tous les droits. Le comportement de compatibilité pour un utilisateur sans
groupe est décrit par `canAccess` dans `access-control.ts` : consulter les
comptes sans groupe avec cette fonction avant de modifier les règles.

Le filtrage du menu n'est pas une frontière de sécurité : la validation doit
rester côté serveur sur chaque route et pour chaque enregistrement.

### Règles impératives pour les données

- Ajouter `tenant_id = ?` aux lectures et écritures métier ; ne jamais faire
  confiance à un `tenantId` envoyé par le navigateur.
- Vérifier qu'un patient, un document, une consultation ou une autre ressource
  appartient au même tenant que la session avant d'agir dessus.
- Paramétrer les valeurs SQL. Ne jamais interpoler une valeur utilisateur
  dans une requête. Les noms/clauses dynamiques doivent provenir d'une
  liste blanche contrôlée.
- Valider les paramètres de route, query strings et body côté serveur (Zod
  lorsque c'est cohérent avec le domaine).
- Utiliser les transactions pour les opérations atomiques ; enregistrer l'audit
  dans la transaction lorsque l'action et son audit doivent réussir ensemble.
- Ne pas renvoyer de chemin de fichier local, secret, hash de mot de passe ou
  données médicales qui ne sont pas nécessaires.
- Protéger les pièces cliniques et audio par routes authentifiées, limiter les
  types et tailles, vérifier le contenu et éviter les liens publics.
- Demander le consentement explicite avant l'audio ; ne pas lancer de
  transcription sans exigence distincte.
- Ne jamais mettre de données réelles de patients ou de secrets dans des
  exemples, tickets, logs ou documentation.

Le wrapper de session ne constitue pas à lui seul une protection contre toutes
les menaces web. Pour une exposition Internet, prévoir aussi HTTPS, contrôle
des sauvegardes et accès production, surveillance, limitation de débit,
durcissement de la configuration et revue des dépendances.

## 10. Interface, composants et langues

Les composants partagés sont dans `src/components/ui` : réutiliser en priorité
`Button`, `Card`, `Modal`, `Icon`, `SearchableInput` et `ToothPicker`.
Les icônes sont dessinées localement via `src/components/ui/Icon.tsx`.

L'internationalisation interne est dans `src/lib/i18n.tsx` :

- locales prises en charge : `fr`, `ar` ;
- le provider expose `useI18n()` ;
- l'arabe active `dir="rtl"` ;
- ajouter les libellés traduits dans les deux langues lorsque la structure de
  traduction est utilisée ;
- certaines vues contiennent encore des textes français écrits directement :
  vérifier le composant concerné avant de choisir la convention.

Pour les styles, respecter Tailwind et `src/app/globals.css`; tester les
largeurs mobiles, les états disabled/loading/error et le RTL si la vue est
utilisée en arabe.

## 11. Bonnes pratiques de contribution

1. Lire la page, le composant, les appels API et le handler serveur avant
   d'éditer.
2. Rechercher le schéma actuel et les helpers existants ; éviter de créer une
   seconde logique pour un flux déjà partagé.
3. Pour un champ métier, vérifier toutes les surfaces : formulaire, types,
   validation, route, SQL, affichage, export, filtres et tests.
4. Garder les changements ciblés, les types stricts et les erreurs visibles.
5. Ne pas utiliser `as any` pour contourner un problème de type.
6. Ne pas ajouter de dépendance si les outils existants suffisent.
7. Mettre à jour ce guide quand l'architecture, les variables ou un parcours
   important change.

Pour les conventions Next.js spécifiques à cette version, lire les guides
installés dans `node_modules/next/dist/docs/` avant d'utiliser une API ou une
convention incertaine.

## 12. Vérification et test manuel

Pour toute modification, sélectionner le contrôle le plus ciblé puis élargir
si nécessaire :

```powershell
npm.cmd exec eslint -- src/chemin/du/fichier.tsx
npx.cmd tsc --noEmit
npm.cmd run build
```

Il n'y a pas de suite de tests automatisés configurée dans `package.json`.
Tester manuellement les parcours modifiés avec un compte et des données de
test, notamment :

- compte autorisé / compte sans permission ;
- deux tenants différents pour détecter une fuite inter-cabinet ;
- validation des champs et messages d'erreur API ;
- persistance après rechargement ;
- navigation et mise à jour de l'état ;
- français, arabe et affichage RTL lorsque pertinent ;
- fichiers : refus des formats/dimensions invalides et lecture protégée ;
- opérations multi-étapes : comportement d'échec et rollback.

## 13. Limites opérationnelles connues

- Les changements de schéma sont partiellement créés à la demande ; les
  migrations centralisées doivent être développées.
- Le stockage par défaut des documents/audio est un répertoire local : il faut
  choisir et vérifier un support durable en production et dans les backups.
- Les permissions de module/action ne remplacent pas une autorisation au
  niveau de chaque ressource : chaque requête doit aussi contrôler le tenant
  et les liens entre enregistrements.
- Les historiques de notifications et les nouveaux schémas sont créés à
  l'exécution ; aucun historique antérieur non conservé ne peut être recréé.
- Le dépôt ne définit pas de commande de tests automatisés.
- Un `npm audit` exécuté pendant une précédente mise à niveau a relevé des
  vulnérabilités dans des dépendances autres que la version Next.js mise à jour.
  Refaire l'audit avant un déploiement : l'état des avis évolue et le rapport
  précédent ne garantit pas le statut actuel.

## 14. Checklist avant livraison

- [ ] Le parcours complet est traité, pas uniquement son apparence.
- [ ] Les entrées serveur sont validées et les erreurs sont explicites.
- [ ] Toutes les requêtes respectent le tenant et les permissions.
- [ ] Les écritures atomiques et journaux d'audit sont cohérents.
- [ ] Les interfaces français/arabe et RTL restent lisibles si applicables.
- [ ] Les fichiers sensibles ne sont pas servis publiquement.
- [ ] ESLint ciblé et TypeScript réussissent.
- [ ] Le build de production réussit si le changement l'exige.
- [ ] Cette documentation est mise à jour si le fonctionnement ou les limites
  ont changé.
