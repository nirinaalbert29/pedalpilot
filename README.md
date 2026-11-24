# PedalPilot

Systeme multi-agents IA pour un atelier/boutique de velos : qualification des prospects,
prise de rendez-vous synchronisee avec un calendrier, relances automatiques multicanales,
gestion de stock, et un dashboard temps reel pour superviser les agents.

> Architecture, responsabilités des modules, flux de relance et limites actuelles : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Structure

```
apps/api     API NestJS + Prisma (agents, evenements, integrations)
apps/web     Landing + dashboard Next.js
docs/        Architecture et guides d'etape
docker-compose.yml   PostgreSQL + Redis en local
```

## Demarrage local (resume)

```bash
pnpm infra:up      # PostgreSQL + Redis
pnpm db:migrate    # schema
pnpm db:seed       # donnees de demonstration
pnpm api:dev       # API sur http://localhost:3001
pnpm web:dev       # landing + chat sur http://localhost:3000
```

La landing Next.js se trouve dans `apps/web`. Copiez `apps/web/.env.example` vers
`apps/web/.env.local` pour définir l’URL de l’API. Gardez `WEB_ORIGIN=http://localhost:3000`
dans `apps/api/.env` pour autoriser le navigateur à appeler l’API locale.

Le dashboard d’équipe est accessible sur `http://localhost:3000/dashboard`. Son API est protégée par `DASHBOARD_API_TOKEN`, à définir dans `apps/api/.env` avant de démarrer l’API.

Details : `docs/ETAPE-1.md`.

Guides complémentaires :

- `docs/ETAPE-4.md` — dashboard et flux temps réel
- `docs/ETAPE-5.md` — Google Calendar et rendez-vous
- `docs/ETAPE-6.md` — réservation et e-mail de confirmation
- `docs/ETAPE-7.md` — disponibilités, consentement aux relances et stock
- `docs/N8N-GMAIL.md` — e-mail de confirmation via n8n et Gmail
- `docs/N8N-RELANCES.md` — workflow n8n des relances
