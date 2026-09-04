import type { FeatureFlags } from '@/platform/config';

/**
 * Where a notification or a link is allowed to send a reader.
 *
 * A notification payload is untrusted input. The previous check — "starts with
 * a slash" — accepts `//evil.example/x`, which is a *protocol-relative URL*:
 * the browser and several link handlers read it as `https://evil.example/x`,
 * so a slash test is not a same-app test.
 *
 * So this is an allow-list of the routes that exist, matched whole. A target
 * this build does not recognise opens nothing rather than something.
 */

/** Routes with no parameter. */
const EXACT = new Set([
  '/',
  '/explore',
  '/garden',
  '/profile',
  '/search',
  '/review',
  '/settings/notifications',
  '/settings/storage',
]);

/** Routes that take exactly one id segment. */
const WITH_ID = ['/seed', '/topic', '/path'] as const;

/**
 * The characters an id may contain.
 *
 * Deliberately narrow: seed and topic ids are slugs the pipeline generates, and
 * anything outside this set is either an encoding trick or a bug.
 */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Routes that only exist while a feature is on.
 *
 * A disabled feature has to be unreachable, not merely unadvertised: hiding the
 * button leaves the route open to a deep link, a notification that was
 * scheduled before the switch was thrown, and navigation state restored from a
 * previous launch.
 *
 * Settings screens are deliberately absent — a reader must always be able to
 * reach the place that explains why something is unavailable.
 */
const ROUTE_REQUIRES: Record<string, keyof FeatureFlags> = {
  '/review': 'reviewEnabled',
};

/** The flag a route needs, if it needs one. */
export function routeRequirement(route: string): keyof FeatureFlags | undefined {
  const [, segment] = route.split('/');
  return ROUTE_REQUIRES[`/${segment}`];
}

/**
 * Whether this build may open the route *right now*.
 *
 * Separate from `isAllowedRoute`, which asks whether the route exists at all:
 * one is about the shape of the target, the other about the current
 * configuration, and conflating them makes a kill switch look like a malformed
 * link.
 */
export function isRouteEnabled(route: string, flags: FeatureFlags): boolean {
  const required = routeRequirement(route);
  return required === undefined || flags[required] === true;
}

export function isAllowedRoute(candidate: unknown): candidate is string {
  if (typeof candidate !== 'string') return false;

  // One leading slash exactly. Two is a protocol-relative URL; a backslash is
  // treated as a slash by some parsers and not others, which is worse.
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return false;
  if (candidate.includes('\\') || candidate.includes('..')) return false;

  // No scheme, host, query or fragment: this is a route, not a URL.
  if (/[?#]/.test(candidate) || candidate.includes('://')) return false;

  if (EXACT.has(candidate)) return true;

  const segments = candidate.split('/');
  // ['', 'seed', 'the-id'] — a leading empty segment and exactly two more.
  if (segments.length !== 3) return false;

  const prefix = `/${segments[1]}`;
  return (WITH_ID as readonly string[]).includes(prefix) && ID.test(segments[2]);
}

/**
 * The route a notification wants opened, if it named one this build allows.
 *
 * `flags` is optional so the shape check can be used on its own; when it is
 * given, a reminder scheduled before a feature was switched off opens nothing
 * rather than a screen that should no longer exist.
 */
export function routeFromNotificationData(
  data: unknown,
  flags?: FeatureFlags
): string | null {
  const route = (data as { route?: unknown })?.route;
  if (!isAllowedRoute(route)) return null;
  if (flags && !isRouteEnabled(route, flags)) return null;
  return route;
}

/** The deep link for one seed, for anything that needs to construct one. */
export const seedRoute = (seedId: string) => `/seed/${seedId}`;
