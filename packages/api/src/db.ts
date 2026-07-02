import { Pool } from 'pg';

interface PandRow {
  id: number;
  kantoor_id: number;
  kantoor_naam: string;
  externe_id: string;
  bron_url: string;
  type: string;
  titel: string;
  beschrijving?: string;
  gemeente: string;
  postcode: string;
  prijs?: number;
  slaapkamers?: number;
  woonoppervlakte_m2?: number;
  perceel_m2?: number;
  epc?: string;
  fotos: string[];
  status: 'actief' | 'verdwenen';
  eerst_gezien: Date;
  laatst_gezien: Date;
}

interface GetPandenOptions {
  gemeente?: string[];
  prijs_min?: number;
  prijs_max?: number;
  kantoor_ids?: number[];
  page?: number;
  limit?: number;
  sort?: string;
}

class DatabaseService {
  private pool: Pool | null = null;

  private getPool(): Pool {
    if (!this.pool) {
      throw new Error('DatabaseService not connected. Call connect() first.');
    }
    return this.pool;
  }

  async connect(databaseUrl: string): Promise<void> {
    // Pool alleen hier aanmaken (niet in de constructor), zodat DATABASE_URL
    // gegarandeerd geladen is via dotenv.config() vóór de pool wordt gemaakt.
    this.pool = new Pool({
      connectionString: databaseUrl
    });

    try {
      await this.getPool().query('SELECT NOW()');
      console.log('Connected to PostgreSQL');

      await this.initializeSchema();
    } catch (error) {
      console.error('Failed to connect to PostgreSQL:', error);
      throw error;
    }
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

    try {
      await this.getPool().query(schema);
    } catch (error) {
      console.error('Failed to initialize schema:', error);
    }
  }

  async getActivePanden(options: GetPandenOptions): Promise<{ panden: PandRow[]; total: number }> {
    let query = 'SELECT * FROM panden WHERE status = $1';
    let params: any[] = ['actief'];
    let paramIndex = 2;

    if (options.gemeente && options.gemeente.length > 0) {
      const placeholders = options.gemeente.map(() => `$${paramIndex++}`).join(',');
      query += ` AND gemeente IN (${placeholders})`;
      params.push(...options.gemeente);
    }

    if (options.prijs_min !== undefined) {
      query += ` AND (prijs IS NULL OR prijs >= $${paramIndex++})`;
      params.push(options.prijs_min);
    }

    if (options.prijs_max !== undefined) {
      query += ` AND (prijs IS NULL OR prijs <= $${paramIndex++})`;
      params.push(options.prijs_max);
    }

    if (options.kantoor_ids && options.kantoor_ids.length > 0) {
      const placeholders = options.kantoor_ids.map(() => `$${paramIndex++}`).join(',');
      query += ` AND kantoor_id IN (${placeholders})`;
      params.push(...options.kantoor_ids);
    }

    // Count-query op de WHERE-clausule berekenen VOORDAT ORDER BY / LIMIT worden
    // toegevoegd. Een COUNT(*) met ORDER BY op een niet-geaggregeerde kolom faalt
    // in PostgreSQL, wat alle listing-endpoints 500 deed geven.
    const countQuery = query.replace(/SELECT \*/, 'SELECT COUNT(*) as total');
    const countResult = await this.getPool().query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    const sortMap: Record<string, string> = {
      prijs_asc: 'prijs ASC NULLS LAST',
      prijs_desc: 'prijs DESC NULLS LAST',
      nieuwst: 'eerst_gezien DESC',
      oudst: 'eerst_gezien ASC',
      // aliassen (backward compatible)
      nieuw: 'eerst_gezien DESC',
      oud: 'eerst_gezien ASC'
    };

    const orderBy = sortMap[options.sort || 'nieuwst'] || 'eerst_gezien DESC';
    query += ` ORDER BY ${orderBy}`;

    const page = options.page || 1;
    const limit = options.limit || 24;
    const offset = (page - 1) * limit;

    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await this.getPool().query(query, params);
    const panden: PandRow[] = result.rows.map(row => ({
      ...row,
      fotos: Array.isArray(row.fotos) ? row.fotos : [],
      eerst_gezien: new Date(row.eerst_gezien),
      laatst_gezien: new Date(row.laatst_gezien)
    }));

    return { panden, total };
  }

