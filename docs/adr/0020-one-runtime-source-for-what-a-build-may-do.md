# 20. One runtime source for what a build may do

Date: 2026-09-05 · Status: accepted · Extends ADR 18

## Context

ADR 18 gave the app remote configuration that fails open, with tests. What it
did not give it was any effect: `isEnabled` and `getFlags` had **zero callers**.
Every feature was on because no code asked whether it should be, which made all
five kill switches decoration.

The gate had a worse problem. `AppGateScreen` offered "go to the garden" in
*both* states, and the handler was `setGate({ state: 'open' })` — so a build the
server had refused with a minimum version could open the entire app by pressing
one button.

And `contentSource` was read from `process.env` in `CatalogContext`, so the one
flag with an obvious operational use — pull published content back when a
publish goes wrong — could only be changed by shipping a binary.

## Decision

**`RemoteConfigContext` is the single runtime source of truth.** Flags live in
state, so a change re-renders whatever depends on them. `platform/config` keeps
a mirror for the code that is not React — the notification scheduler, the outbox
worker — and the context is what writes to it. One set of values, two shapes.

It refreshes on mount, on reconnect, and on return to the foreground. Not on a
timer: a reader who leaves the app open all day is not the case a kill switch
has to reach quickly, and polling costs battery for nothing.

**Nothing mounts until the first fetch settles.** Rendering children first, to
avoid a flash, meant the catalogue started a remote refresh under the *shipped*
flags — so a maintenance switch that turns remote content off was beaten to it
by a fetch that had already gone out. Measured: six Storage requests during
maintenance before, zero after. The splash is already up, so waiting costs
nothing visible, and the fetch is bounded by `CONFIG_TIMEOUT_MS` so it cannot
hang: an app that will not open because a config service is slow is worse than
one that opens with the flags it shipped with.

**A disabled feature is unreachable, not merely unadvertised.** Hiding the
button leaves the route open to a deep link, a notification scheduled before the
switch was thrown, and navigation state restored from a previous launch. So
there are three layers: `routeRequirement` maps a route to the flag it needs,
`routeFromNotificationData` consults the flags, and `FeatureGate` makes the
screen refuse for itself — which also covers the flag flipping while it is open.

Settings screens are deliberately never gated: a reader must always be able to
reach the place that explains why something is unavailable.

**Maintenance is a scoped exception; a forced update is not.** Maintenance can
be carried past into a shell where the backend-dependent flags are off
(`contentSource: 'mock'`, `downloadsEnabled: false`) and what is already on the
device keeps working — which is exactly what the maintenance copy promises. The
gate stays `maintenance`; it is not declared open. A forced update has no way
past it at all, because there is no subset of a build too old to be trusted with
the current data that is knowably safe.

## Consequences

- The acknowledgement is per session. Relaunching shows the maintenance notice
  again, which is right: it is a decision, and the situation may have changed.
  It is cleared automatically when the gate re-opens.
- `npm run seed:emulator -- --gate=maintenance` and `--off=reviewEnabled` put a
  local environment into states that were otherwise only reachable by
  hand-editing Firestore, which is how they went untested.
- `aiTutorEnabled` has no route and no consumer. It stays off by default and
  cannot be switched on remotely at all — ADR 18's narrowing rule refuses any
  remote `true`.
- Verified against the running app with real remote config: killing review made
  `/review` land on Home; maintenance produced zero Storage requests and offered
  no download; a forced update rendered with a single action and no way through;
  and restoring the config brought everything back.
