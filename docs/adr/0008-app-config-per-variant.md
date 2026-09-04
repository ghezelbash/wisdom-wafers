# 8. `app.config.ts` with per-variant identity

Date: 2026-09-03 · Status: accepted

## Context

The project shipped as `wisdom-wafers` with the scheme `wisdomwafers`, and the
blueprint requires separate dev, staging and production identities so all three
can coexist on a device and a deep link cannot open the wrong build.

## Decision

`app.json` is replaced by `app.config.ts`, keyed on `APP_VARIANT`:
`com.dananeh.app{,.staging,.dev}` with schemes `dananeh{,-staging,-dev}`, name
suffixes for the non-production builds, and the Persian display name via
`locales`.

## Consequences

- The app has never been distributed, so the old scheme needs no alias period.
- Splash and adaptive-icon colours now come from the design tokens; the icon
  artwork itself is still Expo's placeholder and needs design.
- EAS profiles in a later goal map one-to-one onto these variants.