  async getNeuwePanden(minDays: number = 7): Promise<PandRow[]> {
    const query = `
      SELECT * FROM panden
      WHERE status = 'actief'
      AND eerst_gezien >= NOW() - INTERVAL '${minDays} days'
      ORDER BY eerst_gezien DESC
      LIMIT 100
    `;

    const result = await this.getPool().query(query);
    return result.rows.map(row => ({
      ...row,
      fotos: Array.isArray(row.fotos) ? row.fotos : [],
      eerst_gezien: new Date(row.eerst_gezien),
      laatst_gezien: new Date(row.laatst_gezien)
    }));
  }

  async getAllKantoren(): Promise<any[]> {
    const query = `
      SELECT DISTINCT kantoor_id as id, kantoor_naam as naam
      FROM panden
      WHERE status = 'actief'
      ORDER BY kantoor_naam ASC
    `;

    const result = await this.getPool().query(query);
    return result.rows;
  }

  async getPandenByKantoor(kantoorId: number): Promise<PandRow[]> {
    const query = `
      SELECT * FROM panden
      WHERE kantoor_id = $1 AND status = 'actief'
      ORDER BY eerst_gezien DESC
    `;

    const result = await this.getPool().query(query, [kantoorId]);
    return result.rows.map(row => ({
      ...row,
      fotos: Array.isArray(row.fotos) ? row.fotos : [],
      eerst_gezien: new Date(row.eerst_gezien),
      laatst_gezien: new Date(row.laatst_gezien)
    }));
  }

  async syncPanden(kantoorId: number, kantoorNaam: string, panden: any[]): Promise<void> {
    const client = await this.getPool().connect();

    try {
      await client.query('BEGIN');

      const upsertQuery = `
        INSERT INTO panden (kantoor_id, kantoor_naam, externe_id, bron_url, titel, gemeente, postcode, prijs, slaapkamers, woonoppervlakte_m2, perceel_m2, epc, fotos, status, eerst_gezien, laatst_gezien)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'actief', NOW(), NOW())
        ON CONFLICT (kantoor_id, externe_id) DO UPDATE SET
          titel = $5,
          gemeente = $6,
          postcode = $7,
          prijs = $8,
          slaapkamers = $9,
          woonoppervlakte_m2 = $10,
          perceel_m2 = $11,
          epc = $12,
          fotos = $13,
          status = 'actief',
          laatst_gezien = NOW()
      `;

      for (const pand of panden) {
        await client.query(upsertQuery, [
          kantoorId,
          kantoorNaam,
          pand.externe_id,
          pand.bron_url,
          pand.titel,
          pand.gemeente,
          pand.postcode,
          pand.prijs || null,
          pand.slaapkamers || null,
          pand.woonoppervlakte_m2 || null,
          pand.perceel_m2 || null,
          pand.epc || null,
          pand.fotos || []
        ]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async purgeOldVerdwenen(days: number): Promise<number> {
    const query = `
      DELETE FROM panden
      WHERE status = 'verdwenen'
      AND laatst_gezien < NOW() - INTERVAL '${days} days'
    `;

    const result = await this.getPool().query(query);
    return result.rowCount || 0;
  }

  async markMissing(kantoorId: number, existingIds: string[]): Promise<void> {
    if (existingIds.length === 0) {
      return;
    }

    const placeholders = existingIds.map((_, i) => `$${i + 2}`).join(',');
    const query = `
      UPDATE panden
      SET status = 'verdwenen', laatst_gezien = NOW()
      WHERE kantoor_id = $1
      AND status = 'actief'
      AND externe_id NOT IN (${placeholders})
    `;

    const params = [kantoorId, ...existingIds];
    await this.getPool().query(query, params);
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

export const dbService = new DatabaseService();


