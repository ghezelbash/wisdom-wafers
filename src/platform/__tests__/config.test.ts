import { applyRemoteFlags, DEFAULT_FLAGS, getFlags, isEnabled, resetFlags } from '@/platform/config';

beforeEach(() => {
  resetFlags();
});

describe('defaults', () => {
  it('are safe without any remote configuration', () => {
    expect(getFlags()).toEqual(DEFAULT_FLAGS);
  });

  // The blueprint is explicit: no AI feature until it is grounded and guarded.
  it('keep the AI tutor off', () => {
    expect(isEnabled('aiTutorEnabled')).toBe(false);
  });
});

describe('remote values', () => {
  it('can turn a feature off', () => {
    applyRemoteFlags({ downloadsEnabled: false });
    expect(isEnabled('downloadsEnabled')).toBe(false);
  });

  it('ignores a key no flag defines', () => {
    applyRemoteFlags({ somethingNew: true });
    expect(getFlags()).toEqual(DEFAULT_FLAGS);
  });

  it('ignores a value of the wrong type rather than coercing it', () => {
    applyRemoteFlags({ downloadsEnabled: 'false' });
    expect(isEnabled('downloadsEnabled')).toBe(true);
  });

  it('leaves untouched flags alone', () => {
    applyRemoteFlags({ reviewEnabled: false });
    expect(isEnabled('remindersEnabled')).toBe(true);
  });
});
