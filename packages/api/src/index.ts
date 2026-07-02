import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';
import path from 'path';
import { dbService } from './db';
import { runScrape } from '@immochecker/scraper';

dotenv.config();

// Voorkomt dat er twee scrape-runs tegelijk lopen (cron + handmatige trigger).
let scrapeBezig = false;

async function voerScrapeUit(bron: string): Promise<void> {
  if (scrapeBezig) {
    console.log(`[api] Scrape (${bron}) overgeslagen — er loopt al een scrape`);
    return;
  }
  scrapeBezig = true;
  console.log(`[api] Scrape gestart (${bron})`);
  try {
    await runScrape();
    console.log(`[api] Scrape voltooid (${bron})`);
  } catch (error) {
    console.error(`[api] Scrape mislukt (${bron}):`, error);
  } finally {
    scrapeBezig = false;
  }
}

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || '';
const SCRAPE_INTERVAL_CRON = process.env.SCRAPE_INTERVAL_CRON || '0 */6 * * *';
const PURGE_AFTER_DAYS = parseInt(process.env.PURGE_AFTER_DAYS || '30', 10);

const app: Express = express();

app.use(cors());
app.use(express.json());

app.get('/api/panden', async (req: Request, res: Response) => {
  try {
    const gemeente = (req.query.gemeente as string)?.split(',').filter(Boolean);
    const prijs_min = req.query.prijs_min ? parseInt(req.query.prijs_min as string, 10) : undefined;
    const prijs_max = req.query.prijs_max ? parseInt(req.query.prijs_max as string, 10) : undefined;
    const kantoor = (req.query.kantoor as string)?.split(',').filter(Boolean).map(Number);
    const sort = req.query.sort as string;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 24;

    const { panden, total } = await dbService.getActivePanden({
      gemeente,
      prijs_min,
      prijs_max,
      kantoor_ids: kantoor,
      page,
      limit,
      sort
    });

    res.json({
      panden,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching panden:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/panden/nieuw', async (req: Request, res: Response) => {
  try {
    const gemeente = (req.query.gemeente as string)?.split(',').filter(Boolean);
    const prijs_min = req.query.prijs_min ? parseInt(req.query.prijs_min as string, 10) : undefined;
    const prijs_max = req.query.prijs_max ? parseInt(req.query.prijs_max as string, 10) : undefined;
    const kantoor = (req.query.kantoor as string)?.split(',').filter(Boolean).map(Number);
    const sort = req.query.sort as string;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 24;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { panden: allPanden } = await dbService.getActivePanden({
      gemeente,
      prijs_min,
      prijs_max,
      kantoor_ids: kantoor,
      page: 1,
      limit: 10000,
      sort
    });

    const nieuwPanden = allPanden.filter((p) => p.eerst_gezien >= sevenDaysAgo);

    res.json({
      panden: nieuwPanden.slice((page - 1) * limit, page * limit),
      total: nieuwPanden.length,
      page,
      pages: Math.ceil(nieuwPanden.length / limit)
    });
  } catch (error) {
    console.error('Error fetching new panden:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/kantoren', async (_req: Request, res: Response) => {
  try {
    const kantoren = await dbService.getAllKantoren();
    res.json(kantoren);
  } catch (error) {
    console.error('Error fetching kantoren:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/kantoren/:id/panden', async (req: Request, res: Response) => {
  try {
    const kantoorId = parseInt(req.params.id, 10);
    const gemeente = (req.query.gemeente as string)?.split(',').filter(Boolean);
    const prijs_min = req.query.prijs_min ? parseInt(req.query.prijs_min as string, 10) : undefined;
    const prijs_max = req.query.prijs_max ? parseInt(req.query.prijs_max as string, 10) : undefined;
    const sort = req.query.sort as string;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 24;

    const { panden, total } = await dbService.getActivePanden({
      gemeente,
      prijs_min,
      prijs_max,
      kantoor_ids: [kantoorId],
      page,
      limit,
      sort
    });

    res.json({
      panden,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching kantoor panden:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Handmatige scrape-trigger (handig voor lokaal testen en on-demand runs).
app.post('/api/scrape', (_req: Request, res: Response) => {
  if (scrapeBezig) {
    return res.status(409).json({ status: 'busy', message: 'Scrape loopt al' });
  }
  // Niet awaiten: draai op de achtergrond, geef meteen antwoord.
  void voerScrapeUit('handmatig');
  return res.status(202).json({ status: 'gestart' });
});

// Onbekende /api/*-routes → 404 JSON i.p.v. de SPA-index terugsturen.
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

const webDistPath = path.join(__dirname, '../../web/dist');
app.use(express.static(webDistPath));

app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(webDistPath, 'index.html'));
});

async function startServer(): Promise<void> {
  try {
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL not set in .env');
    }

    await dbService.connect(DATABASE_URL);
    console.log('Connected to PostgreSQL');

    cron.schedule(SCRAPE_INTERVAL_CRON, () => {
      void voerScrapeUit('cron');
    });

    cron.schedule('0 3 * * *', async () => {
      console.log('Running purge job...');
      try {
        const deleted = await dbService.purgeOldVerdwenen(PURGE_AFTER_DAYS);
        console.log(`Purged ${deleted} old verdwenen panden`);
      } catch (error) {
        console.error('Purge job failed:', error);
      }
    });

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer().catch(console.error);


