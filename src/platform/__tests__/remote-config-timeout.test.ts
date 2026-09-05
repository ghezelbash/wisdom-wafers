import { refreshRemoteConfig, withTimeout } from '@/platform/remote-config';
import { DEFAULT_FLAGS } from '@/platform/config';

/**
 * A race leaves the loser running.
 *
 * `Promise.race` settles on the first result and abandons the rest, but the
 * `setTimeout` behind the loser stays armed and holds the event loop open until
 * it fires. Eight of them survived every unit run — Jest reported eight open
 * `Timeout` handles and force-exited, which is the kind of warning that gets
 * suppressed rather than read. On a device it is a timer per refresh, and the
 * app refreshes on every foreground.
 */

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

/** Every timer Jest is still holding — the thing the leak showed up as. */
const pending = () => jest.getTimerCount();

describe('the timeout around a config fetch', () => {
  it('is cleared when the work wins', async () => {
    const promise = withTimeout(Promise.resolve('config'), 4000);

    await expect(promise).resolves.toBe('config');
    expect(pending()).toBe(0);
  });

  it('is cleared when the work rejects', async () => {
    const promise = withTimeout(Promise.reject(new Error('offline')), 4000);

    await expect(promise).rejects.toThrow('offline');
    expect(pending()).toBe(0);
  });

  it('is cleared when it fires', async () => {
    const promise = withTimeout(new Promise(() => {}), 4000);
    jest.advanceTimersByTime(4000);

    await expect(promise).rejects.toThrow('config-timeout');
    expect(pending()).toBe(0);
  });

  it('does not fire early', async () => {
    let settled = false;
    const promise = withTimeout(new Promise(() => {}), 4000).catch(() => {
      settled = true;
    });

    jest.advanceTimersByTime(3999);
    await Promise.resolve();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(1);
    await promise;
    expect(settled).toBe(true);
  });

  /** A slow answer that arrives after the timeout must change nothing. */
  it('ignores work that resolves after it has already given up', async () => {
    let resolve: (value: string) => void = () => {};
    const slow = new Promise<string>((settle) => {
      resolve = settle;
    });

    const promise = withTimeout(slow, 4000);
    jest.advanceTimersByTime(4000);
    await expect(promise).rejects.toThrow('config-timeout');

    resolve('too late');
    await Promise.resolve();
    expect(pending()).toBe(0);
  });

  it('leaves nothing behind however many times it runs', async () => {
    for (let round = 0; round < 8; round += 1) {
      await withTimeout(Promise.resolve(round), 4000);
    }
    expect(pending()).toBe(0);
  });
});

describe('refreshRemoteConfig', () => {
  it('keeps the shipped defaults when the fetch times out', async () => {
    const promise = refreshRemoteConfig('1.0.0', () => new Promise(() => {}), 4000);
    jest.advanceTimersByTime(4000);

    // Fails open: unreachable is the same as absent.
    await expect(promise).resolves.toEqual({
      gate: { state: 'open' },
      flags: DEFAULT_FLAGS,
      fetchedAt: null,
    });
    expect(pending()).toBe(0);
  });

  it('leaves no timer behind on a fetch that answers', async () => {
    const state = await refreshRemoteConfig('1.0.0', async () => ({ minimumVersion: '1.0.0' }));

    expect(state.gate).toEqual({ state: 'open' });
    expect(pending()).toBe(0);
  });

  it('leaves no timer behind on a fetch that throws', async () => {
    const state = await refreshRemoteConfig('1.0.0', async () => {
      throw new Error('permission-denied');
    });

    expect(state.fetchedAt).toBeNull();
    expect(pending()).toBe(0);
  });
});
