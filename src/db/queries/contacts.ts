import { ilike, lte } from 'drizzle-orm';
import { Db } from '../migrate';
import { contacts, NewContact, Contact } from '../schema';

export async function insertContact(db: Db, contact: NewContact): Promise<Contact> {
  const [inserted] = await db.insert(contacts).values(contact).returning();
  return inserted;
}

export async function findContactByName(db: Db, name: string): Promise<Contact | undefined> {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(ilike(contacts.name, `%${name}%`))
    .limit(1);
  return contact;
}

export async function getContactsDueForFollowUp(db: Db): Promise<Contact[]> {
  return db
    .select()
    .from(contacts)
    .where(lte(contacts.followUpDate, new Date()));
}
