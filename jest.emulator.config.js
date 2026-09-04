/**
 * Tests that need a real backend: security rules and the identity flows. They
 * run in plain Node against the emulator suite — no React Native module map, no
 * jsdom — and are started by `npm run test:emulator`.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  // The app fixtures double as the pipeline's test corpus, so the app's own
  // path aliases have to resolve here too.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@dananeh/content-schema$': '<rootDir>/packages/content-schema/src/index.ts',
    // `expo-constants` reaches for native modules that do not exist in plain
    // Node. These suites are about the backend contract, not the build number,
    // so it is stubbed rather than the whole Expo runtime being stood up.
    '^expo-constants$': '<rootDir>/tests/support/expo-constants-stub.ts',
  },
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { presets: [['babel-preset-expo', { jsx: 'automatic' }]] }],
  },

  testTimeout: 20000,
  // The suites share one emulator: run them serially, or one suite's
  // `clearFirestore` deletes another's fixtures mid-assertion.
  maxWorkers: 1,
};
