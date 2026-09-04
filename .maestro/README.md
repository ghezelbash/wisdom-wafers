# Maestro smoke suite

Nine flows over the paths a beta tester actually walks. They run against an
installed APK on a real device or emulator — not against Metro.

```bash
brew install maestro                      # or: curl -Ls "https://get.maestro.mobile.dev" | bash
adb install -r dananeh-staging.apk
npm run smoke:android
```

`scripts/smoke-android.sh` runs them in order and toggles airplane mode around
flow 06, which Maestro cannot do itself.

## Order matters

1. `01` fresh install and onboarding — asserts a state that only exists once,
   so it calls `clearState` first.
2. `02` cold start — the process is *stopped*, not backgrounded, so this
   exercises reading session, catalogue and identity from disk.
3. `03` a guest completes a seed, with no account anywhere in the flow.
4. `04` that completion survives a force-stop.
5. `05` signing up **links** the guest identity; the garden still shows it.
6. `06` airplane mode → force-stop → relaunch; a downloaded seed still opens.
7. `07` denying notifications blocks nothing else.
8. `08` review: the answer stays covered until recall is attempted.
9. `09` delete account — last, because it destroys what the others built.

## Deep links

The tap-through of a notification cannot be scheduled on demand, so the deep
link is exercised directly:

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "dananeh-staging:///seed/seed-anchoring" com.dananeh.app.staging
```

It must open that seed. And the negative case, which must open **nothing**:

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "dananeh-staging:////evil.example/x" com.dananeh.app.staging
```

`src/platform/deep-links.ts` holds the allow-list and its unit tests.

## What these flows cannot check

Reachable only by hand, on a device, and listed in
`docs/runbooks/native-qa.md`: TalkBack, 200% font scale, a real notification
firing at its scheduled time, and behaviour on a genuinely slow network.
