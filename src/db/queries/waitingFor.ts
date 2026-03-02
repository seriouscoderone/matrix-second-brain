import { lte } from 'drizzle-orm';
import { Db } from '../migrate';
import { waitingFor, NewWaitingFor, WaitingFor } from '../schema';

export async function insertWaitingFor(db: Db, item: NewWaitingFor): Promise<WaitingFor> {
  const [inserted] = await db.insert(waitingFor).values(item).returning();
  return inserted;
}

export async function getFollowUpsDue(db: Db): Promise<WaitingFor[]> {
  return db
    .select()
    .from(waitingFor)
    .where(lte(waitingFor.followUpDate, new Date()));
}
