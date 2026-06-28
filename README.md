# Immochecker

Webapplicatie die het te-koop-aanbod van woningen van 21 lokale immokantoren (regio Leuven) automatisch verzamelt, up-to-date houdt en doorzoekbaar maakt.

## Project Status

**Phase 1-4: Complete** ✅
- Monorepo setup met npm workspaces
- MongoDB datamodel en sync-layer
- Scraper-adapter framework
- Express API met routes
- React frontend met filters en property cards

**Adapter Implementation: 21/21 kantoren** ✅✅✅ (100%)
- ✅ FW4 Whise (5): GVE, Liv'it, Immodrome, BOND, BVM
- ✅ CMS Assets (3): De Dijle, Immo-M, Anthonis
- ✅ Skarabee (1): Marnix
- ✅ Statamic (1): Copandi
- ✅ WordPress WPML (1): Jes
- ✅ Nationaal Portaal (3): Century 21, ERA, Heylen
- ✅ Generic HTML (7): Immo 3000, Covas, Jan Stas, Surplus, Viva, Homies, Gilles

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

**Adapters geimplementeerd:**
- **FW4WhiseAdapter**: Voor FW4-powered sites (GVE, Liv'it, Immodrome, BOND, BVM)
- **CMSAssetsAdapter**: Voor CMS Assets Platform (De Dijle, Immo-M, Anthonis)
- **SkarabeeAdapter**: Voor Skarabee platform (Marnix)
- **StatamicAdapter**: Voor Statamic CMS (Copandi)
- **WordPressWPMLAdapter**: Voor WordPress met WPML (Jes)
- **NationaalPortaalAdapter**: Voor Nationaal Portaal (Century 21, ERA, Heylen)
- **GenericHTMLAdapter**: Voor onbekende/custom sites (Immo 3000, Covas, Jan Stas, Surplus, Viva, Homies, Gilles)

**Adapter Features:**
- Playwright-based scraping (reliable, handles JavaScript)
- Flexible HTML pattern matching (multiple fallback patterns)
- Photo carousel extraction
- Property detail extraction (price, bedrooms, area, EPC, etc.)
- Dynamic pagination/content loading
- Concurrency control (max 3 browsers)
- Exponential backoff retry logic (max 3 retries)
- Proper error handling per property
- Blacklist filtering (skip search pages, tags, etc.)

**Adapter Architecture:**
- `BaseScraperAdapter`: Abstracte klasse met common functionality
- `ScraperAdapter` interface: Defines contract
- Per-kantoor registratie in orchestrator
- Seamless multi-adapter orchestration

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

### Railway Deployment (Single Service) ✅ Ready

Immochecker is fully configured for single-service deployment on Railway. The API server also serves the React frontend as static files.

**See detailed guide**: [DEPLOYMENT.md](DEPLOYMENT.md)

**Quick start** (5 minutes):

1. **MongoDB Atlas**: Create free cluster at https://www.mongodb.com/cloud/atlas
2. **Get connection string**: `mongodb+srv://username:password@cluster.mongodb.net/immochecker`
3. **Railway**: Connect GitHub repo at https://railway.app
4. **Add environment variables**:
   ```
   MONGODB_URI=your-connection-string
   NODE_ENV=production
   ```
5. **Push to GitHub** to trigger auto-deployment

**Access your app** after deployment:
- Frontend: https://your-railway-url.railway.app/
- API: https://your-railway-url.railway.app/api/kantoren
- Health check: https://your-railway-url.railway.app/api/health

**Local testing before deployment**:
```bash
./deploy.sh    # Validates everything
PORT=3000 npm run start  # Test locally
```

### Deployment Files

- `railway.toml` - Railway configuration
- `Procfile` - Build/start commands
- `.env.example` - Environment template
- `deploy.sh` - Local validation script
- `DEPLOYMENT.md` - Detailed deployment guide

## Volgende Stappen

### Fase 1: Deployment & Testing (READY ✅)
- ✅ Setup npm start script with build
- ✅ Create railway.toml configuration
- ✅ Create Procfile for standard deployment
- ✅ Add environment template (.env.example)
- [x] Setup MongoDB Atlas cluster (user task)
- [x] Deploy to Railway (user task)
- [x] Test scraping with real kantoor URLs (post-deployment)

### Fase 2: Enhanced Features
- [ ] Add user saved searches
- [ ] Email notifications for new listings
- [ ] Property comparison tools
- [ ] Map view with property locations
- [ ] Advanced analytics dashboard

### Development Commands

**Install:**
```bash
npm install
```

**Type checking:**
```bash
npm run type-check
```

**Build all packages:**
```bash
npm run build
```

**Run scraper:**
```bash
npm run scrape  # At packages/scraper level (requires MONGODB_URI in .env)
```

**Development servers:**
```bash
npm run api     # API on port 3000
npm run web     # Frontend on port 5173
```

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
