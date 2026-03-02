import { Db } from '../migrate';
import { resources, NewResource, Resource } from '../schema';

export async function insertResource(db: Db, resource: NewResource): Promise<Resource> {
  const [inserted] = await db.insert(resources).values(resource).returning();
  return inserted;
}
