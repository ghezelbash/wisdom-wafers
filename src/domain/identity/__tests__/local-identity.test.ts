import { LocalIdentityRepository } from '@/data/repositories/local-identity-repository';
import { AuthError, isLocalUid } from '@/domain/identity/types';

/**
 * The identity a build with no backend falls back to.
 *
 * "Signing in does not work" turned out to be configuration, not a network
 * failure: a development build does not reach a real Firebase project unless
 * told to, so this repository is what serves a credential action. It used to
 * report `network`, which sends whoever reads it to check their wifi for
 * something only the person who built the app can fix.
 */
describe('a build with no backend', () => {
  it('reports a configuration problem, not a connection one', async () => {
    const repository = new LocalIdentityRepository();

    for (const action of [
      () => repository.signIn(),
      () => repository.linkEmailPassword(),
      () => repository.sendPasswordReset(),
      () => repository.sendVerificationEmail(),
    ]) {
      await expect(action()).rejects.toBeInstanceOf(AuthError);
      await expect(action()).rejects.toMatchObject({ code: 'notConfigured' });
    }
  });

  /** Guest-first is not conditional on a backend being reachable. */
  it('still gives the reader a stable identity', async () => {
    const identity = await new LocalIdentityRepository().ensureSignedIn();

    expect(identity.uid).toBeTruthy();
    expect(isLocalUid(identity.uid)).toBe(true);
    expect(identity.source).toBe('local');
    expect(identity.email).toBeNull();
  });

  it('keeps the same uid across calls, so progress has one owner', async () => {
    const repository = new LocalIdentityRepository();
    const first = await repository.ensureSignedIn();
    const second = await repository.ensureSignedIn();

    expect(second.uid).toBe(first.uid);
  });
});

describe('every auth failure has a locale string', () => {
  it('names one for each code the identity layer can raise', () => {
    // A code with no string renders as the raw key, which is how a Firebase
    // error reaches a reader by accident.
    const fa = require('@/locales/fa.json');
    const en = require('@/locales/en.json');

    const codes = [
      'invalidEmail',
      'weakPassword',
      'emailInUse',
      'invalidCredential',
      'tooManyRequests',
      'network',
      'notConfigured',
      'notAllowed',
      'requiresRecentLogin',
      'unknown',
    ];

    for (const code of codes) {
      expect(typeof fa.authError[code]).toBe('string');
      expect(typeof en.authError[code]).toBe('string');
    }
  });
});
