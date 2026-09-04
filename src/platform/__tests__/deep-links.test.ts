import { isAllowedRoute, routeFromNotificationData } from '@/platform/deep-links';

/**
 * A notification payload is untrusted input.
 *
 * The check this replaces was `route.startsWith('/')`, which accepts
 * `//evil.example/x` — a protocol-relative URL that several link handlers read
 * as `https://evil.example/x`. A slash test is not a same-app test.
 */

describe('routes this build actually has', () => {
  it.each([
    '/',
    '/explore',
    '/garden',
    '/profile',
    '/search',
    '/review',
    '/settings/notifications',
    '/settings/storage',
    '/seed/seed-sky-darkness',
    '/topic/astronomy',
    '/path/path-thinking-clearly',
  ])('allows %s', (route) => {
    expect(isAllowedRoute(route)).toBe(true);
  });
});

describe('anything that could leave the app', () => {
  it('refuses a protocol-relative URL, whatever it starts with', () => {
    expect(isAllowedRoute('//evil.example/x')).toBe(false);
    expect(isAllowedRoute('///evil.example')).toBe(false);
  });

  it.each([
    'https://evil.example/x',
    'javascript:alert(1)',
    'dananeh://seed/x',
    'file:///etc/passwd',
    '/seed/../../settings/delete-account',
    '/seed/a\\b',
    '/explore?next=https://evil.example',
    '/explore#//evil.example',
  ])('refuses %s', (route) => {
    expect(isAllowedRoute(route)).toBe(false);
  });

  it('refuses a route this build does not have', () => {
    expect(isAllowedRoute('/admin')).toBe(false);
    expect(isAllowedRoute('/settings/delete-account')).toBe(false);
    expect(isAllowedRoute('/seed')).toBe(false);
    expect(isAllowedRoute('/seed/a/b')).toBe(false);
  });

  it('refuses an id outside the slug alphabet', () => {
    expect(isAllowedRoute('/seed/a b')).toBe(false);
    expect(isAllowedRoute('/seed/%2e%2e')).toBe(false);
    expect(isAllowedRoute(`/seed/${'a'.repeat(65)}`)).toBe(false);
  });

  it('refuses anything that is not a string', () => {
    for (const value of [null, undefined, 42, {}, ['/'], true]) {
      expect(isAllowedRoute(value)).toBe(false);
    }
  });
});

describe('reading a notification payload', () => {
  it('opens the route it named when the route is allowed', () => {
    expect(routeFromNotificationData({ route: '/seed/seed-anchoring' })).toBe(
      '/seed/seed-anchoring'
    );
  });

  it('opens nothing rather than something when it is not', () => {
    expect(routeFromNotificationData({ route: '//evil.example' })).toBeNull();
    expect(routeFromNotificationData({ route: '/settings/delete-account' })).toBeNull();
    expect(routeFromNotificationData({})).toBeNull();
    expect(routeFromNotificationData(null)).toBeNull();
    expect(routeFromNotificationData('/')).toBeNull();
  });
});
