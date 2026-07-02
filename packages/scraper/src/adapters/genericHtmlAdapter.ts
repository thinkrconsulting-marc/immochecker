import { BaseScraperAdapter } from '../baseAdapter';
import { RuwPand } from '../types';
import { chromium } from 'playwright';

export class GenericHTMLAdapter extends BaseScraperAdapter {
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

        await this.loadAllContent(page);

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

  private async loadAllContent(page: any): Promise<void> {
    try {
      let attempts = 0;
      const maxAttempts = 20;

      while (attempts < maxAttempts) {
        const buttons = await page.$$(
          'button:has-text("Meer"), button:has-text("Load more"), button:has-text("Toon meer"), a[href*="page"]'
        );

        if (buttons.length === 0) break;

        try {
          await buttons[0].click();
          await page.waitForTimeout(800);
          attempts++;
        } catch (error) {
          break;
        }
      }
    } catch (error) {
      this.log('Could not load all content');
    }
  }

  private async extractPropertyLinks(page: any, baseUrl: string): Promise<string[]> {
    const links = new Set<string>();

    const broadSelectors = [
      'a[href*="property"]',
      'a[href*="object"]',
      'a[href*="detail"]',
      'a[href*="listing"]',
      'a[href*="item"]',
      'div.property a:first-child',
      'div[class*="property"] a',
      'div[class*="listing"] a'
    ];

    for (const selector of broadSelectors) {
      const elements = await page.$$(selector);
      for (const el of elements) {
        const href = await el.getAttribute('href');
        if (href && this.isValidPropertyUrl(href)) {
          const fullUrl = new URL(href, baseUrl).toString();
          links.add(fullUrl);
        }
      }
      if (links.size >= 100) break;
    }

    return Array.from(links);
  }

  private isValidPropertyUrl(href: string): boolean {
    if (!href) return false;

    const excluded = [
      '/search',
      '/filter',
      '/category',
      '/page',
      '/login',
      '/register',
      '/contact',
      '#'
    ];

    if (excluded.some((ex) => href.includes(ex))) {
      return false;
    }

    const patterns = [
      /property|object|detail|listing|item|post|\d{4,}/i
    ];

    return patterns.some((p) => p.test(href));
  }

  private async scrapPropertyDetail(page: any, url: string): Promise<RuwPand | null> {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

      await page.waitForTimeout(500);

      const pageContent = await page.content();

      const titel =
        (await this.getTitleFromPage(page)) || (await this.extractTitle(page, pageContent));
      if (titel === 'Unknown Property') {
        return null;
      }

      const prijs = await this.extractPrice(page, pageContent);
      const slaapkamers = await this.extractBedrooms(page, pageContent);
      const woonoppervlakte_m2 = await this.extractArea(page, pageContent);
      const perceel_m2 = await this.extractPlotArea(page, pageContent);
      const epc = await this.extractEPC(page, pageContent);
      const fotos = await this.extractPhotos(page);
      const _geo = this.matchGemeente(`${titel} ${url}`).gemeente
        ? this.matchGemeente(`${titel} ${url}`)
        : this.matchGemeente(pageContent);
      const gemeente = _geo.gemeente || this.extractMunicipality(pageContent);
      const postcode = _geo.postcode || this.extractPostcode(pageContent);
      const externe_id = this.extractId(url);

      if (!prijs && !slaapkamers && !woonoppervlakte_m2) {
        return null;
      }

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
      return null;
    }
  }

  private async extractTitle(_page: any, content: string): Promise<string> {
    const patterns = [
      /<h1[^>]*>([^<]+)<\/h1>/,
      /<h1[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/h1>/,
      /<meta\s+property="og:title"\s+content="([^"]+)"/,
      /<meta\s+name="title"\s+content="([^"]+)"/,
      /<title>([^<]+)<\/title>/
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1].length > 5) {
        return match[1].trim();
      }
    }

    return 'Unknown Property';
  }

  private async extractPrice(_page: any, content: string): Promise<number | undefined> {
    const patterns = [
      /€\s*([\d.,]+)/,
      /price[^>]*>€?\s*([\d.,]+)/i,
      /prijs[^>]*>€?\s*([\d.,]+)/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const price = parseInt(match[1].split(',')[0].replace(/\./g, ''), 10);
        if (price > 1000) return price;
      }
    }

    return undefined;
  }

  private async extractBedrooms(_page: any, content: string): Promise<number | undefined> {
    const patterns = [
      /(\d+)\s*slaapkamer/i,
      /(\d+)\s*bedroom/i,
      /slaapkamers?[:\s]*(\d+)/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    return undefined;
  }

  private async extractArea(_page: any, content: string): Promise<number | undefined> {
    const patterns = [
      /(\d+)\s*m².*woon/i,
      /woonoppervlakte[:\s]*(\d+)/i,
      /living.*?(\d+)\s*m²/i,
      /m²[:\s]*(\d+).*woon/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const area = parseInt(match[1], 10);
        if (area > 20) return area;
      }
    }

    return undefined;
  }

  private async extractPlotArea(_page: any, content: string): Promise<number | undefined> {
    const patterns = [
      /perceel[:\s]*(\d+)\s*m²/i,
      /plot[:\s]*(\d+)\s*m²/i,
      /terrain[:\s]*(\d+)\s*m²/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const plot = parseInt(match[1], 10);
        if (plot > 20) return plot;
      }
    }

    return undefined;
  }

  private async extractEPC(_page: any, content: string): Promise<string | undefined> {
    const epcMatch = content.match(/EPC[:\s]*([A-G])/i);
    return epcMatch ? epcMatch[1] : undefined;
  }

  private async extractPhotos(page: any): Promise<string[]> {
    const photos: string[] = [];

    const imageSelectors = [
      'img[data-src]',
      '[class*="gallery"] img',
      '[class*="carousel"] img',
      '[class*="slider"] img',
      'picture img',
      '[class*="photo"] img'
    ];

    for (const selector of imageSelectors) {
      const images = await page.$$(selector);
      for (const img of images) {
        const src =
          (await img.getAttribute('data-src')) ||
          (await img.getAttribute('src')) ||
          (await img.getAttribute('data-original'));

        if (
          src &&
          src.length > 10 &&
          !src.includes('logo') &&
          !src.includes('icon') &&
          !src.includes('gravatar') &&
          (src.includes('http') || src.startsWith('/'))
        ) {
          photos.push(src);
        }
      }
      if (photos.length >= 5) break;
    }

    return photos.slice(0, 5);
  }

  private extractMunicipality(content: string): string {
    const patterns = [
      /gemeente[:\s]*([A-Za-z\s]+)[<,]/i,
      /plaats[:\s]*([A-Za-z\s]+)[<,]/i,
      /plaats[:\s]*([A-Za-z]+)/i,
      /([A-Za-z]+),\s*\d{4}\s*[A-Z]{2}/
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim().split(',')[0].trim();
      }
    }

    return 'Unknown';
  }

  private extractPostcode(content: string): string {
    const postcodeMatch = content.match(/(\d{4}\s*[A-Z]{2}|\d{5})/);
    return postcodeMatch ? postcodeMatch[1] : '';
  }

  private extractId(url: string): string {
    const patterns = [
      /[?&]id=([a-z0-9-]+)/i,
      /[?&]p=(\d+)/i,
      /\/(\d{4,})(?:\/|$|\?)/,
      /\/([a-z0-9-]+)(?:\/|$|\?)/i
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return url.split('/').pop() || 'unknown';
  }
}


