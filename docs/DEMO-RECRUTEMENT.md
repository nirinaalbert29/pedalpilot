# Démonstration PedalPilot — scénario et recette

Ce guide sert à présenter le parcours intégré au client et à vérifier l’environnement juste avant la démonstration. Les comptes tiers et les secrets restent dans leurs consoles ou variables d’environnement, jamais dans Git.

## Préparer l’environnement

- [ ] Le site et l’API de production répondent en HTTPS ; l’URL d’API utilisée par le site est celle de production.
- [ ] `WEB_ORIGIN` de l’API correspond exactement au domaine public du site.
- [ ] `DATABASE_URL` de l’API utilise la connexion Neon adaptée à l’exécution ; `DIRECT_URL` pointe vers l’hôte Neon sans `-pooler` pour les migrations. La commande Render démarre avec `pnpm --filter api start:prod:migrate`.
- [ ] Les migrations Prisma sont appliquées sur la base utilisée par l’API, et le seed de démonstration ne contient pas de données personnelles réelles.
- [ ] Google Calendar est connecté ; les heures d’ouverture et le fuseau horaire sont corrects.
- [ ] Le workflow n8n de confirmation de rendez-vous est publié. Gmail accepte les destinataires de test.
- [ ] Le workflow des relances est publié, reçoit le token `N8N_FOLLOWUP_TOKEN` et appelle la bonne URL d’API.
- [ ] Pour démontrer WhatsApp : le modèle Meta est approuvé, les identifiants sont enregistrés dans n8n, `WHATSAPP_FOLLOWUPS_ENABLED=true` est défini pour l’API, `NEXT_PUBLIC_WHATSAPP_FOLLOWUPS_ENABLED=true` pour le web, les deux services sont redéployés, et un numéro de test a donné son consentement explicite.
- [ ] Le tableau de bord est accessible avec les identifiants configurés pour la démonstration.
- [ ] La base de démonstration et le stock de l’article choisi sont connus ; aucun prospect client ne sert de test.

## Scénario de présentation (environ 3 minutes)

1. **Prospect et qualification** — sur la landing, envoyer : « Je cherche un vélo gravel autour de 1 200 €, surtout pour des chemins le week-end. » Montrer la réponse, le besoin/budget qualifiés et le prospect qui apparaît dans le dashboard.
2. **Stock connecté** — montrer le produit gravel et sa quantité dans le dashboard. Enregistrer une vente de démonstration puis expliquer le mouvement et l’alerte de seuil.
3. **Rendez-vous** — demander les créneaux réels, réserver un essai et montrer la confirmation dans le dashboard, Google Calendar et l’e-mail. Vérifier l’absence de doublon dans le calendrier.
4. **Supervision** — ouvrir la fiche prospect, montrer la conversation, le score, l’activité des agents et les relances prévues. Montrer que le bouton « Prendre la main » suspend les automatismes.
5. **Relance multicanale** — avec une fiche de test consentie, montrer les canaux choisis, puis une exécution n8n Gmail et, si Meta est configuré, WhatsApp. Montrer `SENT` et la désinscription qui annule les tâches en attente.

Ne pas attendre 24 heures pendant la présentation : préparez une fiche de démonstration isolée avec une échéance due. Ne modifiez pas l’échéance d’un vrai prospect.

## Vérifications finales

- [ ] Un prospect sans consentement ne reçoit aucune relance.
- [ ] Le numéro de téléphone seul ne vaut pas consentement WhatsApp ; la case WhatsApp est distincte de la case e-mail.
- [ ] Une nouvelle réponse, une prise de rendez-vous, une reprise humaine ou une désinscription annule les tâches en attente.
- [ ] Une panne Gmail/Meta est enregistrée comme `FAILED` et visible sur la fiche.
- [ ] Une seconde relance est créée 72 h après un premier envoi réussi, sur le même canal autorisé.
- [ ] Le stock, le rendez-vous et les messages présentés proviennent bien de l’environnement annoncé.
- [ ] Aucun secret, jeton, clé API, adresse ou téléphone de client n’est visible dans le partage d’écran, le dépôt ou les captures.

## Limites à dire clairement au recruteur

- L’envoi WhatsApp réel dépend de la configuration Meta et du modèle approuvé ; le code et le routage n8n ne créent pas le compte fournisseur.
- La livraison des messages passe par n8n et peut être réessayée si n8n tombe avant de notifier l’API ; un fournisseur qui accepte l’envoi mais perd la réponse peut produire un doublon.
- L’environnement de démonstration doit rester séparé des données de production et des prospects réels.
