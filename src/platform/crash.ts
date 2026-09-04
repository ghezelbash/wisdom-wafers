import { getAnalyticsContext } from '@/platform/analytics';
import { appVariant, appVersion } from '@/platform/app-info';

/**
 * Crash and error reporting.
 *
 * A release without crash telemetry is blind: the only signal is a reader
 * bothering to say something, and almost nobody does. This is the transport-
 * agnostic half — what a report contains, and what must never be in it.
 *
 * Crashlytics itself needs React Native Firebase, which needs a development
 * build; the seam is `CrashSink`, and the native migration replaces the
 * implementation without touching a call site. Until then the callable sink
 * writes to `crashReports`, which is visible in the Firebase console.
 */

export interface CrashReport {
  /** The error's own message, scrubbed. */
  message: string;
  /** Where it happened, from the analytics context: route, seed, revision. */
  context: Record<string, string | number | boolean>;
  /** Trimmed: the top frames are the ones that identify a crash. */
  stack?: string;
  fatal: boolean;
  appVersion: string;
  appVariant: string;
  occurredAt: string;
}

export interface CrashSink {
  report(report: CrashReport): void;
}

/**
 * Things that must not travel in a crash report.
 *
 * An exception message is the least controlled string in the app: it can carry
 * a URL with a token, an email a reader typed, or a fragment of their own
 * reflection. The same reasoning as the analytics guard — but a crash cannot be
 * *refused*, because then the crash is invisible. So it is redacted instead,
 * and the redaction is visible in the report.
 */
const REDACTIONS: { pattern: RegExp; as: string }[] = [
  { pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/g, as: '«email»' },
  { pattern: /\b(?:eyJ|AIza|ya29\.)[\w.-]{10,}/g, as: '«token»' },
  { pattern: /https?:\/\/[^\s"')]+/g, as: '«url»' },
  { pattern: /\b\d{9,}\b/g, as: '«digits»' },
  // Any run of Persian text long enough to be prose rather than an identifier.
  { pattern: /[؀-ۿ][؀-ۿ\s]{24,}/g, as: '«text»' },
];

export function scrub(input: string, max = 500): string {
  let output = input;
  for (const { pattern, as } of REDACTIONS) output = output.replace(pattern, as);
  return output.slice(0, max);
}

/** Only the frames that identify the crash; deeper ones are framework noise. */
export function trimStack(stack: string | undefined, frames = 12): string | undefined {
  if (!stack) return undefined;
  return scrub(stack.split('\n').slice(0, frames).join('\n'), 2000);
}

let sink: CrashSink = {
  report(report) {
    if (__DEV__) console.error('[crash]', report.message, report.context);
  },
};

export function setCrashSink(next: CrashSink) {
  sink = next;
}

export function buildCrashReport(
  error: unknown,
  options: { fatal?: boolean; extra?: Record<string, string | number | boolean> } = {}
): CrashReport {
  const asError = error instanceof Error ? error : new Error(String(error));

  return {
    message: scrub(`${asError.name}: ${asError.message}`),
    // Route, seed and revision ride along, so a crash names what the reader was
    // looking at without naming the reader.
    context: { ...getAnalyticsContext(), ...(options.extra ?? {}) },
    stack: trimStack(asError.stack),
    fatal: options.fatal ?? false,
    appVersion: appVersion(),
    appVariant: appVariant(),
    occurredAt: new Date().toISOString(),
  };
}

/** Records an error. Never throws — telemetry must not take a screen down. */
export function reportError(
  error: unknown,
  options: { fatal?: boolean; extra?: Record<string, string | number | boolean> } = {}
): CrashReport | null {
  try {
    const report = buildCrashReport(error, options);
    sink.report(report);
    return report;
  } catch {
    return null;
  }
}

/**
 * A deliberate crash, for proving the pipeline works end to end.
 *
 * Reachable only from a non-production build. Verifying crash reporting by
 * waiting for a real crash means finding out it was broken at the worst
 * possible moment.
 */
export function forceTestCrash(): void {
  if (appVariant() === 'production') return;
  throw new Error('DananehTestCrash: deliberate crash to verify reporting');
}
