# Migrating to React Native Firebase

Status: **prepared, not performed.** The app runs on the Firebase JS SDK behind
repository interfaces (ADR 5). This is the sequence for flipping it, written so
each step is verifiable on its own — the reason it was deferred is that none of
it can be checked without building for a device.

## Why it has to happen eventually

Analytics, Crashlytics, Performance and App Check have no JS SDK equivalent on
native. Until this lands there is no crash reporting from real devices, and
App Check cannot be enforced — which means the backend has no way to tell a real
client from a script.

## Order

Adapter by adapter, each its own commit. Nothing above `src/data/` changes,
because nothing above it imports Firebase.

1. **Development build.** `npx expo prebuild`, then `eas build --profile
   development`. Expo Go cannot load native Firebase; everyone on the project
   needs the dev client first, and that is the step most likely to surprise.
2. **Config.** Add `@react-native-firebase/app` and its config plugin, with
   `googleServicesFile` per variant from an environment variable — the plist and
   json files are secrets in the "do not commit" sense, not the cryptographic
   one, and belong in EAS secrets.
3. **Auth.** Reimplement `FirebaseIdentityRepository` against
   `@react-native-firebase/auth`. The contract is already
   `IdentityRepository`, so the test that matters — anonymous → linked, same
   uid, progress intact — carries over unchanged. Run it against the emulator
   before touching anything else.
4. **Firestore and Storage.** Same shape: `RemoteContentSource` and the outbox
   sender keep their interfaces.
5. **Crashlytics and Performance.** Wire the existing analytics context
   (`getAnalyticsContext()`) into custom keys. No answer text, no search terms —
   the PII guard exists for this reason.
6. **Analytics.** Point `setAnalyticsSink` at the native module. The taxonomy is
   already validated; only the transport changes.
7. **App Check.** Monitor first, for at least a week, and read the metrics
   before enforcing. Then staging, then production in stages. Debug tokens never
   get committed.

## Verification per step

- The emulator suites (`npm run test:emulator`) still pass, on device where the
  step is device-only.
- A cold start on a real device signs in anonymously and opens the bundled seed
  with the network off.
- Creating an account keeps the uid — check the account list, not the UI.
- A forced crash appears in Crashlytics with route, seed id and revision, and
  with nothing the reader typed.

## Rollback

Each adapter is swapped behind its interface, so reverting is a one-file change
plus a build. Keep the JS SDK dependency until every service has been migrated
and observed in production for a release.
