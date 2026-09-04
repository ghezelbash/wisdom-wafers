# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Dananeh / دانانه

Persian-first microlearning app. A **دانه / Seed** is one 5–10 minute learning
unit. The full UI/UX system lives in `design_handoff_dananeh/` — start with its
`README.md`, then the `.dc.html` references (open them in a browser;
`Dananeh Prototype.dc.html` is interactive). Those files are **design
references, not code to copy**: recreate them with the patterns below.

Build order from the handoff, in order:

1. **Tokens and type primitives** — done.
2. **Guest-first routing** — done: onboarding, no login wall, auth as an offer.
3. **Block registry + seed player** — done: 11 block types, sheets, completion.
4. **Offline catalog and outbox** — done: cache states, downloads, storage, queue.
5. **Home, Explore, search** — done: SeedCard variants, finite rails, local index.
6. **Review and growth** — done: Garden, due queue, active recall, intervals.

The platform half — identity, backend, publishing, delivery — follows
`DANANEH_PRODUCT_TECHNICAL_BLUEPRINT.md`, resequenced as goals A–K.
`BUILD_TODO.md` tracks both tracks at deliverable level, and every architectural
decision is recorded in `docs/adr/`. **Read the relevant ADR before changing
something it covers.**

## Repository layout

npm workspaces, additive to the app:

```
src/                      the Expo app
packages/content-schema/  the content contract, shared with backend and CMS
functions/                Cloud Functions (goal D)
admin/                    the CMS (goal I)
docs/adr/                 architecture decision records
```

- **`packages/content-schema` is the single definition of content.** Blocks,
  seeds, bundles, topics, paths and progress events are Zod schemas there; the
  app reaches them through `@/models/seed`, which is a thin re-export.
- Parsing has two modes and they are not interchangeable: `parseBundleStrict`
  is the publish gate, `parseBundleLenient` is what a client uses — a client
  must tolerate content newer than itself.
- Bundle checksums use the package's canonical serialization and its plain-TS
  SHA-256, so the publisher and the on-device verifier cannot disagree.

## Tests

- `npm test` (jest-expo), `npm run typecheck`, `npm run lint` — all three must
  be green before a goal is done.
- `npm run typecheck` builds `packages/content-schema` first. Cloud Functions
  runs Node, so the functions project resolves `@dananeh/content-schema`
  through its `exports` map to the **compiled** copy — on a clean checkout it
  cannot typecheck until the package is built.
- `APP_VARIANT` comes from the shell or the EAS profile, never from `.env`:
  Expo exports only `EXPO_PUBLIC_*` into the environment `app.config.ts` is
  evaluated in. Unset means production, which then fails the environment guard.
  The npm scripts set it; anything invoking `expo` or Gradle directly must too,
  including Gradle's own `:expo-constants:createExpoConfig` task.
- Suites live in `__tests__` beside the code. Pure logic — normalisation, the
  scheduler, grading, dates, schema parsing — is covered first because it is
  what silently breaks later.
- `@testing-library/react-native` v14's `render` is **async**: `await render(…)`.

## Identity

- Every reader is signed in **anonymously before the first screen**, so progress
  has a stable owner from the start. Creating an account **links** that
  credential (`linkWithCredential`) — it must never call
  `createUserWithEmailAndPassword` on an anonymous session, which would mint a
  new uid and orphan everything the guest did.
- Always `await auth.authStateReady()` before reading `currentUser`. The SDK
  restores sessions asynchronously; skipping this is a silent data-loss bug.
- Screens use `useIdentity()` and `authErrorKey(error)`. **No screen imports
  Firebase**, and no raw Firebase error code reaches the UI.
- If Firebase is unreachable or unconfigured, `LocalIdentityRepository` gives a
  device-local uid and the app keeps working — guest-first is not conditional on
  a backend.

## Analytics, flags and ranking

- Events are declared in `src/platform/analytics/events.ts` and sent through
  `track()`. **The PII guard refuses an event rather than sanitising it** —
  sanitising invites "close enough". Search is recorded as a length and a count,
  never as words.
