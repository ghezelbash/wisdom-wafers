# 24. No placeholder visual ships, and a style function is not a style

Date: 2026-09-05

## Status

Accepted.

## Context

Two kinds of defect, found the same way: by measuring what the app actually
renders rather than reading what it is supposed to render.

**The starter's brand was still on screen.** `AnimatedSplashOverlay` drew a
full-screen Expo logo on Expo blue after the native Dananeh splash, on every
cold start. Fourteen starter images and an `expo.icon` directory sat in the
tree, along with six starter components nothing imported.

**Every button had collapsed to the height of its label.** `Pressable` accepts
`style={({ pressed }) => …}` and it is the idiomatic way to write a pressed
state — but a component that also carries a NativeWind `className` never
receives it, because NativeWind resolves classes into `style` itself and the
function goes with them. Everything in the function went too, including
`minHeight`. Measured: 364×30 and 364×26 against a 44pt floor. The number was
in the source the whole time, correct and inert.

Seven more targets failed the same measurement: tab items at 42, chips at 40,
the search field filling 23pt of a 48pt row, the reminder switch at 40×20, and
an inline text action at 22.

**Two placeholders were being shipped as content.** The hero card's cover was a
grey band reading "an illustration for psychology" — a caption for a picture
that does not exist — and an image block with no `imageUrl` rendered its alt
text inside an empty frame, which is exactly what a *failed* image looks like.
Neither a reader nor the publish gate could tell the deliberate case from the
broken one.

## Decision

### Measure the rendered app

`scripts/ux-audit.mjs` renders the real app in Persian and English, light and
dark, at 100% and 200% text, and walks the DOM: every interactive box against
44×44, every text run against what it actually sits on, and the document
direction against the reader's stored language — not the browser's, because the
app deliberately ignores the browser's.

An element passes if it *or a clickable ancestor* meets the floor. A switch is
drawn 40×20 wherever it appears; what matters is whether the region a reader
aims at responds, so the switch is wrapped in a 44×44 `Pressable` that toggles
it, and the rule is written to accept that rather than to be argued around.

### A style function is not a style

`button.tsx` keeps its pressed state in local state and its geometry in a plain
object. There is one function style left in the codebase — none — and the
reason is recorded in the component, because the next person to write
`style={({ pressed }) => …}` will be right about the API and wrong about the
outcome.

### A placeholder is a decision or it is a bug

An image block must now carry either a picture or `describedOnly: true`, and
the publish gate refuses anything else. A described figure is drawn as a titled
figure card with the description set as body text — an editorial element that
reads as intentional — rather than as alt text centred in an empty frame.

The hero cover is drawn: the seed mark on the topic family's tint, hidden from
screen readers because the title below already says everything it says.

### The starter is gone, and cannot come back quietly

Fourteen images, the `expo.icon` directory, six unimported components and two
starter scripts are deleted. `tests/static/brand-assets.test.ts` fails if any of
them reappears by name or by reference, if Expo blue appears in any source file,
if the brand assets the build points at stop existing, or if the splash overlay
and the `expo-splash-screen` configuration drift apart — they carry the same two
background colours and the same 124pt mark, which is what makes the cold start
one splash instead of two.

## Consequences

- `npm run ux:audit` needs a running dev server, so it is not in CI. It is a
  release step, in `docs/runbooks/native-qa.md`.
- It measures the **web** build. TalkBack, a themed launcher icon and a real
  cold start still need a device, and are unsigned owner actions.
- Two token contrast comments were wrong (5.6 for 6.1, 5.0 for 4.9, 9.3 for
  9.2). The colours were fine; the numbers had drifted. `contrast.test.ts` now
  computes them, so a comment that claims a ratio is a comment that is checked.
- Adding an image to a seed is now a two-part decision — picture or described —
  which is one more thing an author has to say, on purpose.
