# SmartCity — Gestion des signalements urbains

Application décentralisée permettant de déclarer un problème urbain,
de consulter son suivi et de conserver l’historique des interventions.

## Technologies

- Solidity 0.8.26
- Hardhat Local
- React et Vite
- ethers.js
- MetaMask
- SheetJS pour les fichiers Excel et CSV

## Fonctionnalités

- Créer et consulter un signalement.
- Empêcher la réutilisation d’un identifiant.
- Affecter une équipe avec le compte municipal.
- Modifier le statut dans l’ordre :
  Reported → Assigned → InProgress → Resolved → Closed.
- Consulter l’historique : dates, acteurs, équipes et commentaires.
- Lire un fichier Excel ou CSV, valider les lignes et les sélectionner.
- Enregistrer les lignes sélectionnées, une transaction par ligne.

Seul le compte municipal peut affecter une équipe et modifier le statut.
La création et la consultation sont accessibles aux autres comptes.

## Installation

Prérequis : Node.js, npm et l’extension MetaMask.

Depuis le dossier du projet :

```powershell
npm.cmd ci
```

L’installation initiale nécessite une connexion Internet.
Une fois les dépendances installées, la démonstration utilise le réseau local.

## Lancement

### 1. Démarrer la blockchain locale

Dans un premier terminal :

```powershell
npx.cmd hardhat node
```

Garder ce terminal ouvert. Si le port 8545 est déjà utilisé,
vérifier si un nœud Hardhat est déjà en cours d’exécution.

### 2. Déployer le contrat

Dans un deuxième terminal, depuis le dossier du projet :

```powershell
node scripts/deploy.mjs
```

Le script compile UrbanIssueRegistry, déploie le contrat et met à jour :

- frontend/src/generated/abi.json
- frontend/src/generated/address.json

L’adresse du contrat et celle du compte municipal sont affichées
dans le terminal.

### 3. Démarrer l’interface

Dans ce même deuxième terminal :

```powershell
npx.cmd vite frontend --host 127.0.0.1 --port 5174
```

Ouvrir l’adresse affichée après « Local: ».
Si le port est occupé, Vite choisit un autre port.

### 4. Configurer MetaMask

- Nom du réseau : Hardhat Local
- URL RPC : http://127.0.0.1:8545
- Chain ID : 31337
- Symbole : ETH

Pour la gestion municipale, utiliser le compte Hardhat numéro 0,
qui déploie le contrat.

Les comptes fournis par Hardhat sont publics et réservés aux tests.
Ne jamais les utiliser avec de vrais fonds.

## Tests

Pendant que Hardhat fonctionne, ouvrir un troisième terminal :

```powershell
node test/urban-issues.mjs
```

Les neuf tests vérifient :

1. La création et la lecture d’un signalement.
2. Le refus d’un identifiant déjà utilisé.
3. Le refus d’une affectation sans autorisation.
4. L’affectation par la municipalité.
5. Le refus d’un saut de statut.
6. Le refus d’une modification sans autorisation.
7. Le passage successif à En cours, Résolu puis Fermé.
8. La conservation des cinq étapes dans l’historique.
9. Le refus d’un numéro inexistant.

Résultat obtenu : 9 tests réussis sur 9.

Les tests déploient un contrat indépendant de celui de l’interface.

## Import Excel et CSV

Fichiers d’exemple :

- urban_issues.csv
- urban_issues.xlsx

Colonnes attendues :

issueId, issueType, location, description, reportDate,
priority, reportedBy, assignedTo, status

Règles d’import :

- Date au format AAAA-MM-JJ.
- Priorité : Low, Medium ou High.
- Pour l’enregistrement, status doit être Reported et assignedTo vide.
- Les équipes sont affectées ensuite dans la gestion municipale.
- Les champs obligatoires et doublons du fichier sont vérifiés.
- Les identifiants déjà enregistrés sont contrôlés avant l’envoi.
- Chaque ligne sélectionnée nécessite une confirmation MetaMask.

L’import utilise plusieurs transactions : si une transaction échoue,
les lignes déjà confirmées restent enregistrées.
Vérifier toute transaction envoyée avant de la relancer.

## Exemple de démonstration

1. Connecter MetaMask sur Hardhat Local.
2. Créer un signalement avec un identifiant unique.
3. Le rechercher avec son numéro numérique.
4. Affecter UrbanTeam01 avec un commentaire.
5. Passer successivement à En cours, Résolu puis Fermé.
6. Consulter l’historique.
7. Importer un fichier, sélectionner les lignes et confirmer les transactions.
8. Rechercher les signalements importés.

Après une modification municipale, cliquer à nouveau sur
« Rechercher » pour actualiser le résultat de consultation.

## Redémarrage du réseau local

Avec la configuration utilisée, arrêter puis relancer le nœud Hardhat
réinitialise la blockchain locale.

Il faut alors redéployer le contrat, actualiser l’interface
et recréer les signalements.

L’adresse utilisée par l’interface se trouve dans :
frontend/src/generated/address.json

## Données

Les données utilisées sont fictives.
Aucune clé privée ne doit être ajoutée au code frontend ni au dépôt GitHub.