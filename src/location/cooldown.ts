import { eq, and, gt, sql } from 'drizzle-orm';
import { Db } from '../db/migrate';
import { locationCooldowns } from '../db/schema';
import { env } from '../config';

/**
 * Atomically check and set cooldown. Returns true if OK to alert
 * (cooldown expired or no prior record). If true, the cooldown is
 * already updated — caller does not need to call updateCooldown().
 *
 * Uses INSERT ... ON CONFLICT to avoid the race where two concurrent
 * location events both pass a SELECT check before either writes.
 */
export async function checkAndSetCooldown(userId: string, placeId: string, db: Db): Promise<boolean> {
  const cooldownMs = env.LOCATION_COOLDOWN_MINUTES * 60 * 1000;
  const cutoff = new Date(Date.now() - cooldownMs);

  // Attempt to insert a new cooldown row. If one already exists and is still
  // within the cooldown window, do nothing (CASE returns the old timestamp).
  // If it exists but is expired, update it. If it doesn't exist, insert it.
  const result = await db.execute(sql`
    INSERT INTO location_cooldowns (user_id, place_id, last_alerted_at)
    VALUES (${userId}, ${placeId}, NOW())
    ON CONFLICT (user_id, place_id) DO UPDATE
      SET last_alerted_at = CASE
        WHEN location_cooldowns.last_alerted_at <= ${cutoff.toISOString()}::timestamp
        THEN NOW()
        ELSE location_cooldowns.last_alerted_at
      END
    RETURNING
      (last_alerted_at >= NOW() - INTERVAL '1 second') AS was_updated
  `);

  // Drizzle's execute() returns { rows: [...] } for node-postgres
  const rows = (result as unknown as { rows: Array<{ was_updated: boolean }> }).rows
    ?? (result as unknown as Array<{ was_updated: boolean }>);
  return rows.length > 0 && rows[0].was_updated;
}

// Keep the original functions for backward compatibility with tests
export async function checkCooldown(userId: string, placeId: string, db: Db): Promise<boolean> {
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
