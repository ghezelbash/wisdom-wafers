# Handoff: Dananeh / دانانه — full UI/UX system

## Overview

Dananeh is a Persian-first microlearning app for curious adults. It turns 5–10 spare minutes
into one credible, memorable learning unit called a **دانه / Seed**. This bundle is the complete
design system and screen set for the MVP: onboarding, Home, Explore/search, the seed player
(eleven block types), completion, Garden, review sessions, auth, offline/storage, settings, and
the twelve system states — RTL-first, light and dark.

The starting point is the existing Expo repo `wisdom-wafers` (Expo ~57.0.19, React Native 0.86.3,
Expo Router, NativeWind, i18next, Firebase JS SDK). That repo is an early skeleton branded
«ویفر خرد» with a violet accent, three lesson card types and a login wall on first launch. This
design replaces that visual layer and expands the content model. **Nothing violet survives.**

## About the design files

The four `.dc.html` files in this bundle are **design references created in HTML** — prototypes
that show intended look and behaviour. They are not production code to copy. The task is to
**recreate these designs in the existing React Native / Expo codebase**, using its established
patterns: NativeWind classes driven by `src/constants/theme.ts`, the `Text` wrapper in
`src/components/Text.tsx`, Expo Router file-based routing, and i18next for copy.

Open the files in a browser to inspect them. `Dananeh Prototype.dc.html` is genuinely
interactive — click through it before implementing the player.

## Fidelity

**High-fidelity.** Final colours, typography, spacing, radii, motion and copy. Every hex value,
font size, line-height and touch-target size in the files is intentional and has been measured.
Recreate the UI faithfully; where a value is not stated in this README, read it off the HTML.

Realistic Persian copy is used throughout — no lorem ipsum. **Ship the copy as written.** It was
written to specific constraints (see Content constraints below) and several strings exist to avoid
specific failure modes (no shame language, no urgency, no colour-only status).

---

## Design tokens

### Colour — light / dark

| Semantic | Light | Dark | Role |
|---|---|---|---|
| `surface.canvas` | `#F7F4EA` | `#171A17` | Page background |
| `surface.card` | `#FFFDF7` | `#222722` | Cards, sheets |
| `text.primary` | `#1F241E` | `#F4F3EB` | Body, titles |
| `text.secondary` | `#5D665B` | `#BBC2B8` | Metadata, captions |
| `brand.primary` | `#2F6D4B` | `#77B98A` | CTA fill, progress fill, links |
| `brand.sprout` | `#65A96B` | `#8BCB94` | Decorative in light; progress fill in dark |
| `accent.sun` | `#E9A928` | `#F2C45F` | Fill only in light; usable as text in dark |
| `accent.sunInk` | `#8A6100` | `#F2C45F` | Sun as type (light mode) |
| `accent.plum` | `#6F5178` | `#B99BC2` | Humanities topic family |
| `feedback.error` | `#B5443C` | `#EF8C84` | Borders, fills, destructive buttons |
| `feedback.errorInk` | `#A03A33` | `#EF8C84` | Error **text** on its own tint |
| `border.hairline` | `rgba(31,36,30,.10)` | `rgba(244,243,235,.09)` | Card borders, dividers |
| `border.strong` | `#8C8778` | `#4A5248` | Off switches, state illustrations |
| `border.track` | `#E4E0D2` | `#333A32` | Progress tracks |

**Four corrections were made to the original brief's palette. Do not revert them:**

1. **Sprout green is not a progress fill in light mode.** `#65A96B` measures 1.88:1 against the
   `#E4E0D2` track — under the 3:1 floor for meaningful graphics. Light-mode progress fills use
   `brand.primary` (4.7:1). Dark mode keeps sprout: it measures 9.3:1 there.
2. **Sun is fill-only in light mode.** `#E9A928` is 1.88:1 on canvas. Where the reward/curiosity
   colour must be text, use `accent.sunInk #8A6100` (5.0:1). Ink on a sun fill is 7.7:1.
