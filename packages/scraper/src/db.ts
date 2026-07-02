import { Pool } from 'pg';
import { RuwPand } from './types';

/**
 * PostgreSQL datalaag voor de scraper.
 * Schrijft naar dezelfde `panden`-tabel die de API leest, zodat scraper en API
 * één gedeelde datastore gebruiken (PostgreSQL).
 */
export class ScraperDbService {
  private pool: Pool | null = null;

  async connect(databaseUrl: string): Promise<void> {
    this.pool = new Pool({ connectionString: databaseUrl });
    await this.pool.query('SELECT NOW()');
    await this.initializeSchema();
    console.log('[scraper] Connected to PostgreSQL');
  }

  private getPool(): Pool {
    if (!this.pool) {
      throw new Error('ScraperDbService not connected. Call connect() first.');
    }
    return this.pool;
  }

  private async initializeSchema(): Promise<void> {
    const schema = `
      CREATE TABLE IF NOT EXISTS panden (
        id SERIAL PRIMARY KEY,
        kantoor_id INTEGER NOT NULL,
        kantoor_naam VARCHAR(255) NOT NULL,
        externe_id VARCHAR(255) NOT NULL,
        bron_url VARCHAR(2048) UNIQUE NOT NULL,
        type VARCHAR(50) DEFAULT 'huis',
        titel VARCHAR(500) NOT NULL,
        beschrijving TEXT,
        gemeente VARCHAR(255) NOT NULL,
        postcode VARCHAR(10),
        prijs INTEGER,
        slaapkamers INTEGER,
        woonoppervlakte_m2 INTEGER,
        perceel_m2 INTEGER,
        epc VARCHAR(3),
        fotos TEXT[] DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'actief',
        eerst_gezien TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        laatst_gezien TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(kantoor_id, externe_id)
      );

      CREATE INDEX IF NOT EXISTS idx_status ON panden(status);
      CREATE INDEX IF NOT EXISTS idx_gemeente ON panden(gemeente);
      CREATE INDEX IF NOT EXISTS idx_prijs ON panden(prijs);
      CREATE INDEX IF NOT EXISTS idx_eerste_gezien ON panden(eerst_gezien);
      CREATE INDEX IF NOT EXISTS idx_kantoor_id ON panden(kantoor_id);
    `;
    await this.getPool().query(schema);
  }

  /**
   * Upsert alle gescrapete panden van één kantoor en markeer verdwenen panden.
   * Retourneert tellingen die de orchestrator gebruikt voor logging.
   */
  async syncPanden(
    kantoorId: number,
    kantoorNaam: string,
    panden: RuwPand[]
  ): Promise<{ nieuw: number; geupdate: number; verdwenen: number }> {
    const pool = this.getPool();
    const client = await pool.connect();

    let nieuw = 0;
    let geupdate = 0;
    let verdwenen = 0;

    try {
      await client.query('BEGIN');

      const upsertQuery = `
        INSERT INTO panden
          (kantoor_id, kantoor_naam, externe_id, bron_url, type, titel, beschrijving,
           gemeente, postcode, prijs, slaapkamers, woonoppervlakte_m2, perceel_m2, epc, fotos,
           status, eerst_gezien, laatst_gezien)
        VALUES ($1, $2, $3, $4, 'huis', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                'actief', NOW(), NOW())
        ON CONFLICT (kantoor_id, externe_id) DO UPDATE SET
          bron_url = EXCLUDED.bron_url,
          titel = EXCLUDED.titel,
          beschrijving = EXCLUDED.beschrijving,
          gemeente = EXCLUDED.gemeente,
          postcode = EXCLUDED.postcode,
          prijs = EXCLUDED.prijs,
          slaapkamers = EXCLUDED.slaapkamers,
          woonoppervlakte_m2 = EXCLUDED.woonoppervlakte_m2,
          perceel_m2 = EXCLUDED.perceel_m2,
          epc = EXCLUDED.epc,
          fotos = EXCLUDED.fotos,
          status = 'actief',
          laatst_gezien = NOW()
        RETURNING (xmax = 0) AS inserted
      `;

      for (const pand of panden) {
        const result = await client.query(upsertQuery, [
          kantoorId,
          kantoorNaam,
          pand.externe_id,
          pand.bron_url,
          pand.titel,
          pand.beschrijving || null,
          pand.gemeente,
          pand.postcode || null,
          pand.prijs ?? null,
          pand.slaapkamers ?? null,
          pand.woonoppervlakte_m2 ?? null,
          pand.perceel_m2 ?? null,
          pand.epc || null,
          pand.fotos || []
        ]);

        if (result.rows[0]?.inserted) {
          nieuw++;
        } else {
          geupdate++;
        }
      }

      // Markeer panden die niet meer voorkomen in de scrape als 'verdwenen'.
      // Alléén doen wanneer de scrape effectief panden opleverde (idempotentie /
      // bescherming tegen een gedeeltelijk gefaalde run die alles zou wissen).
      if (panden.length > 0) {
        const externeIds = panden.map((p) => p.externe_id);
        const placeholders = externeIds.map((_, i) => `$${i + 2}`).join(',');
        const markQuery = `
          UPDATE panden
          SET status = 'verdwenen', laatst_gezien = NOW()
          WHERE kantoor_id = $1
            AND status = 'actief'
            AND externe_id NOT IN (${placeholders})
        `;
        const markResult = await client.query(markQuery, [kantoorId, ...externeIds]);
        verdwenen = markResult.rowCount || 0;
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return { nieuw, geupdate, verdwenen };
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

export const scraperDb = new ScraperDbService();
