# E-mail des rendez-vous via n8n Cloud et Gmail

PedalPilot envoie une confirmation lorsqu’un rendez-vous est créé pour un prospect qui a une adresse e-mail. Avec cette configuration, l’API transmet à votre webhook n8n l’adresse du prospect, son prénom, le type et l’heure du rendez-vous, ainsi que le lien d’annulation. n8n remet le message à Gmail pour l’envoi.

L’adresse saisie dans le chat est enregistrée dans la fiche prospect, mais ne déclenche pas d’e-mail à elle seule. Les notes privées du rendez-vous ne sont pas transmises.

## 1. Créer le webhook n8n

1. Dans n8n Cloud, créez un workflow et ajoutez un nœud **Webhook**.
2. Réglez **HTTP Method** sur `POST`, définissez un chemin comme `pedalpilot-appointment-email` et choisissez **Authentication: Header Auth**.
3. Créez les identifiants Header Auth suivants :
   - **Name** : `Authorization`
   - **Value** : `Bearer ` suivi d’un secret aléatoire long.
4. Dans **Respond**, choisissez **When Last Node Finishes**. Ainsi, PedalPilot ne considère l’e-mail comme envoyé qu’après la réussite du nœud Gmail.

Ne partagez pas ce secret. Il doit être identique dans les identifiants du nœud Webhook et dans `N8N_WEBHOOK_SECRET`.

## 2. Relier Gmail

1. Après Webhook, ajoutez un nœud **Gmail**.
2. Créez ses identifiants et connectez le compte Gmail expéditeur par OAuth.
3. Choisissez **Resource: Message**, **Operation: Send**.
4. Remplissez les champs avec les expressions suivantes :
   - **To** : `={{ $json.body.to }}`
   - **Subject** : `={{ $json.body.subject }}`
   - **Email Type** : `HTML`
   - **Message** : `={{ $json.body.html }}`
5. Désactivez **Append n8n attribution** pour retirer le pied de page automatique n8n.
6. Enregistrez et activez le workflow.

Le nœud Gmail permet d’envoyer un message avec destinataire, objet et contenu HTML. Voir [la documentation n8n du nœud Gmail](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/message-operations/).

## 3. Configurer PedalPilot

Dans `apps/api/.env`, renseignez l’URL de **Production** affichée par le nœud Webhook (l’URL `/webhook/…`, pas `/webhook-test/…`) et le même secret :

```dotenv
N8N_WEBHOOK_URL="https://votre-instance.app.n8n.cloud/webhook/pedalpilot-appointment-email"
N8N_WEBHOOK_SECRET="remplacer-par-le-meme-secret-long"
BUSINESS_TIME_ZONE="Europe/Paris"
WEB_ORIGIN="http://localhost:3000"
```

Redémarrez l’API. Quand les deux variables `N8N_WEBHOOK_URL` et `N8N_WEBHOOK_SECRET` sont configurées, PedalPilot utilise n8n pour les confirmations. Resend reste disponible comme solution de repli lorsque n8n n’est pas configuré.

## 4. Vérifier le flux

1. Dans le chat PedalPilot, saisissez l’adresse e-mail de votre propre compte Gmail et envoyez un message pour l’associer au prospect.
2. Dans le dashboard, créez un rendez-vous pour ce prospect.
3. Vérifiez le statut d’exécution du workflow dans n8n puis la réception dans Gmail.
4. Dans le dashboard, l’état e-mail doit afficher `sent` si le webhook et le nœud Gmail ont réussi.

Pour utiliser le bouton d’annulation reçu par e-mail après le déploiement, remplacez `WEB_ORIGIN` par l’URL publique du site. En local, le lien pointe vers votre machine et n’est utilisable que depuis celle-ci.

## Essai n8n Cloud

L’essai Cloud peut servir à construire et valider le workflow. Selon l’offre actuellement affichée par n8n, il dure 14 jours et comprend 1 000 exécutions. Ce n’est pas un hébergement gratuit permanent ; exportez le workflow avant la fin de l’essai si vous comptez ensuite le déplacer.
