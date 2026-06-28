import { BaseScraperAdapter } from '../baseAdapter';
import { RuwPand } from '../types';
import { chromium } from 'playwright';

export class NationaalPortaalAdapter extends BaseScraperAdapter {
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

        await this.loadAllListings(page);

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

  private async loadAllListings(page: any): Promise<void> {
    try {
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        const loadMoreButton = await page.$('button:has-text("Meer"), button:has-text("Load more"), button:has-text("Toon meer"), a[href*="page"]').catch(() => null);

        if (!loadMoreButton) {
          break;
        }

        try {
          await loadMoreButton.click();
          await page.waitForTimeout(1000);
          attempts++;
        } catch (error) {
          break;
        }
      }

      this.log(`Loaded listings after ${attempts} clicks`);
    } catch (error) {
      this.log('Could not load all listings');
    }
  }

  private async extractPropertyLinks(page: any, baseUrl: string): Promise<string[]> {
    const links = new Set<string>();

    const propertySelectors = [
      'a[href*="object"], a[href*="listing"], a[href*="property"], a.property-link',
      'div[class*="listing"] a',
      'div[class*="property"] a',
      'article a'
    ];

    for (const selector of propertySelectors) {
      const elements = await page.$$(selector);
      for (const el of elements) {
        const href = await el.getAttribute('href');
        if (href && !href.includes('/search') && !href.includes('/filter') && !href.includes('/category')) {
          const fullUrl = new URL(href, baseUrl).toString();
          if (this.isValidPropertyUrl(fullUrl)) {
            links.add(fullUrl);
          }
        }
      }
    }

    return Array.from(links);
  }

  private isValidPropertyUrl(url: string): boolean {
    const propertyPatterns = [
      /\/object\//i,
      /\/listing\//i,
      /\/property\//i,
      /\/detail\//i,
      /id=\d+/i,
      /[a-z0-9-]+\/$/
    ];

    const excludePatterns = [/search|filter|category|page|login|sign/i];

    return (
      propertyPatterns.some((p) => p.test(url)) &&
      !excludePatterns.some((p) => p.test(url))
    );
  }

  private async scrapPropertyDetail(page: any, url: string): Promise<RuwPand | null> {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      const pageContent = await page.content();

      const titel = await this.extractTitle(page, pageContent);
      const prijs = await this.extractPrice(page, pageContent);
      const slaapkamers = await this.extractBedrooms(page, pageContent);
      const woonoppervlakte_m2 = await this.extractArea(page, pageContent);
      const perceel_m2 = await this.extractPlotArea(page, pageContent);
      const epc = await this.extractEPC(page, pageContent);
      const fotos = await this.extractPhotos(page);
      const gemeente = this.extractMunicipality(pageContent);
      const postcode = this.extractPostcode(pageContent);
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
      content.match(/<h1[^>]*>([^<]+)<\/h1>/) ||
      content.match(/<meta\s+property="og:title"\s+content="([^"]+)"/) ||
      content.match(/<title>([^<]+)<\/title>/);

    return titleMatch ? titleMatch[1].trim() : 'Unknown Property';
  }

  private async extractPrice(_page: any, content: string): Promise<number | undefined> {
    const priceMatch =
      content.match(/€\s*([\d.,]+)/) ||
      content.match(/price[^>]*>€?\s*([\d.,]+)/i);

    if (priceMatch) {
      return parseInt(priceMatch[1].replace(/[.,]/g, ''), 10);
    }
    return undefined;
  }

  private async extractBedrooms(_page: any, content: string): Promise<number | undefined> {
    const bedroomMatch =
      content.match(/(\d+)\s*slaapkamer/i) ||
      content.match(/(\d+)\s*bedroom/i) ||
      content.match(/slaapkamers?[:\s]*(\d+)/i);

    return bedroomMatch ? parseInt(bedroomMatch[1], 10) : undefined;
  }

  private async extractArea(_page: any, content: string): Promise<number | undefined> {
    const areaMatch =
      content.match(/(\d+)\s*m².*woon/i) ||
      content.match(/woonoppervlakte[:\s]*(\d+)/i) ||
      content.match(/living.*?(\d+)\s*m²/i);

    return areaMatch ? parseInt(areaMatch[1], 10) : undefined;
  }

  private async extractPlotArea(_page: any, content: string): Promise<number | undefined> {
    const plotMatch =
      content.match(/perceel[:\s]*(\d+)\s*m²/i) ||
      content.match(/plot[:\s]*(\d+)\s*m²/i);

    return plotMatch ? parseInt(plotMatch[1], 10) : undefined;
  }

  private async extractEPC(_page: any, content: string): Promise<string | undefined> {
    const epcMatch = content.match(/EPC[:\s]*([A-G])/i);
    return epcMatch ? epcMatch[1] : undefined;
  }

  private async extractPhotos(page: any): Promise<string[]> {
    const photos: string[] = [];

    const imageSelectors = [
      '[class*="gallery"] img',
      '[class*="carousel"] img',
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
        if (src && !src.includes('logo') && !src.includes('icon')) {
          photos.push(src);
        }
      }
      if (photos.length >= 5) break;
    }

    return photos.slice(0, 5);
  }

  private extractMunicipality(content: string): string {
    const municipalityMatch =
      content.match(/gemeente[:\s]*([A-Za-z\s]+)[<,]/i) ||
      content.match(/plaats[:\s]*([A-Za-z\s]+)[<,]/i) ||
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
    const match = url.match(/(?:id|object)[=\/](\d+)/i);
    if (match) return match[1];

    const slugMatch = url.match(/\/([a-z0-9-]+)(?:\/|$|\?)/i);
    if (slugMatch) return slugMatch[1];

    return url.split('/').pop() || 'unknown';
  }
}
