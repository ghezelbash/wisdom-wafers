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

/** The route a notification wants opened, if it named one this build allows. */
export function routeFromNotificationData(data: unknown): string | null {
  const route = (data as { route?: unknown })?.route;
  return isAllowedRoute(route) ? route : null;
}

/** The deep link for one seed, for anything that needs to construct one. */
export const seedRoute = (seedId: string) => `/seed/${seedId}`;