3. **Dark-mode primary buttons take ink labels, not white.** White on `#77B98A` is 2.1:1;
   `#0F120F` on it is 8.2:1.
4. **Measure on the real parent, not on canvas.** Error red is 5.0:1 on canvas but only 4.4:1 on
   its own 9% tint — hence `feedback.errorInk`. The pale neutral was 1.7:1 as an off-switch fill
   — hence `border.strong`.

### Typography — Yekan Bakh FaNum

License confirmed by the product owner. Files already in `assets/fonts/`.

**Six weights are present; four are used.** Regular 400 (body), SemiBold 600 (caption),
Bold 700 (title.md, label), ExtraBold 800 (display, title.lg). Black 900 appears only in archived
"before" frames. Light 300, Thin and ExtraBlack are unused and can be pruned — the scale has no
light weight on purpose, because Persian loses stroke contrast at body sizes.

| Token | Size / line-height | Weight |
|---|---|---|
| `display` | 34 / 44 | 800 |
| `title.lg` | 26 / 38 | 800 |
| `title.md` | 20 / 32 | 700 |
| `body` | 17 / 30 | 400 |
| `body.sm` | 15 / 26 | 400 |
| `label` | 14 / 20 | 700 |
| `caption` | 13 / 22 | 600 |

**Persian typesetting rules — these are correctness requirements, not polish:**

- Line height ≥ 1.65 for anything body-sized. Persian descenders and dots collide below that.
- **نیم‌فاصله (ZWNJ, U+200C) is content, not styling.** Store it in the string. Normalise it for
  search; preserve it for display; test truncation against it.
- Persian punctuation: «…» not "…", and ، ؛ ٬ — the Latin set is a content bug.
- **Never a Latin middot (U+00B7) next to a digit.** In Yekan Bakh it is glyph-identical to ۰, so
  «۶ دقیقه · مقدماتی» reads as «۶ دقیقه ۰ مقدماتی» and «۳۴ دقیقه» becomes ۳۴۰. Metadata separators
  are a drawn 4pt dot **element** in a flex row, never a text character. This also keeps the
  screen-reader string clean.
- No underlines on Persian text. Links use weight + colour; focus uses a ring.
- Bidi isolation (`dir="ltr"`) on every Latin run: emails, URLs, error codes, versions, publisher
  names, formulas. A Latin **title** gets `dir="ltr"` too — otherwise its trailing "?" renders at
  the wrong end.
- Persian digits in all prose and UI; Latin digits only inside LTR-isolated technical strings.
  Convert at the formatter (`toFaDigits()`), never in stored strings.

### Spacing — 4pt base

`1:4  2:8  3:12  4:16  5:20  6:24  8:32  12:48`

Screen gutter 20 below 430pt, 24 at and above. In-card stack 12, card padding 16, block rhythm 24
(strict inside the player), section break 32, rail break 48.

### Radius

`8` chip/badge · `16` input/option · `24` card/button · `32` sheet/hero.
**No pill buttons** — full-round CTAs read as consumer-app and fight the editorial tone.

### Elevation — three levels only

- `e0` hairline border only — **all cards**. Separation comes from the canvas/card value step.
- `e1` `0 1 2 / 6%` — rarely used.
- `e2` `0 8 28 / 14%` — sheets and the offline banner only.

Dark mode replaces shadow with a lighter surface step.

### Icons

24×24 grid, stroke 1.75, round caps, no fills except state indicators. ~22 glyphs, derived from
the concentric-ring brand geometry. Ships as vectors — the two PNGs in `assets/images/tabIcons`
(home, explore only, solid black, no Garden/Profile equivalent) are retired.

**Mirror in RTL:** back/forward chevrons, progress direction, list disclosure, indent.
**Never mirror:** play, check, download, clock, bookmark, the brand mark.

