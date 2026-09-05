import { getFlags, isEnabled, resetFlags, setFlags, DEFAULT_FLAGS } from '@/platform/config';
import { isAllowedRoute, isRouteEnabled, routeFromNotificationData, routeRequirement } from '@/platform/deep-links';
import { MAINTENANCE_FLAGS } from '@/context/RemoteConfigContext';
import { readGate } from '@/platform/app-gate';

/**
 * A flag that changes nothing is decoration.
 *
 * Every kill switch was declared, tested as a *value*, and read by nothing —
 * so each of these asserts the behaviour the flag is supposed to control, not
 * that the boolean round-trips.
 */

beforeEach(() => {
  resetFlags();
});

describe('the flags a service reads', () => {
  it('mirror whatever the reactive source last decided', () => {
    setFlags({ ...DEFAULT_FLAGS, remindersEnabled: false });

    expect(isEnabled('remindersEnabled')).toBe(false);
    expect(getFlags().remindersEnabled).toBe(false);
  });

  it('return to the shipped defaults on reset', () => {
    setFlags({ ...DEFAULT_FLAGS, downloadsEnabled: false });
    resetFlags();

    expect(getFlags()).toEqual(DEFAULT_FLAGS);
  });

  /** Handing out the live object would let a caller change it by accident. */
  it('hand out a copy, not the live set', () => {
    const flags = getFlags();
    flags.downloadsEnabled = false;

    expect(isEnabled('downloadsEnabled')).toBe(true);
  });
});

describe('routes that only exist while their feature is on', () => {
  it('names the flag the review queue needs', () => {
    expect(routeRequirement('/review')).toBe('reviewEnabled');
    expect(routeRequirement('/review/session')).toBe('reviewEnabled');
  });

  it('leaves ordinary routes unguarded', () => {
    for (const route of ['/', '/explore', '/garden', '/seed/seed-anchoring']) {
      expect(routeRequirement(route)).toBeUndefined();
      expect(isRouteEnabled(route, { ...DEFAULT_FLAGS, reviewEnabled: false })).toBe(true);
    }
  });

  /**
   * Settings must stay reachable however much is switched off — it is where a
   * reader finds out *why* something is unavailable.
   */
  it('never gates a settings screen', () => {
    for (const route of ['/settings/notifications', '/settings/storage']) {
      expect(routeRequirement(route)).toBeUndefined();
    }
  });

  it('closes the review route when the feature is off', () => {
    const off = { ...DEFAULT_FLAGS, reviewEnabled: false };

    expect(isRouteEnabled('/review', DEFAULT_FLAGS)).toBe(true);
    expect(isRouteEnabled('/review', off)).toBe(false);
  });
});

describe('a notification scheduled before the switch was thrown', () => {
  const payload = { route: '/review' };

  it('opens the route while the feature is on', () => {
    expect(routeFromNotificationData(payload, DEFAULT_FLAGS)).toBe('/review');
  });

  // The case that makes hiding a button insufficient: this reminder was
  // scheduled days ago and arrives after the feature was killed.
  it('opens nothing once it is off', () => {
    expect(
      routeFromNotificationData(payload, { ...DEFAULT_FLAGS, reviewEnabled: false })
    ).toBeNull();
  });

  it('still refuses a malformed target, flags or no flags', () => {
    expect(routeFromNotificationData({ route: '//evil.example' }, DEFAULT_FLAGS)).toBeNull();
    expect(isAllowedRoute('//evil.example')).toBe(false);
  });
});

describe('maintenance is a scoped exception, not an open gate', () => {
  /**
   * The previous version set the gate to `open`, which is how a build the
   * server had put into maintenance ended up running the whole app.
   */
  it('turns off exactly what needs the backend, and nothing else', () => {
    const during = { ...DEFAULT_FLAGS, ...MAINTENANCE_FLAGS };

    expect(during.contentSource).toBe('mock');
    expect(during.downloadsEnabled).toBe(false);
    // What is already on the device keeps working — that is the promise the
    // maintenance copy makes.
    expect(during.reviewEnabled).toBe(true);
    expect(during.remindersEnabled).toBe(true);
  });

  it('never switches anything on', () => {
    for (const value of Object.values(MAINTENANCE_FLAGS)) {
      if (typeof value === 'boolean') expect(value).toBe(false);
    }
  });

  it('leaves the gate reading maintenance rather than open', () => {
    expect(readGate({ maintenance: true }, '1.0.0').state).toBe('maintenance');
  });
});

describe('a forced update', () => {
  it('is what the gate reports for a build below the minimum', () => {
    expect(readGate({ minimumVersion: '2.0.0' }, '1.0.0')).toEqual({
      state: 'update-required',
      minimumVersion: '2.0.0',
    });
  });

  /**
   * There is no flag set that makes a too-old build safe, which is why the
   * screen offers no way past it — unlike maintenance.
   */
  it('has no offline subset defined for it', () => {
    const gate = readGate({ minimumVersion: '2.0.0' }, '1.0.0');
    expect(gate.state).toBe('update-required');
    expect(gate).not.toHaveProperty('allowOffline');
  });
});

describe('the AI tutor', () => {
  it('ships off', () => {
    expect(DEFAULT_FLAGS.aiTutorEnabled).toBe(false);
  });

  it('has no route that could reach it', () => {
    for (const route of ['/tutor', '/ai', '/chat']) {
      expect(isAllowedRoute(route)).toBe(false);
    }
  });
});
