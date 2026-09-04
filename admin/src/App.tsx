import { parseSeedStrict, type ParseResult, type Seed } from '@dananeh/content-schema';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, setDoc, orderBy, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useState } from 'react';

import { auth, db, functions } from './firebase';
import { Preview } from './Preview';

type DraftState =
  | 'draft'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'published'
  | 'withdrawn';

interface Draft {
  draftId: string;
  state: DraftState;
  authorUid: string;
  seed: Seed;
  updatedAt: string;
  note?: string;
  publishedRevision?: number;
}

interface AuditEntry {
  draftId: string;
  actorUid: string;
  from: string;
  to: string;
  note?: string;
  at: string;
}

const call = (name: string) => httpsCallable(functions, name);

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (next) => {
        setUser(next);
        if (next) {
          // Roles come from custom claims, set server-side. The UI reads them to
          // decide what to *show*; the backend decides what is allowed.
          const token = await next.getIdTokenResult(true);
          setRoles(
            ['admin', 'editor', 'reviewer'].filter((role) => token.claims[role] === true)
          );
        } else {
          setRoles([]);
        }
        setReady(true);
      }),
    []
  );

  if (!ready) return <p style={{ padding: 24 }}>…</p>;
  if (!user) return <SignIn />;

  return <Workbench user={user} roles={roles} />;
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  return (
    <div className="signin panel">
      <h1 style={{ marginTop: 0 }}>تحریریه‌ی دانانه</h1>
      <p className="muted">با حساب تحریریه وارد شو.</p>
      <input
        aria-label="ایمیل"
        dir="ltr"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="editor@example.com"
      />
      <div style={{ height: 10 }} />
      <input
        aria-label="رمز عبور"
        dir="ltr"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <div style={{ height: 12 }} />
      <button
        className="primary"
        onClick={() =>
          signInWithEmailAndPassword(auth, email, password).catch(() =>
            setError('ورود ناموفق بود.')
          )
        }>
        ورود
      </button>
      {error ? <p style={{ color: 'var(--error-ink)' }}>{error}</p> : null}
    </div>
  );
}

