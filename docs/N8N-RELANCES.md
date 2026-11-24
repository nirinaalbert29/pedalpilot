# Relances automatiques PedalPilot avec n8n Cloud

PedalPilot ne planifie une relance que si le prospect a donné son adresse e-mail et coché son consentement dans le chat. La première tentative est prévue 24 h après le dernier message. Une seconde est prévue 72 h après la première. Une réponse entrante, un rendez-vous, une reprise humaine ou un désabonnement annule les relances en attente.

Le contenu est généré par le LLM configuré dans l’API, avec un texte de secours si l’IA ne répond pas. Gmail envoie le message. Le lien « Gérer mes préférences » mène à `/opt-out` et ne se désabonne qu’après confirmation.

## 1. Préparer l’API

Dans `apps/api/.env`, définissez une nouvelle valeur aléatoire privée :

```dotenv
N8N_FOLLOWUP_TOKEN="votre-secret-aleatoire"
WEB_ORIGIN="https://votre-site-public.example"
```

Le token doit être différent du secret `N8N_WEBHOOK_SECRET` utilisé par le webhook de confirmation de rendez-vous. Appliquez la migration et régénérez Prisma depuis la racine :

```powershell
pnpm db:migrate
pnpm --filter api exec prisma generate
```

n8n Cloud ne peut pas joindre `localhost`. L’API doit être accessible en HTTPS depuis Internet pour le test du workflow. En local, utilisez un tunnel HTTPS temporaire ; ne publiez pas le port de la base de données.

Pour une démonstration locale seulement, vous pouvez régler `FOLLOWUP_FIRST_DELAY_MINUTES=2` dans `.env` et lancer le déclencheur n8n chaque minute. Remettez `1440` (24 h) après la démonstration ; ne raccourcissez pas le délai d’un compte prospect réel.

## 2. Créer le workflow n8n

Créez un workflow et ajoutez les nœuds suivants dans l’ordre.

### Schedule Trigger

Réglez une exécution toutes les 15 minutes.

### HTTP Request — « PedalPilot - Relances à envoyer »

- Method : `GET`
- URL : `https://VOTRE_API/automation/followups/due?limit=5`
- Authentication : Header Auth
- Header name : `Authorization`
- Header value : `Bearer ` suivi de la même valeur que `N8N_FOLLOWUP_TOKEN`
- Activez le traitement des réponses comme JSON.

Le nœud renvoie un élément par relance à envoyer. S’il n’y en a aucune, la suite du workflow n’a rien à traiter.

### Gmail — Send a message

Connectez votre compte Gmail et choisissez **Send a message**.

- To : passez le champ en mode **Expression** et saisissez `{{$json.email}}`
- Subject : **Expression**, `{{$json.subject}}`
- Email format : `HTML`
- Message : **Expression**, `{{$json.html}}`

En mode Expression, ne mettez pas de `=` avant les accolades. L’aperçu doit afficher une vraie adresse e-mail, sans caractère ajouté devant.

### HTTP Request — « Marquer comme envoyé »

Ajoutez un second HTTP Request après Gmail :

- Method : `POST`
- URL en mode Expression : `https://VOTRE_API/automation/followups/{{$('PedalPilot - Relances à envoyer').item.json.followUpId}}/result`
- Authentication : le même Header Auth
- Body Content Type : JSON
- Body : `{"status":"sent"}`

Pour le chemin d’erreur de Gmail, ajoutez un HTTP Request relié à la sortie d’erreur du nœud Gmail avec la même URL, et le body `{"status":"failed","error":"Échec d’envoi Gmail"}`. Configurez le nœud Gmail pour continuer sur sa sortie d’erreur. Si n8n s’arrête avant d’envoyer le résultat, PedalPilot libère automatiquement la relance après 10 minutes pour qu’elle soit réessayée.

Enregistrez puis **Publish/Active** le workflow. Les identifiants Gmail restent stockés dans les Credentials n8n ; ne les mettez pas dans le dépôt.

## 3. Vérifier

1. Dans l’application, ouvrez le chat, saisissez une adresse qui vous appartient et cochez la case de consentement avant d’envoyer un message.
2. Vérifiez dans le dashboard qu’une relance apparaît comme programmée. La première échéance est à 24 h ; ne modifiez pas la base pour vos prospects réels.
3. Pour un essai rapide avec une fiche de démonstration, utilisez temporairement une date `scheduledFor` proche dans Prisma Studio, puis laissez le workflow s’exécuter.
4. Vérifiez la réception du message et l’état `SENT` dans la fiche prospect. Le lien de préférences doit permettre l’arrêt des prochains e-mails.
5. Envoyez une nouvelle réponse dans le chat ou réservez un rendez-vous : la relance programmée doit passer à `CANCELLED`.

Le premier canal implémenté est l’e-mail Gmail. Telegram ou WhatsApp demanderont un compte, un jeton et un workflow n8n propres à ces services ; ils ne sont pas activés par cette configuration.
