# Étape 5 — Rendez-vous et Google Calendar

Depuis la fiche d’un prospect, l’équipe peut proposer un rendez-vous avec un type, une date, une durée et une note interne. PedalPilot refuse les conflits avec ses propres rendez-vous et publie `appointment.proposed` sur son bus d’événements.

Quand Google Calendar est configuré, le rendez-vous est aussi créé dans l’agenda choisi. L’événement contient le type, l’horaire et le prénom du prospect. Il ne contient ni e-mail, ni téléphone, ni note. Aucun invité n’est ajouté et aucune notification n’est envoyée. Les rendez-vous déjà enregistrés peuvent être synchronisés depuis la fiche prospect.

## Configuration Google

1. Dans Google Cloud Console, créez un projet et activez **Google Calendar API**.
2. Configurez l’écran de consentement OAuth et ajoutez votre compte comme utilisateur test si l’application est en mode test.
3. Créez un identifiant OAuth de type **Application Web** et ajoutez `https://developers.google.com/oauthplayground` comme URI de redirection autorisée.
4. Ouvrez [OAuth 2.0 Playground](https://developers.google.com/oauthplayground), ouvrez ses paramètres, puis cochez **Use your own OAuth credentials** et saisissez l’identifiant et le secret OAuth.
5. Dans l’étape 1 du Playground, demandez le scope `https://www.googleapis.com/auth/calendar.events`, autorisez l’accès et connectez l’agenda concerné.
6. Dans l’étape 2, échangez le code et copiez le `refresh_token`.
7. Ajoutez les valeurs dans `apps/api/.env` :

```dotenv
GOOGLE_CLIENT_ID="votre-client-id"
GOOGLE_CLIENT_SECRET="votre-client-secret"
GOOGLE_REFRESH_TOKEN="votre-refresh-token"
GOOGLE_CALENDAR_ID="primary"
```

`primary` désigne l’agenda principal du compte qui a autorisé l’accès. Vous pouvez mettre l’identifiant d’un autre agenda à la place. Ne partagez pas ces secrets et ne les ajoutez pas au dépôt Git.

Après avoir enregistré `.env`, redémarrez l’API avec `pnpm api:dev`. Les nouveaux créneaux seront synchronisés automatiquement. Pour un créneau existant, ouvrez la fiche prospect et cliquez sur **Synchroniser avec Google Calendar**. En cas d’erreur, le rendez-vous reste enregistré dans PedalPilot et le message de synchronisation s’affiche.

Si l’écran OAuth est en mode test, Google peut faire expirer le refresh token après sept jours pour une application externe. Pour une intégration durable, configurez la publication et le statut OAuth appropriés dans Google Cloud.

## Tester

1. Ouvrez `http://localhost:3000/dashboard` et authentifiez-vous avec le jeton du dashboard.
2. Ouvrez un prospect et proposez un rendez-vous futur.
3. Vérifiez dans l’agenda Google configuré que l’événement contient seulement le type, l’horaire et le prénom, sans invité ni notification.
4. Vérifiez qu’un `googleEventId` est associé au rendez-vous dans Prisma Studio.

Les créneaux proposés lisent les événements occupés de l’agenda Google configuré et vérifient les rendez-vous PedalPilot. La réservation recontrôle les deux sources.
