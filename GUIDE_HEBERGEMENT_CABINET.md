# Guide d'hébergement pilote de DentaClinic dans un cabinet dentaire

## 1. Objet du guide

Ce guide explique comment installer DentaClinic sur un ordinateur du cabinet,
configurer MariaDB, servir l'application sur le réseau local et préparer une
phase pilote réelle.

Ce n'est pas un dossier de conformité réglementaire. Avant toute utilisation
avec des données réelles de patients, le cabinet doit faire valider :

- les règles de confidentialité et de conservation ;
- les droits d'accès des utilisateurs ;
- les procédures de sauvegarde et de restauration ;
- les modalités de consentement à l'enregistrement vocal ;
- la sécurité du réseau et des postes ;
- les obligations professionnelles et fiscales applicables.

## 2. Architecture cible recommandée

Pour un test pilote dans un cabinet, l'installation minimale est :

```text
Poste serveur Windows
├── DentaClinic / Next.js
├── MariaDB
├── Node.js
├── Stockage privé des documents médicaux
└── Sauvegarde quotidienne
          │
          └── Routeur local / réseau Wi-Fi du cabinet
                         │
                         ├── Ordinateur secrétaire
                         ├── Ordinateur praticien
                         └── Tablette ou poste suppléant
```

Pour le pilote, recommandez un serveur Windows dédié ou une borne fixe du
cabinet. Le poste serveur ne doit pas être utilisé comme poste personnel
courant.

Architecture minimale sûre :

- ordinateur Windows 64 bits ;
- adresse IP privée fixe pour le serveur ;
- pare-feu Windows configuré ;
- MariaDB accessible uniquement depuis localhost ou le réseau privé ;
- Next.js accessible via HTTPS ;
- certificats locaux reconnus par tous les postes ;
- sauvegarde quotidienne hors poste serveur ;
- espace disque surveillé.

## 3. Prérequis techniques

### 3.1 Logiciels

Installer :

- Node.js compatible avec Next.js 16 ;
- npm fourni avec Node.js ;
- MariaDB 10.11 ou 11.x ;
- Git, si le déploiement vient d'un dépôt ;
- un gestionnaire Windows de processus, par exemple PM2 ;
- optionnellement Caddy ou IIS comme proxy HTTPS.

La version actuellement déclarée dans le projet est Next.js 16.4.6.

Vérifier :

```powershell
node --version
npm.cmd --version
git --version
```

### 3.2 Ressources proposées

Pour 2 à 10 utilisateurs actifs :

- 4 cœurs CPU ;
- 8 Go de RAM ;
- SSD de 100 Go minimum ;
- 1 adresse IPv4 locale fixe ;
- espace supplémentaire pour les documents, photos et audios.

Pour l'enregistrement audio, prévoir au minimum plusieurs gigaoctets libres,
car chaque fichier peut atteindre 50 Mo.

## 4. Préparer MariaDB

### 4.1 Installer MariaDB

Pendant l'installation :

- activer le serveur ;
- choisir une méthode d'authentification disponible dans MariaDB ;
- choisir un mot de passe root puissant ;
- conserver le port 3306 ;
- activer le serveur sur l'interface privée uniquement si possible.

Se connecter :

```powershell
mysql -u root -p
```

Créer un compte dédié à l'application :

```sql
CREATE DATABASE dentaclinic CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'dentaclinic_app'@'localhost'
  IDENTIFIED BY 'REMPLACER_PAR_UN_MOT_DE_PASSE_FORT';

GRANT ALL PRIVILEGES ON dentaclinic.* TO 'dentaclinic_app'@'localhost';
FLUSH PRIVILEGES;
```

Ne pas utiliser le compte `root` par l'application.

Si Next.js tourne sur une autre machine que MariaDB, remplacer `localhost`
par l'adresse locale autorisée ou utiliser une connexion réseau explicitement
restreinte. Limitez l'accès au sous-réseau privé du cabinet.

### 4.2 Vérifier MariaDB

```powershell
mysql -h 127.0.0.1 -P 3306 -u dentaclinic_app -p dentaclinic
```

Un accès réussi confirme les identifiants, la base et le réseau.

## 5. Installer DentaClinic

Depuis PowerShell :

```powershell
cd C:\dentalflow\dentaflow
npm.cmd install
npm.cmd run build
```