### Breakpoints

`320–374` SE: gutter 20, hero title clamps to 2 lines · `375–429` baseline, all specs drawn here ·
`430–599` gutter 24, card metadata on one row · `≥600` web/tablet: content maxes at 720, rails
become a 2-col grid.

### Motion

| Moment | Duration | Curve | Reduce Motion |
|---|---|---|---|
| Block → block | 200ms | standard | Cross-fade 120ms, no translation |
| Answer feedback | 180ms | decelerate | Panel appears at full height, 0ms |
| Growth moment | 700ms | emphasised | Completed ring fades in over 150ms, no scaling |
| Sheet / sources | 260ms | decelerate | Scrim + sheet fade, 140ms |
| Download progress | continuous | linear | Numeric percentage only |
| Skeleton → content | 160ms | standard | Static skeleton, instant swap |
| Tab change | 0ms | — | Identical |

`standard cubic-bezier(.2,0,0,1)` · `decelerate cubic-bezier(0,0,0,1)` · `emphasised` same as
standard with a 120ms hold. Springs only on direct-manipulation drag (ordering, match pairs):
damping .8, stiffness 220. Read Reduce Motion at mount and re-read on app foreground.

**No confetti, ever. Nothing loops. Motion explains a state change or it does not exist.**

---

## Information architecture

Bottom navigation, four tabs: **خانه** Home · **کاوش** Explore · **باغچه** Garden · **من** Profile.

Search is a *pushed* screen reachable from both Home and Explore — never a fifth tab. The seed
player is a full-screen flow **outside the tabs**: while you are in a seed, there is nowhere else
to be.

- **Home** — continue card (top slot when unfinished), growth + due strip, today's hero seed,
  four finite rails, explicit end with an Explore CTA. **No infinite scroll.**
- **Explore** — search field, 6-topic grid, paths rail, filters. → topic detail → path detail.
- **Garden** — five segments in one screen with a filter (in progress / saved / downloaded /
  due / completed), weekly growth with one grace day. → review session, → storage manager.
- **Profile** — account offer (never a wall), three stats, settings. → auth, → delete account.
- **Player** — 11 block types from a registry, sources sheet, report sheet, completion →
  notification ask → account offer.

Player entry points: Home hero, continue card, rail, search result, topic detail, path, deep
link, notification.

---

## Screens

53 frames are drawn in `Dananeh Screens.dc.html`, numbered and captioned. Below is what each
group must do; read exact values off the file.

### 1–4 · First launch (guest, no account, no paywall)

Four steps, all skippable, under 60 seconds.

1. **Brand promise** — one claim, one out. 88pt concentric ring, display title, 17/30 body,
   primary CTA «شروع کنیم», ghost «حساب دارم؟ ورود».
2. **Interests** — 9 topic chips, minimum 2, reversible. Chips are 48pt minimum, filled with
   their topic-family accent when selected. **The CTA label states the blocking condition**
   («دو موضوع انتخاب کن») rather than greying out silently.
3. **Pace** — three radio options (1/day, 2/day, whenever) + three time-of-day chips. Sets the
   daily goal only. **No permission ask here.**
4. **First seed handoff** — the seed card with an offline reassurance row. The first seed is
   **bundled in the binary**, which is what makes a dead-network first run survivable.

### 5–8 · Home, four states

Light, dark, offline-cached, loading skeleton. Same layout in all four.

- **Continue outranks the recommendation** — a half-finished seed is the highest-intent thing on
  screen. 46pt progress ring + truncated title + «۲ دقیقه مانده» + 44pt play button.
- **Growth + due strip** — two cards: weekly 0–7 dots («۴ از ۷ روز») and review count.
- **Hero seed card** — see card anatomy below.
- **Four finite rails**, then an explicit end.
- **Offline state shows per-card availability** («دانلود شده» / «در دسترس نیست») rather than
  hiding what cannot load. The banner states when data was last true.
