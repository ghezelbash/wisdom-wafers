import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';

import { anonymous, makeTestEnv, reader, staff } from './helpers';

let env: RulesTestEnvironment;

const UID = 'reader-1';
const OTHER = 'reader-2';

beforeAll(async () => {
  env = await makeTestEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  // Seed the catalogue with the privileged context: content is server-written,
  // so there is no client path that could create it.
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'seeds/published-seed'), {
      status: 'published',
      topicId: 'astronomy',
      title: 'چرا آسمان شب تاریک است؟',
    });
    await setDoc(doc(db, 'seeds/draft-seed'), { status: 'draft', topicId: 'astronomy' });
    await setDoc(doc(db, 'topics/astronomy'), { status: 'published', family: 'sciences' });
    await setDoc(doc(db, 'appConfig/public'), { minimumVersion: '1.0.0' });
    await setDoc(doc(db, `users/${UID}`), { locale: 'fa-IR', interests: ['astronomy'] });
    await setDoc(doc(db, `users/${UID}/progress/published-seed`), {
      seedId: 'published-seed',
      revision: 1,
      percent: 100,
      status: 'completed',
    });
    await setDoc(doc(db, `userStats/${UID}`), { seedsCompleted: 7 });
    await setDoc(doc(db, 'cmsDrafts/draft-1'), {
      authorUid: 'editor-1',
      title: 'draft',
      state: 'draft',
      seed: { id: 'seed-1', title: 'عنوان' },
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
    await setDoc(doc(db, 'cmsDrafts/in-review'), {
      authorUid: 'editor-1',
      title: 'in review',
      state: 'in_review',
      seed: { id: 'seed-2', title: 'عنوان' },
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
    await setDoc(doc(db, 'cmsReviews/review-1'), {
      draftId: 'draft-1',
      actorUid: 'reviewer-1',
      from: 'in_review',
      to: 'approved',
    });
  });
});

describe('catalogue', () => {
  it('lets anyone read published content', async () => {
    await assertSucceeds(getDoc(doc(anonymous(env), 'seeds/published-seed')));
    await assertSucceeds(getDoc(doc(anonymous(env), 'topics/astronomy')));
    await assertSucceeds(getDoc(doc(anonymous(env), 'appConfig/public')));
  });

  it('hides unpublished content from everyone, including staff', async () => {
    await assertFails(getDoc(doc(anonymous(env), 'seeds/draft-seed')));
    await assertFails(getDoc(doc(reader(env), 'seeds/draft-seed')));
    await assertFails(getDoc(doc(staff(env, 'editor'), 'seeds/draft-seed')));
  });

  // Rules are not filters: a query without the matching constraint fails, even
  // for a reader who would be allowed every document it returns.
  it('requires the query to carry the published constraint', async () => {
    const db = reader(env);
    await assertFails(getDocs(collection(db, 'seeds')));
    await assertSucceeds(
      getDocs(query(collection(db, 'seeds'), where('status', '==', 'published')))
    );
  });

  /**
   * `appConfig/{document}` was world-readable across the collection, so the
   * next operational document added there would have been public by default.
   */
  it('publishes exactly one configuration document', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'appConfig/internal'), { note: 'not for clients' });
    });

    await assertSucceeds(getDoc(doc(anonymous(env), 'appConfig/public')));
    await assertFails(getDoc(doc(anonymous(env), 'appConfig/internal')));
    await assertFails(getDoc(doc(reader(env), 'appConfig/internal')));
    await assertFails(getDocs(collection(reader(env), 'appConfig')));
  });

  it('never lets a client write content', async () => {
    await assertFails(setDoc(doc(reader(env), 'seeds/published-seed'), { status: 'published' }));
    await assertFails(setDoc(doc(staff(env, 'admin'), 'seeds/new-seed'), { status: 'published' }));
    await assertFails(deleteDoc(doc(staff(env, 'admin'), 'seeds/published-seed')));
  });
});

