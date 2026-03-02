import { and, gte, lt } from 'drizzle-orm';
import { Db } from '../migrate';
import { events, NewEvent, Event } from '../schema';

export async function insertEvent(db: Db, event: NewEvent): Promise<Event> {
  const [inserted] = await db.insert(events).values(event).returning();
  return inserted;
}

export async function getEventsToday(db: Db): Promise<Event[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  return db
    .select()
    .from(events)
    .where(
      and(
        gte(events.startAt, startOfDay),
        lt(events.startAt, endOfDay),
      ),
    );
}

export async function getUpcomingEvents(db: Db, days: number): Promise<Event[]> {
  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  return db
    .select()
    .from(events)
    .where(
      and(
        gte(events.startAt, now),
        lt(events.startAt, future),
      ),
    );
}
