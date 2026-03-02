import * as cron from 'node-cron';
import { Db } from '../db/migrate';
import { getTasksDueToday } from '../db/queries/tasks';
import { getEventsToday } from '../db/queries/events';
import { getFollowUpsDue } from '../db/queries/waitingFor';
import { config } from '../config';

export function startDailyCron(
  db: Db,
  sendDigest: (message: string) => Promise<void>,
): void {
  cron.schedule(config.cron.daily_digest, async () => {
    console.log('⏰ Running daily digest...');
    try {
      const tasks = await getTasksDueToday(db);
      const events = await getEventsToday(db);
      const followUps = await getFollowUpsDue(db);

      const lines: string[] = ['**📋 Daily Digest**', ''];

      if (tasks.length > 0) {
        lines.push('**Tasks due today:**');
        tasks.forEach(t => lines.push(`  • [${t.priority}] ${t.title} (${t.owner})`));
        lines.push('');
      }

      if (events.length > 0) {
        lines.push('**Events today:**');
        events.forEach(e => {
          const time = e.startAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          lines.push(`  • ${time} — ${e.title}${e.location ? ` @ ${e.location}` : ''}`);
        });
        lines.push('');
      }

      if (followUps.length > 0) {
        lines.push('**Follow-ups due:**');
        followUps.forEach(f => lines.push(`  • ${f.title} (${f.owner})`));
        lines.push('');
      }

      if (tasks.length === 0 && events.length === 0 && followUps.length === 0) {
        lines.push('Nothing due today. Enjoy your day! 🎉');
      }

      await sendDigest(lines.join('\n'));
    } catch (err) {
      console.error('Daily digest error:', err);
    }
  });

  console.log('✅ Daily digest cron scheduled:', config.cron.daily_digest);
}