- **Skeleton mirrors the loaded geometry exactly** — no layout shift on swap.

### 9–12 · Explore, search, topic detail

- Six topics mapped to three accent families: **sciences → primary**, **humanities → plum**,
  **practical → sun**. Six distinct hues would collide with correct/incorrect/offline semantics.
- **Search results state what was matched** when normalization changed the answer, and highlight
  hits. Search runs against a local normalized index, so **it works offline**.
- **No-result is a recovery screen** — nearest topics as chips plus a "suggest this topic" card.
- Topic detail: paths above loose seeds.

### 13–28 · Seed player

Header chrome is identical on every block: 44pt close, truncated title, **segmented progress with
a text equivalent** («۵ از ۱۱»), save, more. Progress fills from the **right** in RTL.

Eleven block types: `richText`, `image`, `quote`, `callout`, `multipleChoice`, `multiSelect`,
`trueFalse`, `ordering`, `matchPairs`, `reflection`, `summary`.

- **One meaningful block per viewport.** Nothing peeks from below to bait a scroll.
- **Answer feedback carries three signals** — indicator shape, border treatment, text badge —
  before colour. Never colour alone.
- **Partial credit is its own state.** The missed-but-correct option gets a **dashed** border and
  «جا افتاد», so hit / missed / wrong are three visually distinct treatments.
- **Incorrect offers retry with no shame copy** («این‌بار نه»), and shows the correct answer.
- **Wrong options are not hidden** after submit, only de-emphasised to 50% — the reader needs to
  see what they rejected.
- **Ordering and matchPairs each ship a non-drag path** — 44×44 arrow buttons and tap-to-pair.
  Drag is an enhancement, never the sole affordance. On the first/last row the impossible arrow
  direction is `aria-disabled`, not hidden.
- **Reflection is optional, private, never scored**, stored on-device only.
- **Summary is exactly three points**, written as recallable claims — the scheduler asks them
  separately on day 3.
- **Sources sheet** carries publisher, date, type and a last-reviewed date. Latin titles and
  publishers are LTR-isolated; a Persian publisher stays RTL in Yekan Bakh. Foreign years carry
  an era marker («۱۹۸۷ م.» / «۱۳۹۸ ش.»).
- **Report is a normal action** in the same sheet stack, five categories, not a settings item.
- **Unknown block type degrades to a named fallback** and never blocks the seed. Progress is
  preserved; the block type is logged.
- **Autosave on every block change.** Closing is free — no confirmation dialog when state is saved.

### 29–31 · Completion and the two asks

- Headline is **literal** («تمام شد»). The metaphor lives in the ring beside it — a first-time
  user should never have to decode «دانه کاشته شد» to know the lesson ended.
- Three-point summary, correct-answer count, **next review date**, one next recommendation,
  save and share.
- **Notification ask comes after the first completion**, states the frequency cap *before*
  requesting permission, and «الان نه» is a real, equally sized option.
- **Account upgrade** states that guest data carries over. No paywall in the MVP.

### 32–34 · Garden

Five segments, one screen. Weekly growth with the grace day explained in words. The downloaded
list shows cached, downloading (real byte progress) and corrupt-with-retry together. The
nothing-due empty state is framed as good news.

### 35–38 · Review session (آبیاری)

- Due queue: three items, ~3 minutes, and **deferring is free** — «بعداً مرور می‌کنم» is a
  first-class action with no debt language.
- **The answer stays covered until the user has attempted recall.** Revealing first would turn
  retrieval practice into re-reading, which is the one thing this screen must not allow.
- **Confidence is recorded separately from correctness**, and each rating states the interval it
  produces (14 / 7 / 3 / 1 days), so the scheduler is legible rather than magic.
- Results: what changed and the next interval per item.

### 39–43 · Auth and settings

