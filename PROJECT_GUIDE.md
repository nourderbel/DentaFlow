# DentaFlow - Guide complet du projet

Ce document décrit le fonctionnement actuel de DentaFlow et sert de référence pour
comprendre le projet avant toute modification demandée par le client.

## 1. Vue d'ensemble

DentaFlow est une plateforme web de gestion de cabinet dentaire.

Fonctionnalités actuellement présentes :

- Authentification par e-mail et mot de passe.
- Gestion multi-tenant : les données sont isolées par `tenant_id`.
- Tableau de bord dynamique.
- Agenda avec vues jour, semaine, mois et liste.
- Rendez-vous, fauteuils, praticiens, statuts et reports.
- Liste et dossier médical des patients.
- Import/export CSV des patients.
- Recherche globale par dossier, nom, téléphone, WhatsApp ou CIN.
- Odontogramme interactif.
- États dentaires initiaux et actuels.
- Plan de traitement par patient.
- Page globale des traitements.
- Historique des consultations avec chronologie médicale.
- Interface français/arabe.
- Direction RTL automatique pour l'arabe.
- Icônes SVG locales.

## 2. Technologies utilisées

| Technologie | Utilisation |
|---|---|
| Next.js 16 | Framework web et routes App Router |
| React 19 | Interface interactive |
| TypeScript 5 | Typage strict |
| Tailwind CSS 4 | Styles et responsive design |
| MariaDB | Base de données |
| `mariadb` | Connexion serveur à MariaDB |
| `jsonwebtoken` | Sessions JWT |
| `zod` | Validation des entrées API |
| `lucide-react` | Dépendance historique ; les écrans utilisent désormais les SVG locaux |

Commandes principales :

```bash
npm run dev
npm run build
npm run start
npm run lint
```

Les commandes doivent être exécutées depuis :

```text
C:\dentalflow\dentaflow
```

## 3. Structure du projet

```text
dentaflow/
├── public/                         Fichiers statiques
├── src/
│   ├── app/
│   │   ├── (app)/                  Pages protégées
│   │   ├── (auth)/login/           Page de connexion
│   │   ├── api/                    Routes API Next.js
│   │   ├── globals.css             Styles globaux
│   │   └── layout.tsx              Layout racine et provider i18n
│   ├── components/
│   │   ├── layout/                 Sidebar, Topbar, AppShell, navigation
│   │   └── ui/                     Button, Card, Modal, Icon, etc.
│   ├── features/
│   │   ├── agenda/                 Composants, API et types agenda
│   │   ├── dashboard/              Tableau de bord
│   │   ├── patients/               Patients et dossier médical
│   │   └── treatments/             Page globale des traitements
│   ├── lib/
│   │   ├── i18n.tsx                Français/arabe et RTL
│   │   ├── format.ts               Dates, montants et initiales
│   │   ├── dates.ts                Utilitaires de date
│   │   └── tunisia.ts              Gouvernorats tunisiens
│   └── server/
│       ├── auth/                   Session JWT
│       ├── modules/                Services et repositories métier
│       ├── db.ts                   Pool MariaDB
│       ├── http.ts                 Authentification et erreurs API
│       └── ...
├── .env.local                      Configuration locale, ne jamais publier
├── package.json
├── tsconfig.json
└── PROJECT_GUIDE.md                Ce document
```

## 4. Pages disponibles

| URL | Fonction |
|---|---|
| `/login` | Connexion |
| `/` | Tableau de bord dynamique |
| `/agenda` | Agenda et rendez-vous |
| `/patients` | Liste, recherche, import et export patients |
| `/patients/[id]` | Dossier médical patient |
| `/treatments` | Vue globale des plans de traitement |
| `/consultations` | Historique des consultations et chronologie médicale |
| `/quotes` | Devis et propositions de soins |
| `/invoices` | Factures et suivi des paiements |
| `/treasury` | Journal de trésorerie, encaissements et dépenses |
| `/laboratory` | Commandes prothétiques et suivi des travaux de laboratoire |
| `/stock` | Gestion des produits, alertes et réapprovisionnement |
| `/suppliers` | Annuaire des fournisseurs et achats récents |
| `/reports` | Indicateurs financiers, cliniques et activité du cabinet |
| `/team` | Membres du cabinet, rôles et permissions |
| `/settings` | Paramètres du cabinet, apparence, sécurité et exports |

Certaines entrées sont déjà prévues dans la navigation mais ne possèdent pas
encore de page métier complète : odontogramme global.

## 5. Layout et navigation

### `AppShell`

`src/components/layout/AppShell.tsx` compose :

- `Sidebar`
- `Topbar`
- contenu de page
- bouton global Retour

Le nom et le rôle du compte sont récupérés côté serveur dans le layout protégé,
puis transmis à `AppShell`.

### `Sidebar`

La navigation est définie dans :

```text
src/components/layout/nav.ts
```

Chaque élément possède :

- `href`
- clé de traduction
- nom d'icône SVG

Les icônes sont rendues par :

