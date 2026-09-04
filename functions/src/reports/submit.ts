import { z } from 'zod';

import type { Deps } from '../shared/deps';

/**
 * Content reports.
 *
 * A report goes through the outbox like a progress event, so it survives being
 * offline — which means it can arrive twice. It is therefore keyed on the id
 * the device generated and written idempotently, and the endpoint answers with
 * the same three outcomes ingestion does, so the queue knows whether to delete
 * an item, keep retrying it, or stop and keep the reason.
 *
 * It is a Function rather than a client write because the reporter's uid, the
 * received time and the triage state must not be forgeable, and because
 * `reports` is a collection staff read.
 */

export const ContentReportSchema = z.object({
  id: z.string().min(8).max(64),
  uid: z.string().min(1),
  seedId: z.string().min(1).max(64),
  revision: z.number().int().positive(),
  blockId: z.string().min(1).max(64).optional(),
  category: z.enum(['factual', 'sources', 'language', 'inappropriate', 'technical']),
  /** The reader's own words, capped. Never sent anywhere else. */
  detail: z.string().max(1000).optional(),
  occurredAtDevice: z.string(),
  appVersion: z.string().max(32),
});

export type ContentReportInput = z.infer<typeof ContentReportSchema>;

export interface SubmitReportsResult {
  applied: number;
  duplicates: number;
  rejected: { id: string; reason: string }[];
}

export async function submitReports(
  deps: Deps,
  input: { uid: string; reports: unknown[] }
): Promise<SubmitReportsResult> {
  const result: SubmitReportsResult = { applied: 0, duplicates: 0, rejected: [] };

  for (const raw of input.reports) {
    const parsed = ContentReportSchema.safeParse(raw);
    if (!parsed.success) {
      const id = (raw as { id?: string })?.id ?? 'unknown';
      result.rejected.push({ id, reason: parsed.error.issues[0]?.message ?? 'invalid' });
      continue;
    }

    const report = parsed.data;
    if (report.uid !== input.uid) {
      // The caller's identity wins; a report claiming another uid is refused.
      result.rejected.push({ id: report.id, reason: 'uid-mismatch' });
      continue;
    }

    const ref = deps.db.collection('reports').doc(report.id);
    const written = await deps.db.runTransaction(async (transaction) => {
      if ((await transaction.get(ref)).exists) return false;

      transaction.set(ref, {
        ...report,
        // Triage state belongs to the team, and starts where the team expects.
        status: 'open',
        receivedAt: deps.now().toISOString(),
      });
      return true;
    });

    if (written) result.applied += 1;
    else result.duplicates += 1;
  }

  return result;
}
