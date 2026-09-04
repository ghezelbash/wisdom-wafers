// Built-in matchers are extended by @testing-library/react-native itself from
// v12.4 on, so nothing to import here for those.

/**
 * AsyncStorage has no native module under Jest, and v3 no longer ships its own
 * mock. This in-memory stand-in keeps the session, progress and catalog stores
 * testable without a device, and gives each test file a clean store.
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};

  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store[key] ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete store[key];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
      getAllKeys: jest.fn(async () => Object.keys(store)),
    },
  };
});