Ne copier pas le fichier `.env.local` depuis un ordinateur sur un autre
ordinateur. Chaque serveur doit avoir ses propres secrets.

## 6. Configurer les secrets

Créer `.env.local` à la racine du projet :

```dotenv
DATABASE_URL=mysql://dentaclinic_app:REMPLACER@127.0.0.1:3306/dentaclinic
JWT_SECRET=REMPLACER_PAR_64_CARACTERES_ALEATOIRES_MINIMUM
PATIENT_DOCUMENTS_STORAGE_DIR=C:/DentaClinicData/documents
```

Remarques :

- `DATABASE_URL` est obligatoire ;
- `JWT_SECRET` doit contenir au moins 32 caractères ;
- chaque changement du secret JWT déconnecte les sessions ;
- `PATIENT_DOCUMENTS_STORAGE_DIR` doit pointer vers un répertoire privé ;
- ne mettez pas le mot de passe MariaDB dans Git ;
- ne partagez ni `.env.local` ni les clés réelles.

Générer un secret JWT sur Windows :

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

Ne pas utiliser un secret déjà visible dans un terminal, une capture ou un
guide partagé.

Créer le dossier privé des documents :

```powershell
New-Item -ItemType Directory -Force C:\DentaClinicData\documents
icacls C:\DentaClinicData\documents /inheritance:r
icacls C:\DentaClinicData\documents /grant:r "BUILTIN\Administrators:(OI)(CI)F"
icacls C:\DentaClinicData\documents /grant:r "$env:USERNAME:(OI)(CI)F"
```

Pour une installation gérée par une autre identité de service Windows,
accordez les droits à cette identité uniquement.

## 7. Comprendre les migrations et les tables

Le projet ne contient pas actuellement de migrations SQL centralisées dans
`database/migrations`.

Plusieurs modules créent leurs tables avec `CREATE TABLE IF NOT EXISTS` lors du
premier accès ou du démarrage d'une API. Pour cette raison :

1. Ne créez pas toutes les tables manuellement sans vérifier les SQL du dépôt.
2. Connectez-vous une première fois avec la base vide.
3. Ouvrez les modules principaux pour déclencher la création des tables.
4. Sauvegardez la base dès que les premières tables sont créées.
5. Avant une mise à jour, sauvegardez MariaDB et les documents.
6. Dans le futur, ajoutez des migrations SQL versionnées avant une évolution
   importante.

Avant le pilote, vérifiez que les deux bases suivantes sont disponibles :

- fondations : patients, rendez-vous, utilisateurs, audit ;
- modules : consultations, odontogramme, traitements, factures, stock,
  laboratoire, enregistrements audio et permissions.

## 8. Créer le cabinet et les comptes

À partir du dossier du projet :

```powershell
node --env-file=.env.local scripts\create-admin.mjs
```

Malgré le nom historique, le script accepte maintenant les types de compte
`DENTIST` ou `SECRETARY`. Il crée :

- le tenant du cabinet ;
- le cabinet principal ;
- le premier compte ;
- l'abonnement d'essai ;
- le lien utilisateur/cabinet.

Pour ajouter des comptes ensuite :

```powershell
node --env-file=.env.local scripts\create-user.mjs
```

Donnez :

- au praticien le type `DENTIST` ;
- à la secrétaire le type `SECRETARY` ;
- des mots de passe uniques ;
- des droits précis avec les groupes d'accès.

Ne créez pas un compte partagé. Chaque utilisateur doit avoir son identité
pour préserver les journaux d'audit.

## 9. Tester l'application en local

Pour le développement uniquement :

```powershell
npm.cmd run dev
```

Ouvrir :

```text
http://localhost:3000
```

Pour tester le microphone, `localhost` est considéré comme un contexte sécurisé.
Une machine distante accédant à `http://adresse-locale` ne bénéficiera pas
nécessairement de cette exception.