describe('user documents', () => {
  it('lets an owner read and update their own profile', async () => {
    await assertSucceeds(getDoc(doc(reader(env), `users/${UID}`)));
    await assertSucceeds(
      updateDoc(doc(reader(env), `users/${UID}`), { interests: ['astronomy', 'math'] })
    );
  });

  it('keeps one reader out of another reader\'s document', async () => {
    await assertFails(getDoc(doc(reader(env, OTHER), `users/${UID}`)));
    await assertFails(updateDoc(doc(reader(env, OTHER), `users/${UID}`), { locale: 'en' }));
  });

  it('rejects fields outside the allow-list', async () => {
    // A client that could write `role` or `entitlement` would own the app.
    await assertFails(updateDoc(doc(reader(env), `users/${UID}`), { role: 'admin' }));
    await assertFails(updateDoc(doc(reader(env), `users/${UID}`), { premium: true }));
  });

  /**
   * The allow-list constrained *which* keys could be written and nothing about
   * their values: a locale could be an object and a timezone a megabyte.
   */
  it('validates the values, not only the key names', async () => {
    const db = reader(env);
    await assertSucceeds(updateDoc(doc(db, `users/${UID}`), { locale: 'en' }));
    await assertFails(updateDoc(doc(db, `users/${UID}`), { locale: 'kl' }));
    await assertFails(updateDoc(doc(db, `users/${UID}`), { locale: { fa: true } }));
    await assertFails(updateDoc(doc(db, `users/${UID}`), { timezone: 'z'.repeat(65) }));
    await assertFails(updateDoc(doc(db, `users/${UID}`), { displayName: 'n'.repeat(81) }));
  });

  it('accepts the notification preferences the app writes, and no others', async () => {
    const db = reader(env);
    await assertSucceeds(
      updateDoc(doc(db, `users/${UID}`), {
        notificationPreferences: {
          pace: 'one',
          timeOfDay: 'evening',
          reminderTime: '20:30',
          enabled: true,
        },
      })
    );
    await assertFails(
      updateDoc(doc(db, `users/${UID}`), {
        notificationPreferences: { enabled: true, everything: 'else' },
      })
    );
    await assertFails(updateDoc(doc(db, `users/${UID}`), { notificationPreferences: 'on' }));
  });

  it('caps the size of the interests list', async () => {
    const tooMany = Array.from({ length: 21 }, (_, index) => `topic-${index}`);
    await assertFails(updateDoc(doc(reader(env), `users/${UID}`), { interests: tooMany }));
  });

  it('does not let a client delete the account document', async () => {
    // Deletion has to reach subcollections, Storage and push tokens: a Function.
    await assertFails(deleteDoc(doc(reader(env), `users/${UID}`)));
  });
});

describe('progress is the server\u2019s to write', () => {
  const progressPath = `users/${UID}/progress/new-seed`;

  /**
   * The client used to be allowed to write here under field validation. Every
   * progress change already goes through the outbox into `ingestProgress`,
   * which derives the percent, the resume position and the review schedule — a
   * second writer could only contradict it.
   */
  it('refuses a write from the reader it belongs to, however well-formed', async () => {
    await assertFails(
      setDoc(doc(reader(env), progressPath), {
        seedId: 'new-seed',
        revision: 1,
        percent: 40,
        status: 'in_progress',
      })
    );
  });

  it('refuses an update to a document the server wrote', async () => {
    await assertFails(
      updateDoc(doc(reader(env), `users/${UID}/progress/published-seed`), { percent: 20 })
    );
    await assertFails(deleteDoc(doc(reader(env), `users/${UID}/progress/published-seed`)));
  });

  it('still lets the reader read their own, and nobody else read it', async () => {
    await assertSucceeds(getDoc(doc(reader(env), `users/${UID}/progress/published-seed`)));
    await assertFails(getDoc(doc(reader(env, OTHER), `users/${UID}/progress/published-seed`)));
  });

  it('refuses a forged write from another account', async () => {
    await assertFails(
      setDoc(doc(reader(env, OTHER), `users/${UID}/progress/forged`), {
        seedId: 'forged',
        revision: 1,
        percent: 100,
        status: 'completed',
      })
    );
  });
});

