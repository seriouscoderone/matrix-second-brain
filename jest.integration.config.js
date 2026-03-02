module.exports = {
  ...require('./jest.config.js'),
  testMatch: ['**/src/__tests__/integration/**/*.test.ts'],
  testTimeout: 30000,
};
