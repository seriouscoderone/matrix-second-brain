describe('Config loading', () => {
  const originalEnv = process.env;
  const originalExit = process.exit;

  const validEnv = {
    MATRIX_HOMESERVER_URL: 'https://matrix.example.com',
    MATRIX_BOT_USER_ID: '@bot:example.com',
    MATRIX_BOT_ACCESS_TOKEN: 'test-token-abc123',
    ADMIN_MATRIX_ID: '@admin:example.com',
    DATABASE_URL: 'postgresql://localhost:5432/testdb',
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Mock process.exit to prevent Jest from actually exiting
    process.exit = jest.fn() as any;
  });

  afterAll(() => {
    process.env = originalEnv;
    process.exit = originalExit;
  });

  it('creates env object successfully with all required vars', () => {
    process.env = { ...process.env, ...validEnv };
    const { env } = require('../../config');
    expect(env.MATRIX_HOMESERVER_URL).toBe('https://matrix.example.com');
    expect(env.MATRIX_BOT_USER_ID).toBe('@bot:example.com');
    expect(env.MATRIX_BOT_ACCESS_TOKEN).toBe('test-token-abc123');
    expect(env.ADMIN_MATRIX_ID).toBe('@admin:example.com');
    expect(env.DATABASE_URL).toBe('postgresql://localhost:5432/testdb');
  });

  it('calls process.exit(1) when MATRIX_HOMESERVER_URL is missing', () => {
    const { MATRIX_HOMESERVER_URL, ...rest } = validEnv;
    process.env = { ...process.env, ...rest };
    require('../../config');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('calls process.exit(1) when MATRIX_HOMESERVER_URL is an invalid URL', () => {
    process.env = { ...process.env, ...validEnv, MATRIX_HOMESERVER_URL: 'not-a-url' };
    require('../../config');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('defaults LLM_PROVIDER to bedrock', () => {
    process.env = { ...process.env, ...validEnv };
    const { env } = require('../../config');
    expect(env.LLM_PROVIDER).toBe('bedrock');
  });

  it('defaults ALERT_RADIUS_METERS to 500', () => {
    process.env = { ...process.env, ...validEnv };
    const { env } = require('../../config');
    expect(env.ALERT_RADIUS_METERS).toBe(500);
  });

  it('coerces CLASSIFICATION_CONFIDENCE_THRESHOLD from string to number', () => {
    process.env = {
      ...process.env,
      ...validEnv,
      CLASSIFICATION_CONFIDENCE_THRESHOLD: '0.8',
    };
    const { env } = require('../../config');
    expect(env.CLASSIFICATION_CONFIDENCE_THRESHOLD).toBe(0.8);
    expect(typeof env.CLASSIFICATION_CONFIDENCE_THRESHOLD).toBe('number');
  });
});
