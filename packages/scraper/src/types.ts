export interface RuwPand {
  externe_id: string;
  bron_url: string;
  titel: string;
  beschrijving?: string;
  gemeente: string;
  postcode?: string;
  prijs?: number;
  slaapkamers?: number;
  woonoppervlakte_m2?: number;
  perceel_m2?: number;
  epc?: string;
  fotos: string[];
}

export interface KantoorConfig {
  id: number;
  naam: string;
  basis_url: string;
  aanbod_urls: string[];
  scraper_groep: string;
}

export interface ScraperAdapter {
  scrapeKantoor(config: KantoorConfig): Promise<RuwPand[]>;
}
