import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';

export async function loadContext(db: NodePgDatabase<typeof schema>): Promise<string> {
  const sections: string[] = [];

  try {
    const activeProjects = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.status, 'active'));

    if (activeProjects.length > 0) {
      const lines = activeProjects.map(p => {
        const parts = [`- ${p.name} (id: ${p.id})`];
        if (p.nextAction) parts.push(`next_action="${p.nextAction}"`);
        if (p.deadline) parts.push(`deadline=${p.deadline.toISOString().split('T')[0]}`);
        if (p.owner) parts.push(`owner=${p.owner}`);
        return parts.join(', ');
      });
      sections.push(`ACTIVE PROJECTS:\n${lines.join('\n')}`);
    }
  } catch {
    // Table may not exist yet during initial setup
  }

  try {
    const allContacts = await db
      .select()
      .from(schema.contacts);

    if (allContacts.length > 0) {
      const lines = allContacts.map(c => {
        const parts = [`- ${c.name} (id: ${c.id})`];
        if (c.relationship) parts.push(`relationship=${c.relationship}`);
        if (c.company) parts.push(`company=${c.company}`);
        return parts.join(', ');
      });
      sections.push(`CONTACTS:\n${lines.join('\n')}`);
    }
  } catch {
    // Table may not exist yet
  }

  try {
    const allAreas = await db
      .select()
      .from(schema.areas);

    if (allAreas.length > 0) {
      const lines = allAreas.map(a => {
        const parts = [`- ${a.name} (id: ${a.id})`];
        if (a.reviewFrequency) parts.push(`review=${a.reviewFrequency}`);
        if (a.owner) parts.push(`owner=${a.owner}`);
        return parts.join(', ');
      });
      sections.push(`AREAS:\n${lines.join('\n')}`);
    }
  } catch {
    // Table may not exist yet
  }

  try {
    const pendingTasks = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.status, 'pending'));

    if (pendingTasks.length > 0) {
      const lines = pendingTasks.slice(0, 20).map(t => {
        const parts = [`- ${t.title} (id: ${t.id})`];
        if (t.priority) parts.push(`priority=${t.priority}`);
        if (t.dueDate) parts.push(`due=${t.dueDate.toISOString().split('T')[0]}`);
        if (t.owner) parts.push(`owner=${t.owner}`);
        return parts.join(', ');
      });
      sections.push(`PENDING TASKS (up to 20):\n${lines.join('\n')}`);
    }
  } catch {
    // Table may not exist yet
  }

  if (sections.length === 0) {
    return 'No existing records in the system yet.';
  }

  return sections.join('\n\n');
}
