import { BaseScraperAdapter } from '../baseAdapter';
import { RuwPand } from '../types';
import { chromium } from 'playwright';

export class WordPressWPMLAdapter extends BaseScraperAdapter {
  async scrapeKantoor(): Promise<RuwPand[]> {
    const browser = await chromium.launch();
    const context = await browser.newContext({ userAgent: this.userAgent });
    const page = await context.newPage();

    try {
      const allPanden: RuwPand[] = [];

      for (const url of this.config.aanbod_urls) {
        this.log(`Scraping ${url}`);

        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        } catch (error) {
          this.error(`Failed to load ${url}`);
          continue;
        }

        const propertyLinks = await this.extractPropertyLinks(page, url);
        this.log(`Found ${propertyLinks.length} property links`);

        for (const link of propertyLinks) {
          await this.sleep(this.delayMs);
          const pand = await this.scrapPropertyDetail(page, link);
          if (pand) {
            allPanden.push(pand);
          }
        }
      }

      return allPanden;
    } catch (error) {
      this.error(`Scrape failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      await context.close();
      await browser.close();
    }
  }

  private async extractPropertyLinks(page: any, baseUrl: string): Promise<string[]> {
    const links = new Set<string>();

    await page.waitForSelector('a[href*="property"], a[href*="post"], a.post-link, article a', { timeout: 5000 }).catch(() => {});

    const propertyLinks = await page.$$('a[href*="property"], a[href*="post"], a.post-link, article a, .property-link a, .entry-title a');

    for (const link of propertyLinks) {
      const href = await link.getAttribute('href');
      if (href && !href.includes('/category/') && !href.includes('/tag/') && !href.includes('/author/')) {
        const fullUrl = new URL(href, baseUrl).toString();
        if (this.isPropertyLink(fullUrl)) {
          links.add(fullUrl);
        }
      }
    }

    return Array.from(links);
  }

  private isPropertyLink(href: string): boolean {
    const propertyPatterns = [
      /\/property\//i,
      /\/post\//i,
      /\/item\//i,
      /\/object\//i,
      /\?p=\d+/i,
      /\/\d{4}\/\d{2}\/\d{2}\//,
      /[a-z0-9-]+\/$/
    ];

    const blacklistPatterns = [/category|tag|author|page|archive|search/i];

    return (
      propertyPatterns.some((pattern) => pattern.test(href)) &&
      !blacklistPatterns.some((pattern) => pattern.test(href))
    );
  }

  private async scrapPropertyDetail(page: any, url: string): Promise<RuwPand | null> {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      const pageContent = await page.content();

      const titel = (await this.getTitleFromPage(page)) || (await this.extractTitle(page, pageContent));
      const prijs = await this.extractPrice(page, pageContent);
      const slaapkamers = await this.extractBedrooms(page, pageContent);
      const woonoppervlakte_m2 = await this.extractArea(page, pageContent);
      const perceel_m2 = await this.extractPlotArea(page, pageContent);
      const epc = await this.extractEPC(page, pageContent);
      const fotos = await this.extractPhotos(page);
      // Gemeente/postcode: eerst titel+URL tegen bekende regio-lijst matchen,
      // dan de paginacontent, met de oude regex-extractie als laatste fallback.
      const _geo = this.matchGemeente(`${titel} ${url}`).gemeente
        ? this.matchGemeente(`${titel} ${url}`)
        : this.matchGemeente(pageContent);
      const gemeente = _geo.gemeente || this.extractMunicipality(pageContent);
      const postcode = _geo.postcode || this.extractPostcode(pageContent);
      const externe_id = this.extractId(url);

      const pand: RuwPand = {
        externe_id,
        bron_url: url,
        titel,
        gemeente,
        postcode,
        prijs,
        slaapkamers,
        woonoppervlakte_m2,
        perceel_m2,
        epc,
        fotos
      };

      return pand;
    } catch (error) {
      this.error(`Failed to scrape: ${url}`);
      return null;
    }
  }

  private async extractTitle(_page: any, content: string): Promise<string> {
    const titleMatch =
      content.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)<\/h1>/) ||
      content.match(/<h1[^>]*>([^<]+)<\/h1>/) ||
      content.match(/<meta\s+property="og:title"\s+content="([^"]+)"/) ||
      content.match(/<title>([^<]+)<\/title>/);

    return titleMatch ? titleMatch[1].trim() : 'Unknown Property';
  }

  private async extractPrice(_page: any, content: string): Promise<number | undefined> {
    const priceMatch =
      content.match(/price[^>]*>€\s*([\d.,]+)/i) ||
      content.match(/€\s*([\d.,]+)/);

    if (priceMatch) {
      return parseInt(priceMatch[1].split(',')[0].replace(/\./g, ''), 10);
    }
    return undefined;
  }

  private async extractBedrooms(_page: any, content: string): Promise<number | undefined> {
    const bedroomMatch =
      content.match(/slaapkamer[^>]*>(\d+)/i) ||
      content.match(/(\d+)\s*slaapkamer/i) ||
      content.match(/bedroom[^>]*>(\d+)/i);

    return bedroomMatch ? parseInt(bedroomMatch[1], 10) : undefined;
  }

  private async extractArea(_page: any, content: string): Promise<number | undefined> {
    const areaMatch =
      content.match(/(\d+)\s*m².*woon/i) ||
      content.match(/woonoppervlakte[^>]*>(\d+)/i) ||
      content.match(/living.*?(\d+)\s*m²/i);

    return areaMatch ? parseInt(areaMatch[1], 10) : undefined;
  }

  private async extractPlotArea(_page: any, content: string): Promise<number | undefined> {
    const plotMatch = content.match(/perceel[^>]*>(\d+)\s*m²/i) || content.match(/plot[^>]*>(\d+)\s*m²/i);

    return plotMatch ? parseInt(plotMatch[1], 10) : undefined;
  }

  private async extractEPC(_page: any, content: string): Promise<string | undefined> {
    const epcMatch = content.match(/EPC[^>]*>([A-G])/i) || content.match(/EPC[:\s]*([A-G])/i);

    return epcMatch ? epcMatch[1] : undefined;
  }

  private async extractPhotos(page: any): Promise<string[]> {
    const photos: string[] = [];

    const imageSelectors = [
      '.entry-content img',
      '.post-content img',
      '[class*="gallery"] img',
      '[class*="slider"] img',
      'img[data-src]',
      'picture img'
    ];

    for (const selector of imageSelectors) {
      const images = await page.$$(selector);
      for (const img of images) {
        const src =
          (await img.getAttribute('data-src')) ||
          (await img.getAttribute('src'));
        if (src && !src.includes('logo') && !src.includes('icon') && !src.includes('gravatar')) {
          photos.push(src);
        }
      }
      if (photos.length >= 5) break;
    }

    return photos.slice(0, 5);
  }

  private extractMunicipality(content: string): string {
    const municipalityMatch =
      content.match(/gemeente[^>]*>([A-Za-z\s]+)</i) ||
      content.match(/plaats[^>]*>([A-Za-z\s]+)</i) ||
      content.match(/plaats[:\s]+([A-Za-z]+)/i) ||
      content.match(/([A-Za-z]+),\s*\d{4}\s*[A-Z]{2}/);

    if (municipalityMatch) {
      return municipalityMatch[1].trim().split(',')[0].trim();
    }
    return 'Unknown';
  }

  private extractPostcode(content: string): string {
    const postcodeMatch = content.match(/(\d{4}\s*[A-Z]{2}|\d{5})/);
    return postcodeMatch ? postcodeMatch[1] : '';
  }

  private extractId(url: string): string {
    const match = url.match(/[?&]p=(\d+)/);
    if (match) return match[1];

    const slugMatch = url.match(/\/([a-z0-9-]+)\/?$/i);
    if (slugMatch) return slugMatch[1];

    return url.split('/').pop() || 'unknown';
  }
}


