# Immochecker

Webapplicatie die het te-koop-aanbod van woningen van 21 lokale immokantoren (regio Leuven) automatisch verzamelt, up-to-date houdt en doorzoekbaar maakt.

## Project Status

**Phase 1-4: Complete** ✅
- Monorepo setup met npm workspaces
- MongoDB datamodel en sync-layer
- Scraper-adapter interface met FW4-adapter
- Express API met routes
- React frontend met filters en property cards

## Architectuur

```
immochecker/
├── packages/
│   ├── scraper/        # TypeScript — Playwright-adapters + sync-logica
│   ├── api/            # TypeScript — Express + node-cron
│   └── web/            # TypeScript — React + Vite
├── immokantoren_leuven.json  # Config voor 21 kantoren
├── package.json        # workspace root
├── tsconfig.json       # root TypeScript config
└── .env.example       # environment variables template
```

## Installatie

```bash
npm install
```

## Environment Variables

Copy `.env.example` to `.env` en vul in:

```
MONGODB_URI=mongodb+srv://...
SCRAPE_INTERVAL_CRON=0 */6 * * *
SCRAPE_CONCURRENCY=3
SCRAPE_DELAY_MS=1500
USER_AGENT=Mozilla/5.0 (compatible; ImmocheckerBot/1.0)
PURGE_AFTER_DAYS=30
PORT=3000
NODE_ENV=development
```

## Gebouwde Componenten

### Scraper (`packages/scraper/`)
- **BaseScraperAdapter**: Abstracte adapter voor alle scrapers
- **FW4WhiseAdapter**: Concrete implementatie voor FW4-sites (5 kantoren)
- **ScraperOrchestrator**: Orchestreert scraping met concurrency control en retry logic
- Logging en error handling per kantoor

### API (`packages/api/`)
- **DatabaseService**: MongoDB connection en sync-logica
- **Express Routes**:
  - `GET /api/panden` - Alle actieve panden met filters
  - `GET /api/panden/nieuw` - Nieuwe panden (≤ 7 dagen)
  - `GET /api/kantoren` - Lijst van kantoren
  - `GET /api/kantoren/:id/panden` - Panden van één kantoor
  - `GET /api/health` - Health check
- **Scheduling**: node-cron voor scraping (6u) en purging (dagelijks 03:00)

### Frontend (`packages/web/`)
- **App**: Main component met filtering logic
- **PropertyCard**: Kaartweergave met foto-carousel
- **FilterBar**: Filters voor prijs, gemeente, kantoor, sortering
- **Header**: Branding
- **Styling**: Responsive design (desktop, tablet, mobiel)

## Datamodel

### MongoDB Collection: `panden`

```typescript
interface Pand {
  _id: ObjectId;
  kantoor_id: number;
  kantoor_naam: string;
  externe_id: string;
  bron_url: string;
  type: "huis";
  titel: string;
  beschrijving?: string;
  gemeente: string;
  postcode: string;
  prijs?: number;
  slaapkamers?: number;
  woonoppervlakte_m2?: number;
  perceel_m2?: number;
  epc?: string;
  fotos: string[];
  status: "actief" | "verdwenen";
  eerst_gezien: Date;
  laatst_gezien: Date;
}
```

### Indexen
- `bron_url` (unique)
- `(kantoor_id, externe_id)` (unique)
- `status`, `gemeente`, `prijs`, `eerst_gezien`, `kantoor_id`

## Development

### Install dependencies
```bash
npm install
```

### Run API server
```bash
npm run api
```

### Run Web dev server
```bash
npm run web
```

### Run scraper manually
```bash
npm run scrape
```

### Type check
```bash
npm run type-check
```

### Build all
```bash
npm run build
```

## Deployment

### Railway Configuration

#### Service 1: `immo-api` (`packages/api`)
- Root dir: `packages/api`
- Type: Web service (Node.js)
- Port: 3000
- Env vars: `MONGODB_URI`, `SCRAPE_INTERVAL_CRON`, etc.

#### Service 2: `immo-web` (`packages/web`)
- Root dir: `packages/web`
- Type: Static site (Vite build)
- Build: `npm run build`
- Start: `npm run preview`

## Volgende Stappen

1. **Instellingen aanpassen**:
   - MongoDB URI configureren in `.env`
   - Port aanpassen indien nodig

2. **Adapters toevoegen** (na FW4):
   - `cms_assets_platform` (De Dijle, Immo-M, Anthonis)
   - `skarabee` (Marnix)
   - `statamic` (Copandi)
   - `wordpress_wpml` (Jes)
   - `nationaal_portaal` (Century 21, ERA, Heylen)
   - `custom_onbekend` (Immo 3000, Covas, Jan Stas, Surplus, Viva, Homies, Gilles)

3. **Testen**:
   - Unit tests voor adapters
   - Integration tests voor API routes
   - E2E tests voor UI

4. **Optimalisering**:
   - Caching strategies
   - Image optimization
   - Performance monitoring

## Scripts Beschikbaar

| Script | Beschrijving |
|--------|-------------|
| `npm install` | Install dependencies |
| `npm run scrape` | Run scraper once |
| `npm run api` | Start API dev server |
| `npm run web` | Start Web dev server |
| `npm run build` | Build all packages |
| `npm run type-check` | TypeScript type checking |
| `npm run lint` | Lint all packages |

## Notes

- Alle adapters gebruiken Playwright voor reliable scraping
- Concurrency begrensd tot 3 gelijktijdige browsers
- Exponentiële backoff op errors (max 3 retries)
- Soft-delete strategie voor panden
- Purge-job verwijdert verdwenen panden ouder dan 30 dagen