describe('devices and their push tokens', () => {
  const devicePath = `users/${UID}/devices/device-1`;
  const device = {
    deviceId: 'device-1',
    pushToken: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    platform: 'android',
    appVersion: '1.0.0',
    updatedAt: '2026-09-05T12:00:00.000Z',
  };

  it('accepts the shape the app writes', async () => {
    await assertSucceeds(setDoc(doc(reader(env), devicePath), device));
  });

  it('lets a reader retire their own token', async () => {
    await setDoc(doc(reader(env), devicePath), device);
    await assertSucceeds(deleteDoc(doc(reader(env), devicePath)));
  });

  /** `read, write: if owner(uid)` accepted every one of these. */
  it('refuses a document of any other shape', async () => {
    const db = reader(env);
    await assertFails(setDoc(doc(db, devicePath), { ...device, note: 'anything at all' }));
    await assertFails(setDoc(doc(db, devicePath), { ...device, deviceId: 'someone-elses' }));
    await assertFails(setDoc(doc(db, devicePath), { ...device, platform: 'toaster' }));
    await assertFails(setDoc(doc(db, devicePath), { ...device, pushToken: 42 }));
    await assertFails(setDoc(doc(db, devicePath), { ...device, pushToken: 'x'.repeat(257) }));
    await assertFails(setDoc(doc(db, devicePath), { ...device, appVersion: 'v'.repeat(33) }));
  });

  it('keeps another account away from it entirely', async () => {
    await assertFails(getDoc(doc(reader(env, OTHER), devicePath)));
    await assertFails(setDoc(doc(reader(env, OTHER), devicePath), device));
  });
});

describe('bookmarks', () => {
  it('accepts a well-formed save and un-save from their owner', async () => {
    const db = reader(env);
    await assertSucceeds(
      setDoc(doc(db, `users/${UID}/saved/published-seed`), {
        seedId: 'published-seed',
        saved: true,
        updatedAt: '2026-09-05T12:00:00.000Z',
      })
    );
    // The removal is a document, not an absence.
    await assertSucceeds(
      setDoc(doc(db, `users/${UID}/saved/published-seed`), {
        seedId: 'published-seed',
        saved: false,
        updatedAt: '2026-09-05T13:00:00.000Z',
      })
    );
  });

  it('rejects an unknown field, a mismatched id, or a wrong type', async () => {
    const db = reader(env);
    const base = { seedId: 'published-seed', saved: true, updatedAt: '2026-09-05T12:00:00.000Z' };

    await assertFails(
      setDoc(doc(db, `users/${UID}/saved/published-seed`), { ...base, note: 'anything' })
    );
    await assertFails(setDoc(doc(db, `users/${UID}/saved/other-seed`), base));
    await assertFails(
      setDoc(doc(db, `users/${UID}/saved/published-seed`), { ...base, saved: 'yes' })
    );
    await assertFails(
      setDoc(doc(db, `users/${UID}/saved/published-seed`), { ...base, updatedAt: 12345 })
    );
  });

  /** Deleting would lose the statement that the bookmark was taken away. */
  it('refuses a delete, because a removal has to be a document', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `users/${UID}/saved/published-seed`), {
        seedId: 'published-seed',
        saved: true,
        updatedAt: '2026-09-05T12:00:00.000Z',
      });
    });

    await assertFails(deleteDoc(doc(reader(env), `users/${UID}/saved/published-seed`)));
  });

  it('keeps one reader out of another reader\'s bookmarks', async () => {
    await assertFails(
      setDoc(doc(reader(env), `users/${OTHER}/saved/published-seed`), {
        seedId: 'published-seed',
        saved: true,
        updatedAt: '2026-09-05T12:00:00.000Z',
      })
    );
  });
});

describe('review state', () => {
  /**
   * A client that can write its own schedule can decide never to be asked
   * again. The attempt is recorded as an event; the due date is derived.
   */
  it('is readable by its owner and writable by nobody', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `users/${UID}/reviews/published-seed`), {
        seedId: 'published-seed',
        reviewedAt: '2026-09-05T12:00:00.000Z',
        interval: 14,
        dueAt: '2026-09-19T12:00:00.000Z',
        count: 1,
        confidence: 'easy',
        updatedAt: '2026-09-05T12:00:00.000Z',
      });
    });

    await assertSucceeds(getDoc(doc(reader(env), `users/${UID}/reviews/published-seed`)));
    await assertFails(
      setDoc(doc(reader(env), `users/${UID}/reviews/published-seed`), {
        seedId: 'published-seed',
        interval: 365,
        dueAt: '2099-01-01T00:00:00.000Z',
        confidence: 'easy',
      })
    );
    await assertFails(deleteDoc(doc(reader(env), `users/${UID}/reviews/published-seed`)));
  });

  it('is not readable by anyone else', async () => {
    await assertFails(getDoc(doc(reader(env), `users/${OTHER}/reviews/published-seed`)));
  });
});

