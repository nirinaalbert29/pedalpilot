# Étape 7 — Relances, disponibilités et gestion du stock

Cette étape complète le parcours d’un prospect et le fonctionnement de la boutique.

## Relances

- Le chat demande un consentement explicite avant de programmer un suivi par e-mail.
- Une relance personnalisée est planifiée 24 h après l’échange, puis une dernière 72 h après le premier envoi si le prospect reste inactif.
- Une réponse, un rendez-vous, une reprise humaine ou un désabonnement annule les relances en attente.
- Les envois sont traités par n8n Cloud et Gmail. Consultez [N8N-RELANCES.md](./N8N-RELANCES.md) pour créer le workflow.
- Chaque envoi est enregistré et visible dans la fiche prospect ; un échec peut être relancé depuis le dashboard.

## Disponibilités et réservation

Le chat propose maintenant un bouton **Prendre rendez-vous** après le premier échange. Les créneaux tiennent compte des réservations PedalPilot, des événements Google Calendar occupés, du fuseau de la boutique et des heures d’ouverture. La réservation publique revalide le créneau au moment de l’enregistrement. La confirmation reprend l’envoi d’e-mail et la synchronisation Google Calendar déjà configurés.

Configurez les horaires dans `apps/api/.env` :

```dotenv
BUSINESS_TIME_ZONE="Europe/Paris"
BUSINESS_OPEN_HOUR=9
BUSINESS_CLOSE_HOUR=17
BUSINESS_DAYS=1,2,3,4,5,6
BUSINESS_SLOT_INTERVAL_MIN=30
BUSINESS_MIN_LEAD_HOURS=2
```

`BUSINESS_DAYS` utilise `0` pour dimanche jusqu’à `6` pour samedi. La vérification Google Calendar utilise les permissions existantes de lecture/écriture d’événements. Si l’API Google n’est pas configurée, les créneaux PedalPilot restent vérifiés localement.

## Stock

Le dashboard permet d’enregistrer des réapprovisionnements et des ventes avec une quantité. Chaque mouvement met à jour la quantité disponible de façon atomique et crée une ligne d’historique. Une vente qui dépasserait le stock disponible est refusée. Les alertes du dashboard signalent les produits au seuil de réapprovisionnement.

## Migration locale

La migration ajoute l’état `PROCESSING` pour éviter que deux exécutions n8n envoient la même relance, ainsi que le consentement et le jeton d’arrêt. Depuis la racine du dépôt :

```powershell
pnpm db:migrate
pnpm --filter api exec prisma generate
```

Ne publiez jamais `apps/api/.env`. Après avoir appliqué la migration, redémarrez l’API et le frontend.
