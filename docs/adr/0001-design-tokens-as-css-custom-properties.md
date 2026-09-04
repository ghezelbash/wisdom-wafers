# 1. Design tokens as CSS custom properties

Date: 2026-09-03 · Status: accepted

## Context

The design handoff ships a semantic token set with a light and a dark value for
every token. NativeWind's usual answer is a `dark:` variant on every colour
class, which doubles the class list on every element and makes a missed variant
invisible until someone opens the app in dark mode.

## Decision

Colours are CSS custom properties declared once in `global.css`, swapped under
`prefers-color-scheme`, and referenced by name in `tailwind.config.js`. A class
like `bg-card` is therefore already theme-aware. `src/constants/theme.ts` holds
the same values for JS-side consumers (SVG, the native tab bar, StatusBar).

## Consequences

- No `dark:` variants for colour anywhere; a new token is added in two places.
- The two files must stay in step — stated in `AGENTS.md`.
- Verified: `react-native-css-interop` stores root variables per colour scheme,
  so this resolves on native as well as web.
