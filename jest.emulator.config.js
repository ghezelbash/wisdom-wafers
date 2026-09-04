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
    // `babel-preset-expo` rewrites `process.env.EXPO_PUBLIC_*` into a read from
    // this virtual module, which ships as ESM. Without the mapping, any app
    // module that touches an `EXPO_PUBLIC_` variable fails to *parse* here.
    '^expo/virtual/env$': '<rootDir>/tests/support/expo-virtual-env.ts',
  },
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { presets: [['babel-preset-expo', { jsx: 'automatic' }]] }],
  },

  testTimeout: 20000,
  /**
   * How long teardown is allowed before Jest calls the process hung.
   *
   * Not suppression: `--detectOpenHandles` reports **no** open handles across
   * these suites, and the process exits on its own about a second after the
   * run. What the default 1000 ms was catching is the gRPC channel close
   * racing the timer, not a leak. Anything that genuinely fails to close still
   * warns — it just has to take longer than five seconds to do it.
   */
  openHandlesTimeout: 5000,
  // The suites share one emulator: run them serially, or one suite's
  // `clearFirestore` deletes another's fixtures mid-assertion. The npm script
  // adds `--runInBand` so they also run in the main process — a worker that
  // holds a Firestore channel open outlives the run and Jest reports it as a
  // hung handle even once every client has been terminated.
  maxWorkers: 1,
};
