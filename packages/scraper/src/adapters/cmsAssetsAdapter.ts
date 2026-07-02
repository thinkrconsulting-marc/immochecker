import { BaseScraperAdapter } from '../baseAdapter';
import { RuwPand } from '../types';
import { chromium } from 'playwright';

export class CMSAssetsAdapter extends BaseScraperAdapter {
  async scrapeKantoor(): Promise<RuwPand[]> {
    const browser = await chromium.launch();
    const context = await browser.newContext({ userAgent: this.userAgent });
    const page = await context.newPage();

    try {
      const allPanden: RuwPand[] = [];

      for (const url of this.config.aanbod_urls) {
        this.log(`Scraping ${url}`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

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

    const propertyElements = await page.$$('[data-property], .property-card, .property-item, [class*="property"]');

    for (const element of propertyElements) {
      const href = await element.$eval('a', (el: any) => el.href).catch(() => null);
      if (href) {
        links.add(href);
      }
    }

    if (links.size === 0) {
      const allLinks = await page.$$('a[href*="property"], a[href*="immovable"], a[href*="/item/"]');
      for (const link of allLinks) {
        const href = await link.getAttribute('href');
        if (href && this.isPropertyLink(href)) {
          links.add(new URL(href, baseUrl).toString());
        }
      }
    }

    return Array.from(links);
  }

  private isPropertyLink(href: string): boolean {
    const propertyPatterns = [
      /\/property\//i,
      /\/item\//i,
      /\/immovable\//i,
      /\/details\//i,
      /\d{6,10}$/,
      /te-koop|for-sale/i
    ];
    return propertyPatterns.some((pattern) => pattern.test(href));
  }

  private async scrapPropertyDetail(page: any, url: string): Promise<RuwPand | null> {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      const pageContent = await page.content();

      const titleMatch =
        pageContent.match(/<h1[^>]*>([^<]+)<\/h1>/) ||
        pageContent.match(/<title>([^<]+)<\/title>/);
      const titel =
        (await this.getTitleFromPage(page)) ||
        (titleMatch ? this.cleanText(titleMatch[1]) : 'Unknown Property');

      const priceMatch = pageContent.match(/€\s*([\d.,]+)/);
      const prijs = priceMatch
        ? parseInt(priceMatch[1].split(',')[0].replace(/\./g, ''), 10)
        : undefined;

      const bedroomsMatch =
        pageContent.match(/(\d+)\s*slaapkamer/i) ||
        pageContent.match(/(\d+)\s*bedroom/i);
      const slaapkamers = bedroomsMatch ? parseInt(bedroomsMatch[1], 10) : undefined;

      const areaMatch =
        pageContent.match(/(\d+)\s*m².*woon/i) ||
        pageContent.match(/living\s*space[:\s]+(\d+)/i);
      const woonoppervlakte_m2 = areaMatch ? parseInt(areaMatch[1], 10) : undefined;

      const percatchMatch =
        pageContent.match(/perceel[:\s]+(\d+)\s*m²/i) ||
        pageContent.match(/plot[:\s]+(\d+)\s*m²/i);
      const perceel_m2 = percatchMatch ? parseInt(percatchMatch[1], 10) : undefined;

      const epcMatch = pageContent.match(/EPC[:\s]*([A-G])/i);
      const epc = epcMatch ? epcMatch[1] : undefined;

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

  private async extractPhotos(page: any): Promise<string[]> {
    const photos: string[] = [];

    const imageSelectors = [
      'img[data-src]',
      'img[src*="property"]',
      'img[src*="immo"]',
      '[class*="carousel"] img',
      '[class*="gallery"] img'
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
      content.match(/city[:\s]+([A-Za-z\s]+)[<,]/i) ||
      content.match(/([A-Za-z]+),\s*\d{4}\s*[A-Z]{2}/) ||
      content.match(/\d{4}\s*([A-Za-z\s]+)\s*/);

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
    const match = url.match(/\/(\d{6,10})(?:\/|$|[\?#])/);
    if (match) return match[1];
    const slugMatch = url.match(/\/([a-z0-9-]+)(?:\/|$|[\?#])/);
    return slugMatch ? slugMatch[1] : url.split('/').pop() || 'unknown';
  }
}