Avant le démarrage réel, valider :

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd exec next -- --version
```

## 10. Publier sur le réseau du cabinet

### 10.1 Adresse IP fixe

Sur le routeur du cabinet ou dans Windows :

- réserver une adresse IP locale au serveur ;
- activer Windows uniquement sur le réseau privé ;
- ouvrir le port 3000 sur le pare-feu du serveur ;
- limiter les appareils autorisés si le routeur le permet ;
- ne pas ouvrir le port 3000 sur Internet tant que HTTPS n'est pas actif.

Trouver l'adresse privée :

```powershell
ipconfig
```

Exemple attendu :

```text
192.168.1.50
```

Pour un test interne initial :

```powershell
npm.cmd run dev -- --hostname 0.0.0.0
```

Puis tester depuis un autre PC :

```text
http://192.168.1.50:3000
```

Cette URL HTTP n'est pas suffisante pour le microphone sur un poste distant.

### 10.2 HTTPS recommandé sur le réseau local

Le navigateur exige HTTPS pour `getUserMedia` utilisé par les enregistrements
audio, sauf sur `localhost`.

Options :

1. reverse proxy HTTPS Caddy ou IIS ;
2. domaine privé interne avec certificats ;
3. VPN sécurisé avec HTTPS ;
4. hébergement Internet avec domaine public et certificat reconnu.

Exemple conceptuel avec Caddy :

```text
cabinet.local {
    reverse_proxy 127.0.0.1:3000
}
```

Le nom DNS `cabinet.local` doit être résolu par tous les postes, et le
certificat doit être approuvé par tous les navigateurs.

Ne vous appuyez pas sur un certificat auto-signé non installé sur les postes :
Chrome, Edge et les autres navigateurs peuvent bloquer le microphone.

## 11. Lancer Next.js en production

Créer le build :

```powershell
npm.cmd install
npm.cmd run build
```

Test de démarrage :

```powershell
npm.cmd run start
```

Next.js écoute alors par défaut sur `localhost:3000`. Pour lancer sur le réseau :

```powershell
npm.cmd exec next -- start --hostname 0.0.0.0 --port 3000
```

### 11.1 Processus permanent avec PM2

Installer PM2 :

```powershell
npm.cmd install --global pm2
npm.cmd install --global pm2-windows-startup
pm2-startup install
```

Depuis la racine du projet :

```powershell
npm.cmd run build
pm2 start npm --name dentaclinic -- run start
pm2 save
```

PM2 démarre après le démarrage Windows si le démarrage automatique a été
installé correctement.

Commandes utiles :

```powershell
pm2 status
pm2 logs dentaclinic
pm2 restart dentaclinic
pm2 stop dentaclinic
pm2 save
```

## 12. Reverse proxy HTTPS

### 12.1 Gardez Next.js interne

L'application peut rester sur `127.0.0.1:3000`. Le proxy accepte les connexions
HTTPS et les transmet à Next.js.

Ouvrez uniquement les ports nécessaires :

- HTTPS : 443 ;
- HTTP : 80 pour rediriger vers HTTPS ;
- SSH/administration : restreint à l'administrateur si Internet est utilisé.

### 12.2 Pare-feu Windows

Sur le serveur :

```powershell
New-NetFirewallRule -DisplayName "DentaClinic HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
New-NetFirewallRule -DisplayName "DentaClinic local HTTP" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

En production HTTPS, le port 3000 peut être fermé au réseau extérieur. La
liaison à `127.0.0.1` suffit.

## 13. Sauvegarde

Une sauvegarde complète comprend :

1. la base MariaDB ;
2. `PATIENT_DOCUMENTS_STORAGE_DIR` ;
3. `.env.local` sauvegardé hors ligne ;
4. une liste des versions Node/npm ;
5. une copie du code publié ;
6. le registre des certificats.

Sauvegarde MariaDB :

```powershell
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
mariadb-dump -h 127.0.0.1 -u dentaclinic_app -p dentaclinic |
  Set-Content -Encoding utf8 "C:\DentaClinicBackups\dentaclinic-$timestamp.sql"
```

Sauvegarde des documents :

```powershell
robocopy C:\DentaClinicData\documents C:\DentaClinicBackups\documents /MIR /R:3 /W:5
```

Copiez les sauvegardes vers un second support :

- disque externe chiffré ;
- stockage réseau chiffré ;
- stockage hors site approuvé ;
- ne les laissez pas uniquement sur le serveur.

Fréquence recommandée pour le pilote :

- base : toutes les nuits ;
- documents : toutes les nuits ;
- sauvegarde complète avant chaque mise à jour ;
- test de restauration au moins une fois pendant le pilote.

Ne tenez pas compte d'une sauvegarde comme réussie avant d'avoir testé une
restauration sur une autre base.

## 14. Permissions et groupes