describe('deletion jobs', () => {
  /**
   * The document holds the receipt, which is a capability that can finish a
   * deletion without a session. Nobody reads it — a reader asks about their
   * own job through `myAccountDeletionStatus`, which requires the receipt they
   * were handed and answers with a state and nothing else.
   */
  it('are unreadable and unwritable by everyone, owner and admin alike', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `deletionJobs/${UID}`), {
        uid: UID,
        state: 'requested',
        receipt: 'a'.repeat(32),
        completed: [],
      });
    });

    await assertFails(getDoc(doc(reader(env), `deletionJobs/${UID}`)));
    await assertFails(getDoc(doc(staff(env, 'admin'), `deletionJobs/${UID}`)));
    await assertFails(setDoc(doc(reader(env), `deletionJobs/${UID}`), { state: 'done' }));
    await assertFails(deleteDoc(doc(staff(env, 'admin'), `deletionJobs/${UID}`)));
  });
});

describe('server-authoritative aggregates', () => {
  it('are readable by their owner and writable by nobody', async () => {
    await assertSucceeds(getDoc(doc(reader(env), `userStats/${UID}`)));
    await assertFails(setDoc(doc(reader(env), `userStats/${UID}`), { seedsCompleted: 9999 }));
    await assertFails(setDoc(doc(reader(env), `entitlements/${UID}`), { premium: true }));
    await assertFails(setDoc(doc(reader(env), `users/${UID}/daily/2026-09-03`), { seeds: 5 }));
  });

  it('are not readable by anyone else', async () => {
    await assertFails(getDoc(doc(reader(env, OTHER), `userStats/${UID}`)));
  });
});

describe('reports', () => {
  // Reports arrive through `submitReport`, which is idempotent on the id the
  // device generated. A client that could create could also overwrite, and an
  // overwritable report is one a reporter could rewrite after triage.
  it('refuses every client write, even a well-formed one from the reporter', async () => {
    const db = reader(env);
    await assertFails(
      setDoc(doc(db, 'reports/report-1'), {
        uid: UID,
        seedId: 'published-seed',
        category: 'factual',
        detail: 'عدد اشتباه است.',
      })
    );
    await assertFails(
      setDoc(doc(db, 'reports/report-2'), { uid: OTHER, seedId: 'published-seed', category: 'factual' })
    );
    await assertFails(
      setDoc(doc(db, 'reports/report-3'), { uid: UID, seedId: 'published-seed', category: 'spam' })
    );
  });

  it('refuses a reporter rewriting a report the team is already triaging', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'reports/triaged'), {
        uid: UID,
        seedId: 'published-seed',
        category: 'factual',
        status: 'open',
      });
    });

    await assertFails(
      setDoc(doc(reader(env), 'reports/triaged'), {
        uid: UID,
        seedId: 'published-seed',
        category: 'technical',
      })
    );
  });

  it('is readable only by reviewers and admins', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'reports/existing'), {
        uid: UID,
        seedId: 'published-seed',
        category: 'factual',
      });
    });

    await assertFails(getDoc(doc(reader(env), 'reports/existing')));
    await assertSucceeds(getDoc(doc(staff(env, 'reviewer'), 'reports/existing')));
    await assertSucceeds(getDoc(doc(staff(env, 'admin'), 'reports/existing')));
    await assertFails(getDoc(doc(staff(env, 'editor'), 'reports/existing')));
  });
});

