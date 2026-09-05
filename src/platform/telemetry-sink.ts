import { eventId } from '@/domain/progress/events';
import { enqueue } from '@/lib/outbox';
import { setAnalyticsContext, setAnalyticsSink, type AnalyticsSink } from '@/platform/analytics';
import { installId, sessionId } from '@/platform/analytics/correlation';
import { appVariant, appVersion } from '@/platform/app-info';
import { setCrashSink, type CrashReport, type CrashSink } from '@/platform/crash';

/**
 * Getting telemetry off the device.
 *
 * Through the outbox, like everything else: an event recorded in airplane mode
 * is delivered when the connection comes back, and the server's per-item
 * acknowledgement decides whether it leaves the queue. That matters most for
 * crashes — the report describing why the app died offline is the one worth
 * having.
 *
 * The PII guard has already run by the time anything reaches here: `track`
 * refuses an unsafe event rather than sanitising it, so a refused event is
 * never queued. The server refuses again, because a client is not a trust
 * boundary.
 */

export const TELEMETRY_KIND = 'telemetry-event' as const;
export const CRASH_KIND = 'telemetry-crash' as const;

const outboxAnalyticsSink: AnalyticsSink = {
  track(name, params) {
    const id = eventId();
    void enqueue(TELEMETRY_KIND, id, {
      id,
      name,
      params,
      occurredAt: new Date().toISOString(),
      appVersion: appVersion(),
      appVariant: appVariant(),
    });
  },
};

const outboxCrashSink: CrashSink = {
  report(report: CrashReport) {
    const id = eventId();
    void enqueue(CRASH_KIND, id, {
      id,
      message: report.message,
      context: report.context,
      ...(report.stack ? { stack: report.stack } : {}),
      fatal: report.fatal,
      occurredAt: report.occurredAt,
      appVersion: report.appVersion,
      appVariant: report.appVariant,
    });
  },
};

/**
 * Points analytics and crash reporting at the queue.
 *
 * Called once at startup. Until it is, both keep their development sinks, which
 * log rather than send — so a test or a Storybook render never queues anything.
 */
export function installTelemetrySinks() {
  setAnalyticsSink(outboxAnalyticsSink);
  setCrashSink(outboxCrashSink);

  // Build context and the correlation key, on every event and every crash.
  // The session id is available synchronously so a crash during startup still
  // correlates; the install id arrives a tick later, when storage answers.
  setAnalyticsContext({
    session_id: sessionId(),
    app_version: appVersion(),
    env: appVariant(),
  });

  void installId()
    .then((id) => setAnalyticsContext({ install_id: id }))
    .catch(() => {
      // Already handled inside `installId`; nothing to add here.
    });
}
