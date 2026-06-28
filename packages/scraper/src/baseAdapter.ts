import { ScraperAdapter, KantoorConfig, RuwPand } from './types';

export abstract class BaseScraperAdapter implements ScraperAdapter {
  protected readonly config: KantoorConfig;
  protected readonly userAgent: string;
  protected readonly delayMs: number;

  constructor(
    config: KantoorConfig,
    userAgent: string = 'Mozilla/5.0 (compatible; ImmocheckerBot/1.0)',
    delayMs: number = 1500
  ) {
    this.config = config;
    this.userAgent = userAgent;
    this.delayMs = delayMs;
  }

  abstract scrapeKantoor(): Promise<RuwPand[]>;

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected log(message: string): void {
    console.log(`[${this.config.naam}] ${message}`);
  }

  protected error(message: string): void {
    console.error(`[${this.config.naam}] ERROR: ${message}`);
  }
}