describe('CMS', () => {
  it('is closed to readers and open to editorial roles', async () => {
    await assertFails(getDoc(doc(reader(env), 'cmsDrafts/draft-1')));
    await assertSucceeds(getDoc(doc(staff(env, 'editor'), 'cmsDrafts/draft-1')));
    await assertSucceeds(getDoc(doc(staff(env, 'reviewer'), 'cmsDrafts/draft-1')));
  });

  it('lets an editor save the content of an editable draft', async () => {
    await assertSucceeds(
      updateDoc(doc(staff(env, 'editor'), 'cmsDrafts/draft-1'), {
        seed: { id: 'seed-1', title: 'عنوان تازه' },
        updatedAt: '2026-09-04T00:00:00.000Z',
      })
    );
  });

  /**
   * The bypass this closes: an editor with a REST client could set
   * `state: 'approved'` on their own draft and then ask the publish Function to
   * ship it. The Function's self-approval check never runs, because the
   * Function trusts the state on the document.
   */
  it('does not let anyone move a draft through the workflow directly', async () => {
    for (const role of ['editor', 'reviewer', 'admin'] as const) {
      await assertFails(
        updateDoc(doc(staff(env, role), 'cmsDrafts/draft-1'), { state: 'approved' })
      );
      await assertFails(
        updateDoc(doc(staff(env, role), 'cmsDrafts/draft-1'), { state: 'in_review' })
      );
    }
  });

  /**
   * Any editorial role could rewrite any draft, including one submitted by
   * someone else — the trail would then show the original author against text
   * they never wrote.
   */
  it('does not let one editor rewrite another editor\u2019s draft', async () => {
    await assertFails(
      updateDoc(doc(staff(env, 'editor', 'editor-2'), 'cmsDrafts/draft-1'), {
        seed: { id: 'seed-1', title: 'نوشته‌ی کس دیگر' },
        updatedAt: '2026-09-05T00:00:00.000Z',
      })
    );
  });

  /** Someone has to be able to fix a draft whose author has left. */
  it('keeps an admin override, documented rather than implicit', async () => {
    await assertSucceeds(
      updateDoc(doc(staff(env, 'admin'), 'cmsDrafts/draft-1'), {
        seed: { id: 'seed-1', title: 'اصلاح مدیر' },
        updatedAt: '2026-09-05T00:00:00.000Z',
      })
    );
  });

  it('does not let anyone forge authorship or an approval', async () => {
    const editor = staff(env, 'editor');
    await assertFails(updateDoc(doc(editor, 'cmsDrafts/draft-1'), { authorUid: 'someone-else' }));
    await assertFails(updateDoc(doc(editor, 'cmsDrafts/draft-1'), { approvedBy: 'reviewer-1' }));
    await assertFails(updateDoc(doc(editor, 'cmsDrafts/draft-1'), { reviewerUid: 'reviewer-1' }));
    await assertFails(updateDoc(doc(editor, 'cmsDrafts/draft-1'), { publishedRevision: 4 }));
    await assertFails(updateDoc(doc(editor, 'cmsDrafts/draft-1'), { publishedAt: '2026-09-04' }));
  });

  // A reviewer must be looking at the text that was submitted.
  it('freezes a draft while it is in review', async () => {
    await assertFails(
      updateDoc(doc(staff(env, 'editor'), 'cmsDrafts/in-review'), {
        seed: { id: 'seed-2', title: 'تغییر بعد از ارسال' },
        updatedAt: '2026-09-04T00:00:00.000Z',
      })
    );
  });

  it('lets a new draft be created only as a draft, owned by its author', async () => {
    const editor = staff(env, 'editor');

    await assertSucceeds(
      setDoc(doc(editor, 'cmsDrafts/fresh'), {
        authorUid: 'editor-1',
        state: 'draft',
        title: 'تازه',
        seed: { id: 'seed-3' },
        updatedAt: '2026-09-04T00:00:00.000Z',
      })
    );

    // Someone else's name on it.
    await assertFails(
      setDoc(doc(editor, 'cmsDrafts/forged'), {
        authorUid: 'reviewer-1',
        state: 'draft',
        seed: { id: 'seed-4' },
      })
    );

    // Straight to approved, skipping review entirely.
    await assertFails(
      setDoc(doc(editor, 'cmsDrafts/preapproved'), {
        authorUid: 'editor-1',
        state: 'approved',
        seed: { id: 'seed-5' },
      })
    );
  });

  /**
   * A reviewer who can write the audit trail can write "approved by someone
   * else" onto their own draft — which is the rule the workflow exists for.
   */
  it('lets editorial read the audit trail and nobody write it', async () => {
    await assertSucceeds(getDoc(doc(staff(env, 'editor'), 'cmsReviews/review-1')));

    for (const role of ['editor', 'reviewer', 'admin'] as const) {
      await assertFails(
        setDoc(doc(staff(env, role), 'cmsReviews/forged'), {
          draftId: 'draft-1',
          actorUid: 'reviewer-1',
          from: 'in_review',
          to: 'approved',
        })
      );
      await assertFails(updateDoc(doc(staff(env, role), 'cmsReviews/review-1'), { to: 'published' }));
    }
    await assertFails(deleteDoc(doc(staff(env, 'admin'), 'cmsReviews/review-1')));
  });

  it('only lets an admin delete a draft', async () => {
    await assertFails(deleteDoc(doc(staff(env, 'editor'), 'cmsDrafts/draft-1')));
    await assertSucceeds(deleteDoc(doc(staff(env, 'admin'), 'cmsDrafts/draft-1')));
  });

  it('keeps publish jobs out of client hands entirely', async () => {
    await assertFails(setDoc(doc(staff(env, 'admin'), 'publishJobs/job-1'), { state: 'done' }));
  });
});