- Feature flags default safely in the binary; remote values can only narrow, can
  only set keys that already exist, and are ignored if the type is wrong. The
  AI tutor stays off until it is grounded and guarded.
- Ranking lives in `src/domain/recommendation/rank.ts` and is deterministic. A
  card's reason is derived from the component that moved the score, so it is
  true by construction — **never invent a reason**, omit the row instead.

## Local storage

- Two backends behind one API: **SQLite on device** (`src/data/local/`),
  key-value elsewhere. `progress-store` and `catalog-store` choose; no screen
  knows which is in use.
- Migrations are **forward-only and never edited after release** — an edited
  migration silently skips on devices that already applied it. Nothing drops a
  column: a shape that is no longer read stays for at least one release.
- The SQL is tested for real against Node's built-in SQLite through the same
  `SqlDriver` interface the device uses, so the queries are exercised rather
  than mocked.
- Downloaded bundles are verified on the way in **and** on the way out. A system
  cache can be evicted; a promised download cannot be, and a checksum mismatch
  means fetch it again, never render it.
- `metro.config.js` must keep `wasm` in `assetExts`: expo-sqlite's web entry
  imports one, and Metro resolves the graph even though the driver bails on web.

## Content pipeline

- Publishing is server-only: rules keep clients out of `seeds` and
  `seedRevisions`, and `functions/src/publish` is the one door in. It validates
  strictly, compiles the bundle, checksums it, uploads, then flips the pointer
  in a transaction — in that order, so nothing invalid ever gets an artifact.
- **A published revision is immutable.** A correction is a new revision, because
  a reader's recorded progress points at the exact text they answered against.
  Rollback moves the pointer; artifacts are never deleted.
- Progress reaches the server through the outbox and `ingestProgress`, which is
  **idempotent on event id** — the queue retries, so an event must count once.
- Handlers take injected `Deps` rather than importing globals, which is what
  lets the same code run in a function, in a test, and in a publish script.
- `EXPO_PUBLIC_CONTENT_SOURCE=remote` switches the catalogue to published
  content; a failed fetch keeps what is on the device rather than emptying the
  app.

## Backend and emulators

- `npm run emulators` starts auth, Firestore and Storage;
  `npm run test:emulator` runs the rules and integration suites against them.
  Firestore is on **8181**, not 8080 (OrbStack commonly holds 8080).
- The emulator project is `demo-dananeh`: a `demo-` id is never backed by a real
  project, so a test cannot reach production.
- **A development build only talks to a real project on purpose** — set
  `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=1` for the emulator, or
  `EXPO_PUBLIC_ALLOW_LIVE_FIREBASE=1` to opt in. Anonymous sign-in creates real
  accounts, so the default in dev is neither.
- Rules are tested against denial, not just success. `resource` is null on
  create — read through it and the rule fails with an evaluation error rather
  than a clean `false`.

## Routing and session

- **There is no login wall.** `src/app/_layout.tsx` gates on onboarding, not on
  an account: `Stack.Protected` shows `onboarding` until
  `session.onboarded`, and the tabs after. `auth` sits outside both guards.
- `src/context/SessionContext.tsx` holds the guest session — onboarding state,
  interests, pace, time of day — in AsyncStorage. Routing waits for its
  `isReady`, so nothing flashes before the stored session is read.
- Signing in or creating an account **carries guest data over**; it never gates
  a feature and there is no paywall. Every path out of `auth` keeps the reader
  in the app.
- The tab bar is a custom bar (`src/components/app-tabs.tsx`) over
  `expo-router/js-tabs`, because the native tab bar cannot take the vector icon
  set. It is 76pt border-box plus the home-indicator inset. Garden is the
  fourth tab and lands with its screen in build step 6.

## Seed player

- Content model is `src/models/seed.ts`; seeds come from
  `src/data/content-repository.ts`, never from a screen reaching into fixtures.
