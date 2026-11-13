# Harmony Repair

Portail de direction pour le garage Harmony Repair, sur serveur GTA V RP. La page d’accueil redirige vers le tableau de bord, avec un onglet employés et le suivi des pièces administratives (carte d’identité RP, permis et diplôme).

## Développement local

Le site est séparé en pages statiques (management/, employees/, login/), routes Vercel Functions (api/) et logique serveur partagée (lib/server/). Aucun secret n’est enregistré dans le dépôt.

## Connexion Discord et accès direction

1. Dans le portail développeur Discord, vérifie que l’application possède le redirect OAuth exact https://harmony-repair.vercel.app/api/auth/callback/discord.
2. Configure dans Vercel > harmony-repair > Settings > Environment Variables pour Production : AUTH_DISCORD_ID, AUTH_DISCORD_SECRET et AUTH_SECRET (secret aléatoire d’au moins 32 caractères).
3. Configure HARMONY_DIRECTOR_IDS avec les identifiants numériques Discord des membres de direction autorisés, séparés par des virgules. Active le mode développeur Discord, clic droit sur le profil puis Copier l’identifiant de l’utilisateur.
4. Relie le stockage Blob privé harmony-rp-private-documents au projet et à l’environnement Production. Vercel doit fournir BLOB_READ_WRITE_TOKEN.
5. Redéploie la production après tout changement de variables.

Après la connexion OAuth, l’API contrôle l’identifiant Discord dans la liste autorisée. Sans identifiant configuré, l’accès aux données est refusé. Les documents (PDF/JPG/PNG/WebP, 4 Mo maximum) sont privés et ne sont servis qu’après vérification de la session et du rôle directeur. Les types de fichiers sont contrôlés côté serveur par signature binaire. Les requêtes de modification doivent provenir du même site.

## Sécurité des identifiants

Si le Client Secret Discord a été envoyé dans une conversation, régénère-le dans le portail développeur Discord et remplace AUTH_DISCORD_SECRET dans Vercel. Ne place jamais le secret dans le code, GitHub ou une variable préfixée NEXT_PUBLIC_.

## Limites de cette première version

Les dossiers employés sont conservés comme fichiers JSON séparés dans Blob privé. Cette solution convient à un petit effectif, mais une base PostgreSQL sera préférable si plusieurs responsables modifient souvent les dossiers simultanément. La protection Vercel Authentication peut aussi demander un compte Vercel avant d’atteindre la connexion Discord ; pour ouvrir le portail aux directeurs via Discord uniquement, il faudra ensuite choisir explicitement de retirer cette protection ou de connecter un domaine personnalisé.