Le modèle actuel utilise des comptes `DENTIST` et `SECRETARY` plus des groupes
de droits. Il n'y a pas de rôle administrateur distinct.

Configuration recommandée pour le pilote :

- médecin : agenda, patients, consultations, odontogramme, traitements,
  documents cliniques, trésorerie selon les responsabilités ;
- secrétaire : agenda, patients, factures et opérations autorisées ;
- équipe/paramètres : uniquement pour les personnes responsables du cabinet ;
- aucune permission implicite sur toutes les opérations.

Dans Équipe & accès :

1. créez les groupes ;
2. affectez les droits module par module ;
3. ajoutez les utilisateurs ;
4. vérifiez les exceptions individuelles ;
5. testez chaque compte sur une autre session privée.

Ne donnez pas tous les droits à tous les comptes pour éviter de masquer les
vrais défauts d'autorisation pendant le pilote.

## 15. Test pilote sur le terrain

### 15.1 Durée

Phase recommandée :

- 2 à 3 jours pour les tests internes ;
- 1 semaine avec quelques dossiers fictifs ;
- 2 à 4 semaines avec un volume limité de dossiers réels ;
- revue quotidienne avec praticien et secrétaire.

### 15.2 Tests obligatoires

#### Authentification

- connexion secrétaire ;
- connexion praticien ;
- déconnexion ;
- mot de passe incorrect ;
- compte désactivé ;
- expiration de la session ;
- navigation avec compte sans droit.

#### Patients

- création ;
- recherche ;
- modification ;
- archivage/restauration ;
- dossier patient ;
- liens depuis rendez-vous.

#### Agenda

- création ;
- conflit praticien/fauteuil ;
- modification ;
- reporter ;
- chaque état du rendez-vous ;
- fermeture automatique de la popup ;
- confirmation, arrivée, consultation, annulation, absence.

#### Consultations

- création clinique ;
- recherche ;
- enregistrement vocal ;
- consentement ;
- lecture ;
- ajout automatique dans le dossier consultation ;
- limites de taille et durée.

#### Odontogramme

- dent adulte ;
- dent enfant ;
- état initial ;
- état actuel ;
- sauvegarde ;
- impression/PDF sans en-tête URL.

#### Facturation

- devis ;
- conversion ;
- facture ;
- paiement ;
- solde ;
- montant et devise.

#### Stock

- article ;
- seuil ;
- lot ;
- expiration ;
- réapprovisionnement.

#### Laboratoire

- nouvelle commande ;
- échéance ;
- changement d'étape ;
- terminée.

#### Permissions

Testez :

- lecture refusée ;
- création refusée ;
- modification refusée ;
- suppression refusée ;
- accès direct à une URL API ;
- accès direct à une page interdite.

## 16. Enregistrements vocaux

Avant le test vocal :

- confirmer HTTPS ;
- autoriser le microphone dans Edge/Chrome ;
- vérifier que Windows active le bon périphérique ;
- fermer les applications utilisant déjà le micro ;
- demander le consentement explicite du patient ;
- informer le patient du traitement et de la durée de conservation ;
- ne pas enregistrer sans consentement ;
- utiliser une fiche fictive avant les vrais patients.

Le système prend actuellement en charge :

- WebM ;
- MP4 ;
- 50 Mo maximum ;
- 30 minutes maximum ;
- stockage privé hors base ;
- métadonnées en MariaDB ;
- rattachement automatique à une consultation du jour ;
- création d'une consultation si aucune consultation n'existe.

Supprimez les fichiers directement dans l'interface pour appliquer la procédure
de suppression prévue. Les sauvegardes peuvent conserver temporairement une
copie : documentez également leur durée de rétention.

## 17. Sécurité réseau

Pendant le pilote :

- utilisez une Wi-Fi dédiée ou VLAN du cabinet ;
- changez les mots de passe Wi-Fi ;
- désactivez le routage Internet depuis les équipements inutiles ;
- n'exposez pas MariaDB sur Internet ;
- utilisez HTTPS ;
- désactivez les accès distants non nécessaires ;
- verrouillez le poste serveur ;
- utilisez Windows Update ;
- utilisez un antivirus à jour ;
- ne partagez pas les comptes ;
- créez des comptes avec accès limité.

Ne redirigez pas MariaDB 3306 vers Internet.

