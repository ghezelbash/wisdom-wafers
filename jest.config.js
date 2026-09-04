/**
 * Tests run under `jest-expo`, which gives the React Native module map and
 * transform. Suites live beside the code they cover, in `__tests__` folders.
 */
const expoPreset = require('jest-expo/jest-preset');

/**
 * The Firebase SDK ships ESM, and jest-expo's ignore list does not cover it, so
 * anything importing the data layer fails to parse without this. Extending the
 * preset's own patterns keeps them in step with Expo upgrades.
 */
const transformIgnorePatterns = expoPreset.transformIgnorePatterns.map((pattern) =>
  pattern.replace('(?!(', '(?!(firebase|@firebase|')
);

module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns,
  roots: ['<rootDir>/src', '<rootDir>/packages'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@dananeh/content-schema$': '<rootDir>/packages/content-schema/src/index.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  collectCoverageFrom: [
    'src/lib/**/*.ts',
    'src/features/**/*.ts',
    'packages/content-schema/src/**/*.ts',
  ],
};
