# Harmony Repair

Portail de direction pour le garage Harmony Repair, sur serveur GTA V RP. Le tableau de bord donne l’effectif et les rappels des dossiers. La page Employés centralise les informations et pièces du personnel. L’onglet Contrats suit les entreprises, familles et groupes ainsi que leurs prestations autorisées. L’onglet Accès permet à l’admin principal d’autoriser ou retirer des comptes Discord.

## Organisation du projet

```text
/
├── index.html, styles.css          Accueil et styles partagés
├── assets/                         Logo, navigation et synchronisation du site
├── login/                          Connexion Discord
├── management/                     Tableau de bord et gestion du personnel
├── employees/                      Registre des employés
├── contracts/                      Contrats partenaires et recherche de prestations
├── services/                       Déclaration des prestations utilisées
├── directors/                      Gestion des accès administrateurs
├── api/
│   ├── auth/                       Début/retour de session Discord
│   └── management/                 Routes API protégées par domaine
└── lib/server/                     Auth, règles métier, stockage privé et validations
```

Les pages sont séparées par fonction, l’API porte les frontières d’accès, et `lib/server/` regroupe les traitements partagés. Les secrets et fichiers de configuration locaux sont exclus du dépôt par `.gitignore`; les secrets de production restent dans les variables d’environnement Vercel.

## Configuration Discord

Dans le portail développeur Discord, vérifie que le redirect OAuth exact est configuré :
https://harmony-repair.vercel.app/api/auth/callback/discord

Les variables Production attendues dans Vercel :
- AUTH_DISCORD_ID : identifiant de l’application Discord
- AUTH_DISCORD_SECRET : secret OAuth Discord
- AUTH_SECRET : secret aléatoire d’au moins 32 caractères
- HARMONY_ADMIN_IDS : identifiant Discord de l’admin principal, séparés par des virgules en cas de plusieurs admins principaux

L’admin principal peut ensuite ajouter les autres comptes via /directors/. Les documents, contrats et listes d’accès sont stockés dans le Blob privé harmony-rp-private-documents. Vercel fournit BLOB_READ_WRITE_TOKEN lorsque le magasin est connecté au projet.

## Rôles et permissions

Un employé dont la fiche contient son identifiant Discord peut se connecter avec Discord sans être ajouté une deuxième fois dans la liste des directeurs. Ses onglets et droits API de consultation sont déterminés par son rôle dans le garage. L’admin principal configure la matrice depuis l’onglet Accès; les changements sont stockés dans le Blob privé. Par défaut, les rôles Patron, Co-patron, DRH, RH et Chef d’atelier ont accès au tableau de bord, aux employés, aux contrats et aux partenaires. Mécano confirmé, Mécano apprenti et Stagiaire ont accès à Partenaires. La modification des fiches, des contrats et des documents reste réservée à la direction; la saisie des prestations est ouverte aux employés autorisés. L’onglet Accès est réservé à l’admin principal.

## Accès et documents

L’API vérifie la session Discord et le rôle sur le serveur avant chaque opération. Les écritures vérifient l’origine de la requête. Les documents sont vérifiés par signature de fichier, limités à 4 Mo par document, stockés en privé et téléchargés en pièce jointe. Formats acceptés : PDF, JPG, PNG et WebP.

Ces dossiers sont prévus pour des documents fictifs de personnages RP. Évite d’y déposer de vrais documents personnels.

## Rotation des identifiants

Si un secret Discord a été partagé dans une conversation, régénère-le dans le portail développeur Discord puis remplace AUTH_DISCORD_SECRET directement dans Vercel. Ne l’ajoute jamais au dépôt ni à une variable exposée au navigateur.

## Protection Vercel

La protection Vercel Authentication est indépendante de la connexion Discord et peut exiger un compte Vercel avant de montrer la page. Elle est conservée tant qu’un administrateur n’a pas demandé explicitement de l’enlever pour la production.
# Automatic site synchronization

All management pages load `assets/site-sync.js`. It broadcasts successful mutations to other open tabs and dispatches `harmony:refresh` after mutations, tab focus, and periodic synchronization. Pages that display API-backed records should subscribe to that event and reload their data, while skipping refreshes when a form or modal has unsaved input. Add the same script to future management tabs and register their page-specific refresh handler.