Email, password and Latin identifiers are LTR-isolated in a monospace slot inside the RTL form.
Verify-email keeps the app fully usable. **Delete account names exactly what is destroyed**,
offers an export first, and its confirm is destructive-styled rather than hidden. Notification
settings state the frequency cap as content, not fine print.

### 44–50 · Offline, storage, system states

Storage manager with a real quota bar (bind the fill to `used/total`; the redline shows 6.4 of
30 MB = 21.4%). Offline-missing-asset inside the player states the resume point and offers a skip.

**Every failure state names what still works and offers a second action that is not "retry"** —
an offline user who can only press retry is stuck. Error codes, versions and identifiers are
LTR-isolated in monospace so they can be read aloud or copied. Permission-denied never blocks the
app and spells out the OS path. Maintenance and forced-update state a real bound, not a spinner.

### 51–53 · LTR proof

The same system in English, mirrored natively — **not flipped screenshots**. Every directional
property is logical (`marginStart/End`, `paddingStart/End`, `start/end`, plain flex order), so
switching document direction moves the whole layout with no mirrored assets. Gregorian dates and
Latin digits under `en`.

---

## Content card anatomy (SeedCard)

Topic chip → title → one-line learning promise → format/duration/difficulty → recommendation
reason → progress/download state → CTA.

**Never** place metadata over the illustration, and never let the illustration be the only way to
tell two cards apart.

Six variants:

- `hero` — illustration, promise, reason, full CTA row. Home only, one per screen.
- `rail` — 230pt wide, chip + title + metadata, no illustration, whole card is the target.
- `continue` — progress ring replaces the illustration, CTA collapses to a 44pt play button.
- `list` — 26pt status circle, title, one metadata line. Topic detail, Garden, search.
- `review` — interval badge («۷ر») instead of a chip, no CTA; the row is the target.
- `skeleton` — mirrors the loaded card's geometry exactly.

The **recommendation reason** comes from a fixed set of reason codes. If ranking cannot explain
the pick, **omit the row** — never invent a reason.

---

## Component states

Full matrix in `Dananeh Components.dc.html`: 14 data-driven components × 16 states, with a note
on every cell marked unreachable-by-design.

Three rules that cut the matrix down:

1. A component that **can be empty** must have its own empty copy — no shared «چیزی نیست».
2. A component that **can fail** must offer a second action.
3. A component that **can be stale** must say when it was last true.

**Refreshing is not loading.** Loading shows a skeleton because there is nothing to show.
Refreshing keeps the old content fully legible and marks it stale — pull-to-refresh must never
blank the screen you were reading.

**Focused is web-first.** The 2px offset ring is for keyboard and web. On native, draw it only
when an external keyboard or switch control is attached, so it never appears mid-tap.

---

## Accessibility

Target: **WCAG 2.2 AA.** 4.5:1 normal text, 3:1 UI graphics. All 15 published contrast pairs are
measured, not estimated — table in `Dananeh Handoff.dc.html`.

- **Touch targets ≥ 44×44**, everywhere, including inline text actions (which get vertical
  padding and a negative margin to keep their optical position).
- **No colour-only status anywhere.** Every state carries an icon and a text label.
- **Screen-reader labels are specified per element.** Close is «بستن دانه», not «×». Progress
  announces blocks («بلوک ۵ از ۱۱»), never a percentage. Option state appends «، پاسخ درست» —
  never a colour word. Feedback panels are `aria-live="polite"` (assertive would cut off the
  option label mid-read). Decorative rings are `aria-hidden`; only the ring carrying data gets a
  label. Download announces its size *before* the action.
- **Focus order follows Persian reading order** (right-to-left, top-to-bottom). One exception:
  in the player, close is first regardless of side — leaving must always be reachable first.
- **200% Dynamic Type:** body scales fully; titles cap at 1.6× and clamp to three lines; buttons
  grow in height and never shrink their label; answer options become full-width blocks with the
  indicator top-aligned at the start edge. **Nothing is hidden to make room.** Home genuinely
  scrolls at 200% — the guarantee is that *pinned* screen-level CTAs (player, onboarding, review)
  never leave the viewport, because they sit in non-shrinking footers.
