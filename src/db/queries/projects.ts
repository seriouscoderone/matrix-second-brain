import { eq } from 'drizzle-orm';
import { Db } from '../migrate';
import { projects, NewProject, Project } from '../schema';

export async function insertProject(db: Db, project: NewProject): Promise<Project> {
  const [inserted] = await db.insert(projects).values(project).returning();
  return inserted;
}

export async function getActiveProjects(db: Db): Promise<Project[]> {
  return db
    .select()
    .from(projects)
    .where(eq(projects.status, 'active'));
}

export async function updateProjectRoomId(db: Db, projectId: string, roomId: string): Promise<void> {
  await db
    .update(projects)
    .set({ matrixRoomId: roomId })
    .where(eq(projects.id, projectId));
}

export async function getProjectByName(db: Db, name: string): Promise<Project | undefined> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.name, name))
    .limit(1);
  return project;
}

export async function getProjectByRoomId(db: Db, roomId: string): Promise<Project | undefined> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.matrixRoomId, roomId))
    .limit(1);
  return project;
}
