/**
 * Just enough `expo-constants` for the Node suites.
 *
 * The real module reaches for native modules that only exist in an app process.
 * These tests assert the backend contract, not the build number, so the shape
 * the app reads is provided and nothing else.
 */
export default {
  expoConfig: {
    version: '1.0.0',
    extra: { variant: 'development' },
  },
};
