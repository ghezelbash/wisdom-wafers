import { Platform } from 'react-native';

import { __resetAppCheck, appCheckStatus, ensureAppCheck } from '@/data/remote/app-check';

/**
 * App Check is prepared, not enabled.
 *
 * What these hold onto is the honesty of the state: a build that cannot attest
 * must say so, rather than appearing configured and quietly sending nothing.
 */

beforeEach(() => {
  __resetAppCheck();
});

describe('a build that cannot attest', () => {
  it('says so instead of failing, on native', async () => {
    // The JS SDK attests with reCAPTCHA, which needs a DOM. Play Integrity and
    // DeviceCheck are native modules the JS SDK cannot reach.
    expect(Platform.OS).not.toBe('web');
    await expect(ensureAppCheck({})).resolves.toBe('unsupported-platform');
  });

  it('never throws, because startup must not depend on it', async () => {
    await expect(ensureAppCheck(undefined)).resolves.toBeDefined();
  });

  it('records the decision so the state can be reported', async () => {
    expect(appCheckStatus()).toBeNull();
    await ensureAppCheck({});
    expect(appCheckStatus()).toBe('unsupported-platform');
  });

  it('decides once rather than on every Firebase call', async () => {
    const first = await ensureAppCheck({});
    const second = await ensureAppCheck({});

    expect(second).toBe(first);
  });
});
