/**
 * Integration tests -- requires docker-compose.dev.yml to be running.
 * Run: docker-compose -f docker-compose.dev.yml up -d
 * Then: npm run test:integration
 */

describe('Bot Integration Tests', () => {
  // These tests require a live Matrix homeserver and PostgreSQL.
  // They are skipped by default unless INTEGRATION_TEST=1 is set.

  const runIntegration = process.env.INTEGRATION_TEST === '1';
  const itOrSkip = runIntegration ? it : it.skip;

  itOrSkip('bot responds to !setup command', async () => {
    // TODO: Send !setup to bot, wait for response, verify wizard started
  });

  itOrSkip('inbox message creates DB record', async () => {
    // TODO: Send message to inbox room, wait for bot reply, query DB
  });

  itOrSkip('shopping message creates shopping_items record', async () => {
    // TODO: "Buy milk at Whole Foods" -> verify shopping_items row
  });
});
