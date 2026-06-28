import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { ScraperOrchestrator } from './orchestrator';
import { FW4WhiseAdapter } from './adapters/fw4Adapter';
import { CMSAssetsAdapter } from './adapters/cmsAssetsAdapter';
import { KantoorConfig } from './types';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';
const SCRAPE_CONCURRENCY = parseInt(process.env.SCRAPE_CONCURRENCY || '3', 10);
const SCRAPE_DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '1500', 10);
const USER_AGENT = process.env.USER_AGENT || 'Mozilla/5.0 (compatible; ImmocheckerBot/1.0)';

async function main(): Promise<void> {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not set in .env');
    process.exit(1);
  }

  const kantorenPath = path.join(__dirname, '..', '..', '..', 'immokantoren_leuven.json');
  const kantorenData = JSON.parse(fs.readFileSync(kantorenPath, 'utf-8'));

  const kantoren: KantoorConfig[] = [];
  for (const [grupeNaam, grupeData] of Object.entries(
    kantorenData.scraper_groepen
  )) {
    const grupeInfo = grupeData as { kantoren?: Array<{ id: number; naam: string; basis_url: string; aanbod_urls: string[] }> };
    if (grupeInfo.kantoren) {
      for (const kantoor of grupeInfo.kantoren) {
        kantoren.push({
          id: kantoor.id,
          naam: kantoor.naam,
          basis_url: kantoor.basis_url,
          aanbod_urls: kantoor.aanbod_urls,
          scraper_groep: grupeNaam
        });
      }
    }
  }

  const orchestrator = new ScraperOrchestrator({
    concurrency: SCRAPE_CONCURRENCY,
    delayMs: SCRAPE_DELAY_MS,
    userAgent: USER_AGENT,
    maxRetries: 3
  });

  const fw4Kantoren = kantoren.filter((k) => k.scraper_groep === 'fw4_whise');
  for (const kantoor of fw4Kantoren) {
    orchestrator.registerAdapter(kantoor.id.toString(), new FW4WhiseAdapter(
      kantoor,
      USER_AGENT,
      SCRAPE_DELAY_MS
    ));
  }

  const cmsAssetsKantoren = kantoren.filter((k) => k.scraper_groep === 'cms_assets_platform');
  for (const kantoor of cmsAssetsKantoren) {
    orchestrator.registerAdapter(kantoor.id.toString(), new CMSAssetsAdapter(
      kantoor,
      USER_AGENT,
      SCRAPE_DELAY_MS
    ));
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db('immochecker');
    const pandCollection = db.collection('panden');

    const allRegisteredKantoren = [...fw4Kantoren, ...cmsAssetsKantoren];

    await orchestrator.scrapeAndSync(
      allRegisteredKantoren,
      async (kantoorId: number, kantoorNaam: string, panden: any[]) => {
        const now = new Date();
        const nieuwPanden = [];
        const updatePanden = [];
        let verdwekenCount = 0;

        for (const pand of panden) {
          try {
            const result = await pandCollection.updateOne(
              { kantoor_id: kantoorId, externe_id: pand.externe_id },
              {
                $set: {
                  ...pand,
                  kantoor_id: kantoorId,
                  kantoor_naam: kantoorNaam,
                  type: 'huis',
                  status: 'actief',
                  laatst_gezien: now
                },
                $setOnInsert: {
                  eerst_gezien: now
                }
              },
              { upsert: true }
            );

            if (result.upsertedId) {
              nieuwPanden.push(pand.externe_id);
            } else {
              updatePanden.push(pand.externe_id);
            }
          } catch (error) {
            console.error('Error upserting pand:', error);
          }
        }

        const existingPanden = await pandCollection
          .find({ kantoor_id: kantoorId, status: 'actief' })
          .toArray();

        const pandUrls = new Set(panden.map((p) => p.bron_url));
        for (const existing of existingPanden) {
          if (!pandUrls.has(existing.bron_url)) {
            await pandCollection.updateOne(
              { _id: existing._id },
              { $set: { status: 'verdwenen' } }
            );
            verdwekenCount++;
          }
        }

        return {
          nieuw: nieuwPanden.length,
          geupdate: updatePanden.length,
          verdwenen: verdwekenCount
        };
      }
    );

    console.log('\nScrape completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Scrape failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
