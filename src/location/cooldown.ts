import { eq, and, gt } from 'drizzle-orm';
import { Db } from '../db/migrate';
import { locationCooldowns } from '../db/schema';
import { env } from '../config';

export async function checkCooldown(userId: string, placeId: string, db: Db): Promise<boolean> {
  // Returns true if OK to alert (cooldown expired or no cooldown record)
  const cooldownMs = env.LOCATION_COOLDOWN_MINUTES * 60 * 1000;
  const cutoff = new Date(Date.now() - cooldownMs);

  const existing = await db
    .select()
    .from(locationCooldowns)
    .where(
      and(
        eq(locationCooldowns.userId, userId),
        eq(locationCooldowns.placeId, placeId),
        gt(locationCooldowns.lastAlertedAt, cutoff),
      ),
    )
    .limit(1);

  return existing.length === 0;
}

export async function updateCooldown(userId: string, placeId: string, db: Db): Promise<void> {
  await db
    .insert(locationCooldowns)
    .values({ userId, placeId, lastAlertedAt: new Date() })
    .onConflictDoUpdate({
      target: [locationCooldowns.userId, locationCooldowns.placeId],
      set: { lastAlertedAt: new Date() },
    });
}
