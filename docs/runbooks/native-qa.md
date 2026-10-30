# Native QA on Android

What the automated checks cover, and what only a device can answer.

## Automated

| Check | Command | Runs in CI |
|---|---|---|
| Config per variant, and misconfiguration failing the build | `npm run check:config` | yes |
| Prebuild + `assembleDebug` | — | yes |
| Generated icons, splash, RTL, permissions, backup, package | `npm run check:android` | yes |
| Deep-link allow-list | `npm test` | yes |
| Nine smoke flows on a device | `npm run smoke:android` | no — needs a device |
| Touch targets, contrast, direction and 200% text | `npm run ux:audit` | no — needs the web server running |

`npm run check:android` reads the generated project rather than trusting that
prebuild succeeded. It found two real defects the first time it ran:
`POST_NOTIFICATIONS` was not declared, so the Android 13+ permission ask
silently no-opped, and `allowBackup` was at the platform default of `true`,
which would have copied reflections the app calls "on this device only" into the
reader's Google account.

`npm run ux:audit` renders the real app in Persian and English, light and dark,
at 100% and 200% text, and measures every interactive box and every text run in
the **rendered DOM** — the question being what a reader can hit and read, which
depends on layout rather than on a class name.

It found that **every button in the app had collapsed to the height of its
label**: `Pressable`'s `style={({ pressed }) => …}` is dropped when the same
component carries a NativeWind `className`, and the height lived inside it. The
number was right there in the source, which is why nothing else caught it. Seven
other target failures came out of the same run — see
`docs/qa/2026-09-05/README.md`.

Add `-- --shots <dir>` to keep the screenshots. It is not in CI because it needs
a running dev server; run it before a release and when a screen's layout
changes.

## Setting up the local Android toolchain

Needed for the Maestro suite, an emulator, and `adb logcat` — none of which have
ever been run against this app.

```bash
brew install --cask temurin@17          # the JDK Gradle expects
brew install --cask android-commandlinetools
brew install maestro

export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

sdkmanager --install "platform-tools" "platforms;android-35" \
  "build-tools;35.0.0" "system-images;android-35;google_apis;arm64-v8a"
avdmanager create avd -n dananeh -k "system-images;android-35;google_apis;arm64-v8a"
emulator -avd dananeh &
```

Then, with a device attached or the emulator running:

```bash
adb devices                              # must list one device
adb install -r <the APK from docs/release/>
npm run smoke:android                    # the eleven flows, with a report
```

### What it would and would not have caught

**Not the startup hang.** `currentEnvironmentIssues` returns `[]` under
`__DEV__`, and a local emulator runs a debug build — the code path that failed
does not execute there. Only a *release* build reaches it. If you want a local
release build:

```bash
cd android && ./gradlew assembleRelease   # after `npm run prebuild`
```

That is also the only local way to hit `lintVitalRelease`, which is what failed
the first two EAS builds.

**What it does catch:** everything in the list below, which is currently
unsigned in its entirety.

## By hand, on a device

Only these. Everything else above is automated.

**Nothing below is signed off.** No Android SDK is installed in the environment
these goals were built in, so every item here is owner-action. Each needs a
screenshot or a note recorded against it in this file before an external build
goes out.

### 1 · Cold start on a real device
Force-stop, then launch. Time to the first frame of Home, three times, and note
the slowest. Budget: p95 under 2.5s on a mid-range phone.

### 2 · Right-to-left and Persian typography
- The tab bar reads right to left, and the back chevron points right.
- Numbers are Persian everywhere except inside LTR-isolated technical strings
  (an email, a version, a DOI).
- No Latin middot next to a digit — in Yekan Bakh it is glyph-identical to ۰.
- Line height at body size does not look cramped; the scale targets ≥ 1.65.

### 3 · Keyboard
Open the reflection block and the auth form. The field stays visible above the
keyboard, and the email field is LTR-isolated inside the RTL layout.

### 4 · Text scale
System font size at maximum. Nothing clips, no button loses its label, and the
tab bar stays usable.

### 5 · TalkBack
Walk Home → a seed → completion. Every control has a label, the download button
announces its size *before* the action, and the progress bar reports a
percentage rather than "in progress".

### 6 · A reminder that actually fires
Set the reminder two minutes ahead, background the app, wait. It arrives once,
in the right channel, and tapping it opens the app at the route it named — not
the home screen. Then deny notifications in system settings and confirm the app
setting says so rather than showing an enabled switch.

### 7 · Offline, for real
Airplane mode, force-stop, relaunch. A downloaded seed opens; the banner says
when the data was last true; completing a seed queues rather than fails. Then
back online: the queue drains and the completion appears in Firestore exactly
once.

### 8 · Storage and eviction
Download several seeds, check the storage screen's numbers against Android's
own app-storage figure. Clear the app's cache from system settings — downloads
are in the app's own directory and must survive it.

### 9 · Install, upgrade, reinstall
Install the APK on a clean device. Then install a newer build over it: progress
and the account survive. Then uninstall and reinstall: the app starts fresh
without crashing.

### 10 · The launcher icon, on a themed launcher

Install, then look at the home screen: the adaptive icon at rest, the icon under
"Themed icons" on Android 13+, and the icon in the app drawer and in Settings →
Apps. A monochrome layer that is drawn wrong shows up as a filled blob rather
than as the seed mark. `npm run check:android` proves the resources are
*generated*; only a launcher proves they are *right*.

### 11 · The cold-start hand-off

Record a cold start in light mode and again in dark. There must be exactly one
splash: the native Dananeh splash, dissolving into Home. A second screen, a
flash of white, or a different background colour between the two means the
overlay in `src/components/brand-splash.tsx` and the `expo-splash-screen`
configuration in `app.config.ts` have drifted apart — they carry the same
colours and the same 124pt mark on purpose, and a test holds them together.

## Devices

At least: one Samsung and one stock-Android device, spanning Android 10, 13 and
15. Themed (monochrome) icons need Android 13+ to be visible at all.
