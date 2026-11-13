# Harmony Repair

Site vitrine statique avec une fonction Vercel pour l’authentification Discord.

## Développement local

Le site vitrine est dans `index.html` et `styles.css`. La page de connexion et ses styles/scripts se trouvent dans `login/`. Le flux d’authentification est séparé dans `api/auth/` et utilise Auth.js Core avec des cookies de session chiffrés. Aucun secret n’est conservé dans le dépôt.

## Activer la connexion Discord

1. Dans le [portail développeur Discord](https://discord.com/developers/applications), crée une application et copie son Client ID ainsi que son Client Secret.
2. Dans **OAuth2 > Redirects**, ajoute exactement : `https://harmony-repair.vercel.app/api/auth/callback/discord`.
3. Dans **Vercel > harmony-repair > Settings > Environment Variables**, ajoute ces variables pour l’environnement **Production** :
   - `AUTH_DISCORD_ID` : Client ID Discord
   - `AUTH_DISCORD_SECRET` : Client Secret Discord
   - `AUTH_SECRET` : secret aléatoire d’au moins 32 caractères (générer avec `openssl rand -base64 32`)
4. Redéploie la production si Vercel ne lance pas automatiquement un déploiement après l’ajout des variables.

La portée Discord est limitée à `identify`; le site ne demande pas l’accès à l’e-mail. Auth.js vérifie state/PKCE et protège les actions de session contre les requêtes CSRF. Les sessions JWT sont chiffrées dans un cookie HttpOnly, SameSite=Lax, avec une durée de sept jours. Les données du profil ne sont pas persistées dans une base de données.

La page est `/login/`. Le callback OAuth est `/api/auth/callback/discord`. Les headers de sécurité sont définis dans `vercel.json`.

## Limite actuelle du formulaire de contact

Le formulaire de contact existant utilise `mailto:`. Il devra être raccordé à un service serveur si tu souhaites recevoir les demandes directement sans client mail.

