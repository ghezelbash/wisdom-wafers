import { SEED_SCHEMA_VERSION, type Seed } from '@/models/seed';

/**
 * اثر لنگر.
 *
 * Launch content: authored, sourced and publishable as it stands. Every source
 * points at the specific paper or page the claim comes from, not a publisher's
 * homepage.
 */
export const anchoringSeed: Seed = {
  id: 'seed-anchoring',
  schemaVersion: SEED_SCHEMA_VERSION,
  revision: 1,
  topicId: 'psychology',
  title: 'چرا اولین عدد، بقیه را می‌کِشد؟',
  promise: 'می‌بینی چطور یک عدد بی‌ربط، تخمین بعدی‌ات را جابه‌جا می‌کند.',
  difficulty: 'intro',
  estimatedMinutes: 6,
  lastReviewedAt: '2026-08-28T00:00:00.000Z',
  reviewedBy: 'تحریریه‌ی دانانه',
  recall: [
    {
      id: 'r1',
      prompt: 'بدون نگاه‌کردن به دانه: اثر لنگر در یک جمله چیست؟',
      answer:
        'اولین عددی که می‌بینیم نقطه‌ی شروع تخمین می‌شود و پاسخ نهایی به‌اندازه‌ی کافی از آن دور نمی‌شود — حتی وقتی آن عدد آشکارا بی‌ربط است.',
    },
    {
      id: 'r2',
      prompt: 'چرا «فقط به عدد نگاه نکن» راه‌حل خوبی نیست؟',
      answer:
        'چون اثر لنگر حتی وقتی می‌دانیم عدد تصادفی است هم کار می‌کند. راه عملی‌تر این است که پیش از دیدن هر عددی، خودت یک بازه بنویسی.',
    },
  ],
  sources: [
    {
      id: 'src-tversky-1974',
      title: 'Judgment under Uncertainty: Heuristics and Biases',
      publisher: 'Science, vol. 185, no. 4157, pp. 1124–1131',
      year: 1974,
      era: 'ce',
      kind: 'مقاله‌ی پژوهشی',
      url: 'https://doi.org/10.1126/science.185.4157.1124',
      latin: true,
    },
    {
      id: 'src-ariely-2003',
      title: 'Coherent Arbitrariness: Stable Demand Curves Without Stable Preferences',
      publisher: 'The Quarterly Journal of Economics, vol. 118, no. 1, pp. 73–106',
      year: 2003,
      era: 'ce',
      kind: 'مقاله‌ی پژوهشی',
      url: 'https://doi.org/10.1162/00335530360535153',
      latin: true,
    },
  ],
  blocks: [
    {
      id: 'b1',
      type: 'richText',
      eyebrow: 'اثر لنگر',
      heading: 'یک چرخ گردان، و تخمینی که جابه‌جا می‌شود',
      paragraphs: [
        'در یک آزمایش کلاسیک، از شرکت‌کننده‌ها خواستند چرخی را بچرخانند که عددی بین ۰ تا ۱۰۰ نشان می‌داد. بعد پرسیدند: به نظرت چند درصد کشورهای عضو سازمان ملل در آفریقا هستند؟',
        'کسانی که چرخ برایشان عدد کوچکی آورده بود، تخمین کمتری دادند؛ کسانی که عدد بزرگ‌تری دیده بودند، تخمین بیشتری. همه می‌دانستند چرخ تصادفی است. باز هم اثر گذاشت.',
      ],
    },
    {
      id: 'b2',
      type: 'callout',
      tone: 'note',
      title: 'خوب است بدانی',
      body: 'اثر لنگر فقط دربارهٔ اعداد نیست. اولین قیمتی که در مذاکره گفته می‌شود، اولین تشخیصی که پزشک مطرح می‌کند و اولین نمره‌ای که به یک متن می‌دهیم، همه لنگر می‌سازند.',
    },
    {
      id: 'b3',
      type: 'quote',
      text: 'مردم از یک نقطه‌ی شروع تخمین می‌زنند و آن را تعدیل می‌کنند — اما تعدیل معمولاً کافی نیست.',
      attribution: 'نقل به مضمون از تِوِرسکی و کانمن',
      period: '۱۹۷۴',
    },
    {
      id: 'b4',
      type: 'multipleChoice',
      question: 'در آزمایش چرخ گردان، چه چیزی تخمین‌ها را از هم جدا کرد؟',
      sourceId: 'src-tversky-1974',
      options: [
        { id: 'o1', text: 'میزان آگاهی شرکت‌کننده‌ها از جغرافیا', isCorrect: false },
        { id: 'o2', text: 'عددی که چرخ به‌صورت تصادفی نشان داده بود', isCorrect: true },
        { id: 'o3', text: 'زمانی که برای پاسخ داشتند', isCorrect: false },
        { id: 'o4', text: 'ترتیب پرسیدن سؤال‌ها', isCorrect: false },
      ],
      explanation:
        'عدد تصادفی نقطه‌ی شروع شد. شرکت‌کننده‌ها از همان‌جا تعدیل کردند و به‌اندازه‌ی کافی دور نشدند.',
    },
    {
      id: 'b5',
      type: 'multiSelect',
      question: 'کدام‌ها در عمل اثر لنگر را کم می‌کنند؟',
      options: [
        { id: 'o1', text: 'پیش از دیدن هر عددی، خودت یک بازه بنویسی', isCorrect: true },
        { id: 'o2', text: 'عمداً یک تخمین در جهت مخالف هم بسازی', isCorrect: true },
        { id: 'o3', text: 'به خودت بگویی «تحت تأثیر قرار نمی‌گیرم»', isCorrect: false },
        { id: 'o4', text: 'سریع‌تر تصمیم بگیری تا فرصت فکر کردن نباشد', isCorrect: false },
      ],
      explanation:
        'آگاه بودن از سوگیری به‌تنهایی آن را خنثی نمی‌کند. چیزی که کار می‌کند، ساختن یک مرجع مستقل پیش از دیدن لنگر است.',
    },
    {
      id: 'b6',
      type: 'trueFalse',
      statement: 'اگر بدانیم عددی که دیده‌ایم تصادفی است، دیگر روی تخمین‌مان اثر نمی‌گذارد.',
      answer: false,
      explanation:
        'در همان آزمایش، شرکت‌کننده‌ها چرخ را با چشم خود می‌چرخاندند و باز هم اثر دیده شد.',
    },
    {
      id: 'b7',
      type: 'ordering',
      prompt: 'مسیر شکل‌گیری یک لنگر را به ترتیب بچین',
      items: [
        { id: 'i1', text: 'یک عدد در دسترس قرار می‌گیرد' },
        { id: 'i2', text: 'ذهن آن را نقطه‌ی شروع می‌گیرد' },
        { id: 'i3', text: 'تخمین از آنجا تعدیل می‌شود' },
        { id: 'i4', text: 'تعدیل زودتر از حد لازم متوقف می‌شود' },
      ],
    },
    {
      id: 'b8',
      type: 'reflection',
      prompt: 'آخرین باری که قیمتی را دیدی و «گران» یا «ارزان» بودنش را نسبت به چه چیزی سنجیدی؟',
      maxLength: 600,
    },
    {
      id: 'b9',
      type: 'summary',
      points: [
        'اولین عدد، نقطه‌ی شروع تخمین می‌شود — حتی اگر بی‌ربط باشد.',
        'تعدیل از روی لنگر انجام می‌شود و معمولاً زود متوقف می‌شود.',
        'راه عملی: پیش از دیدن هر عددی، بازه‌ی خودت را بنویس.',
      ],
    },
  ],
};
