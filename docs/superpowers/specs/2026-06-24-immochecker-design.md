# Immochecker — Design Spec
**Datum:** 2026-06-24  
**Status:** Goedgekeurd

---

## Doel

Webapplicatie die het te-koop-aanbod van woningen van 21 lokale immokantoren (regio Leuven) automatisch verzamelt, up-to-date houdt en doorzoekbaar maakt. Alleen huizen (geen appartementen, gronden, garages, commercieel).

---

## 1. Architectuur & Deployment

### Monorepo (npm workspaces)
```
immochecker/
├── packages/
│   ├── scraper/        # TypeScript — Playwright-adapters + sync-logica
│   ├── api/            # TypeScript — Express + node-cron
│   └── web/            # TypeScript — React + Vite
├── immokantoren_leuven.json
├── package.json        # workspace root
└── .env.example
```

### Railway (GitHub auto-deploy, 2 services)
| Service | Root dir | Type |
|---|---|---|
| `immo-api` | `packages/api` | Web service (Node.js) |
| `immo-web` | `packages/web` | Static site (Vite build) |

- `immo-api` draait altijd; bevat de scraper via **node-cron** (geen PM2).
- `immo-web` wordt gebuild door Railway en geserveerd via hun CDN.
- **MongoDB Atlas** is extern; URI via env-var.
- Env-vars worden per service ingesteld in Railway dashboard.

### Waarom 2 services?
Frontend-builds gebruiken Railway's CDN-caching; API-restarts breken de UI niet. Kosten zijn gelijk aan één service.

---

## 2. Datamodel (MongoDB)

### Collectie `panden`
```typescript
interface Pand {
  _id: ObjectId;
  kantoor_id: number;
  kantoor_naam: string;
  externe_id: string;        // property-ID uit bron-URL
  bron_url: string;          // unique
  type: "huis";
  titel: string;
  beschrijving?: string;
  gemeente: string;
  postcode: string;
  prijs?: number;
  slaapkamers?: number;
  woonoppervlakte_m2?: number;
  perceel_m2?: number;
  epc?: string;              // A–G
  fotos: string[];           // directe URLs van bronsite
  status: "actief" | "verdwenen";
  eerst_gezien: Date;
  laatst_gezien: Date;
}
```

### Indexen
- Uniek: `bron_url`
- Uniek samengesteld: `(kantoor_id, externe_id)`
- Enkelvoudig: `status`, `gemeente`, `prijs`, `eerst_gezien`, `kantoor_id`

### Soft-delete strategie
Panden worden nooit hard-verwijderd tijdens een scrape-run. Ze krijgen `status: "verdwenen"` — maar **alleen als de scrape van dat kantoor volledig en succesvol afliep** (idempotency). Purge van `verdwenen` panden ouder dan 30 dagen via aparte node-cron job (dagelijks).

---

## 3. Scraper-architectuur

### Adapter-interface (uniform voor alle platforms)
```typescript
interface KantoorConfig {
  id: number;
  naam: string;
  basis_url: string;
  aanbod_urls: string[];
  scraper_groep: string;
}

interface RuwPand {
  externe_id: string;  // afgeleid uit bron_url door adapter (stabiel bij herhaalde scrapes)
  bron_url: string;
  titel: string;
  beschrijving?: string;
  gemeente: string;
  postcode?: string;
  prijs?: number;
  slaapkamers?: number;
  woonoppervlakte_m2?: number;
  perceel_m2?: number;
  epc?: string;
  fotos: string[];
}

interface ScraperAdapter {
  scrapeKantoor(config: KantoorConfig): Promise<RuwPand[]>;
}
```

De **sync-laag** is platform-onafhankelijk: ontvangt `RuwPand[]` + `kantoor_id`, doet upserts (update `laatst_gezien` + velden), zet ontbrekende panden op `verdwenen`, zet nieuwe panden op `actief` met `eerst_gezien = nu`.

### Platform-adapters (bouwvolgorde)
| Prioriteit | Adapter | Kantoren | Aanpak |
|---|---|---|---|
| 1 | `fw4_whise` | GVE, Liv'it, Immodrome, BOND, BVM (5) | Server-rendered; detail-links via regex; load-more tot einde; per pand detail bezoeken |
| 2 | `cms_assets_platform` | De Dijle, Immo-M, Anthonis (3) | Server-rendered; selectors 1× bepalen, hergebruiken |
| 3 | `skarabee` | Marnix (1) | Server-rendered; stabiele Skarabee RP6 HTML |
| 4 | `statamic` | Copandi (1) | Server-rendered |
| 5 | `wordpress_wpml` | Jes (1) | Playwright + `waitForSelector` (JS-rendered) |
| 6 | `nationaal_portaal` | Century 21, ERA, Heylen (3) | Playwright; filter op gemeente, niet kantoor; XHR/JSON-API zoeken |
| 7 | `custom_onbekend` | Immo 3000, Covas, Jan Stas, Surplus, Viva, Homies, Gilles (7) | Per site selectors bepalen; voor geblokkeerde sites Playwright gebruiken |

