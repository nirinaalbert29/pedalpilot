# Relances e-mail et WhatsApp avec n8n Cloud

Après un message, PedalPilot programme une relance à 24 h et, si elle est envoyée, une seconde 72 h plus tard. Les échéances repartent du dernier message. Une nouvelle réponse, un rendez-vous, une reprise humaine, ou le retrait du consentement annule les tâches en attente. Chaque canal exige son consentement séparé.

Le texte bref est personnalisé par le LLM configuré dans l’API, avec un texte de secours. n8n livre les messages et renvoie le résultat à l’API. L’URL de préférences arrête les deux canaux. Les secrets du fournisseur se gardent dans les Credentials n8n, jamais dans le dépôt.

## 1. Préparer la base et l’API

La migration ajoute le consentement WhatsApp et renomme le jeton de désinscription en jeton commun aux canaux. En local, ajoutez `DIRECT_URL` à `apps/api/.env` : il peut être identique à `DATABASE_URL` pour PostgreSQL local. Sur Neon, gardez `DATABASE_URL` avec le pooler pour l’API et `DIRECT_URL` avec le nom d’hôte sans `-pooler` pour les migrations. Prisma utilise automatiquement `DIRECT_URL` pour `migrate deploy`.

```powershell
pnpm db:migrate
pnpm --filter api exec prisma generate
```

En production, ajoutez `DIRECT_URL` aux variables du service API Render et utilisez la commande de démarrage `pnpm --filter api start:prod:migrate`. Elle applique les migrations en attente avant de lancer l’API. Gardez `N8N_FOLLOWUP_TOKEN` et `WEB_ORIGIN` dans les variables de l’API. L’API doit être joignable par n8n Cloud en HTTPS ; `localhost` ne fonctionne pas depuis n8n Cloud.

Après avoir publié et activé les deux branches du workflow, et après approbation du modèle Meta, définissez `WHATSAPP_FOLLOWUPS_ENABLED=true` dans le service API et `NEXT_PUBLIC_WHATSAPP_FOLLOWUPS_ENABLED=true` dans le service web, puis redéployez les deux services. L’interface masque le champ de téléphone et la case WhatsApp tant que le réglage public du web reste désactivé. Les variables WhatsApp de `.env.example` restent à `false` par défaut.

Pour une démo contrôlée uniquement, `FOLLOWUP_FIRST_DELAY_MINUTES=2` raccourcit le premier délai. Remettez `1440` ensuite. Ne changez pas les délais des prospects réels.

## 2. Créer les deux branches n8n

Le workflow partagé suit ce chemin :

`Schedule Trigger → HTTP Request (GET relances dues) → If (channel = WHATSAPP) → branche WhatsApp ou Gmail → HTTP Request (résultat)`

Le nœud `GET` reste celui de la configuration Gmail existante :

- Method : `GET`
- URL : `https://VOTRE_API/automation/followups/due?limit=5`
- Authentication : Header Auth, nom `Authorization`, valeur `Bearer ` suivie du `N8N_FOLLOWUP_TOKEN` de l’API.
- Schedule Trigger : toutes les 15 minutes.

Ajoutez un nœud **If** après le `GET`. Condition de type Boolean, valeur en mode Expression : `{{$json.channel === 'WHATSAPP'}}`. La sortie vraie va à WhatsApp ; la sortie fausse continue vers Gmail.

### Branche Gmail

Gmail → **Send a message** :

- To : `{{$json.email}}`
- Subject : `{{$json.subject}}`
- Email format : `HTML`
- Message : `{{$json.html}}`

Reliez la réussite de Gmail et de WhatsApp au nœud de résultat `POST`. Configurez leurs sorties d’erreur pour poster aussi un résultat `failed`.

### Branche WhatsApp Cloud API