function Workbench({ user, roles }: { user: User; roles: string[] }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorText, setEditorText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(
    () =>
      onSnapshot(collection(db, 'cmsDrafts'), (snapshot) => {
        setDrafts(snapshot.docs.map((document) => document.data() as Draft));
      }),
    []
  );

  useEffect(
    () =>
      onSnapshot(query(collection(db, 'cmsReviews'), orderBy('at', 'desc'), limit(20)), (snapshot) =>
        setAudit(snapshot.docs.map((document) => document.data() as AuditEntry))
      ),
    []
  );

  const selected = drafts.find((draft) => draft.draftId === selectedId) ?? null;

  useEffect(() => {
    if (selected) setEditorText(JSON.stringify(selected.seed, null, 2));
  }, [selectedId, selected]);

  /** Validation runs on every keystroke: the publish gate, shown early. */
  const validation: ParseResult<Seed> | null = useMemo(() => {
    if (!editorText.trim()) return null;
    try {
      return parseSeedStrict(JSON.parse(editorText));
    } catch {
      return { ok: false, issues: [{ path: 'json', message: 'JSON معتبر نیست' }] };
    }
  }, [editorText]);

  const parsedSeed = validation?.ok ? validation.value : null;

  const canEdit = roles.includes('editor') || roles.includes('admin');

  /**
   * A draft in review is frozen: a reviewer has to be looking at the text that
   * was submitted. The rules enforce it; this is so the button says so rather
   * than failing with a permission error nobody can act on.
   */
  const isEditable = (state: DraftState) => state === 'draft' || state === 'changes_requested';

  /**
   * Starting a new draft.
   *
   * Through the Function, not a direct write: authorship and the starting state
   * are decided server-side, which is what makes the self-approval rule mean
   * something. Creating content by hand in Firestore was the only way before.
   */
  const createDraft = async () => {
    if (!parsedSeed) {
      setMessage('برای ساخت پیش‌نویس، ابتدا یک دانه‌ی معتبر در ویرایشگر بگذار.');
      return;
    }
    await run('createContentDraft', { seed: parsedSeed });
  };

  /** A correction to something already published, at the next revision. */
  const startCorrection = async () => {
    if (!selected) return;
    await run('startCorrection', { seedId: selected.seed?.id });
  };
  const canReview = roles.includes('reviewer') || roles.includes('admin');
  const isAuthor = selected?.authorUid === user.uid;

  const run = async (name: string, data: Record<string, unknown>) => {
    setBusy(true);
    setMessage('');
    try {
      await call(name)(data);
      setMessage('انجام شد.');
    } catch (error) {
      const code = (error as { message?: string }).message ?? 'unknown';
      setMessage(`ناموفق: ${code}`);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!selected || !parsedSeed) return;
    await setDoc(
      doc(db, 'cmsDrafts', selected.draftId),
      { seed: parsedSeed, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    setMessage('ذخیره شد.');
  };

  return (
    <div className="layout">
      <aside className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>پیش‌نویس‌ها</strong>
          <button onClick={() => signOut(auth)}>خروج</button>
        </div>
        <p className="muted" dir="ltr">{user.email} · {roles.join(', ') || 'no role'}</p>

        {drafts.length === 0 ? <p className="muted">هنوز پیش‌نویسی نیست.</p> : null}
        {drafts.map((draft) => (
          <button
            key={draft.draftId}
            className="draft-item"
            onClick={() => setSelectedId(draft.draftId)}>
            <span className={`state ${draft.state}`}>{draft.state}</span>{' '}
            {draft.seed?.title ?? draft.draftId}
          </button>
        ))}

        <hr style={{ border: 0, borderTop: '1px solid var(--hairline)', margin: '16px 0' }} />
        <strong>تاریخچه</strong>
        {audit.map((entry, index) => (
          <p key={index} className="muted" style={{ margin: '6px 0' }}>
            {entry.draftId}: {entry.from} → {entry.to}
            {entry.note ? ` — ${entry.note}` : ''}
          </p>
        ))}
      </aside>

      <main className="panel">
        {!selected ? (
          <p className="muted">یک پیش‌نویس را انتخاب کن.</p>
        ) : (
          <>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>{selected.seed?.title}</h2>
              <span className={`state ${selected.state}`}>{selected.state}</span>
            </div>

            <textarea
              aria-label="محتوای دانه"
              value={editorText}
              onChange={(event) => setEditorText(event.target.value)}
            />

            {validation && !validation.ok ? (
              <ul className="issues">
                {validation.issues.slice(0, 8).map((issue, index) => (
                  <li key={index}>
                    <code dir="ltr">{issue.path || 'root'}</code> — {issue.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: 'var(--brand)' }}>معتبر است و آماده‌ی بررسی.</p>
            )}

            <div className="row" style={{ marginTop: 12 }}>
              <button
                onClick={save}
                disabled={!canEdit || !parsedSeed || busy || !isEditable(selected.state)}
                title={
                  isEditable(selected.state)
                    ? undefined
                    : 'در این وضعیت، متن پیش‌نویس قابل ویرایش نیست.'
                }>
                ذخیره
              </button>
              <button onClick={createDraft} disabled={!canEdit || !parsedSeed || busy}>
                پیش‌نویس تازه از این متن
              </button>
              <button
                onClick={startCorrection}
                disabled={!canEdit || busy}
                title="یک نسخه‌ی تازه از همین دانه، با شماره‌ی revision بعدی">
                اصلاح نسخه‌ی منتشرشده
              </button>
              <button
                onClick={() => run('submitForReview', { draftId: selected.draftId })}
                disabled={!canEdit || !parsedSeed || busy || !isEditable(selected.state)}>
                ارسال برای بررسی
              </button>
              <button
                className="primary"
                onClick={() => run('review', { draftId: selected.draftId, decision: 'approve' })}
                // An editor cannot approve their own draft; the function refuses
                // it too, this only avoids offering a dead button.
                disabled={!canReview || isAuthor || selected.state !== 'in_review' || busy}>
                تأیید
              </button>
              <button
                onClick={() =>
                  run('review', {
                    draftId: selected.draftId,
                    decision: 'request_changes',
                    note: 'نیاز به اصلاح',
                  })
                }
                disabled={!canReview || selected.state !== 'in_review' || busy}>
                درخواست اصلاح
              </button>
              <button
                className="primary"
                onClick={() => run('publishApproved', { draftId: selected.draftId })}
                disabled={!canEdit || selected.state !== 'approved' || busy}>
                انتشار
              </button>
              <button
                className="danger"
                onClick={() =>
                  run('rollback', {
                    seedId: selected.seed.id,
                    toRevision: (selected.publishedRevision ?? selected.seed.revision) - 1,
                  })
                }
                disabled={!roles.includes('admin') || busy}>
                بازگردانی
              </button>
            </div>

            {message ? <p className="muted">{message}</p> : null}
          </>
        )}
      </main>

      <aside className="panel">
        <strong>پیش‌نمایش</strong>
        <Preview seed={parsedSeed} />
      </aside>
    </div>
  );
}
