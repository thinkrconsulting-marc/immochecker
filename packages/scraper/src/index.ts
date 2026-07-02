import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { ScraperOrchestrator } from './orchestrator';
import { FW4WhiseAdapter } from './adapters/fw4Adapter';
import { CMSAssetsAdapter } from './adapters/cmsAssetsAdapter';
import { SkarabeeAdapter } from './adapters/skarabeeAdapter';
import { StatamicAdapter } from './adapters/statamicAdapter';
import { WordPressWPMLAdapter } from './adapters/wordpressWpmlAdapter';
import { NationaalPortaalAdapter } from './adapters/nationaalPortaalAdapter';
import { GenericHTMLAdapter } from './adapters/genericHtmlAdapter';
import { KantoorConfig, RuwPand } from './types';
import { ScraperDbService } from './db';

dotenv.config();

const SCRAPE_CONCURRENCY = parseInt(process.env.SCRAPE_CONCURRENCY || '3', 10);
const SCRAPE_DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '1500', 10);
const USER_AGENT =
  process.env.USER_AGENT || 'Mozilla/5.0 (compatible; ImmocheckerBot/1.0)';

/**
 * Bepaalt of een pand een huis is (geen appartement, grond, garage, kantoor,
 * commercieel, ...). De opdracht is expliciet: enkel huizen opnemen.
 */
function isHuis(pand: RuwPand): boolean {
  const haystack = `${pand.bron_url} ${pand.titel}`.toLowerCase();
  const uitgesloten = [
    'appartement',
    'apartment',
    'studio',
    'penthouse',
    'grond',
    'bouwgrond',
    'garage',
    'parking',
    'staanplaats',
    'kantoor',
    'commercieel',
    'handelspand',
    'winkel',
    'industrieel',
    'loods',
    'magazijn',
    'opbrengsteigendom',
    'opbrengsteigendom',
    'gemengd-gebruik',
    'nieuwbouwproject'
  ];
  return !uitgesloten.some((term) => haystack.includes(term));
}

function laadKantoren(): KantoorConfig[] {
  const kantorenPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'immokantoren_leuven.json'
  );
  const kantorenData = JSON.parse(fs.readFileSync(kantorenPath, 'utf-8'));

  const ruweKantoren: Array<{
    id: number;
    naam: string;
    basis_url: string;
    aanbod_urls: string[];
    scraper_groep: string;
  }> = kantorenData.kantoren || [];

  return ruweKantoren.map((k) => ({
    id: k.id,
    naam: k.naam,
    basis_url: k.basis_url,
    aanbod_urls: k.aanbod_urls,
    scraper_groep: k.scraper_groep
  }));
}

function bouwOrchestrator(kantoren: KantoorConfig[]): {
  orchestrator: ScraperOrchestrator;
  geregistreerd: KantoorConfig[];
} {
  const orchestrator = new ScraperOrchestrator({
    concurrency: SCRAPE_CONCURRENCY,
    delayMs: SCRAPE_DELAY_MS,
    userAgent: USER_AGENT,
    maxRetries: 3
  });

  const adapterVoorGroep: Record<
    string,
    new (k: KantoorConfig, ua: string, delay: number) => any
  > = {
    fw4_whise: FW4WhiseAdapter,
    cms_assets_platform: CMSAssetsAdapter,
    skarabee: SkarabeeAdapter,
    statamic: StatamicAdapter,
    wordpress_wpml: WordPressWPMLAdapter,
    nationaal_portaal: NationaalPortaalAdapter,
    custom_onbekend: GenericHTMLAdapter
  };

  const geregistreerd: KantoorConfig[] = [];
  for (const kantoor of kantoren) {
    const AdapterClass = adapterVoorGroep[kantoor.scraper_groep];
    if (!AdapterClass) {
      console.warn(
        `[scraper] Geen adapter voor groep '${kantoor.scraper_groep}' (${kantoor.naam}) — overgeslagen`
      );
      continue;
    }
    orchestrator.registerAdapter(
      kantoor.id.toString(),
      new AdapterClass(kantoor, USER_AGENT, SCRAPE_DELAY_MS)
    );
    geregistreerd.push(kantoor);
  }

  return { orchestrator, geregistreerd };
}

/**
 * Voert één volledige scrape-run uit en synchroniseert naar PostgreSQL.
 * Wordt zowel via de CLI (`npm run scrape`) als door de API-cron aangeroepen.
 */
export async function runScrape(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not set in .env');
  }

  const kantoren = laadKantoren();
  console.log(`[scraper] ${kantoren.length} kantoren geladen`);

  const { orchestrator, geregistreerd } = bouwOrchestrator(kantoren);
  console.log(`[scraper] ${geregistreerd.length} adapters geregistreerd`);

  const db = new ScraperDbService();
  await db.connect(databaseUrl);

  try {
    await orchestrator.scrapeAndSync(
      geregistreerd,
      async (kantoorId: number, kantoorNaam: string, panden: RuwPand[]) => {
        const enkelHuizen = panden.filter(isHuis);
        return db.syncPanden(kantoorId, kantoorNaam, enkelHuizen);
      }
    );
    console.log('[scraper] Scrape completed successfully');
  } finally {
    await db.disconnect();
  }
}

// Alleen automatisch uitvoeren wanneer dit bestand direct wordt gestart
// (`node dist/index.js`), niet wanneer het geïmporteerd wordt door de API.
if (require.main === module) {
  runScrape()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[scraper] Scrape failed:', error);
      process.exit(1);
    });
}
