import { eq } from 'drizzle-orm';
import { Db } from '../migrate';
import { inboxItems, NewInboxItem, InboxItem } from '../schema';

export async function insertInboxItem(db: Db, item: NewInboxItem): Promise<InboxItem> {
  const [inserted] = await db.insert(inboxItems).values(item).returning();
  return inserted;
}

export async function markProcessed(db: Db, id: string): Promise<void> {
  await db
    .update(inboxItems)
    .set({ status: 'processed', processedAt: new Date() })
    .where(eq(inboxItems.id, id));
}

export async function getUnprocessedItems(db: Db): Promise<InboxItem[]> {
  return db
    .select()
    .from(inboxItems)
    .where(eq(inboxItems.status, 'new'));
}
