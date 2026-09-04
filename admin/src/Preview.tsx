import type { Seed } from '@dananeh/content-schema';

/**
 * What a reader would see.
 *
 * Deliberately plain: the point is to check the *content* — that a question has
 * one correct answer, that a summary is three recallable claims, that alt text
 * exists — not to reproduce the app's visual design in a second place that
 * would then drift.
 */
export function Preview({ seed }: { seed: Seed | null }) {
  if (!seed) return <p className="muted">پیش‌نمایشی نیست.</p>;

  return (
    <div className="phone" dir="rtl">
      <p className="muted">{seed.topicId} · {seed.estimatedMinutes} دقیقه · {seed.difficulty}</p>
      <h2 style={{ margin: '4px 0 6px' }}>{seed.title}</h2>
      <p className="muted" style={{ marginTop: 0 }}>{seed.promise}</p>

      {seed.blocks.map((block) => (
        <div className="block" key={block.id}>
          <div className="block-type">{block.type}</div>
          <BlockBody block={block} />
        </div>
      ))}

      <div className="block">
        <div className="block-type">sources</div>
        {seed.sources.length === 0 ? (
          <p style={{ color: 'var(--error-ink)' }}>بدون منبع — قابل انتشار نیست.</p>
        ) : (
          seed.sources.map((source) => (
            <p key={source.id} style={{ margin: '4px 0' }}>
              <span dir={source.latin ? 'ltr' : 'rtl'}>{source.title}</span>
              <span className="muted"> — {source.publisher}, {source.year} {source.era === 'ce' ? 'م.' : 'ش.'}</span>
            </p>
          ))
        )}
      </div>
    </div>
  );
}

function BlockBody({ block }: { block: Seed['blocks'][number] }) {
  const any = block as Record<string, unknown>;

  switch (block.type) {
    case 'richText':
      return <>{(any.paragraphs as string[]).map((text, index) => <p key={index}>{text}</p>)}</>;
    case 'image':
      // Alt text is a publish gate, so the preview shows it rather than an image.
      return <p className="muted">تصویر — متن جانشین: {String(any.alt)}</p>;
    case 'quote':
      return <blockquote style={{ margin: 0 }}>«{String(any.text)}»</blockquote>;
    case 'callout':
      return <p><strong>{String(any.title)}</strong> — {String(any.body)}</p>;
    case 'multipleChoice':
    case 'multiSelect':
      return (
        <>
          <p>{String(any.question)}</p>
          <ul>
            {(any.options as { id: string; text: string; isCorrect: boolean }[]).map((option) => (
              <li key={option.id} style={{ color: option.isCorrect ? 'var(--brand)' : undefined }}>
                {option.text}
                {option.isCorrect ? ' ✓' : ''}
              </li>
            ))}
          </ul>
          <p className="muted">{String(any.explanation)}</p>
        </>
      );
    case 'trueFalse':
      return (
        <p>
          {String(any.statement)} <strong>{any.answer ? '(درست)' : '(غلط)'}</strong>
        </p>
      );
    case 'ordering':
      return (
        <ol>
          {(any.items as { id: string; text: string }[]).map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ol>
      );
    case 'matchPairs':
      return (
        <ul>
          {(any.pairs as { id: string; concept: string; description: string }[]).map((pair) => (
            <li key={pair.id}>
              <strong>{pair.concept}</strong> — {pair.description}
            </li>
          ))}
        </ul>
      );
    case 'reflection':
      return <p className="muted">بازاندیشی: {String(any.prompt)}</p>;
    case 'summary':
      return (
        <ol>
          {(any.points as string[]).map((point, index) => (
            <li key={index}>{point}</li>
          ))}
        </ol>
      );
    default:
      // The app degrades the same way; the preview should show what they'd see.
      return <p className="muted">بلوک ناشناخته — در اپ به حالت جایگزین می‌افتد.</p>;
  }
}
