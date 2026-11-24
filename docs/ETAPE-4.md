# Étape 4 — Dashboard de supervision

Le dashboard affiche les prospects du chat, leur qualification, l’historique de conversation, l’activité des agents et les produits sous le seuil de réapprovisionnement. Il actualise la liste et le fil d’activité avec les événements SSE. La fiche prospect permet aussi d’enregistrer une proposition locale de rendez-vous.

## Accès protégé

Les routes `/dashboard/*` et `/events/*` exigent un jeton Bearer. Ajoutez un secret long dans `apps/api/.env` :

```dotenv
DASHBOARD_API_TOKEN=remplacez_par_un_secret_aleatoire_long
```

Dans PowerShell 5.1, vous pouvez en générer un ainsi :

```powershell
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$token = [Convert]::ToBase64String($bytes)
$rng.Dispose()
$token
```

Copiez la valeur dans `apps/api/.env`, puis redémarrez l’API. Collez le même jeton sur la page de connexion du dashboard. Il reste en mémoire dans l’onglet et disparaît au rechargement ou à la fermeture.

## Démarrer

Depuis la racine du dépôt, dans deux terminaux :

```powershell
pnpm api:dev
```

```powershell
pnpm web:dev
```

Ouvrez `http://localhost:3000/dashboard`, entrez le jeton et sélectionnez un prospect pour voir sa conversation. La page d’accueil contient aussi un lien « Espace équipe ».

## Routes utilisées

- `GET /dashboard/summary` — compteurs de prospects, prospects chauds, qualification, alertes de stock et événements récents.
- `GET /dashboard/prospects` — liste, recherche (`q`), filtre par statut et température.
- `GET /dashboard/prospects/:id` — fiche et messages récents du prospect.
- `GET /appointments?prospectId=...`, `POST /appointments` et `POST /appointments/:id/sync` — voir, proposer ou synchroniser un créneau avec Google Calendar si les identifiants sont configurés.
- `GET /events/stream` — flux SSE pour rafraîchir le tableau à l’arrivée d’un événement.

Toutes ces routes et l’historique `/events` exigent `Authorization: Bearer <DASHBOARD_API_TOKEN>`. Sans jeton configuré, elles restent fermées. Le chat public `POST /chat` n’est pas protégé par ce jeton.

Une proposition utilise le statut `PROPOSED` et vérifie les conflits avec les autres rendez-vous PedalPilot. Si Google Calendar est configuré, elle crée un événement interne avec le type, l’horaire et le prénom du prospect, sans invité ni notification.
