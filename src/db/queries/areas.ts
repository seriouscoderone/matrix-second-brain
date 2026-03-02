import { Db } from '../migrate';
import { areas, NewArea, Area } from '../schema';

export async function insertArea(db: Db, area: NewArea): Promise<Area> {
  const [inserted] = await db.insert(areas).values(area).returning();
  return inserted;
}

export async function getAreas(db: Db): Promise<Area[]> {
  return db.select().from(areas);
}