- Blocks render from `src/features/seed-player/registry.tsx`, keyed by
  `block.type`. **A missing key renders the named fallback, never throws** —
  `seed-unknown-block` is a fixture that keeps that path honest.
- Blocks are presentational: they hold a draft, the player owns grading
  (`grade.ts`), the footer CTA and persistence.
- Answer state carries three signals — indicator, border treatment and a text
  badge — before colour. `missed` is dashed. Wrong options are de-emphasised to
  50%, never hidden.
- Progress is written through on every change (`src/lib/progress-store.ts`), so
  closing a seed needs no confirmation. Reflections live there and nowhere else.

## Offline, review and growth

- `CatalogContext` owns cache state and downloads; `src/lib/outbox.ts` queues
  anything that would be sent. Being offline never costs a completion.
- Cached / downloading / corrupt / missing are four distinct appearances, never
  a boolean, and downloads report real bytes.
- `src/lib/schedule.ts` is the scheduler: intervals 14/7/3/1 days, first ask on
  day three, weekly growth with one grace day. Confidence is recorded separately
  from correctness and each rating states the interval it produces.
- The review answer stays covered until the reader has attempted recall.
  Revealing first turns retrieval practice into re-reading.

## Locale

- `src/lib/locale.ts` owns locale **and** direction. `src/i18n.ts` only holds
  resources — nothing runs on import.
- Persian is the default; the device language is not consulted, because seeds
  ship in Persian. English is a port the reader chooses.
- Under `en` the type stack falls back to the system face. Yekan Bakh **FaNum
  renders Latin digits as Persian glyphs**, which is right for Persian and wrong
  for the English port — `Text` handles this, so never hard-code `fontFamily`.
- On web, direction must be set on the document (`dir` on `<html>`):
  react-native-web maps `marginStart` and friends onto CSS logical properties,
  and `I18nManager` alone leaves the DOM laid out left-to-right. On native a
  direction change applies on the next launch — `setLocale` reports that back
  as `needsRestart`.

## Design system

- **`src/constants/theme.ts` is the source of truth** for colour, type, space,
  radius, elevation and motion. `global.css` mirrors the colours as CSS custom
  properties so NativeWind classes resolve to the same palette. Change one,
  change the other.
- **Never write a hex in a component.** Use a token class (`bg-canvas`,
  `text-ink`, `border-hairline`) or `useTheme()` for JS-side colour.
- **No `dark:` variants for colour.** The CSS custom properties swap on
  `prefers-color-scheme`, so `bg-card` is already theme-aware.
- Four palette corrections are load-bearing and must not be reverted: sprout is
  decorative in light mode (progress fills use `brand`); sun is fill-only in
  light mode (`sunInk` when it must be type); dark primary buttons carry an ink
  label (`onBrand`), never white; `errorInk` is for error text on the error
  tint. See the token comments for the measured ratios.
- Radius scale is 8 / 16 / 24 / 32. **No pill buttons** — `rounded-full` is a
  regression.
- Cards get a hairline border, not a shadow. `e2` is for sheets and the offline
  banner only.
- **No colour-only status anywhere.** Every state carries an icon and a text
  label as well.
- Touch targets ≥ 44×44, including inline text actions.

## Text

`src/components/Text.tsx` is the only text primitive.

- Size and weight come from the `variant` prop (`display`, `titleLg`,
  `titleMd`, `body`, `bodySm`, `label`, `caption`) — never from ad-hoc classes.
- **Colour is the `color` prop, not a className.** The variant styles land in
  `style`, which outranks anything NativeWind emits, so a `text-…` colour class
  would silently lose.
- `ltr` / `mono` isolate a Latin run: emails, URLs, error codes, versions,
  publisher names, formulas, and Latin titles.

## Persian typesetting — correctness, not polish

- Line height ≥ 1.65 at body sizes. The type scale already satisfies this.
- نیم‌فاصله (ZWNJ, U+200C) is content. Store it in the string, preserve it for
  display, normalise it only for search.
