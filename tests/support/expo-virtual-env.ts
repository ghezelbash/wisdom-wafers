/**
 * `expo/virtual/env`, for the plain-Node suites.
 *
 * `babel-preset-expo` rewrites every `process.env.EXPO_PUBLIC_*` reference into
 * a read from this virtual module — that is how Expo inlines those values at
 * build time. The real module ships as ESM, which the Node suites do not
 * transform, so any app module touching an `EXPO_PUBLIC_` variable would fail
 * to parse rather than fail an assertion.
 *
 * Reading straight from `process.env` is also the honest behaviour here: these
 * tests are run by a process whose environment is the thing under test.
 */
export const env = process.env;
