// Set env vars before importing anything that loads config
process.env.LLM_PROVIDER = 'mock';
process.env.MATRIX_HOMESERVER_URL = 'https://matrix.example.com';
process.env.MATRIX_BOT_USER_ID = '@bot:example.com';
process.env.MATRIX_BOT_ACCESS_TOKEN = 'test-token-abc123';
process.env.ADMIN_MATRIX_ID = '@admin:example.com';
process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

// Mock the DB context loader so the pipeline does not hit a real DB
jest.mock('../../ai/context', () => ({
  loadContext: jest.fn().mockResolvedValue('No existing records in the system yet.'),
}));

import { processCapturedMessage } from '../../ai/pipeline';

// Helper: create a mock DB that captures inserts
function createMockDb() {
  const insertedValues: any[] = [];

  const returning = jest.fn().mockImplementation(() => {
    const id = 'mock-id-' + Math.random().toString(36).slice(2, 8);
    const row = {
      id,
      title: 'Mock Title',
      name: 'Mock Name',
      item: 'Mock Item',
      ...insertedValues[insertedValues.length - 1],
    };
    return [row];
  });

  const values = jest.fn().mockImplementation((val: any) => {
    insertedValues.push(val);
    return { returning };
  });

  const insertFn = jest.fn().mockReturnValue({ values });

  return {
    insert: insertFn,
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue([]),
    }),
    _insertedValues: insertedValues,
  } as any;
}

describe('AI Pipeline with MockProvider', () => {
  it('classifies "Buy milk at Whole Foods" as shopping', async () => {
    const db = createMockDb();
    const result = await processCapturedMessage(
      'Buy milk at Whole Foods',
      'alice',
      '!room:example.com',
      db,
    );
    expect(result.category).toBe('shopping');
    expect(result.needsClarification).toBe(false);
  });

  it('classifies "Meeting with John tomorrow at 3pm" as event', async () => {
    const db = createMockDb();
    const result = await processCapturedMessage(
      'Meeting with John tomorrow at 3pm',
      'alice',
      '!room:example.com',
      db,
    );
    expect(result.category).toBe('event');
  });

  it('classifies "Follow up with Sarah next week about the contract" as waiting_for', async () => {
    const db = createMockDb();
    const result = await processCapturedMessage(
      'Follow up with Sarah next week about the contract',
      'alice',
      '!room:example.com',
      db,
    );
    expect(result.category).toBe('waiting_for');
  });

  it('classifies "Start a project: build personal website" as project', async () => {
    const db = createMockDb();
    const result = await processCapturedMessage(
      'Start a project: build personal website',
      'alice',
      '!room:example.com',
      db,
    );
    expect(result.category).toBe('project');
  });

  it('classifies "Read this article: https://example.com" as resource', async () => {
    const db = createMockDb();
    const result = await processCapturedMessage(
      'Read this article: https://example.com',
      'alice',
      '!room:example.com',
      db,
    );
    expect(result.category).toBe('resource');
  });
});
