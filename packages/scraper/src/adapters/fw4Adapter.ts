import { BaseScraperAdapter } from '../baseAdapter';
import { RuwPand } from '../types';

export class FW4WhiseAdapter extends BaseScraperAdapter {
  private detailLinkRegex = /(huis|villa|woning|gelijkvloerse-woning|eengezinswoning|appartement|opbrengsteigendom|grond|garage|kantoor|commercieel|gebouw-voor-gemengd-gebruik)-te-koop-in-[a-z0-9-]+\/\d{6,7}/g;

  async scrapeKantoor(): Promise<RuwPand[]> {
    const playwright = await import('playwright');
    const browserPage = await this.createPage(playwright);

    try {
      const allPanden: RuwPand[] = [];

      for (const url of this.config.aanbod_urls) {
        this.log(`Scraping ${url}`);
        await browserPage.goto(url, { waitUntil: 'networkidle' });

        await this.loadAllProperties(browserPage);

        const detailLinks = await this.extractDetailLinks(browserPage);
        this.log(`Found ${detailLinks.length} property links`);

        for (const link of detailLinks) {
          await this.sleep(this.delayMs);
          const pand = await this.scrapPropertyDetail(browserPage, link);
          if (pand) {
            allPanden.push(pand);
          }
        }
      }

      return allPanden;
    } finally {
      await browserPage.close();
    }
  }

  private async createPage(playwright: any): Promise<any> {
    const browser = await playwright.chromium.launch();
    const context = await browser.newContext({
      userAgent: this.userAgent
    });
    return await context.newPage();
  }

  private async loadAllProperties(page: any): Promise<void> {
    let hasMore = true;
    let retries = 0;
    const maxRetries = 100;

    while (hasMore && retries < maxRetries) {
      const button = await page.$('button:has-text("Toon meer"), button:has-text("Show more")');

      if (!button) {
        hasMore = false;
      } else {
        try {
          await button.click();
          await page.waitForTimeout(1000);
          retries++;
        } catch (error) {
          hasMore = false;
        }
      }
    }

    this.log(`Loaded all properties after ${retries} clicks`);
  }

  private async extractDetailLinks(page: any): Promise<string[]> {
    const html = await page.content();
    const matches = html.match(this.detailLinkRegex);
    const links = new Set(matches || []);
    return Array.from(links).map((link) => `${this.config.basis_url}/${link}`);
  }

  private async scrapPropertyDetail(page: any, url: string): Promise<RuwPand | null> {
    try {
      await page.goto(url, { waitUntil: 'networkidle' });

      const pageContent = await page.content();

      const titleMatch = pageContent.match(/<h1[^>]*>([^<]+)<\/h1>/);
      const titel = titleMatch ? titleMatch[1].trim() : 'Unknown';

      const priceMatch = pageContent.match(/€\s*([\d.]+)/);
      const prijs = priceMatch ? parseInt(priceMatch[1].replace(/\./g, ''), 10) : undefined;

      const bedroomsMatch = pageContent.match(/(\d+)\s*slaapkamer/i);
      const slaapkamers = bedroomsMatch ? parseInt(bedroomsMatch[1], 10) : undefined;

      const areaMatch = pageContent.match(/(\d+)\s*m².*woon/i);
      const woonoppervlakte_m2 = areaMatch ? parseInt(areaMatch[1], 10) : undefined;

      const epcMatch = pageContent.match(/EPC:\s*([A-G])/i);
      const epc = epcMatch ? epcMatch[1] : undefined;

      const fotos = await this.extractPhotos(page);

      const gemeente = this.extractGemeente(url);
      const externe_id = this.extractId(url);

      const pand: RuwPand = {
        externe_id,
        bron_url: url,
        titel,
        gemeente,
        postcode: '',
        prijs,
        slaapkamers,
        woonoppervlakte_m2,
        epc,
        fotos
      };

      return pand;
    } catch (error) {
      this.error(`Failed to scrape detail page: ${url}`);
      return null;
    }
  }

  private async extractPhotos(page: any): Promise<string[]> {
    const photos: string[] = [];

    const imageElements = await page.$$('img[src*="property"], img[src*="immo"]');

    for (const img of imageElements) {
      const src = await img.getAttribute('src');
      if (src && !src.includes('logo') && !src.includes('icon')) {
        photos.push(src);
      }
    }

    return photos.slice(0, 5);
  }

  private extractGemeente(url: string): string {
    const match = url.match(/te-koop-in-([a-z0-9-]+)/);
    if (match) {
      return match[1].split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    return 'Unknown';
  }

  private extractId(url: string): string {
    const match = url.match(/\/(\d{6,7})$/);
    return match ? match[1] : url.split('/').pop() || 'unknown';
  }
}
