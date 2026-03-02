import { eq, and, gte, lt, ne } from 'drizzle-orm';
import { Db } from '../migrate';
import { tasks, NewTask, Task } from '../schema';

export async function insertTask(db: Db, task: NewTask): Promise<Task> {
  const [inserted] = await db.insert(tasks).values(task).returning();
  return inserted;
}

export async function getTasksDueToday(db: Db): Promise<Task[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  return db
    .select()
    .from(tasks)
    .where(
      and(
        gte(tasks.dueDate, startOfDay),
        lt(tasks.dueDate, endOfDay),
      ),
    );
}

export async function getOverdueTasks(db: Db): Promise<Task[]> {
  return db
    .select()
    .from(tasks)
    .where(
      and(
        lt(tasks.dueDate, new Date()),
        ne(tasks.status, 'done'),
      ),
    );
}

export async function getTasksByOwner(db: Db, owner: 'alice' | 'bob' | 'shared'): Promise<Task[]> {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.owner, owner));
}