describe('published content is immutable to clients', () => {
  it('refuses every client write to a seed or a revision, whatever their role', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'seedRevisions/published-seed_1'), {
        seedId: 'published-seed',
        revision: 1,
        status: 'published',
        checksum: 'a'.repeat(64),
      });
    });

    for (const role of ['editor', 'reviewer', 'admin'] as const) {
      const db = staff(env, role);
      await assertFails(updateDoc(doc(db, 'seeds/published-seed'), { title: 'دستکاری' }));
      await assertFails(
        setDoc(doc(db, 'seedRevisions/published-seed_1'), { checksum: 'b'.repeat(64) }, { merge: true })
      );
      await assertFails(deleteDoc(doc(db, 'seedRevisions/published-seed_1')));
      await assertFails(setDoc(doc(db, 'seeds/invented'), { status: 'published' }));
    }
  });

  it('lets anyone read a published revision and nobody read an unpublished one', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'seedRevisions/published-seed_1'), { status: 'published' });
      await setDoc(doc(db, 'seedRevisions/draft-seed_1'), { status: 'draft' });
    });

    await assertSucceeds(getDoc(doc(anonymous(env), 'seedRevisions/published-seed_1')));
    await assertFails(getDoc(doc(staff(env, 'admin'), 'seedRevisions/draft-seed_1')));
  });
});

describe('the guard\u2019s own bookkeeping', () => {
  it('keeps rate-limit counters away from the caller they count', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `rateLimits/ingestProgress__${UID}`), {
        windowStartedAt: 0,
        count: 1,
      });
    });

    // Reading it tells a caller exactly when to resume; writing it removes the
    // limit altogether.
    await assertFails(getDoc(doc(reader(env), `rateLimits/ingestProgress__${UID}`)));
    await assertFails(
      setDoc(doc(reader(env), `rateLimits/ingestProgress__${UID}`), { count: 0 })
    );
  });

  it('lets an admin read App Check coverage and nobody write it', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'appCheckCoverage/2026-09-05/shards/0'), {
        verified: 3,
        unverified: 1,
      });
    });

    await assertSucceeds(getDoc(doc(staff(env, 'admin'), 'appCheckCoverage/2026-09-05/shards/0')));
    await assertFails(getDoc(doc(reader(env), 'appCheckCoverage/2026-09-05/shards/0')));
    await assertFails(
      setDoc(doc(staff(env, 'admin'), 'appCheckCoverage/2026-09-05/shards/1'), { verified: 999 })
    );
  });
});

describe('everything else', () => {
  it('is denied by default', async () => {
    await assertFails(getDoc(doc(reader(env), 'somethingNew/doc-1')));
    await assertFails(setDoc(doc(reader(env), 'somethingNew/doc-1'), { any: 'value' }));
    await assertFails(getDoc(doc(staff(env, 'admin'), 'somethingNew/doc-1')));
  });
});
