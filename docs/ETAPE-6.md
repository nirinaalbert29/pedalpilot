# Étape 6 — Réservation de stock liée aux rendez-vous

Cette étape relie le stock au parcours rendez-vous. Depuis la fiche prospect, l’équipe peut choisir un produit disponible à réserver. La réservation et le rendez-vous sont enregistrés ensemble ; le stock ne peut pas devenir négatif si deux personnes réservent simultanément la dernière unité.

## Fonctionnement

- Le champ **Article à réserver** est facultatif. Sans article sélectionné, le rendez-vous suit le parcours habituel.
- Une réservation décrémente le stock et crée un mouvement `RESERVATION` lié au rendez-vous.
- **Annuler** libère toute réservation encore active, rétablit le stock et crée un mouvement `RELEASE`.
- **Terminer** marque les réservations actives `FULFILLED` : le stock reste décrémenté. Cette action n’est disponible qu’après l’heure de fin.
- Le tableau de bord reçoit les événements de réservation, d’indisponibilité, d’annulation et de clôture.
- Si le prospect a une adresse e-mail et que n8n ou Resend est configuré, PedalPilot lui envoie un récapitulatif contenant son prénom, le type et l’horaire du rendez-vous, ainsi qu’un lien de confirmation d’annulation. n8n est prioritaire lorsque son URL de webhook et son secret sont configurés.
- Le lien ouvre une page de confirmation. Après confirmation, PedalPilot annule le rendez-vous, libère le stock et supprime son événement Google Calendar s’il avait été créé.

Si Google Calendar ou un service d’e-mail ne sont pas configurés, le rendez-vous et la réservation restent enregistrés localement. L’état de synchronisation est indiqué au tableau de bord.

## Configuration de l’e-mail

Pour passer par n8n Cloud et Gmail, suivez [le guide n8n et Gmail](./N8N-GMAIL.md). Resend reste disponible comme solution de repli :

```dotenv
RESEND_API_KEY="votre-cle-resend"
MAIL_FROM="PedalPilot <rendez-vous@votre-domaine.fr>"
BUSINESS_TIME_ZONE="Europe/Paris"
WEB_ORIGIN="http://localhost:3000"
```

Remplacez le fuseau horaire par celui de la boutique si nécessaire. Pour un déploiement, `WEB_ORIGIN` doit être l’URL publique du site.

## Routes protégées du dashboard

Toutes ces routes demandent `Authorization: Bearer <DASHBOARD_API_TOKEN>` :

- `GET /dashboard/products` — produits actifs et quantité disponible.
- `POST /appointments` — peut recevoir `productId` en option ; réserve une unité si ce champ est fourni.
- `POST /appointments/:id/cancel` — annule localement et libère les réservations actives.
- `POST /appointments/:id/complete` — clôture un rendez-vous terminé et consomme ses réservations.

## Lien public d’annulation

`POST /appointments/public/cancel` ne demande pas le jeton du dashboard. Il exige le jeton aléatoire de 256 bits contenu dans le lien e-mail, et n’annule rien lors d’un simple affichage de la page. Le prospect doit confirmer son action, qui annule le rendez-vous, libère le stock et tente de supprimer l’événement Google Calendar correspondant.

Exemple de corps pour `POST /appointments` :

```json
{
  "prospectId": "id-du-prospect",
  "startsAt": "2030-05-20T10:00:00.000Z",
  "type": "TEST_RIDE",
  "productId": "id-du-produit"
}
```

## Vérification manuelle

1. Ouvrez le dashboard, sélectionnez un prospect et choisissez un produit qui a du stock.
2. Proposez un rendez-vous : le stock affiché doit baisser d’une unité et l’article doit apparaître dans le rendez-vous.
3. Annulez ce rendez-vous : la quantité doit revenir à sa valeur initiale.
4. Pour vérifier la clôture, proposez un rendez-vous dont l’heure de fin est passée, puis cliquez sur **Terminer**. La réservation passe à `FULFILLED` et le stock ne remonte pas.
5. Tentez de réserver le dernier exemplaire deux fois : la seconde demande doit être refusée avec un conflit, sans stock négatif.
6. Avec n8n ou Resend configuré et un prospect qui a une adresse e-mail, proposez un rendez-vous et vérifiez la réception du récapitulatif. Ouvrez son lien d’annulation, confirmez l’action et vérifiez que le rendez-vous, son événement Google et la réservation de stock sont annulés.
