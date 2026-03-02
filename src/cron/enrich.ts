import * as cron from 'node-cron';
import { Db } from '../db/migrate';
import { getUnprocessedItems } from '../db/queries/inbox';
import { config } from '../config';

export function startEnrichmentCron(db: Db): void {
  cron.schedule(config.cron.enrichment, async () => {
    console.log('⏰ Running background enrichment...');
    try {
      const items = await getUnprocessedItems(db);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      // Only process items older than 5 minutes that haven't been processed
      const staleItems = items.filter(i => i.createdAt < fiveMinutesAgo);

      if (staleItems.length > 0) {
        console.log(`Found ${staleItems.length} unprocessed items older than 5 min`);
        // In a full implementation, re-run the pipeline on these items
        // For now, log them for manual review
        staleItems.forEach(i => {
          console.log(`  - [${i.id}] ${i.rawContent.substring(0, 50)}...`);
        });
      }
    } catch (err) {
      console.error('Enrichment cron error:', err);
    }
  });

  console.log('✅ Enrichment cron scheduled:', config.cron.enrichment);
}
