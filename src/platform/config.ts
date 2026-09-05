/**
 * Feature flags and kill switches.
 *
 * Defaults live in the binary and are safe on their own: if the config service
 * is unreachable — or has never been configured — the app behaves exactly as
 * shipped. Remote Config only ever narrows what is on, which is what makes a
 * kill switch trustworthy.
 */
export interface FeatureFlags {
  /** Where the catalogue comes from. */
  contentSource: 'mock' | 'remote';
  /** Downloads for offline reading. */
  downloadsEnabled: boolean;
  /** The review session and the due queue. */
  reviewEnabled: boolean;
  /** Local reminders. */
  remindersEnabled: boolean;
  /**
   * Off until there is retrieval from an approved corpus, citations,
   * prompt-injection defence, rate limits and a safety classifier — the
   * blueprint is explicit that this stays dark.
   */
  aiTutorEnabled: boolean;
}

export const DEFAULT_FLAGS: FeatureFlags = {
  contentSource: process.env.EXPO_PUBLIC_CONTENT_SOURCE === 'remote' ? 'remote' : 'mock',
  downloadsEnabled: true,
  reviewEnabled: true,
  remindersEnabled: true,
  aiTutorEnabled: false,
};

/**
 * The mirror, for code that is not React.
 *
 * `RemoteConfigContext` is the source of truth and writes here whenever the
 * effective flags change; the outbox worker, the notification scheduler and
 * anything else outside the tree read it. Two shapes, one set of values —
 * never two sets.
 */
let flags: FeatureFlags = { ...DEFAULT_FLAGS };

export const getFlags = (): FeatureFlags => ({ ...flags });

export const isEnabled = <K extends keyof FeatureFlags>(flag: K) => flags[flag];

/** Written by `RemoteConfigContext`. Nothing else should call it. */
export function setFlags(next: FeatureFlags) {
  flags = { ...next };
}

/**
 * Applies remote values.
 *
 * Three rules, and the third is the one that makes a kill switch trustworthy:
 *
 *  1. only keys that already exist are read — a remote payload cannot
 *     introduce a flag no code knows about;
 *  2. only with the type the default has — it cannot turn a boolean into a
 *     string;
 *  3. **it can only narrow.** A boolean may go `true → false`, never
 *     `false → true`.
 *
 * Rule 3 is why a compromised or mistyped remote value cannot switch on
 * something this binary was shipped with off — the AI tutor, most of all, which
 * stays dark until it is grounded, cited and rate-limited. Turning a feature
 * *on* is a release, not a config change.
 *
 * `contentSource` is the exception the rule needs: it is not a boolean, and
 * moving between `mock` and `remote` is not "more on" in either direction. It
 * follows rules 1 and 2 only.
 */
export function applyRemoteFlags(remote: Record<string, unknown>): FeatureFlags {
  const next = { ...flags };

  for (const key of Object.keys(DEFAULT_FLAGS) as (keyof FeatureFlags)[]) {
    const value = remote[key];
    if (value === undefined) continue;
    if (typeof value !== typeof DEFAULT_FLAGS[key]) continue;

    // Narrowing only: a remote value may switch something off, never on.
    if (typeof value === 'boolean' && value === true) continue;

    (next as Record<string, unknown>)[key] = value;
  }

  flags = next;
  return getFlags();
}

/** Restores the shipped defaults — used by tests and by a config reset. */
export function resetFlags() {
  flags = { ...DEFAULT_FLAGS };
}
