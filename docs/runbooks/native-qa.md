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

`npm run check:android` reads the generated project rather than trusting that
prebuild succeeded. It found two real defects the first time it ran:
`POST_NOTIFICATIONS` was not declared, so the Android 13+ permission ask
silently no-opped, and `allowBackup` was at the platform default of `true`,
which would have copied reflections the app calls "on this device only" into the
reader's Google account.

## By hand, on a device

Only these. Everything else above is automated.

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

## Devices

At least: one Samsung and one stock-Android device, spanning Android 10, 13 and
15. Themed (monochrome) icons need Android 13+ to be visible at all.
