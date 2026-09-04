# Internal beta — release notes and install checklist

**Status: not built.** Everything the repository can do is done and green. The
build itself needs credentials only the project owner has; the exact list is at
the end of `docs/runbooks/environments.md` and repeated at the bottom here.

This document is written so that whoever runs the build can fill in the blanks
and hand it to testers unchanged.

---

## Build record

Fill in after `eas build` returns.

| | |
|---|---|
| Profile | `internal-apk` |
| Variant / package | `staging` · `com.dananeh.app.staging` |
| Backend | `dananeh-staging` |
| Channel | `preview` |
| App version | `1.0.0` |
| Build number | _from EAS_ |
| Commit | _`git rev-parse HEAD`_ |
| Built at | _from EAS_ |
| Artifact URL | _from EAS_ |
| APK SHA-256 | `shasum -a 256 dananeh-staging.apk` |

```bash
npx expo install --check
npm run typecheck && npm run lint && npm test -- --ci && npm run test:emulator
npm run check:config
npx eas-cli@latest build --platform android --profile internal-apk
```

---

## What is in this build

**A whole app with no account required.** Onboarding, three authored Persian
seeds, the eleven-block player, review scheduling, the garden, search and
explore all work as a guest, offline, from the first launch.

**Content that verifies itself.** Every published bundle carries a manifest —
revision, Storage path, checksum, size — and is checked against it on the way in
and again on every read. A copy that stops matching is refused and re-fetched
rather than rendered.

**Nothing lost to a bad network.** Completions, reviews and content reports are
queued on device and delivered when the connection returns. An item leaves the
queue only when the server says it counted; a rejection is kept, with its
reason.

**An account adds devices; it never gates anything.** Signing up links the guest
identity rather than replacing it. Signing into an account made elsewhere brings
this device's finished seeds with it, and cannot double-count them.

**Delete account means delete.** Server first — subcollections, aggregates,
Storage files, push tokens, the Auth record — and only then the device. A
failure leaves you signed in and told, rather than looking at an empty app whose
data is still on the server.

**Maintenance and forced update** can be switched on from `appConfig/public`
without a new build, and both fail open.

## Known issues

| | Impact | Plan |
|---|---|---|
| Three launch seeds | Home rails are short and Explore has one path | Content, not code — the pipeline and CMS are ready |
| The bundled seed's image block has no asset | Shows its alt text instead of a picture | Asset production |
| Crashlytics, Performance and App Check are not on | Crashes reach `crashReports` in Firestore, not a crash dashboard | Needs React Native Firebase and a development build |
| Preferences do not sync | Progress and bookmarks do; pace and reminder time stay per device | The transport exists, `SessionContext` does not call it |
| Data export is device-only | The pre-deletion export does not include server data | — |
| `allowBackup` is off | Changing phones loses on-device progress unless you have an account | Deliberate: the alternative copies private reflections into Google backup |
| No audio or video blocks | Not in this release | Explicitly out of MVP scope |
| Expo Doctor warns on AsyncStorage | `3.1.1` vs the version Expo 57 pins | Decide before public beta |

---

## Install and test on a clean device

Do these in order. Steps 1–8 are what "the APK works" means; anything failing
there is a blocker.

### Install
1. Open the artifact URL on the phone, allow install from that source, install.
   The app appears as **دانانه (Staging)** with its own icon, alongside any
   other variant.
2. Open it. **No Metro, no computer, no cable.** First frame within a few
   seconds; nothing crashes.

### Guest, offline
3. Turn on airplane mode **before first launch**. Complete onboarding: pick at
   least two interests, choose a pace. Everything reads right-to-left, numbers
   are Persian.
4. Open the offered seed and finish it. It works with no network — that is the
   point of the seed in the binary.
5. Force-stop the app (Settings → Apps → force stop). Reopen. The completion is
   still in the garden.

### Online
6. Turn airplane mode off. Home fills in; the offline banner goes.
7. Download a seed from its card. The size shown before you tap is the real
   published size, and the progress is real.
8. Airplane mode → force-stop → reopen → open the downloaded seed. It opens.

### Account
9. Profile → create an account. Everything you have read is still there
   afterwards — the guest identity was linked, not replaced.
10. Sign out, sign back in. Same.
11. Try signing up again with the same email: you are offered "sign in to that
    account" rather than a red error.
12. Password reset sends an email that arrives.

### Notifications
13. Finish a seed and accept the reminder offer. The permission sheet appears
    (it does not on Android 13+ without the manifest entry, which is why this
    step is here). Set a time two minutes out, background the app, wait.
14. It arrives once. Tapping it opens the app at what it pointed to.
15. Deny notifications in system settings. The app's setting says so, and
    everything else still works.

### Content reports
16. Report a problem on a block while offline. Reconnect. It appears in
    `reports` in the Firebase console.

### Deletion
17. Settings → delete account → export first, then delete. It completes, and you
    land back in the app as a new guest. Nothing you had is still there.

### Robustness
18. Reinstall over the top with a newer build: progress and account survive.
19. Uninstall, reinstall: starts clean without crashing.
20. System font size at maximum: nothing clips, no button loses its label.

`docs/runbooks/native-qa.md` has the rest — TalkBack, cold-start timings,
storage accounting.

---

## Feedback

One channel, and ask for: the device and Android version, what you were doing,
what you expected, and a screenshot. A report saying only "it broke" costs more
to chase than it saves.

If the app shows a **Build misconfigured** screen, the build was assembled
without a complete EAS environment — see `docs/runbooks/environments.md`. That
screen exists precisely so this is obvious rather than showing up later as
"sign-in doesn't work".

---

## Before this can be built

From `docs/runbooks/environments.md`:

**Enough to run the build:** the three Firebase project ids confirmed; the six
`EXPO_PUBLIC_FIREBASE_*` values per environment; the EAS project id from
`eas init`.

**Needed for the APK to actually work:** Anonymous *and* Email/Password sign-in
enabled per project; Firestore and Storage created; an Android app registered
per package name; the Android signing decision (EAS-generated or your own
keystore); and the emails holding `admin` / `editor` / `reviewer`.
