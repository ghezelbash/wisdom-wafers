import { analyseQuery, buildIndex, highlightParts, normalize, searchIndex } from '@/lib/search';

describe('normalize', () => {
  it('unifies Arabic letter forms with Persian ones', () => {
    expect(normalize('كتاب')).toBe(normalize('کتاب'));
    expect(normalize('عربي')).toBe(normalize('عربی'));
    expect(normalize('مدرسة')).toBe(normalize('مدرسه'));
  });

  it('folds hamza carriers', () => {
    expect(normalize('أحمد')).toBe(normalize('احمد'));
    expect(normalize('إيران')).toBe(normalize('ایران'));
    expect(normalize('آسمان')).toBe(normalize('اسمان'));
    expect(normalize('مؤسسه')).toBe(normalize('موسسه'));
  });

  it('drops diacritics, tatweel and the zero-width non-joiner', () => {
    expect(normalize('کِتاب')).toBe(normalize('کتاب'));
    expect(normalize('کــتاب')).toBe(normalize('کتاب'));
    // نیم‌فاصله is content, but it must not split a match.
    expect(normalize('می‌خواهم')).toBe(normalize('میخواهم'));
  });

  it('normalises Persian, Arabic and Latin digits to one form', () => {
    expect(normalize('۱۴۰۵')).toBe('1405');
    expect(normalize('١٤٠٥')).toBe('1405');
    expect(normalize('1405')).toBe('1405');
  });

  it('lowercases Latin and collapses whitespace', () => {
    expect(normalize('  Olbers   Paradox ')).toBe('olbers paradox');
  });

  it('leaves the display string alone — it only produces a search key', () => {
    const original = 'می‌خواهم آسمانِ شب';
    normalize(original);
    expect(original).toBe('می‌خواهم آسمانِ شب');
  });
});

describe('analyseQuery', () => {
  it('reports a colloquial expansion separately from normalisation', () => {
    const analysis = analyseQuery('آسمون شب');
    // The two mechanisms are different: this one substituted a *different word*,
    // so the UI has to be able to say so.
    expect(analysis.expandedFrom).toBe('آسمون');
    expect(analysis.expandedTo).toBe('آسمان');
    expect(analysis.normalized).toContain(normalize('آسمان'));
  });

  it('reports the words as written, not as normalised', () => {
    const analysis = analyseQuery('خونه');
    expect(analysis.expandedFrom).toBe('خونه');
    expect(analysis.expandedTo).toBe('خانه');
  });

  it('says nothing when plain normalisation was enough', () => {
    expect(analyseQuery('آسمان').expandedFrom).toBeUndefined();
    expect(analyseQuery('كتاب').expandedFrom).toBeUndefined();
  });
});

describe('the local index', () => {
  const docs = [
    { id: 'a', title: 'چرا آسمان شب کاملاً تاریک است؟', topic: 'اخترشناسی' },
    { id: 'b', title: 'اثر لنگر در تصمیم‌های مالی', topic: 'روان‌شناسی' },
    { id: 'c', title: 'Olbers paradox explained', topic: 'astronomy' },
  ];
  const index = buildIndex(docs, (doc) => [doc.title, doc.topic]);

  const ids = (query: string) => searchIndex(index, analyseQuery(query)).map((doc) => doc.id);

  it('matches regardless of ک/ی spelling', () => {
    expect(ids('تاريك')).toEqual(['a']);
    expect(ids('تاریک')).toEqual(['a']);
  });

  it('matches across نیم‌فاصله', () => {
    expect(ids('تصمیم‌های')).toEqual(['b']);
    expect(ids('تصمیمهای')).toEqual(['b']);
  });

  it('finds a colloquial spelling through the expansion list', () => {
    expect(ids('آسمون')).toEqual(['a']);
  });

  it('is case-insensitive for Latin', () => {
    expect(ids('OLBERS')).toEqual(['c']);
  });

  it('requires every term to match', () => {
    expect(ids('آسمان مالی')).toEqual([]);
  });

  it('returns nothing for an empty query rather than everything', () => {
    expect(ids('')).toEqual([]);
    expect(ids('   ')).toEqual([]);
  });
});

describe('highlightParts', () => {
  it('marks the matching run and leaves the rest intact', () => {
    const parts = highlightParts('چرا آسمان شب تاریک است؟', analyseQuery('آسمان'));
    expect(parts.map((part) => part.text).join('')).toBe('چرا آسمان شب تاریک است؟');
    expect(parts.filter((part) => part.hit).map((part) => part.text)).toEqual(['آسمان']);
  });

  it('marks the written form when the query was colloquial', () => {
    const parts = highlightParts('چرا آسمان شب تاریک است؟', analyseQuery('آسمون'));
    expect(parts.some((part) => part.hit)).toBe(true);
  });
});
