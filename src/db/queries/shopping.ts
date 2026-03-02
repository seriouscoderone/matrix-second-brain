import { eq, and } from 'drizzle-orm';
import { Db } from '../migrate';
import { shoppingItems, NewShoppingItem, ShoppingItem } from '../schema';

export async function insertShoppingItem(db: Db, item: NewShoppingItem): Promise<ShoppingItem> {
  const [inserted] = await db.insert(shoppingItems).values(item).returning();
  return inserted;
}

export async function getPendingItemsForPlace(db: Db, placeId: string): Promise<ShoppingItem[]> {
  return db
    .select()
    .from(shoppingItems)
    .where(
      and(
        eq(shoppingItems.placeId, placeId),
        eq(shoppingItems.status, 'pending'),
      ),
    );
}

export async function getSharedShoppingItems(db: Db): Promise<ShoppingItem[]> {
  return db
    .select()
    .from(shoppingItems)
    .where(
      and(
        eq(shoppingItems.owner, 'shared'),
        eq(shoppingItems.status, 'pending'),
      ),
    );
}

export async function getAllPendingShoppingItems(db: Db): Promise<ShoppingItem[]> {
  return db
    .select()
    .from(shoppingItems)
    .where(eq(shoppingItems.status, 'pending'));
}