Cette branche requiert un compte Meta Business, un numéro WhatsApp Business Platform, un jeton avec la permission d’envoi, et un modèle de message approuvé en français. Les relances partent plus de 24 h après le dernier message ; utilisez donc un modèle approuvé, pas un message texte libre. Meta exige que le prospect ait communiqué son numéro et accepté clairement de recevoir des messages WhatsApp de PedalPilot. Le chat présente une case séparée à cet effet.

Dans WhatsApp Manager, créez un modèle marketing de suivi en français, par exemple nommé `pedalpilot_relance`, avec un corps qui comprend trois variables : prénom, message personnalisé et lien de préférences. Exemple à soumettre puis faire approuver :

```text
Bonjour {{1}}, suite à votre demande PedalPilot : {{2}}
Pour arrêter les relances, ouvrez ce lien : {{3}}
```

Dans n8n, ajoutez un **HTTP Request** après la sortie vraie du If :

- Method : `POST`
- URL : `https://graph.facebook.com/v27.0/VOTRE_PHONE_NUMBER_ID/messages`
- Authentication : Generic Credential Type → Header Auth. Header `Authorization`, valeur `Bearer VOTRE_JETON_META`.
- Send Body : activé ; Body Content Type : JSON ; Specify Body : Using JSON. Passez le champ JSON entier en mode Expression et collez :

```javascript
={{ {
  messaging_product: 'whatsapp',
  to: $json.phone,
  type: 'template',
  template: {
    name: 'pedalpilot_relance',
    language: { code: 'fr' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: $json.firstName },
        { type: 'text', text: $json.message },
        { type: 'text', text: $json.unsubscribeUrl }
      ]
    }]
  }
} }}
```

Remplacez `VOTRE_PHONE_NUMBER_ID` par l’ID du numéro WhatsApp Business, et ajustez le nom/langue du modèle pour correspondre exactement au modèle approuvé dans Meta. N’utilisez pas le numéro visible de la boutique à la place du Phone Number ID.

### Enregistrer le résultat

Après la réussite de chaque nœud d’envoi, ajoutez le même HTTP Request :

- Method : `POST`
- URL en mode Expression : `https://VOTRE_API/automation/followups/{{$('PedalPilot - Relances à envoyer').item.json.followUpId}}/result`
- Authentication : le même Header Auth que le `GET`.
- Body Content Type : JSON ; body `{"status":"sent"}`.

Sur chaque sortie d’erreur du nœud d’envoi, appelez cette URL avec `{"status":"failed","error":"Échec d’envoi"}`. Si n8n tombe avant le retour de résultat, l’API libère le verrou après 10 minutes pour permettre un nouvel essai. Les relances WhatsApp apparaissent dans le dashboard comme canal distinct.

## 3. Vérification de bout en bout

1. Publiez le workflow et vérifiez que son état est actif.
2. Dans le chat, utilisez vos propres coordonnées de test : un e-mail avec la case e-mail, puis un numéro au format international avec la case WhatsApp. Les deux cases restent indépendantes.
3. Dans la fiche du prospect, vérifiez que les relances sont inscrites avec le bon canal.
4. Pour éviter d’attendre, rendez due une fiche de démonstration dédiée depuis Prisma Studio ; ne raccourcissez pas les tâches d’un prospect réel.
5. Lancez le workflow et vérifiez le message Gmail, le message WhatsApp et le statut `SENT` pour chacun. Le modèle WhatsApp doit déjà être approuvé par Meta.
6. Ouvrez le lien de préférences et confirmez : les deux consentements sont retirés et les relances en attente sont annulées.
7. Répondez dans le chat ou réservez un rendez-vous avant l’échéance : aucune relance ne doit partir ensuite.

Le connecteur Meta et le modèle approuvé sont une configuration externe : cette implémentation ne crée pas le compte Meta ni ses identifiants. Sources officielles : [envoi de messages WhatsApp Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/), [modèles WhatsApp](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/message_templates/) et [politique WhatsApp Business](https://business.whatsapp.com/policy/).
