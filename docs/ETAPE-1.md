# Etape 1 - Fondations (monorepo, base de donnees, seed)

Prerequis sur ta machine : Node 20+, pnpm, Docker Desktop (ou Docker Engine), git.

## 1. Decompresser et initialiser

```bash
unzip pedalpilot-etape1.zip
cd pedalpilot
git init
```

## 2. Creer l'API NestJS dans apps/api (sans ecraser nos fichiers)

```bash
pnpm dlx @nestjs/cli new nest-tmp --package-manager pnpm --skip-git --skip-install
cp -rn nest-tmp/. apps/api/
rm -rf nest-tmp
cd apps/api
npm pkg set name=api
```

`cp -n` ne remplace rien : `prisma/` et `.env.example` restent intacts.

## 3. Installer les dependances de l'API

```bash
pnpm add @prisma/client @nestjs/config bcryptjs@2
pnpm add -D prisma@6 tsx @types/bcryptjs@2
npm pkg set "scripts.db:migrate=prisma migrate dev" "scripts.db:seed=tsx prisma/seed.ts" "scripts.db:studio=prisma studio"
cp .env.example .env
cd ../..
pnpm install
```

Si pnpm affiche un avertissement sur des scripts de build ignores (Prisma), lance
`pnpm approve-builds`, selectionne `prisma`, `@prisma/client` et `@prisma/engines`, puis relance `pnpm install`.

## 4. Lancer PostgreSQL et Redis

```bash
pnpm infra:up
docker ps          # pedalpilot-postgres et pedalpilot-redis doivent etre "healthy"
```

## 5. Valider le schema, migrer, remplir

```bash
pnpm --filter api exec prisma validate     # doit afficher : The schema ... is valid
pnpm db:migrate                            # nom de migration : init
pnpm db:seed
pnpm db:studio                             # http://localhost:5555
```

## 6. Points de controle (etape terminee quand tout est vrai)

- [ ] `prisma validate` reussit
- [ ] La migration `init` est creee dans `apps/api/prisma/migrations`
- [ ] Le seed affiche un resume (produits, prospects, messages, rendez-vous, ...) sans erreur
- [ ] Prisma Studio montre 25 produits et 40 prospects
- [ ] Dans `Product`, `CHAIN-11V` est a 0 (rupture voulue pour la demo) et `SEALANT` est sous son seuil
- [ ] Des prospects `FOLLOWING_UP` ont une relance `SCHEDULED` (pour la demo "Accelerer le temps")
- [ ] `git add -A && git commit -m "chore: monorepo, schema prisma et seed de demo"`

## Compte demo (dashboard)

`demo@pedalpilot.dev` / `demo1234`

## Si ca bloque

Copie-moi le message d'erreur exact et la commande qui l'a produit : je corrige le fichier concerne.
