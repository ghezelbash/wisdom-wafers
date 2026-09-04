# Maestro end-to-end suite

Eleven flows over the paths a beta tester actually walks. They run against an
installed APK on a device or emulator — not against Metro.

```bash
brew install maestro                      # or: curl -Ls "https://get.maestro.mobile.dev" | bash
adb install -r dananeh-staging.apk
npm run smoke:android                     # runs everything, writes a report
npm run check:e2e                         # the static checks, no device needed
```

## The suite could not fail

Before release goal 10, it referenced `id: "email"` when the app had **no
`testID` anywhere at all** — and marked the tap optional, so the step passed by
not happening. The signup flow built its address from Maestro's copied-text
variable with nothing ever copied, tapped "already have an account?" (which
switches to *sign-in*) and then tapped "create account", never entered a
password, and finished by asserting a segment label that is on screen whether or
not anything survived. A device run would have gone green.

So: the app now carries `testID`s for every control a flow needs, the flows
address them by id rather than by Persian label, and `npm run check:e2e`
answers the question a device run cannot — *could this flow fail?* It checks
that every id exists in the source, that every flow asserts something, that
`optional` taps are confined to the one place they are legitimate, and that the
seven behaviours below are actually covered.

## Order matters

1. `01` fresh install and onboarding — asserts a state that exists once, so it
   calls `clearState` first, and now asserts reaching the *end* of onboarding
   rather than `.*`, which matched every screen ever rendered.
2. `02` cold start — the process is stopped, not backgrounded, so this exercises
   reading session, catalogue and identity from disk.
3. `03` a guest completes a seed, with no account anywhere in the flow.
4. `04` that completion survives a force-stop — asserted **by the seed's title**,
   not by a segment label.
5. `05` signing up **links** the guest identity: the same completion is still
   there afterwards, and the profile no longer offers to create an account.
6. `06` a seed **downloaded from Storage** is opened after a force-stop with the
   radio off. Two halves, because Maestro cannot toggle airplane mode.
7. `07` denying notifications blocks nothing else, and the screen says what it
   can and cannot do.
8. `08` review: the answer stays covered until recall is attempted.
9. `09` delete account — deletes the account flow 05 created, re-authenticating
   if asked, and verifies what is left.
10. `10` deep links: one allowed, four refused, each asserted **in the app**.
11. `11` a notification's route opens the review screen, not home.

## The account

`scripts/smoke-android.sh` mints one address per run —
`beta-<timestamp>@dananeh-test.example` — exports it as `DANANEH_E2E_EMAIL`,
prints it into the report, and flow 09 deletes it. Unique per run because of the
timestamp, deterministic because both flows read the same value. Override with
`DANANEH_E2E_EMAIL` / `DANANEH_E2E_PASSWORD` to point at a specific account.

## Deep links

Flow 10, not shell output. `adb am start` reports that it *delivered* an intent,
which says nothing about what the app did with it — a link that opened an
arbitrary route printed the same success as one that was refused. The flow opens
each link and asserts what is on screen:

| link | expected |
|---|---|
| `dananeh-staging:///seed/seed-sky-darkness` | the seed opens |
| `dananeh-staging:////evil.example/x` | home, and nothing named `evil.example` |
| `dananeh-staging:///settings/delete-account?confirm=1` | no confirmation screen |
| `dananeh-staging:///tutor` | home — the tutor ships off |
| `dananeh-staging:///../../etc/passwd` | home |

## Clean starting state

- A device or emulator that has **never had the app**, or `adb uninstall
  com.dananeh.app.staging` first. Flow 01 calls `clearState`, which resets app
  storage but not the OS notification permission — a device that has already
  denied it will skip the sheet in flow 07.
- Online, with airplane mode off. The runner leaves it off however it exits.
- The staging build installed (`com.dananeh.app.staging`), reaching a real
  backend — flow 09 verifies deletion against the server.

## What is not automated

Delivering a real scheduled local notification. Flow 11 opens the route the
notification carries, which is the part automation can reach; that the OS fires
a reminder at 21:00 is checked by hand, in `docs/runbooks/native-qa.md`.
