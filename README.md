# Harmony Repair

Portail de direction pour le garage Harmony Repair, sur serveur GTA V RP. Le tableau de bord donne l’effectif et les rappels des dossiers. La page Employés centralise les informations et pièces du personnel. L’onglet Contrats suit les entreprises, familles et groupes ainsi que leurs prestations autorisées. L’onglet Accès permet à l’admin principal d’autoriser ou retirer des comptes Discord.

## Organisation

Les pages statiques sont réparties dans management/, employees/, contracts/, directors/ et login/. Les routes API sont dans api/ et la logique serveur partagée dans lib/server/. Les secrets restent dans les variables d’environnement Vercel.

## Configuration Discord

Dans le portail développeur Discord, vérifie que le redirect OAuth exact est configuré :
https://harmony-repair.vercel.app/api/auth/callback/discord

Les variables Production attendues dans Vercel :
- AUTH_DISCORD_ID : identifiant de l’application Discord
- AUTH_DISCORD_SECRET : secret OAuth Discord
- AUTH_SECRET : secret aléatoire d’au moins 32 caractères
- HARMONY_ADMIN_IDS : identifiant Discord de l’admin principal, séparés par des virgules en cas de plusieurs admins principaux

L’admin principal peut ensuite ajouter les autres comptes via /directors/. Les documents, contrats et listes d’accès sont stockés dans le Blob privé harmony-rp-private-documents. Vercel fournit BLOB_READ_WRITE_TOKEN lorsque le magasin est connecté au projet.

## Accès et documents

L’API vérifie la session Discord et le rôle sur le serveur avant chaque opération. Les changements doivent avoir la même origine que le site. Les documents sont vérifiés par signature de fichier, limités à 4 Mo par document, stockés en privé et téléchargés en pièce jointe. Formats acceptés : PDF, JPG, PNG et WebP.

Ces dossiers sont prévus pour des documents fictifs de personnages RP. Évite d’y déposer de vrais documents personnels.

## Rotation des identifiants

Si un secret Discord a été partagé dans une conversation, régénère-le dans le portail développeur Discord puis remplace AUTH_DISCORD_SECRET directement dans Vercel. Ne l’ajoute jamais au dépôt ni à une variable exposée au navigateur.

## Protection Vercel

La protection Vercel Authentication est indépendante de la connexion Discord et peut exiger un compte Vercel avant de montrer la page. Elle est conservée tant qu’un administrateur n’a pas demandé explicitement de l’enlever pour la production.