### Betrouwbaarheid
- `p-limit` voor concurrency (max 3 gelijktijdige browsers).
- Per kantoor try/catch: fout logt en slaat over, andere kantoren lopen door.
- Retries met exponentiële backoff (max 3 pogingen per kantoor).
- Polite delays: 1–2s tussen requests op dezelfde site.
- User-agent configureerbaar via env.

---

## 4. API

### Routes
```
GET /api/panden
  ?gemeente=Leuven,Herent  (kommalijst)
  ?prijs_min=200000
  ?prijs_max=500000
  ?kantoor=2,13
  ?sort=prijs_asc|prijs_desc|nieuwst|oudst
  ?page=1&limit=24
  → { panden: Pand[], total: number, page: number }

GET /api/panden/nieuw
  → panden met eerst_gezien ≥ nu − 7 dagen (zelfde query-params)

GET /api/kantoren
  → [{ id, naam, basis_url, actief_count }]

GET /api/kantoren/:id/panden
  → actieve panden van één kantoor (zelfde query-params)
```

Alle endpoints filteren automatisch op `status: "actief"`. Express + TypeScript. Geen auth.

---

## 5. Frontend (React + Vite + TypeScript)

### Routes
| Path | Pagina |
|---|---|
| `/` | Filterbalk + kaartenraster alle actieve huizen |
| `/nieuw` | Zelfde weergave, enkel panden ≤ 7 dagen oud + "Nieuw"-badge |
| `/kantoor/:id` | Alle huizen van één kantoor + kantoorinfo bovenaan |

### Pandkaart
- Foto-carousel: 3–5 foto's direct zichtbaar, lazy-loaded.
- Kerninfo prominent: prijs, gemeente, slaapkamers, m² woon, m² perceel, EPC-badge.
- Knop "Meer info →" opent `bron_url` in nieuw tabblad.

### Filterbalk (hoofdpagina + /nieuw)
- Prijs min/max (twee invoervelden).
- Gemeente multiselect (7 doelgemeenten + overige die opduiken in DB).
- Kantoor-dropdown.
- Sortering (prijs ↑, prijs ↓, nieuwst, oudst).
- Filtering via API-calls (server-side) voor correcte paginatie.

### UI-keuzes
- Nederlandstalig.
- Geen auth, geen dark-mode, geen CMS — intern gereedschap.
- Responsief raster (1–3 kolommen afhankelijk van scherm).

---

## 6. Scheduling

- node-cron in `immo-api`: elke 6u (configureerbaar via `SCRAPE_INTERVAL_CRON` env-var).
- Handmatige run: `npm run scrape` in `packages/scraper`.
- Purge-job: dagelijks om 03:00 via aparte cron in dezelfde API-service.

---

## 7. Configuratie (.env.example)

```
MONGODB_URI=mongodb+srv://...
SCRAPE_INTERVAL_CRON=0 */6 * * *
SCRAPE_CONCURRENCY=3
SCRAPE_DELAY_MS=1500
USER_AGENT=Mozilla/5.0 (compatible; ImmocheckerBot/1.0)
PURGE_AFTER_DAYS=30
PORT=3000
```

---

## 8. Logging

Per scrape-run, per kantoor:
```
[Immo GVE] ✓ 23 panden gevonden | 2 nieuw | 1 verdwenen | 0:42s
[Jes Vastgoed] ✗ Fout: timeout na 30s (poging 2/3)
```

Totaalregel na elke run: `Run voltooid: 18/21 kantoren OK | 312 actief | 5 nieuw | 3 verdwenen`

---

## 9. Bouwvolgorde

1. Monorepo opzetten (workspace root, tsconfig, basis packages).
2. Datamodel + sync-laag (platform-onafhankelijk).
3. FW4-adapter (5 kantoren) + end-to-end testen met sync.
4. API + Railway-deployment (immo-api live).
5. React frontend hoofdpagina met filters + pandkaarten.
6. /nieuw pagina + /kantoor/:id pagina's + Railway-deployment (immo-web live).
7. Overige adapters incrementeel (cms_assets → skarabee → statamic → wordpress → nationale portalen → custom).
8. Scheduling + purge-job.
9. README.md.
