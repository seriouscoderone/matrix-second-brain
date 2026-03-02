import { eq, arrayOverlaps, like, sql } from 'drizzle-orm';
import { Db } from '../migrate';
import { notes, NewNote, Note } from '../schema';

export async function insertNote(db: Db, note: NewNote): Promise<Note> {
  const [inserted] = await db.insert(notes).values(note).returning();
  return inserted;
}

export async function generateZettelId(db: Db): Promise<string> {
  const today = new Date();
  const datePrefix = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('');

  const existing = await db
    .select({ zettelId: notes.zettelId })
    .from(notes)
    .where(like(notes.zettelId, `${datePrefix}-%`));

  const nextN = existing.length + 1;
  return `${datePrefix}-${nextN}`;
}

export async function searchNotesByTags(db: Db, tags: string[]): Promise<Note[]> {
  return db
    .select()
    .from(notes)
    .where(arrayOverlaps(notes.tags, tags));
}
