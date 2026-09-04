import { validateParams, type EventMap, type EventName } from './events';

/**
 * Analytics, with the transport left open.
 *
 * Native Analytics arrives with the React Native Firebase migration; until
 * then events are validated, buffered and logged, so the taxonomy is exercised
 * from the start rather than bolted on at the end. Nothing here blocks a
 * screen: a failure to record is never a failure to use the app.
 */

export interface AnalyticsSink {
  track(name: string, params: Record<string, unknown>): void;
}

/** Context attached to every event and to error reports. */
let context: Record<string, string | number | boolean> = {};

let sink: AnalyticsSink = {
  track(name, params) {
    if (__DEV__) console.log('[analytics]', name, params);
  },
};

export function setAnalyticsSink(next: AnalyticsSink) {
  sink = next;
}

/** Route, seed, revision, online state — never an answer or a search term. */
export function setAnalyticsContext(next: Record<string, string | number | boolean>) {
  context = { ...context, ...next };
}

export function getAnalyticsContext() {
  return { ...context };
}

export function track<K extends EventName>(name: K, params: EventMap[K]): void {
  const payload = { ...context, ...(params as Record<string, unknown>) };
  const issues = validateParams(payload);

  if (issues.length) {
    // Dropped rather than sent: a PII leak is not something to fix after the
    // fact, and the loud failure in development is the point.
    if (__DEV__) {
      console.error('[analytics] refused event with unsafe parameters', name, issues);
    }
    return;
  }

  try {
    sink.track(name, payload);
  } catch {
    // Telemetry must never take a screen down with it.
  }
}