- **Reduce Motion** has a real alternative for every entry in the motion spec.

---

## Content constraints

| Field | Limit |
|---|---|
| Seed title | ≤ 60 chars, 3-line clamp |
| Learning promise | ≤ 80 chars, one line, **required to publish** |
| Topic name | ≤ 14 chars or the chip wraps |
| Question | ≤ 120 chars |
| Answer option | ≤ 70 chars |
| Explanation | 120–260 chars (shorter reads as dismissive, longer gets skipped) |
| Summary | exactly 3 points, ≤ 90 each, each independently recallable |
| Reflection | ≤ 600 chars, optional, never scored, on-device only |
| Sources | ≥ 1 to publish, each with publisher, date, era marker, type |

---

## Files this design touches

| Path | Action | What changes |
|---|---|---|
| `src/constants/theme.ts` | replace | 5 greyscale colours → the semantic token set above, light/dark pair per token. `Spacing` keeps its shape, gains 12/20/48. `MaxContentWidth` 800 → 720. **`BottomTabInset` iOS must change 50 → 76**; Android's 80 already fits. |
| `tailwind.config.js` | replace | Remove `brand.500 #8b5cf6` and `surface.light #f9fafb` entirely. Radius scale → 8/16/24/32. |
| `src/components/Text.tsx` | extend | Keep the weight→family mapping. Add a `variant` prop bound to the type scale so sizes stop being ad-hoc class names. |
| `src/app/lesson/[id].tsx` | replace | → `features/seed-player` with a block registry. Also fixes the conditional `useColorScheme` call (a real hooks-order bug in the current file). |
| `src/app/(tabs)/_layout.tsx` | extend | Add the Garden tab; four total. Vector icons replace `assets/images/tabIcons`. |
| `src/app/(tabs)/index.tsx` | replace | Centred welcome card → the Home composition. |
| `src/app/(tabs)/explore.tsx` | replace | Image-led course cards → topic grid + paths + metadata-led SeedCards. |
| `src/app/(tabs)/profile.tsx` | replace | → stats + settings list; sign-out moves into settings. |
| `src/app/auth.tsx` | extend | **No longer the entry point.** Reached from Profile or after a completion. |
| `src/i18n.ts` | replace | Locale bootstrap instead of `I18nManager.forceRTL` at import time — the current version needs a reload to switch direction. |
| `src/locales/fa.json` | extend | Rename every «ویفر خرد» string. New keys for the 12 system states. **No string may contain shame or urgency copy.** |
| `src/models/lesson.ts` | replace | 3 card types → 11 block types with `schemaVersion` and `revision`. |
| `src/data/store.ts`, `generatedData.ts` | replace | → `ContentRepository` interface with a mock adapter; keep fixtures for tests. |
| `assets/fonts/*` | keep | Ship 400/600/700/800. Prune Light, Thin, ExtraBlack. |

---

## React Native implementation notes

- **Logical properties only.** `marginStart/End`, `paddingStart/End`, `start/end` — never
  `left/right`. This is what makes the LTR port free.
- **Never `flexDirection:'row-reverse'` inside an RTL tree** — it double-flips back to LTR. Plain
  `row` already lays out right-to-left. (This was a real bug caught during the design pass.)
- **Progress rings** need `react-native-svg` with an explicit RTL transform — SVG does not
  inherit document direction.
- **FlashList** for Garden and search; fixed `estimatedItemSize` per card variant (list 84,
  rail 132, hero 300).
- **Player blocks render from a registry** keyed by `block.type` with a default case. A missing
  key must render the fallback, not throw.
- **Persian numerals at the formatter**, not in strings — one `toFaDigits()` so a Latin digit can
  never leak into UI copy.