- Persian punctuation («…», ، ؛ ٬), never the Latin set.
- **Never a Latin middot next to a digit** — in Yekan Bakh it is glyph-identical
  to ۰. Metadata separators use `<MetaDot />`, a drawn element.
- Persian digits in all prose and UI via `toFaDigits()` in `src/lib/format.ts`.
  Convert at the formatter, never in stored strings. Latin digits only inside
  LTR-isolated technical strings.
- No underlines on Persian text; links use weight + colour.

## React Native rules

- **Logical properties only**: `marginStart/End`, `paddingStart/End`,
  `start/end` — never `left/right`. This is what keeps the LTR port free.
- **Never `flexDirection: 'row-reverse'` inside an RTL tree** — it double-flips
  back to LTR. Plain `row` already lays out right-to-left.
- Progress rings need `react-native-svg` with an explicit RTL transform; SVG
  does not inherit document direction.
- Player blocks render from a registry keyed by `block.type` with a default
  case: an unknown type renders a named fallback, never throws.
- Dates: ISO UTC in data, Jalali at render. Foreign publication years carry an
  era marker.
- No text baked into images.

## react-native-web traps

Both of these cost real debugging time; check them first when a layout looks
wrong on web but the code reads correctly.

- **`tailwind.config.js` content globs must cover every source directory.** A
  class used only under `src/features` was never generated, so fixed-size boxes
  silently collapsed.
- **react-native-web defaults views to `flex-shrink: 1`; React Native uses 0.**
  A fixed-size sibling (badge, icon, indicator) in a flex row must set
  `flexShrink: 0` / `shrink-0`, and a flexible text needs `min-w-0` to shrink
  below its content width.

## Backend workflows

- `npm run emulators` · `npm run seed:emulator` (editor/reviewer/admin accounts
  and one draft) · `npm run admin` (the CMS on :5273).
- `npm run build:functions` compiles the schema package **and** the functions.
  Cloud Functions runs Node, so `@dananeh/content-schema` must be built — its
  `exports` map gives bundlers the TypeScript source and Node the compiled copy.
- Publishing goes through the editorial state machine in
  `functions/src/publish/drafts.ts`. An editor cannot approve their own draft;
  that rule lives in the function because security rules cannot see authorship.

## Running the app

- `CI=1 npx expo start --web --port <port>` for a headless web check;
  Playwright is a dev dependency for screenshots.
- App identity comes from `app.config.ts` and `APP_VARIANT`
  (`development` / `staging` / `production`): separate bundle ids and schemes so
  the three builds coexist and a deep link cannot open the wrong one.
- **Metro in this checkout does not always pick up file edits.** After changing
  source or locale JSON, restart the dev server with `--clear` before trusting
  what the browser shows — a stale `fa.json` silently falls back to English.

## Content

- **The launch catalogue is `LAUNCH_SEEDS` in `src/data/content-repository.ts`.**
  Every seed in it must pass `parseSeedStrict` — the same gate the publish
  pipeline applies — because it is what a reader sees on a dead network and
  whenever a remote refresh fails. `fixtures.test.ts` holds that line, along
  with "no test fixture in the catalogue" and "no path pointing at content this
  build does not ship".
- Test-only content lives in `src/data/__fixtures__/`. `unknownBlockSeed` is
  invalid by construction and must never be in the runtime catalogue; it exists
  so the registry's named fallback stays exercised.
- Sources cite a **specific page**, not a publisher homepage — there is a test
  for it. Prefer a `https://doi.org/…` link, which is stable and resolvable.
  A source with no verifiable link omits `url` rather than pointing at a
  front page.
- Ship the Persian copy from the handoff as written. No shame or urgency
  language in any string.

## Fonts

Four weights ship: Regular 400 (body), SemiBold 600 (caption), Bold 700
(title.md, label), ExtraBold 800 (display, title.lg). Light, Thin, Black and
ExtraBlack were pruned — the scale has no light weight on purpose, because
Persian loses stroke contrast at body sizes.
