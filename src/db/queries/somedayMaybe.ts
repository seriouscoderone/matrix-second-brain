import { lte } from 'drizzle-orm';
import { Db } from '../migrate';
import { somedayMaybe, NewSomedayMaybe, SomedayMaybe } from '../schema';

export async function insertSomedayMaybe(db: Db, item: NewSomedayMaybe): Promise<SomedayMaybe> {
  const [inserted] = await db.insert(somedayMaybe).values(item).returning();
  return inserted;
}

export async function getOverdueReviews(db: Db): Promise<SomedayMaybe[]> {
  return db
    .select()
    .from(somedayMaybe)
    .where(lte(somedayMaybe.reviewDate, new Date()));
}
