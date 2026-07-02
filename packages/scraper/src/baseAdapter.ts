import { ScraperAdapter, KantoorConfig, RuwPand } from './types';

export abstract class BaseScraperAdapter implements ScraperAdapter {
  protected readonly config: KantoorConfig;
  protected readonly userAgent: string;
  protected readonly delayMs: number;

  // Bekende gemeenten in (en rond) de doelregio Leuven. Langste namen eerst
  // zodat 'Scherpenheuvel-Zichem' vóór 'Zichem' matcht.
  private static readonly MUNICIPALITIES: Array<{ naam: string; postcode: string }> = [
    { naam: 'Scherpenheuvel-Zichem', postcode: '3270' },
    { naam: 'Oud-Heverlee', postcode: '3050' },
    { naam: 'Tielt-Winge', postcode: '3390' },
    { naam: 'Sint-Joris-Weert', postcode: '3051' },
    { naam: 'Sint-Agatha-Rode', postcode: '3040' },
    { naam: 'Veltem-Beisem', postcode: '3020' },
    { naam: 'Begijnendijk', postcode: '3130' },
    { naam: 'Boortmeerbeek', postcode: '3190' },
    { naam: 'Pellenberg', postcode: '3212' },
    { naam: 'Kortenberg', postcode: '3070' },
    { naam: 'Keerbergen', postcode: '3140' },
    { naam: 'Boutersem', postcode: '3370' },
    { naam: 'Huldenberg', postcode: '3040' },
    { naam: 'Kessel-Lo', postcode: '3010' },
    { naam: 'Bekkevoort', postcode: '3460' },
    { naam: 'Kortenaken', postcode: '3470' },
    { naam: 'Hoegaarden', postcode: '3320' },
    { naam: 'Rotselaar', postcode: '3110' },
    { naam: 'Wezemaal', postcode: '3111' },
    { naam: 'Holsbeek', postcode: '3220' },
    { naam: 'Heverlee', postcode: '3001' },
    { naam: 'Wilsele', postcode: '3012' },
    { naam: 'Wijgmaal', postcode: '3018' },
    { naam: 'Winksele', postcode: '3020' },
    { naam: 'Tervuren', postcode: '3080' },
    { naam: 'Leefdaal', postcode: '3061' },
    { naam: 'Werchter', postcode: '3118' },
    { naam: 'Tremelo', postcode: '3120' },
    { naam: 'Betekom', postcode: '3130' },
    { naam: 'Aarschot', postcode: '3200' },
    { naam: 'Rillaar', postcode: '3202' },
    { naam: 'Gelrode', postcode: '3200' },
    { naam: 'Bierbeek', postcode: '3360' },
    { naam: 'Lovenjoel', postcode: '3360' },
    { naam: 'Blanden', postcode: '3052' },
    { naam: 'Haasrode', postcode: '3053' },
    { naam: 'Glabbeek', postcode: '3380' },
    { naam: 'Kumtich', postcode: '3300' },
    { naam: 'Testelt', postcode: '3272' },
    { naam: 'Averbode', postcode: '3271' },
    { naam: 'Zichem', postcode: '3271' },
    { naam: 'Binkom', postcode: '3211' },
    { naam: 'Bertem', postcode: '3060' },
    { naam: 'Haacht', postcode: '3150' },
    { naam: 'Lubbeek', postcode: '3210' },
    { naam: 'Linden', postcode: '3210' },
    { naam: 'Herent', postcode: '3020' },
    { naam: 'Tienen', postcode: '3300' },
    { naam: 'Diest', postcode: '3290' },
    { naam: 'Leuven', postcode: '3000' }
  ];

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

  /**
   * Decodeert veelvoorkomende HTML-entities en normaliseert witruimte.
   */
  protected cleanText(text: string): string {
    if (!text) return '';
    return text
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#39;|&apos;|&rsquo;/gi, "'")
      .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
      .replace(/&euro;/gi, '€')
      .replace(/&eacute;/gi, 'é')
      .replace(/&egrave;/gi, 'è')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Robuuste titel-extractie via de DOM (innerText) i.p.v. regex op ruwe HTML.
   * Probeert achtereenvolgens: <h1>, og:title, document.title.
   * Verwijdert een eventuele " | Kantoornaam"-suffix.
   */
  protected async getTitleFromPage(page: any): Promise<string | undefined> {
    const kandidaten: Array<() => Promise<string | null | undefined>> = [
      async () => {
        const h1 = await page.$('h1');
        return h1 ? await h1.innerText() : null;
      },
      async () =>
        await page.getAttribute('meta[property="og:title"]', 'content').catch(() => null),
      async () => await page.title().catch(() => null)
    ];

    // Bekende "junk"-titels (browserwaarschuwingen, 404-pagina's, cookiebanners,
    // kantoorslogans) die we willen overslaan zodat een betere kandidaat gekozen wordt.
    const junkPatronen = [
      /browser.*niet.*ondersteun/i,
      /pagina.*(niet.*(gevonden|worden gevonden)|bestaat niet)/i,
      /page not found|not found|404/i,
      /cookie/i,
      /javascript.*inschakel/i,
      /even geduld|loading/i
    ];
    const isJunk = (t: string) => junkPatronen.some((p) => p.test(t));

    for (const kandidaat of kandidaten) {
      try {
        const ruw = await kandidaat();
        if (ruw) {
          const titel = this.cleanText(ruw).split(/\s[|–—]\s/)[0].trim();
          // Te kort, te lang (waarschijnlijk een beschrijving) of junk → volgende proberen.
          if (titel.length > 4 && titel.length <= 120 && !isJunk(titel)) {
            return titel;
          }
        }
      } catch {
        /* volgende kandidaat proberen */
      }
    }
    return undefined;
  }

  /**
   * Matcht een gemeente + postcode tegen de bekende lijst voor de regio.
   * Kijkt eerst naar gemeentenamen, daarna naar een Belgische postcode (4 cijfers).
   */
  protected matchGemeente(text: string): { gemeente?: string; postcode?: string } {
    if (!text) return {};
    const lower = text.toLowerCase();

    for (const m of BaseScraperAdapter.MUNICIPALITIES) {
      const naam = m.naam.toLowerCase();
      // woordgrens-achtige match om deelstrings te vermijden
      const re = new RegExp(`(^|[^a-z])${naam.replace(/[-]/g, '[- ]')}([^a-z]|$)`, 'i');
      if (re.test(lower)) {
        return { gemeente: m.naam, postcode: m.postcode };
      }
    }

    const pc = text.match(/\b(3\d{3})\b/);
    if (pc) {
      const found = BaseScraperAdapter.MUNICIPALITIES.find((m) => m.postcode === pc[1]);
      if (found) return { gemeente: found.naam, postcode: found.postcode };
      return { postcode: pc[1] };
    }

    return {};
  }
}