```text
src/components/ui/Icon.tsx
```

Pour ajouter une icône, ajouter une forme SVG dans `shapes`, puis utiliser :

```tsx
<Icon name="nomDeIcone" size={18} />
```

### `Topbar`

La barre supérieure contient :

- fil d'Ariane
- recherche patient avec suggestions
- notifications visuelles
- bouton de langue
- profil dynamique
- paramètres et déconnexion

Les anciens boutons globaux « Nouveau patient » et « Nouveau rendez-vous »
ont été retirés de la Topbar. Les créations restent accessibles depuis les
pages concernées.

## 6. Internationalisation

Le projet utilise une solution interne, sans bibliothèque i18n externe.

Fichier principal :

```text
src/lib/i18n.tsx
```

Utilisation dans un composant client :

```tsx
const { locale, t } = useI18n();

<h1>{t("patients.title")}</h1>
```

Langues actuelles :

- `fr`
- `ar`

Le provider :

- mémorise la langue dans `localStorage`
- définit `document.documentElement.lang`
- définit `document.documentElement.dir`
- active RTL pour l'arabe

Pour ajouter un texte :

1. Ajouter la clé dans le bloc `fr`.
2. Ajouter la même clé dans le bloc `ar`.
3. Utiliser `t("la.cle")` dans le composant.
4. Ne pas traduire les valeurs métier sauvegardées en base si elles servent
   aux filtres ou aux contraintes API.

Les valeurs techniques comme les statuts de traitement restent actuellement :

```text
À faire
En cours
Terminé
```

L'affichage peut être traduit séparément, mais la valeur envoyée à l'API doit
rester compatible avec le schéma serveur.

## 7. Authentification et sécurité

La session est un cookie JWT :

```text
dentaflow_session
```

Le token contient :

- `userId`
- `tenantId`
- `role`

Durée actuelle : 8 heures.

Fichier principal :

```text
src/server/auth/session.ts
```

Règles importantes :

- Toute route API protégée doit utiliser `withAuth`.
- Toute requête métier doit filtrer par `session.tenantId`.
- Les écritures doivent limiter les rôles avec `WRITE_ROLES` si nécessaire.
- Ne jamais faire confiance à un `tenantId` envoyé par le navigateur.
- Ne jamais exposer `DATABASE_URL` ou `JWT_SECRET`.
- `JWT_SECRET` doit contenir au moins 32 caractères aléatoires.

## 8. Base de données

La connexion est gérée dans :

```text
src/server/db.ts
```

Variable nécessaire :

```text
DATABASE_URL=...
```

Le pool MariaDB est conservé dans `globalThis` en développement pour éviter
de créer trop de connexions lors des rechargements Next.js.

Tables principales utilisées :

- `users`
- `patients`
- `appointments`
- `audit_logs`
- `appointment_day_locks`
- `patient_odontogram`
- `patient_treatments`

Les tables `patient_odontogram` et `patient_treatments` sont actuellement
créées automatiquement par les routes concernées si elles n'existent pas.

## 9. API principales

### Authentification

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### Patients

```text
GET    /api/patients?q=...
POST   /api/patients
GET    /api/patients/[id]
PATCH  /api/patients/[id]
DELETE /api/patients/[id]
```

La recherche patient couvre :

- numéro de dossier
- prénom
- nom
- nom complet dans les deux ordres
- téléphone
- WhatsApp
- CIN

### Agenda

```text
GET    /api/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD
POST   /api/appointments
GET    /api/appointments/[id]
PATCH  /api/appointments/[id]
DELETE /api/appointments/[id]
```

Les dates passées sont bloquées par la validation métier.
Les conflits de praticien et de fauteuil sont contrôlés côté serveur.

### Odontogramme

```text
GET /api/patients/[id]/odontogram
PUT /api/patients/[id]/odontogram
```

Le payload utilise notamment :

```json
{
  "toothNumber": 16,
  "status": "Fracture",
  "note": "Observation",
  "view": "initial"
}
```

Les vues sont séparées :

- `initial`
- `current`

### Traitements

```text
GET  /api/patients/[id]/treatments
POST /api/patients/[id]/treatments
GET  /api/treatments
GET  /api/consultations
```

Le traitement contient notamment :

- patient
- phase
- acte
- dent(s)
- montant
- statut
- praticien
- date prévue

## 10. Patients et dossier médical

### Liste patients

Fichier :

```text
src/features/patients/components/PatientsView.tsx
```

Fonctions :

- recherche avec délai de 300 ms
- ouverture d'un dossier en cliquant sur une ligne
- import CSV
- export CSV
- création patient
- affichage du solde

### Formulaire patient

Fichier :

```text
src/features/patients/components/PatientForm.tsx
```

Les champs comprennent identité, coordonnées, antécédents, médicaments,
grossesse, diabète, hypertension, anticoagulants et notes médicales.

### Dossier médical

Fichier :

```text
src/features/patients/components/PatientDetailView.tsx
```

Le composant gère :

