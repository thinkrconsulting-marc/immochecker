import { BaseScraperAdapter } from '../baseAdapter';
import { RuwPand } from '../types';
import { chromium } from 'playwright';

export class SkarabeeAdapter extends BaseScraperAdapter {
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

    await page.waitForSelector('a[href*="details"], a[href*="property"], .property-link', { timeout: 5000 }).catch(() => {});

    const propertyLinks = await page.$$('a[href*="details"], a[href*="property"], a[href*="item"], .property-link, [data-property] a');

    for (const link of propertyLinks) {
      const href = await link.getAttribute('href');
      if (href) {
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
      /\/details?\//i,
      /\/property\//i,
      /\/object\//i,
      /\/item\//i,
      /property-id=/i,
      /-\d{5,8}(?:\/|$|\?)/
    ];
    return propertyPatterns.some((pattern) => pattern.test(href));
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

  private async extractTitle(page: any, content: string): Promise<string> {
    try {
      const heading = await page.$('h1, h2');
      if (heading) {
        return await heading.textContent();
      }
    } catch (error) {
      const titleMatch = content.match(/<h1[^>]*>([^<]+)<\/h1>/);
      if (titleMatch) {
        return titleMatch[1].trim();
      }
    }
    return 'Unknown Property';
  }

  private async extractPrice(_page: any, content: string): Promise<number | undefined> {
    try {
      const priceElement = await _page.$('[class*="price"], [data-price]');
      if (priceElement) {
        const text = await priceElement.textContent();
        const match = text.match(/€\s*([\d.,]+)/);
        if (match) {
          return parseInt(match[1].replace(/[.,]/g, ''), 10);
        }
      }
    } catch (error) {
      const priceMatch = content.match(/€\s*([\d.,]+)/);
      if (priceMatch) {
        return parseInt(priceMatch[1].replace(/[.,]/g, ''), 10);
      }
    }
    return undefined;
  }

  private async extractBedrooms(_page: any, content: string): Promise<number | undefined> {
    try {
      const bedroomElement = await _page.$('[class*="bedroom"], [data-bedroom]');
      if (bedroomElement) {
        const text = await bedroomElement.textContent();
        const match = text.match(/(\d+)/);
        if (match) return parseInt(match[1], 10);
      }
    } catch (error) {
      const bedroomMatch = content.match(/(\d+)\s*slaapkamer/i);
      if (bedroomMatch) return parseInt(bedroomMatch[1], 10);
    }
    return undefined;
  }

  private async extractArea(_page: any, content: string): Promise<number | undefined> {
    try {
      const areaElement = await _page.$('[class*="living"], [class*="area"]');
      if (areaElement) {
        const text = await areaElement.textContent();
        const match = text.match(/(\d+)\s*m²/);
        if (match) return parseInt(match[1], 10);
      }
    } catch (error) {
      const areaMatch = content.match(/(\d+)\s*m².*woon/i);
      if (areaMatch) return parseInt(areaMatch[1], 10);
    }
    return undefined;
  }

  private async extractPlotArea(_page: any, content: string): Promise<number | undefined> {
    const plotMatch = content.match(/perceel[:\s]+(\d+)\s*m²/i);
    return plotMatch ? parseInt(plotMatch[1], 10) : undefined;
  }

  private async extractEPC(_page: any, content: string): Promise<string | undefined> {
    const epcMatch = content.match(/EPC[:\s]*([A-G])/i);
    return epcMatch ? epcMatch[1] : undefined;
  }

  private async extractPhotos(page: any): Promise<string[]> {
    const photos: string[] = [];

    const imageSelectors = [
      '[class*="slider"] img',
      '[class*="carousel"] img',
      '[class*="gallery"] img',
      'img[data-src]',
      '[class*="photo"] img',
      'a[href*="image"] img'
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
      content.match(/gemeente[:\s]+([A-Za-z\s]+)[<,]/i) ||
      content.match(/plaats[:\s]+([A-Za-z\s]+)[<,]/i) ||
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
    const match = url.match(/(?:property|object|item|details?)[=\/](\d{5,10})/i);
    if (match) return match[1];

    const slugMatch = url.match(/\/([a-z0-9-]+)(?:\/|$|\?)/i);
    if (slugMatch) return slugMatch[1];

    return url.split('/').pop() || 'unknown';
  }
}
