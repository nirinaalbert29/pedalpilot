# PedalPilot

Systeme multi-agents IA pour un atelier/boutique de velos : qualification des prospects,
prise de rendez-vous synchronisee avec un calendrier, relances automatiques multicanales,
gestion de stock, et un dashboard temps reel pour superviser les agents.

> README complet (architecture, choix techniques, scenario de test) : en cours de redaction.

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
```

Details : `docs/ETAPE-1.md`.