- informations patient
- archivage
- odontogramme
- états initiaux et actuels par dent
- notes cliniques
- plan de traitement
- progression des traitements

## 11. Agenda

Fichiers principaux :

```text
src/features/agenda/components/AgendaView.tsx
src/features/agenda/api.ts
src/features/agenda/types.ts
```

Vues :

- jour
- semaine
- mois
- liste

Fonctionnalités :

- filtre par fauteuil
- création et modification
- report
- historique des reports
- statuts colorés
- import CSV
- blocage des dates passées

## 12. Dashboard

Fichiers :

```text
src/features/dashboard/DashboardView.tsx
src/app/(app)/page.tsx
```

Le dashboard charge les données réelles :

- rendez-vous du mois
- rendez-vous du jour
- patients
- soldes patients

Il calcule :

- rendez-vous du jour
- patients attendus
- actes terminés
- actes annulés
- créances
- activité mensuelle

Les cartes possèdent un hover animé avec support de
`prefers-reduced-motion`.

## 13. Page traitements

Fichier :

```text
src/features/treatments/TreatmentsView.tsx
```

La page `/treatments` affiche :

- actes au programme
- actes terminés
- actes en cours
- montant planifié
- progression globale
- traitements regroupés par phase
- filtres patient et statut
- formulaire d'ajout d'acte

La route globale est :

```text
src/app/api/treatments/route.ts
```

## 14. Comment appliquer une future demande client

### Étape 1 : identifier la surface concernée

Exemples :

| Demande | Fichiers probables |
|---|---|
| Modifier un texte | `src/lib/i18n.tsx`, composant concerné |
| Ajouter une carte dashboard | `DashboardView.tsx` |
| Modifier les patients | `PatientsView.tsx`, `PatientForm.tsx`, API patients |
| Modifier l'odontogramme | `PatientDetailView.tsx`, route odontogramme |
| Modifier un traitement | `TreatmentsView.tsx`, route traitements |
| Modifier l'agenda | `AgendaView.tsx`, API appointments |
| Ajouter une icône | `src/components/ui/Icon.tsx` |
| Modifier la navigation | `nav.ts`, `Sidebar.tsx` |
| Ajouter un champ stocké | schéma, API, repository, formulaire et migration |

### Étape 2 : vérifier le flux complet

Pour une donnée dynamique, suivre systématiquement :

```text
UI
→ API client
→ route API
→ validation Zod
→ service
→ repository
→ MariaDB
→ réponse API
→ état React
→ affichage
```

Ne pas modifier uniquement l'interface si la demande implique une sauvegarde.

### Étape 3 : préserver le multi-tenant

Toute requête SQL doit inclure le tenant courant :

```sql
WHERE tenant_id = ?
```

Ne jamais utiliser un identifiant provenant du navigateur sans vérifier qu'il
appartient au tenant de la session.

### Étape 4 : préserver le bilingue

Pour tout nouveau texte :

```tsx
const { t } = useI18n();
```

Ajouter les traductions françaises et arabes dans `i18n.tsx`.

### Étape 5 : valider

Après une modification :

```bash
npm run build
```

Puis, si possible :

```bash
npm run lint
```

Tester manuellement le scénario demandé dans le navigateur.

## 15. Règles de modification

- Lire le code existant avant de créer une nouvelle logique.
- Réutiliser `Button`, `Card`, `Modal` et `Icon`.
- Utiliser les routes API existantes lorsqu'elles couvrent déjà le besoin.
- Garder les valeurs métier compatibles avec les schémas serveur.
- Ne pas mettre de secrets dans le code ou la documentation.
- Ne pas supprimer une fonctionnalité existante sans demande explicite.
- Afficher les erreurs API au lieu de les ignorer.
- Éviter les `as any`.
- Préférer les changements ciblés.
- Mettre à jour ce guide si l'architecture ou les flux changent.

## 16. Checklist avant livraison

- [ ] La demande client est couverte sur l'interface concernée.
- [ ] Les données sont réellement persistées si nécessaire.
- [ ] Les permissions sont respectées.
- [ ] Le `tenant_id` est vérifié côté serveur.
- [ ] Le français et l'arabe sont disponibles.
- [ ] Le mode RTL reste utilisable.
- [ ] Les états de chargement et d'erreur sont visibles.
- [ ] Les anciennes fonctionnalités continuent de fonctionner.
- [ ] `npm run build` réussit.
- [ ] Les fichiers modifiés sont documentés si nécessaire.

## 17. Limites et améliorations futures

Points encore perfectibles :

- Les pages de devis, factures, stock, laboratoire et rapports ne sont pas
  encore des modules métier complets.
- Les boutons Importer et CSV de la page traitements sont visuels et peuvent
  être reliés à un vrai flux CSV.
- Les notifications ne sont pas encore connectées à une source de données.
- Le sélecteur de langue est fonctionnel pour l'interface, mais les données
  métier stockées conservent leurs valeurs techniques françaises.
- Les migrations SQL devraient être centralisées dans un dossier de migrations
  plutôt que créées à la volée par certaines routes.
