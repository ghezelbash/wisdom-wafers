# 17. The native build is verified, not assumed

Date: 2026-09-04 · Status: accepted

## Context

`expo prebuild` succeeding was being read as "the Android build is correct". It
proves the config plugins ran. It does not prove the icons landed, that RTL is
enabled, that a permission the app asks for is declared, or that a database the
app calls "on this device only" stays there.

Two defects were live and invisible:

- **`POST_NOTIFICATIONS` was not declared.** From Android 13 the permission ask
  silently no-ops without it, so the reader gets a reminder switch that does
  nothing and no error anywhere.
- **`allowBackup` was at the platform default of `true`.** Android auto-backup
  would have copied the SQLite database — reflections included — into the
  reader's Google account. The app tells them reflections are private and
  on-device.

Separately, notification routing validated its target with
`route.startsWith('/')`. That accepts `//evil.example/x`, a protocol-relative
URL that several link handlers read as absolute. A slash test is not a same-app
test.

## Decision

**Read the generated project, do not trust the generator.**
`scripts/check-android-native.mjs` prebuilds into a temporary workspace (or
takes an existing `android/`) and asserts eleven things out of the real
manifest, resources and gradle file: adaptive **and** monochrome icons across
every density, a light and a dark splash, the notification icon, `supportsRtl`,
`POST_NOTIFICATIONS`, `allowBackup="false"`, and the scheme and package for the
variant. It found both defects on its first run, and it is a CI gate.

**Deep links are an allow-list.** `src/platform/deep-links.ts` matches whole
routes that exist in this build, rejects a second leading slash, a backslash, a
`..`, a scheme, a query and a fragment, and constrains ids to a slug alphabet. A
target this build does not recognise opens nothing rather than something.

**The Android channel is created before it is needed.** From Android 8 a
notification with no channel is dropped; from 13 the channel is what the reader
turns off independently of the app-level permission. It is created before the
permission ask, not after — a channel that appears later is one they never
chose — and it carries a Persian name, because that is what appears in system
settings.

**Nine Maestro flows** over the paths a beta tester walks, in a deliberate
order: the fresh-install flow asserts a state that exists only once, and
deletion runs last because it destroys what the others built.
`scripts/smoke-android.sh` toggles airplane mode around the offline flow, which
Maestro cannot do itself.

## Consequences

- `docs/runbooks/native-qa.md` lists what is automated and the nine things only
  a device can answer — TalkBack, 200% text, a reminder actually firing.
- `allowBackup: false` means a reader who changes phones loses their on-device
  progress unless they have an account. That is the correct trade against
  silently backing up private reflections, and it is what the account offer is
  for. Revisit with a backup rule that excludes the database *and* a privacy
  policy sentence describing what is included.
- The prebuild check is slow (a full prebuild) but runs only in CI's Android
  job, which already prebuilds.
