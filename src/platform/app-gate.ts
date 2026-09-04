/**
 * Whether this build may run at all.
 *
 * Two states the handoff wrote copy for and nothing could ever trigger, because
 * they need a backend to say so: **maintenance**, when the service is
 * deliberately down, and **update required**, when a build is too old to be
 * trusted with the current data.
 *
 * Both are read from `appConfig/public`, which is world-readable and
 * server-written. Both fail *open*: an unreachable, malformed or absent config
 * leaves the app running. A kill switch that bricks the app when the config
 * service has a bad day is worse than the problem it solves.
 */

export type GateState =
  | { state: 'open' }
  | { state: 'maintenance'; message?: string; until?: string }
  | { state: 'update-required'; minimumVersion: string };

/**
 * Compares dotted numeric versions.
 *
 * Not a full semver implementation on purpose: `appVersion` is `major.minor.patch`
 * from `app.config.ts`, and anything richer would be a version this comparison
 * has no defined answer for. A part that is not a number is read as 0, so a
 * malformed remote value can only ever make the app *more* permissive.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) =>
    String(value)
      .split('.')
      .map((part) => {
        const number = Number.parseInt(part, 10);
        return Number.isFinite(number) && number >= 0 ? number : 0;
      });

  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

export const isBelowMinimum = (current: string, minimum: string) =>
  compareVersions(current, minimum) < 0;

/** The shape of `appConfig/public`. Everything is optional by design. */
export interface RemoteAppConfig {
  maintenance?: unknown;
  maintenanceMessage?: unknown;
  maintenanceUntil?: unknown;
  minimumVersion?: unknown;
  flags?: unknown;
}

const asString = (value: unknown, max = 400): string | undefined =>
  typeof value === 'string' && value.trim().length && value.length <= max
    ? value.trim()
    : undefined;

/**
 * Reads the gate out of a remote document.
 *
 * Every field is validated for type before it is believed. A remote value that
 * is the wrong shape is ignored rather than coerced — coercion is how a typo in
 * a console field turns into every reader seeing a locked app.
 */
export function readGate(config: RemoteAppConfig | null | undefined, appVersion: string): GateState {
  if (!config) return { state: 'open' };

  if (config.maintenance === true) {
    return {
      state: 'maintenance',
      message: asString(config.maintenanceMessage),
      until: asString(config.maintenanceUntil, 40),
    };
  }

  const minimumVersion = asString(config.minimumVersion, 32);
  // Only a version that parses to something greater than this build closes the
  // gate. A malformed one compares as 0.0.0 and lets everyone through.
  if (minimumVersion && isBelowMinimum(appVersion, minimumVersion)) {
    return { state: 'update-required', minimumVersion };
  }

  return { state: 'open' };
}
