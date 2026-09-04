import { compareVersions, isBelowMinimum, readGate } from '@/platform/app-gate';
import { refreshRemoteConfig } from '@/platform/remote-config';
import { DEFAULT_FLAGS, getFlags, resetFlags } from '@/platform/config';

/**
 * The one document that can change how a shipped binary behaves.
 *
 * Everything here fails **open**. A kill switch that bricks the app when the
 * config service has a bad day is worse than the problem it solves, and the
 * asymmetry has to be asserted rather than intended.
 */

beforeEach(() => {
  resetFlags();
});

describe('comparing versions', () => {
  it('orders builds the obvious way', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
  });

  it('treats a missing part as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2', '1.2.1')).toBe(-1);
  });

  /** A typo in a console field must not lock every reader out. */
  it('reads an unparseable part as zero, so a malformed value only permits', () => {
    expect(compareVersions('1.0.0', 'not-a-version')).toBe(1);
    expect(isBelowMinimum('1.0.0', '')).toBe(false);
    expect(isBelowMinimum('1.0.0', 'latest')).toBe(false);
  });
});

describe('reading the gate', () => {
  it('is open with no document at all', () => {
    expect(readGate(null, '1.0.0')).toEqual({ state: 'open' });
    expect(readGate(undefined, '1.0.0')).toEqual({ state: 'open' });
    expect(readGate({}, '1.0.0')).toEqual({ state: 'open' });
  });

  it('closes for maintenance, carrying the message and the estimate', () => {
    expect(
      readGate(
        { maintenance: true, maintenanceMessage: 'به‌روزرسانی محتوا', maintenanceUntil: '۱۵:۰۰' },
        '1.0.0'
      )
    ).toEqual({ state: 'maintenance', message: 'به‌روزرسانی محتوا', until: '۱۵:۰۰' });
  });

  // Only `true`. "true", 1 and "yes" are typos, not instructions.
  it('does not accept a truthy value as maintenance', () => {
    for (const value of ['true', 1, 'yes', {}, []]) {
      expect(readGate({ maintenance: value }, '1.0.0')).toEqual({ state: 'open' });
    }
  });

  it('closes for a build older than the minimum', () => {
    expect(readGate({ minimumVersion: '1.2.0' }, '1.0.0')).toEqual({
      state: 'update-required',
      minimumVersion: '1.2.0',
    });
  });

  it('stays open for a build at or above the minimum', () => {
    expect(readGate({ minimumVersion: '1.0.0' }, '1.0.0').state).toBe('open');
    expect(readGate({ minimumVersion: '1.0.0' }, '2.0.0').state).toBe('open');
  });

  it('ignores a minimum that is not a usable string', () => {
    for (const value of [42, true, {}, '', '   ', 'x'.repeat(64)]) {
      expect(readGate({ minimumVersion: value }, '1.0.0').state).toBe('open');
    }
  });

  it('puts maintenance ahead of a version check', () => {
    expect(readGate({ maintenance: true, minimumVersion: '9.0.0' }, '1.0.0').state).toBe(
      'maintenance'
    );
  });
});

describe('applying the document', () => {
  it('narrows a flag the document turns off', async () => {
    const remote = await refreshRemoteConfig('1.0.0', async () => ({
      flags: { reviewEnabled: false },
    }));

    expect(remote.flags.reviewEnabled).toBe(false);
    expect(remote.gate.state).toBe('open');
    expect(remote.fetchedAt).not.toBeNull();
  });

  it('ignores a flag of the wrong type, and one nobody declared', async () => {
    const remote = await refreshRemoteConfig('1.0.0', async () => ({
      flags: { reviewEnabled: 'no', somethingInvented: true },
    }));

    expect(remote.flags.reviewEnabled).toBe(DEFAULT_FLAGS.reviewEnabled);
    expect(remote.flags).not.toHaveProperty('somethingInvented');
  });

  /**
   * What makes a kill switch trustworthy: it can only narrow. Turning a
   * feature *on* is a release, not a config change — and the AI tutor stays
   * dark until it is grounded, cited and rate-limited, whatever a document
   * somewhere says.
   */
  it('refuses to switch anything on that shipped off', async () => {
    const remote = await refreshRemoteConfig('1.0.0', async () => ({
      flags: { aiTutorEnabled: true },
    }));

    expect(remote.flags.aiTutorEnabled).toBe(false);
  });

  it('accepts switching off something that shipped on', async () => {
    const remote = await refreshRemoteConfig('1.0.0', async () => ({
      flags: { downloadsEnabled: false, remindersEnabled: false },
    }));

    expect(remote.flags.downloadsEnabled).toBe(false);
    expect(remote.flags.remindersEnabled).toBe(false);
  });

  it('cannot switch a flag back on once a document has switched it off', async () => {
    await refreshRemoteConfig('1.0.0', async () => ({ flags: { downloadsEnabled: false } }));
    const back = await refreshRemoteConfig('1.0.0', async () => ({
      flags: { downloadsEnabled: true },
    }));

    // Recovering from a kill switch is a restart, which restores the shipped
    // default — not a second remote value that could itself be wrong.
    expect(back.flags.downloadsEnabled).toBe(false);
  });

  it('ignores a flags field that is not an object', async () => {
    for (const flags of [null, 'off', 42, ['reviewEnabled']]) {
      const remote = await refreshRemoteConfig('1.0.0', async () => ({ flags }));
      expect(remote.flags).toEqual(DEFAULT_FLAGS);
    }
  });

  /** The failure mode that matters: the config service is down. */
  it('leaves the binary exactly as it shipped when the fetch throws', async () => {
    const remote = await refreshRemoteConfig('1.0.0', async () => {
      throw new Error('unreachable');
    });

    expect(remote.gate).toEqual({ state: 'open' });
    expect(remote.flags).toEqual(DEFAULT_FLAGS);
    expect(remote.fetchedAt).toBeNull();
    expect(getFlags()).toEqual(DEFAULT_FLAGS);
  });

  it('leaves it as shipped when there is no document', async () => {
    const remote = await refreshRemoteConfig('1.0.0', async () => null);
    expect(remote.gate).toEqual({ state: 'open' });
    expect(remote.flags).toEqual(DEFAULT_FLAGS);
  });
});
