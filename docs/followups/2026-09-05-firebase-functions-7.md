# Follow-up — firebase-functions 6.6.0 → 7.x

Opened: 2026-09-05 · Review by: 2026-10-06 · Owner: release owner

## What the warning says

The Functions emulator prints, on every start:

```
⚠  functions: package.json indicates an outdated version of firebase-functions.
   Please upgrade using npm install --save firebase-functions@latest
```

Installed: **6.6.0**. Latest: **7.3.2**. That is a major version.

## The decision, and why

**Not now. Pinned at `6.6.0` exactly.**

The upgrade is a major, and it is being considered days before the first signed
artifact this project has ever produced. Every callable, the scheduler, the
`onCall` request shape, the App Check plumbing and the error mapping go through
this SDK — an upgrade would have to be re-verified against all of it, and the
emulator suite proves behaviour rather than compilation, so a green typecheck
would not be evidence.

Nothing in 6.6.0 is known-broken here: the emulator runs the functions, the
smoke test exercises every callable over HTTP, and 23 emulator suites pass. The
warning is a version comparison, not a fault report.

Both `firebase-functions` and `firebase-admin` are now pinned to exact versions
rather than `^`, so the release candidate resolves to the same tree tomorrow as
it does today. That is the property a release build needs and a caret range
cannot give.

## What the upgrade needs, when it happens

1. Read the 7.0.0 release notes for breaking changes to `onCall`, `onSchedule`,
   `HttpsError` and App Check handling — those are what this codebase uses.
2. `npm --workspace @dananeh/functions install firebase-functions@7` on a branch
   of its own, never alongside other changes.
3. `npm run build:functions` under **Node 22**, then the full emulator suite,
   then `npm run smoke:local` — the last of these is the one that would catch a
   changed request shape, because it calls every callable over real HTTP.
4. Check `functions/src/shared/guard.ts` in particular: it reads `request.app`
   for App Check coverage, and that field's contract is the sort of thing a
   major changes.
5. Deploy to staging and re-run `npm run diagnose` before production.

## Trigger to revisit sooner

- A 6.x security advisory.
- Anything the beta needs that only exists in 7.x.
- Cloud Functions dropping 6.x support (it has not).
