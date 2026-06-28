import pLimit from 'p-limit';
import { RuwPand, KantoorConfig } from './types';
import { BaseScraperAdapter } from './baseAdapter';

export interface SyncStats {
  kantoorId: number;
  kantoorNaam: string;
  succes: boolean;
  nieuw: number;
  geupdate: number;
  verdwenen: number;
  duur_ms: number;
  error?: string;
}

export interface ScraperConfig {
  concurrency: number;
  delayMs: number;
  userAgent: string;
  maxRetries: number;
}

export class ScraperOrchestrator {
  private config: ScraperConfig;
  private adapters: Map<string, BaseScraperAdapter> = new Map();

  constructor(config: ScraperConfig) {
    this.config = config;
  }

  registerAdapter(grupeNaam: string, adapter: BaseScraperAdapter): void {
    this.adapters.set(grupeNaam, adapter);
  }

  async scrapeAndSync(
    kantoren: KantoorConfig[],
    syncFn: (kantoorId: number, kantoorNaam: string, panden: RuwPand[]) => Promise<any>
  ): Promise<SyncStats[]> {
    const limit = pLimit(this.config.concurrency);
    const results: SyncStats[] = [];

    const tasks = kantoren.map((kantoor) =>
      limit(async () => {
        const startTime = Date.now();
        const grupeNaam = kantoor.scraper_groep;
        const adapter = this.adapters.get(grupeNaam);

        if (!adapter) {
          return {
            kantoorId: kantoor.id,
            kantoorNaam: kantoor.naam,
            succes: false,
            nieuw: 0,
            geupdate: 0,
            verdwenen: 0,
            duur_ms: 0,
            error: `No adapter found for gruppe: ${grupeNaam}`
          };
        }

        let lastError: string | undefined;
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
          try {
            const panden = await adapter.scrapeKantoor();
            const syncResult = await syncFn(kantoor.id, kantoor.naam, panden);

            const duur = Date.now() - startTime;
            const stat: SyncStats = {
              kantoorId: kantoor.id,
              kantoorNaam: kantoor.naam,
              succes: true,
              nieuw: syncResult.nieuw,
              geupdate: syncResult.geupdate,
              verdwenen: syncResult.verdwenen,
              duur_ms: duur
            };

            this.logSyncResult(stat);
            return stat;
          } catch (error) {
            lastError =
              error instanceof Error ? error.message : 'Unknown error';

            if (attempt < this.config.maxRetries) {
              const backoffMs = Math.pow(2, attempt - 1) * 1000;
              console.log(
                `[${kantoor.naam}] Retry ${attempt}/${this.config.maxRetries} after ${backoffMs}ms: ${lastError}`
              );
              await new Promise((resolve) => setTimeout(resolve, backoffMs));
            }
          }
        }

        const duur = Date.now() - startTime;
        return {
          kantoorId: kantoor.id,
          kantoorNaam: kantoor.naam,
          succes: false,
          nieuw: 0,
          geupdate: 0,
          verdwenen: 0,
          duur_ms: duur,
          error: lastError
        };
      })
    );

    const stats = await Promise.all(tasks);
    this.logSummary(stats);

    return stats;
  }

  private logSyncResult(stat: SyncStats): void {
    if (stat.succes) {
      const msg = `✓ ${stat.nieuw} nieuw | ${stat.geupdate} geupdate | ${stat.verdwenen} verdwenen | ${(stat.duur_ms / 1000).toFixed(1)}s`;
      console.log(`[${stat.kantoorNaam}] ${msg}`);
    } else {
      const msg = `✗ Fout: ${stat.error}`;
      console.error(`[${stat.kantoorNaam}] ${msg}`);
    }
  }

  private logSummary(stats: SyncStats[]): void {
    const success = stats.filter((s) => s.succes).length;
    const totalNieuw = stats.reduce((sum, s) => sum + s.nieuw, 0);
    const totalVerdwenen = stats.reduce((sum, s) => sum + s.verdwenen, 0);

    console.log(
      `\nRun voltooid: ${success}/${stats.length} kantoren OK | ${totalNieuw} nieuw | ${totalVerdwenen} verdwenen`
    );
  }
}
