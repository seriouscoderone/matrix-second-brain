import { Db } from '../db/migrate';
import { Place } from '../db/schema';
import { getAllPlaces } from '../db/queries/places';
import { getPendingItemsForPlace } from '../db/queries/shopping';
import { checkCooldown, updateCooldown } from './cooldown';
import { env } from '../config';

// Haversine formula — returns distance in meters
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface ProximityAlert {
  place: Place;
  distanceMeters: number;
  items: Array<{ item: string; createdBy: string }>;
}

export async function findNearbyPlaces(
  lat: number,
  lon: number,
  db: Db,
): Promise<ProximityAlert[]> {
  const places = await getAllPlaces(db);
  const alerts: ProximityAlert[] = [];

  for (const place of places) {
    const distance = haversine(
      lat, lon,
      parseFloat(place.lat.toString()),
      parseFloat(place.lon.toString()),
    );

    if (distance <= env.ALERT_RADIUS_METERS) {
      const items = await getPendingItemsForPlace(db, place.id);
      if (items.length > 0) {
        alerts.push({
          place,
          distanceMeters: Math.round(distance),
          items: items.map(i => ({ item: i.item, createdBy: i.createdBy })),
        });
      }
    }
  }

  return alerts;
}

export async function checkProximityAndAlert(
  userId: string,
  lat: number,
  lon: number,
  db: Db,
  sendAlert: (message: string) => Promise<void>,
): Promise<void> {
  const alerts = await findNearbyPlaces(lat, lon, db);

  for (const alert of alerts) {
    const canAlert = await checkCooldown(userId, alert.place.id, db);
    if (!canAlert) continue;

    const itemLines = alert.items
      .map(i => `  • ${i.item}${i.createdBy !== userId ? ` — added by ${i.createdBy}` : ''}`)
      .join('\n');

    const message = `Hey! You're near ${alert.place.name} (~${alert.distanceMeters}m). You have items on your list there:\n${itemLines}\nWorth a stop if you have time!`;

    await sendAlert(message);
    await updateCooldown(userId, alert.place.id, db);
  }
}
