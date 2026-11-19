# Étape 3 — Agent de qualification et chat

Cette étape ajoute un chat texte pour la landing page, un agent de qualification, la lecture du stock courant et une intégration LLM compatible OpenAI. Groq est préconfiguré. Sans clé, en cas de quota dépassé ou d’indisponibilité du fournisseur, l’API répond avec une qualification déterministe de secours.

## Configuration

Dans `apps/api/.env`, ajoutez ou vérifiez :

```dotenv
LLM_PROVIDER=groq
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=votre_cle_groq
LLM_MODEL=openai/gpt-oss-20b
LLM_MAX_TOKENS=650
LLM_TEMPERATURE=0.3
# Facultatif, pour un modèle de raisonnement compatible
# LLM_REASONING_EFFORT=low
```

La clé reste uniquement côté API, jamais dans le navigateur. `LLM_MODEL` peut être remplacé par tout modèle auquel votre compte donne accès. `LLM_MAX_TOKENS` règle la longueur maximale de sortie et `LLM_TEMPERATURE` accepte une valeur de 0 à 2. `LLM_REASONING_EFFORT` est facultatif (`low`, `medium` ou `high`) et dépend du modèle choisi. Par sécurité, la clé `STT_API_KEY` n'est pas automatiquement réutilisée pour le chat ; mettez la même clé Groq dans `LLM_API_KEY`.

Autres serveurs compatibles OpenAI :

```dotenv
# OpenRouter
LLM_PROVIDER=openrouter
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=votre_cle_openrouter
LLM_MODEL=fournisseur/modele

# Ollama installé et lancé sur votre machine (aucune clé API)
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=nom-du-modele-déjà-téléchargé
```

Pour Ollama, téléchargez d'abord le modèle localement et utilisez son nom exact. Groq/OpenRouter utilisent un service hébergé et peuvent appliquer des quotas ou des frais selon le modèle et votre compte ; vérifiez les conditions du fournisseur.

Groq propose un niveau gratuit avec des limites de débit par modèle. Le modèle `openai/gpt-oss-20b` est listé avec une tarification à l’usage sur le niveau Developer ; vérifiez le niveau de votre compte et ses limites avant utilisation. Les limites gratuites ou erreurs fournisseur déclenchent le mode de secours. Consultez les [modèles et tarifs Groq](https://console.groq.com/docs/models), les [limites de débit](https://console.groq.com/docs/rate-limits) et la [facturation](https://console.groq.com/docs/billing-faqs).

Les variables `STT_*` (`whisper-large-v3-turbo`, `STT_LANGUAGE=fr`) concernent la transcription audio. L’endpoint de cette étape reçoit du texte ; la transcription audio n’est pas encore branchée à une route.

## Démarrer

Depuis la racine du dépôt :

```powershell
pnpm infra:up
pnpm api:dev
```

L’API écoute sur `http://localhost:3001`. Si la base n’a pas encore reçu ses migrations, appliquez celles du projet. `pnpm db:seed` efface puis recrée les données de démonstration : ne le lancez que sur une base de démo dont vous pouvez remplacer le contenu.

La landing et son widget de chat sont dans `apps/web`. Copiez `apps/web/.env.example` en `apps/web/.env.local`, gardez `NEXT_PUBLIC_API_URL=http://localhost:3001`, puis démarrez le site dans un autre terminal :

```powershell
pnpm web:dev
```

Ouvrez `http://localhost:3000`, puis utilisez le bouton « Parler vélo ». Le widget transmet le prénom facultatif et chaque message à `POST /chat`, conserve le `prospectId` pour les messages suivants et affiche les erreurs de connexion dans la conversation.

## Endpoint du chat

`POST /chat` crée ou reprend une conversation. Exemple :

```powershell
$body = @{ name = 'Camille'; message = 'Je cherche un vélo gravel autour de 1200 euros' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3001/chat -ContentType 'application/json' -Body $body
```

La réponse donne `prospectId`, `conversationId`, `reply`, `qualification` et `mode` (`ai`, `fallback` ou `human`). Pour continuer, envoyez le `prospectId` reçu :

```powershell
$body = @{ prospectId = 'ID_RETOURNE'; message = 'Je roule surtout le week-end' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3001/chat -ContentType 'application/json' -Body $body
```

L’agent s’abonne à `conversation.message` sur le bus. Il charge les produits actifs et leur stock avant de répondre, enregistre la qualification et l’exécution dans `Prospect` et `AgentRun`, puis émet `prospect.qualified`. Il ne réserve ni ne vend de produit. Si un conseiller a repris la conversation (`humanTakeover`), l’agent n’appelle pas le LLM.

Le message entrant ne peut dépasser 2 000 caractères. Un e-mail fourni permet de retrouver et reprendre le prospect correspondant ; sans `prospectId` ni e-mail, un nouveau prospect est créé.

## Vérifications

```powershell
pnpm --filter api test
pnpm --filter api build
Test-Path apps\api\dist\main.js
```

Les tests incluent un faux endpoint compatible Groq/OpenAI, le parcours de qualification avec une réponse IA structurée, le stock dans le mode de secours et la reprise humaine. Sans `LLM_API_KEY`, `GROQ_API_KEY` ni `STT_API_KEY`, `mode` vaut `fallback` et le chat reste utilisable. Avec un modèle et une clé autorisés, il vaut `ai`.

