import { Db } from '../migrate';
import { places, NewPlace, Place } from '../schema';

export async function insertPlace(db: Db, place: NewPlace): Promise<Place> {
  const [inserted] = await db.insert(places).values(place).returning();
  return inserted;
}

export async function getAllPlaces(db: Db): Promise<Place[]> {
  return db.select().from(places);
}