- **Metadata separators are components**, never the middot character (see typesetting rules).
- **Box-sizing matters in the tab bar.** The bar is 76pt border-box plus the home-indicator inset
  (96 at 200% type). Content-box plus padding silently adds 11pt.
- **Search normalization is shared** between index and query — one module, or the two drift and
  results become unexplainable.
- **Colloquial variants are not normalization.** Unicode normalization handles hamza forms, ی/ي,
  ک/ك, ZWNJ, tatweel, diacritics and digits. «آسمون» → «آسمان» is a *different word*, and needs a
  separate curated expansion list. The prototype implements both and its UI names which mechanism
  fired. The original blueprint's §9.1 conflates them.
- **Dates:** ISO UTC in data, **Jalali at render** (one calendar, no switcher). Foreign
  publication years carry an era marker.
- **No text baked into images.** Every string is live text — that is what makes 200% type and
  screen readers work.

---

## Assets

- **Fonts** — `assets/fonts/YekanBakhFaNum-{Regular,SemiBold,Bold,ExtraBold}`, woff2 for web and
  ttf for native. Already in the repo; license confirmed by the product owner.
- **Icons** — one 24×24 / 1.75-stroke vector set, ~22 glyphs, derived from the concentric-ring
  brand geometry. Not included as separate files; the HTML contains every glyph as inline SVG and
  they can be lifted directly.
- **Illustration** — **not included and not generated.** Every image slot in the designs is a
  labelled placeholder stating its subject and aspect ratio. The plan is one commissioned
  editorial illustration per topic, 16:9 for cards and 4:5 for in-player, AVIF/WebP with JPEG
  fallback, three widths. **Alt text is a publish gate.**
- **Brand mark** — three concentric circles plus a filled centre. Never mirrored, recoloured or
  rotated. Works at 24px. Inline SVG in every file's header.

---

## Suggested build order

1. **Tokens and type primitives.** Nothing else lands cleanly until the violet is gone.
2. **Guest-first routing.** Removes the login wall; the biggest activation change in the set.
3. **Block registry + player.** Where the product actually lives.
4. **Offline catalog and outbox.** The differentiator, and it constrains the player's autosave shape.
5. **Home, Explore, search.** Needs the card component and reason codes to exist first.
6. **Review and growth.** Retention, and the reason the summary block is written the way it is.

---

## Files in this bundle

| File | Contents |
|---|---|
| `Dananeh Foundations.dc.html` | Rationale, 5 design principles, the current UI recreated as a "before" baseline, full token tables with measured contrast, type scale, Persian typesetting rules, motion specs, do-not-do page |
| `Dananeh Screens.dc.html` | 53 numbered screens, RTL-first, light and dark, every core flow plus the LTR proof |
| `Dananeh Components.dc.html` | Component library with anatomy, variants and interaction rules; the 14 × 16 state matrix |
| `Dananeh Prototype.dc.html` | **Interactive.** First run → completion, search with normalization, offline resume, review session. Network and Reduce Motion are togglable; focus order annotates itself per screen |
| `Dananeh Handoff.dc.html` | IA map, four flow diagrams, screen-reader contract, measured contrast results, redlines at 320/390/430 and 200%, file-by-file handoff |
| `fonts/` | The Yekan Bakh weights the design uses, so the HTML renders correctly offline |

Open the HTML files in a browser. Start with the Prototype — click through the player before
implementing it.

---

## Two things still open

1. **Illustration is uncommissioned.** Placeholders state subject and ratio. If the plan changes
   to stock photography, card anatomy needs revisiting — the metadata-led layout exists partly
   because commissioned art is expensive and slow.
2. **Two open design questions worth instrumenting rather than arguing:** whether the finite Home
   (four rails then an ending) reads as generous or empty — measure the Explore CTA at the end of
   the rails; and whether weekly growth retains as well as a daily streak — watch D7 against
   grace-day usage.
