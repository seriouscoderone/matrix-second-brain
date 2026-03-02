import * as cron from 'node-cron';
import { Db } from '../db/migrate';
import { getActiveProjects } from '../db/queries/projects';
import { getOverdueTasks } from '../db/queries/tasks';
import { getOverdueReviews } from '../db/queries/somedayMaybe';
import { config } from '../config';

export function startWeeklyCron(
  db: Db,
  sendDigest: (message: string) => Promise<void>,
): void {
  cron.schedule(config.cron.weekly_review, async () => {
    console.log('⏰ Running weekly review...');
    try {
      const projects = await getActiveProjects(db);
      const overdueTasks = await getOverdueTasks(db);
      const reviews = await getOverdueReviews(db);

      // Stale projects: active but no update in 14 days
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const staleProjects = projects.filter(
        p => p.createdAt < twoWeeksAgo && !p.nextAction,
      );

      const lines: string[] = ['**📅 Weekly Review**', ''];

      if (staleProjects.length > 0) {
        lines.push('**Stale projects (no next action):**');
        staleProjects.forEach(p => lines.push(`  • ${p.name}`));
        lines.push('');
      }

      if (overdueTasks.length > 0) {
        lines.push('**Overdue tasks:**');
        overdueTasks.forEach(t => {
          const due = t.dueDate ? t.dueDate.toLocaleDateString() : 'unknown';
          lines.push(`  • ${t.title} (due: ${due}, ${t.owner})`);
        });
        lines.push('');
      }

      if (reviews.length > 0) {
        lines.push('**Someday/Maybe past review date:**');
        reviews.forEach(s => lines.push(`  • ${s.title}`));
        lines.push('');
      }

      if (staleProjects.length === 0 && overdueTasks.length === 0 && reviews.length === 0) {
        lines.push('Everything looks good! Great week. 🌟');
      }

      await sendDigest(lines.join('\n'));
    } catch (err) {
      console.error('Weekly review error:', err);
    }
  });

  console.log('✅ Weekly review cron scheduled:', config.cron.weekly_review);
}