## 18. Supervision

Sur le serveur, surveillez :

```powershell
pm2 status
pm2 logs dentaclinic --lines 200
Get-PSDrive C
Get-Service -Name MariaDB
```

Si MariaDB utilise un autre nom de service, vérifiez :

```powershell
Get-Service | Where-Object {$_.Name -like "*maria*" -or $_.DisplayName -like "*Maria*"}
```

Sur chaque poste :

- taille du cache navigateur ;
- autorisation microphone ;
- certificat HTTPS ;
- sauvegarde des favoris ;
- version de Chrome ou Edge ;
- déconnexion automatique après huit heures.

## 19. Mise à jour

Avant chaque mise à jour :

1. arrêter les nouveaux utilisateurs ;
2. sauvegarder MariaDB ;
3. sauvegarder les documents ;
4. sauvegarder `.env.local` ;
5. récupérer les changements Git ;
6. installer les dépendances ;
7. exécuter lint ;
8. exécuter build ;
9. démarrer sur une copie pilote ;
10. tester les fonctions critiques ;
11. publier sur le serveur ;
12. redémarrer PM2.

```powershell
git pull --ff-only
npm.cmd install
npm.cmd run lint
npm.cmd run build
pm2 restart dentaclinic
```

Ne mettez pas à jour Next.js immédiatement en production. Testez d'abord la
version sur une copie ou une machine pilote.

## 20. Dépannage

### Application inaccessible

Vérifier :

```powershell
pm2 status
pm2 logs dentaclinic
Test-NetConnection 127.0.0.1 -Port 3000
```

### Base MariaDB inaccessible

Vérifier :

```powershell
Test-NetConnection 127.0.0.1 -Port 3306
```

Puis vérifier `DATABASE_URL`, les identifiants MariaDB et les privilèges.

### Session invalide

Vérifier :

- présence de `.env.local` ;
- longueur minimale de `JWT_SECRET` ;
- cookie du navigateur ;
- heure du serveur ;
- compte actif ;
- compte existant dans le tenant.

### Microphone refusé

Vérifier :

- HTTPS ou localhost ;
- autorisation du domaine dans le navigateur ;
- périphérique actif dans Windows ;
- aucune autre application utilisant le micro ;
- Chrome/Edge à jour ;
- certificat HTTPS reconnu.

### Page sans droits

Vérifier :

- groupe affecté ;
- permission individuelle ;
- module concerné ;
- action concernée ;
- statut actif du compte ;
- rafraîchir la session après modification.

### PDF sans adresse localhost

Le PDF de l'odontogramme est généré dans le navigateur avec html2canvas/jspdf.
Ne servez pas la page avec HTTP depuis un autre poste si l'impression doit être
intégrée à un flux HTTPS. Si `window.print` est utilisé par un autre écran,
les en-têtes du navigateur peuvent apparaître dans la boîte d'impression.

## 21. Critères de passage en pilote réel

Avant d'autoriser des données réelles, tous les points suivants doivent être
validés :

- MariaDB fonctionne avec sauvegarde ;
- documents stockés sur volume persistant ;
- `.env.local` sécurisé ;
- HTTPS actif ;
- comptes individuels actifs ;
- droits testés ;
- réseau limité ;
- sauvegarde/restauration testée ;
- enregistrements audio testés ;
- journaux d'audit présents ;
- procédure de déconnexion connue ;
- responsable technique désigné ;
- responsable de données désigné ;
- consigne patient préparée ;
- rollback disponible.

## 22. Checklist finale

```text
[ ] Node.js installé
[ ] MariaDB installé
[ ] Base dentaclinic créée
[ ] Utilisateur MariaDB applicatif limité
[ ] DATABASE_URL configurée
[ ] JWT_SECRET unique généré
[ ] Dossier des documents créé
[ ] Build réussi
[ ] Premier cabinet créé
[ ] Comptes praticien/secrétaire créés
[ ] Permissions vérifiées
[ ] HTTPS ou localhost validé
[ ] Microphone testé
[ ] Sauvegarde MariaDB testée
[ ] Sauvegarde des fichiers testée
[ ] Restauration testée
[ ] PM2 démarré
[ ] Adresse locale réservée
[ ] Pare-feu configuré
[ ] Accès Internet limité
[ ] Tests pilote terminés
[ ] Validation du cabinet obtenue
```
