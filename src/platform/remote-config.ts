import { applyRemoteFlags, type FeatureFlags } from '@/platform/config';
import { readGate, type GateState, type RemoteAppConfig } from '@/platform/app-gate';

/**
 * Fetching the one document that can change how a shipped binary behaves.
 *
 * `appConfig/public` is world-readable and server-written. It carries three
 * things: whether the service is in maintenance, the oldest build still
 * allowed, and feature flag overrides.
 *
 * Everything here **fails open**. An unreachable, malformed or absent document
 * leaves the app exactly as it shipped — a kill switch that bricks the app when
 * the config service has a bad day is worse than the problem it solves, and
 * `applyRemoteFlags` can only ever *narrow* what is already on.
 */

export interface RemoteState {
  gate: GateState;
  flags: FeatureFlags;
  fetchedAt: string | null;
}

export type ConfigFetcher = () => Promise<RemoteAppConfig | null>;

/** Reads `appConfig/public` through the Firestore SDK, lazily. */
export const firestoreConfigFetcher: ConfigFetcher = async () => {
  const [{ getDb, isFirebaseConfigured }, { doc, getDoc }] = await Promise.all([
    import('@/data/remote/firebase-app'),
    import('firebase/firestore'),
  ]);
  if (!isFirebaseConfigured) return null;

  const snapshot = await getDoc(doc(getDb(), 'appConfig', 'public'));
  return snapshot.exists() ? (snapshot.data() as RemoteAppConfig) : null;
};

/**
 * Applies remote configuration, or changes nothing.
 *
 * The flags are applied first and the gate is derived from the same document,
 * so a build never ends up honouring half of one fetch and half of another.
 */
/**
 * How long the app waits to be told what it may do.
 *
 * Nothing mounts until this settles, so it cannot be unbounded: a Firestore
 * read against an unreachable host does not fail quickly, and an app that will
 * not open because a config service is slow is worse than one that opens with
 * the flags it shipped with.
 */
export const CONFIG_TIMEOUT_MS = 4000;

const withTimeout = <T,>(work: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    work,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error('config-timeout')), ms)
    ),
  ]);

export async function refreshRemoteConfig(
  appVersion: string,
  fetch: ConfigFetcher = firestoreConfigFetcher,
  timeoutMs = CONFIG_TIMEOUT_MS
): Promise<RemoteState> {
  let config: RemoteAppConfig | null = null;

  try {
    config = await withTimeout(fetch(), timeoutMs);
  } catch {
    // Unreachable is the same as absent: the binary's own defaults stand.
    return { gate: { state: 'open' }, flags: applyRemoteFlags({}), fetchedAt: null };
  }

  const flags = applyRemoteFlags(
    config?.flags && typeof config.flags === 'object' && !Array.isArray(config.flags)
      ? (config.flags as Record<string, unknown>)
      : {}
  );

  return { gate: readGate(config, appVersion), flags, fetchedAt: new Date().toISOString() };
}
