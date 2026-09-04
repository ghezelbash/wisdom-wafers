# دانانه · Dananeh

Persian-first microlearning. A **دانه / seed** is one 5–10 minute learning unit:
you read it, answer a few questions, and it comes back for review before you
forget it. There is no login wall — a guest gets the whole product, and an
account adds devices rather than unlocking features.

Expo SDK 57 · React Native 0.86 · Firebase · TypeScript.

---

## Running it locally

Four commands, in four terminals. This is the canonical sequence; anything else
in the docs defers to it.

```bash
npm ci                     # 1 · install
cp .env.example .env       # 2 · configure (see below)

npm run emulators          # 3 · Auth, Firestore, Storage and Functions
npm run seed:emulator      # 4 · accounts, config and published content
npm start                  # 5 · the app
```

Then, to check the whole stack is actually wired up:

```bash
npm run smoke:local
```

It signs in as the seeded reader, reads the published catalogue, downloads a
bundle from Storage and verifies its checksum, exercises three callables, and
walks the editorial workflow — over HTTP, the way the app does. If it passes,
the environment is real.

### `.env`

Leave the Firebase values blank and keep `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=1`:
with the emulator, no project configuration is needed at all.

Two things that do **not** belong in `.env`:

- **`APP_VARIANT`** — Expo only exports `EXPO_PUBLIC_*` into the environment
  `app.config.ts` is evaluated in, so setting it in a file silently does
  nothing and falls through to `production`. The npm scripts set it; EAS build
  profiles set it for a build.
- **Anything genuinely secret** — `EXPO_PUBLIC_*` values are inlined into the
  bundle. Staging and production configuration lives in the EAS environment.

A development build reaches a *real* Firebase project only with
`EXPO_PUBLIC_ALLOW_LIVE_FIREBASE=1`. Anonymous sign-in creates real accounts, so
a stray `npm run web` must not do it by accident. Without either flag, signing
in reports "not available in this build" — which is configuration, not a
network failure.

### Metro serves stale bundles

After changing source, locale JSON or an `EXPO_PUBLIC_*` value:

```bash
npm start -- --clear
```

Without it a fix can look broken, or a broken thing can look fixed. It has cost
real debugging time more than once.

### Ports

| | | |
|---|---|---|
| Emulator UI | 4000 | http://127.0.0.1:4000 |
| Auth | 9099 | |
| Functions | 5001 | `europe-west1` |
| Firestore | **8181** | not 8080 — OrbStack commonly holds that |
| Storage | 9199 | |
| Metro / web | 8081 | |
| CMS (`npm run admin`) | 5273 | |

### Seeded accounts

All with the password `dananeh-emulator`:

| account | role |
|---|---|
| `reader@example.com` | none — an ordinary reader |
| `editor@example.com` | `editor` |
| `reviewer@example.com` | `reviewer` |
| `admin@example.com` | `admin` |

The seeder also writes `appConfig/public` with the gate open, publishes the
three launch seeds **through the real pipeline** — revision, manifest, checksum
and Storage bundle included — and leaves two drafts in the editorial workflow.
It refuses to run against anything that is not a `demo-` project.

---

## Checks

```bash
npm run typecheck      # app, tests, schema, functions and CMS
npm run lint           # zero warnings; --max-warnings 0
npm test               # unit and component
npm run test:emulator  # rules, pipeline, local store, identity
npm run check:config   # every variant's identity, and misconfiguration failing
npm run check:android  # what the generated Android project actually contains
npx expo-doctor        # dependency compatibility with SDK 57
```

All of them run in CI on every pull request, and none is advisory.

---

## Where things are

```
src/                      the app
  app/                    routes (expo-router)
  features/seed-player/   the block registry and the player
  domain/                 policy: identity, progress, account, ranking
  data/local/             SQLite, downloads, the outbox
  data/remote/            Firebase adapters
  platform/               config, env, analytics, crash, notifications
packages/content-schema/  the content contract, shared with backend and CMS
functions/                Cloud Functions
admin/                    the CMS
docs/adr/                 why things are the way they are
docs/runbooks/            how to operate them
```

**Read `AGENTS.md` before changing code**, and the relevant ADR before changing
something it covers. `docs/runbooks/environments.md` covers Firebase and EAS
setup; `docs/internal-beta.md` is the release record and tester checklist.
