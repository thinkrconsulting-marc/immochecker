import { MongoClient, Db, Collection } from 'mongodb';
import { Pand, RuwPand } from './types';

export class DatabaseService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private pandCollection: Collection<Pand> | null = null;

  async connect(mongoUri: string, dbName: string = 'immochecker'): Promise<void> {
    this.client = new MongoClient(mongoUri);
    await this.client.connect();
    this.db = this.client.db(dbName);
    this.pandCollection = this.db.collection<Pand>('panden');
    await this.createIndexes();
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }

  private async createIndexes(): Promise<void> {
    if (!this.pandCollection) return;

    await this.pandCollection.createIndex({ bron_url: 1 }, { unique: true });
    await this.pandCollection.createIndex({ kantoor_id: 1, externe_id: 1 }, { unique: true });
    await this.pandCollection.createIndex({ status: 1 });
    await this.pandCollection.createIndex({ gemeente: 1 });
    await this.pandCollection.createIndex({ prijs: 1 });
    await this.pandCollection.createIndex({ eerst_gezien: 1 });
    await this.pandCollection.createIndex({ kantoor_id: 1 });
  }

  async syncPanden(
    kantoorId: number,
    kantoorNaam: string,
    rawPanden: RuwPand[]
  ): Promise<{ nieuw: number; geupdate: number; verdwenen: number }> {
    if (!this.pandCollection) {
      throw new Error('Database not connected');
    }

    const now = new Date();
    const stats = { nieuw: 0, geupdate: 0, verdwenen: 0 };

    const existingPanden = await this.pandCollection
      .find({ kantoor_id: kantoorId, status: 'actief' })
      .toArray();

    const rawPandenUrls = new Set(rawPanden.map((p) => p.bron_url));

    for (const pand of rawPanden) {
      const existing = existingPanden.find((p) => p.externe_id === pand.externe_id);

      if (existing) {
        const updates = {
          $set: {
            titel: pand.titel,
            beschrijving: pand.beschrijving,
            gemeente: pand.gemeente,
            postcode: pand.postcode,
            prijs: pand.prijs,
            slaapkamers: pand.slaapkamers,
            woonoppervlakte_m2: pand.woonoppervlakte_m2,
            perceel_m2: pand.perceel_m2,
            epc: pand.epc,
            fotos: pand.fotos,
            status: 'actief' as const,
            laatst_gezien: now
          }
        };

        await this.pandCollection.updateOne({ _id: existing._id }, updates);
        stats.geupdate++;
      } else {
        const newPand: Pand = {
          kantoor_id: kantoorId,
          kantoor_naam: kantoorNaam,
          externe_id: pand.externe_id,
          bron_url: pand.bron_url,
          type: 'huis',
          titel: pand.titel,
          beschrijving: pand.beschrijving,
          gemeente: pand.gemeente,
          postcode: pand.postcode || '',
          prijs: pand.prijs,
          slaapkamers: pand.slaapkamers,
          woonoppervlakte_m2: pand.woonoppervlakte_m2,
          perceel_m2: pand.perceel_m2,
          epc: pand.epc,
          fotos: pand.fotos,
          status: 'actief',
          eerst_gezien: now,
          laatst_gezien: now
        };

        try {
          await this.pandCollection.insertOne(newPand);
          stats.nieuw++;
        } catch (error: unknown) {
          const err = error as { code?: number };
          if (err.code === 11000) {
            stats.geupdate++;
          } else {
            throw error;
          }
        }
      }
    }

    for (const existing of existingPanden) {
      if (!rawPandenUrls.has(existing.bron_url)) {
        await this.pandCollection.updateOne(
          { _id: existing._id },
          { $set: { status: 'verdwenen' as const } }
        );
        stats.verdwenen++;
      }
    }

    return stats;
  }

  async getActivePanden(filters?: {
    gemeente?: string[];
    prijs_min?: number;
    prijs_max?: number;
    kantoor_ids?: number[];
    page?: number;
    limit?: number;
    sort?: string;
  }): Promise<{ panden: Pand[]; total: number }> {
    if (!this.pandCollection) {
      throw new Error('Database not connected');
    }

    const query: Record<string, unknown> = { status: 'actief' };

    if (filters?.gemeente && filters.gemeente.length > 0) {
      query.gemeente = { $in: filters.gemeente };
    }

    if (filters?.prijs_min !== undefined || filters?.prijs_max !== undefined) {
      query.prijs = {};
      if (filters.prijs_min !== undefined) {
        (query.prijs as Record<string, number>).$gte = filters.prijs_min;
      }
      if (filters.prijs_max !== undefined) {
        (query.prijs as Record<string, number>).$lte = filters.prijs_max;
      }
    }

    if (filters?.kantoor_ids && filters.kantoor_ids.length > 0) {
      query.kantoor_id = { $in: filters.kantoor_ids };
    }

    const total = await this.pandCollection.countDocuments(query);

    let sortQuery: Record<string, number> = { laatst_gezien: -1 };
    if (filters?.sort) {
      if (filters.sort === 'prijs_asc') sortQuery = { prijs: 1 };
      else if (filters.sort === 'prijs_desc') sortQuery = { prijs: -1 };
      else if (filters.sort === 'oudst') sortQuery = { eerst_gezien: 1 };
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 24;
    const skip = (page - 1) * limit;

    const panden = await this.pandCollection
      .find(query)
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .toArray();

    return { panden, total };
  }

  async purgeOldVerdwenen(daysOld: number): Promise<number> {
    if (!this.pandCollection) {
      throw new Error('Database not connected');
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.pandCollection.deleteMany({
      status: 'verdwenen',
      laatst_gezien: { $lt: cutoffDate }
    });

    return result.deletedCount || 0;
  }

  async getKantoren(): Promise<Array<{ id: number; naam: string; actief_count: number }>> {
    if (!this.pandCollection) {
      throw new Error('Database not connected');
    }

    const result = await this.pandCollection
      .aggregate([
        { $match: { status: 'actief' } },
        {
          $group: {
            _id: { id: '$kantoor_id', naam: '$kantoor_naam' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.id': 1 } }
      ])
      .toArray();

    return result.map((r) => ({
      id: (r._id as { id: number; naam: string }).id,
      naam: (r._id as { id: number; naam: string }).naam,
      actief_count: r.count
    }));
  }
}

export const dbService = new DatabaseService();
