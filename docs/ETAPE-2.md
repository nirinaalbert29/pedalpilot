# Etape 2 - Bus d'evenements (le lien entre les agents)

Tout se passe dans `apps/api/src`. Commandes en PowerShell, depuis la racine du projet
(`D:\PERSONAL_PROJECTS\pedalpilot-etape1\pedalpilot`).

## Ce que cette etape ajoute

| Fichier | Role |
|---|---|
| `prisma/prisma.service.ts`, `prisma.module.ts` | Acces a la base, partage par toute l'API |
| `events/event-types.ts` | Catalogue des evenements (le "langage commun" des agents) |
| `events/events.service.ts` | Le bus : `emit()` (base + diffusion), `on()` (abonnement d'un agent), `stream()`, `recent()` |
| `events/events.controller.ts` | `GET /events` (historique), `GET /events/stream` (temps reel SSE), `POST /events/test` (dev) |
| `health/*` | `GET /health` (API + base) |
| `app.module.ts`, `main.ts` | Remplaces : sans `@nestjs/observe`, CORS, port 3001 |
| `events/events.service.spec.ts` | 5 tests unitaires du bus |

Garanties du bus : un handler qui plante n'affecte ni les autres agents ni l'emetteur ;
si la base est indisponible, l'evenement est quand meme diffuse (`persisted: false`).

## 1. Retirer Observe (inutile pour ce projet)

```powershell
pnpm --filter api remove @nestjs/observe
```

## 2. Installer les fichiers

Place `pedalpilot-etape2.zip` a la racine du projet, puis :

```powershell
tar -xf pedalpilot-etape2.zip
```

`app.module.ts` et `main.ts` sont remplaces, les autres fichiers sont nouveaux.

## 3. Lancer l'API

```powershell
pnpm api:dev
```

Tu dois voir `Connecte a PostgreSQL` puis `API prete sur http://localhost:3001`.
(Docker doit tourner : `pnpm infra:up` si besoin.)

## 4. Tester (3 terminaux PowerShell, utilise `curl.exe` et non `curl`)

Depuis l'etape 4, `/events` et `/events/stream` necessitent `DASHBOARD_API_TOKEN` dans
`apps/api/.env`. Dans le terminal PowerShell, charge le jeton puis passe-le en Bearer :

```powershell
$headers = @{ Authorization = "Bearer VOTRE_DASHBOARD_API_TOKEN" }
```

Terminal 2 :

```powershell
curl.exe http://localhost:3001/health
curl.exe -H "Authorization: Bearer VOTRE_DASHBOARD_API_TOKEN" "http://localhost:3001/events?limit=3"
```

- `/health` doit renvoyer `"status":"ok","db":"up"`.
- `/events` doit renvoyer 3 evenements issus du seed.

Terminal 3 (laisse-le ouvert, il attend les evenements) :

```powershell
curl.exe -N -H "Authorization: Bearer VOTRE_DASHBOARD_API_TOKEN" http://localhost:3001/events/stream
```

Retour dans le terminal 2 :

```powershell
curl.exe -X POST -H "Authorization: Bearer VOTRE_DASHBOARD_API_TOKEN" http://localhost:3001/events/test
```

Le terminal 3 doit afficher immediatement :

```
event: agent-event
id: ...
data: {"id":"...","type":"system.test",...}
```

Dans Prisma Studio, la table `AgentEvent` contient une nouvelle ligne `system.test`.

## 5. Tests unitaires

```powershell
pnpm --filter api test
```

Attendu : les 5 tests de `events.service.spec.ts` passent (des lignes `ERROR` dans la sortie sont normales :
ce sont les cas d'echec testes volontairement).

## 6. Verifier le build (important pour le deploiement)

```powershell
pnpm --filter api build
Test-Path apps\api\dist\main.js
```

- `True` : parfait.
- `False` : lance `Test-Path apps\api\dist\src\main.js`. Si c'est `True`, le script `start:prod`
  (`node dist/main`) ne trouvera pas le fichier : envoie-moi `apps\api\tsconfig.build.json` et
  `apps\api\nest-cli.json`, on corrige avant le deploiement.

## 7. Points de controle

- [ ] `/health` : `ok` / `up`
- [ ] `/events?limit=3` renvoie des evenements du seed
- [ ] Le flux `/events/stream` recoit l'evenement du `POST /events/test`
- [ ] Les 5 tests passent
- [ ] `pnpm --filter api build` reussit
- [ ] Commit : `git add -A` puis `git commit -m "feat(api): bus d'evenements, flux SSE, historique et sante"`

## Comment les agents s'en serviront (etape 3)

```ts
@Injectable()
export class QualificationAgent implements OnModuleInit {
  constructor(private readonly events: EventsService) {}

  onModuleInit() {
    this.events.on(EVENT.PROSPECT_CREATED, (event) => this.handle(event));
  }

  private async handle(event: AgentEventMessage) {
    // ... analyse du message, calcul du score ...
    await this.events.emit({
      type: EVENT.PROSPECT_QUALIFIED,
      agent: 'QUALIFICATION',
      prospectId: event.prospectId,
      payload: { score: 82, temperature: 'HOT' },
    });
  }
}
```

Cote navigateur (dashboard, etape 8) : `new EventSource(url).addEventListener('agent-event', handler)`
(les evenements sont nommes : `onmessage` ne les recoit pas).
