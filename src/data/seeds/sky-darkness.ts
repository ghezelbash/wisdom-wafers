import { SEED_SCHEMA_VERSION, type Seed } from '@/models/seed';

/**
 * The bundled first seed.
 *
 * It ships in the binary, which is what makes a dead-network first run
 * survivable, and it exercises all eleven block types — so a change to the
 * registry is caught by opening this one seed.
 */
export const skyDarknessSeed: Seed = {
  id: 'seed-sky-darkness',
  schemaVersion: SEED_SCHEMA_VERSION,
  revision: 4,
  topicId: 'astronomy',
  title: 'چرا آسمان شب کاملاً تاریک است؟',
  promise: 'می‌فهمی تاریکی آسمان چه چیزی درباره‌ی سنّ و گسترش جهان می‌گوید.',
  difficulty: 'intro',
  estimatedMinutes: 6,
  bundled: true,
  lastReviewedAt: '2026-08-20T00:00:00.000Z',
  reviewedBy: 'تحریریه‌ی دانانه',
  recall: [
    {
      id: 'r1',
      prompt: 'بدون نگاه‌کردن به دانه: تاریکی آسمان شب کدام دو چیز را دربارهٔ جهان نشان می‌دهد؟',
      answer:
        'جهان سنّ محدودی دارد. نورِ ستاره‌های دورتر از افق دید هنوز به ما نرسیده است. انبساط جهان هم نور رسیده را کم‌انرژی‌تر می‌کند، اما سهمش کوچک‌تر است.',
    },
    {
      id: 'r2',
      prompt: 'چرا «غبار» پاسخ پارادوکس اولبرس نیست؟',
      answer: 'غبار با جذب نور گرم می‌شود و خودش می‌تابد؛ پس تاریکی را توضیح نمی‌دهد.',
    },
  ],
  sources: [
    {
      id: 'src-olbers',
      title: 'Olbers’s Paradox and the Spectral Intensity of the Extragalactic Background Light',
      publisher: 'The Astrophysical Journal, vol. 367, pp. 399–406',
      year: 1991,
      era: 'ce',
      kind: 'مقاله‌ی پژوهشی',
      url: 'https://doi.org/10.1086/169638',
      latin: true,
    },
    {
      id: 'src-harrison',
      title: 'Darkness at Night: A Riddle of the Universe',
      publisher: 'Harvard University Press',
      year: 1987,
      era: 'ce',
      kind: 'کتاب',
      latin: true,
    },
    {
      id: 'src-textbook',
      title: 'کتاب: کیهان‌شناسی مقدماتی، فصل ۲',
      publisher: 'انتشارات دانشگاه صنعتی',
      year: 1398,
      era: 'sh',
      kind: 'کتاب درسی',
    },
  ],
  blocks: [
    {
      id: 'b1',
      type: 'richText',
      eyebrow: 'پارادوکس اولبرس',
      heading: 'اگر جهان بی‌کران باشد، تاریکی توضیح می‌خواهد',
      paragraphs: [
        'فرض کن جهان بی‌نهایت بزرگ، بی‌نهایت قدیمی و پر از ستاره باشد. در این حالت در هر جهتی که نگاه کنی، دیر یا زود چشمت به سطح یک ستاره می‌خورد.',
        'نتیجه‌اش این است که آسمان شب باید مثل روز روشن باشد — نه فقط پرستاره، بلکه یکدست درخشان. اما آسمان تاریک است. پس یکی از آن سه فرض غلط است.',
      ],
    },
    {
      id: 'b2',
      type: 'image',
      alt: 'نمودار: از یک چشم، چند خط دید در جهت‌های مختلف رسم شده و هر خط در نهایت به سطح یک ستاره می‌رسد.',
      caption:
        'در جهانی بی‌کران، هر خط دید در نهایت به سطح یک ستاره می‌رسد. تعداد ستاره‌ها با فاصله زیاد می‌شود و کم‌نوری‌شان را جبران می‌کند.',
      aspect: '4:5',
    },
    {
      id: 'b3',
      type: 'quote',
      text: 'تاریکی آسمان شب یکی از قدیمی‌ترین سرنخ‌های ما درباره‌ی این است که جهان همیشه نبوده است.',
      attribution: 'نقل به مضمون از بحث‌های کلاسیک کیهان‌شناسی',
      period: 'سده‌ی نوزدهم',
    },
    {
      id: 'b4',
      type: 'callout',
      tone: 'note',
      title: 'خوب است بدانی',
      body: 'این استدلال قبل از کشف انبساط جهان مطرح شد. یعنی فقط با نگاه‌کردن به آسمان — بدون تلسکوپ — می‌شد فهمید چیزی در تصویر ساده‌ی «جهان همیشگی» غلط است.',
    },
    {
      id: 'b5',
      type: 'callout',
      tone: 'misconception',
      title: 'اشتباه رایج',
      body: '«غبار جلوی نور را می‌گیرد» پاسخ کاملی نیست: غبار با جذب نور گرم می‌شود و خودش می‌درخشد.',
    },
    {
      id: 'b6',
      type: 'multipleChoice',
      question: 'اگر جهان بی‌کران، ساکن و بی‌نهایت‌سال بود، آسمان شب چگونه دیده می‌شد؟',
      sourceId: 'src-olbers',
      options: [
        { id: 'o1', text: 'همان‌قدر تاریک، چون فاصله‌ها زیاد است', isCorrect: false },
        { id: 'o2', text: 'یکدست روشن، مثل سطح یک ستاره', isCorrect: true },
        { id: 'o3', text: 'پر از ستاره‌های پراکنده، مثل امشب', isCorrect: false },
        { id: 'o4', text: 'بستگی به فصل و جهت نگاه دارد', isCorrect: false },
      ],
      explanation:
        'تعداد ستاره‌ها با مربع فاصله زیاد می‌شود و کم‌نوری هر ستاره را جبران می‌کند. جمعِ همه، سطحی یکدست روشن می‌سازد.',
    },
    {
      id: 'b7',
      type: 'multiSelect',
      question: 'کدام‌ها به تاریک بودن آسمان شب کمک می‌کنند؟',
      options: [
        { id: 'o1', text: 'جهان سنّ محدودی دارد', isCorrect: true },
        { id: 'o2', text: 'جهان در حال انبساط است', isCorrect: true },
        { id: 'o3', text: 'غبار میان‌ستاره‌ای نور را می‌بلعد', isCorrect: false },
        { id: 'o4', text: 'ستاره‌ها کم‌نورتر از گذشته‌اند', isCorrect: false },
      ],
      explanation:
        'سنّ محدود جهان سهم اصلی را دارد: نور ستاره‌های دورتر از افق دید هنوز نرسیده است. انبساط نور رسیده را کم‌انرژی‌تر می‌کند، ولی برآوردها سهمش را تنها چند برابر کاهش نشان می‌دهند. غبار راه‌حل نیست — گرم می‌شود و خودش می‌تابد.',
    },
    {
      id: 'b8',
      type: 'trueFalse',
      statement: 'تاریکی آسمان شب به‌تنهایی نشان می‌دهد که جهان آغازی داشته است.',
      answer: true,
      explanation:
        'همین مشاهده‌ی ساده یکی از سه فرض «بی‌کران، ساکن، بی‌نهایت‌سال» را رد می‌کند — و سنّ محدود، هم ساده‌ترین توضیح است و هم آن‌که برآوردها بیشترین سهم را به آن می‌دهند.',
    },
    {
      id: 'b9',
      type: 'ordering',
      prompt: 'استدلال را به ترتیب بچین',
      items: [
        { id: 'i1', text: 'جهان را بی‌کران و بی‌نهایت‌سال فرض کن' },
        { id: 'i2', text: 'در هر جهت، خط دید به سطح ستاره‌ای می‌رسد' },
        { id: 'i3', text: 'پس آسمان باید یکدست روشن باشد' },
        { id: 'i4', text: 'اما آسمان تاریک است، پس فرض‌ها غلط‌اند' },
      ],
    },
    {
      id: 'b10',
      type: 'matchPairs',
      prompt: 'هر مفهوم را به توضیحش وصل کن',
      pairs: [
        {
          id: 'p1',
          concept: 'پارادوکس اولبرس',
          description: 'تناقض آسمان تاریک با جهان بی‌کران',
        },
        { id: 'p2', concept: 'سرخ‌گرایی', description: 'کم‌شدن انرژی نور در جهان منبسط' },
        { id: 'p3', concept: 'افق دید', description: 'دورترین فاصله‌ای که نورش به ما رسیده' },
      ],
      distractors: ['تعداد ستاره‌های کهکشان راه شیری'],
    },
    {
      id: 'b11',
      type: 'reflection',
      prompt: 'کدام فرضِ آن استدلال برایت غافلگیرکننده‌تر بود؟',
      maxLength: 600,
    },
    {
      id: 'b12',
      type: 'summary',
      points: [
        'در جهان بی‌کران و همیشگی، آسمان شب باید یکدست روشن باشد.',
        'تاریکی آسمان یعنی جهان سنّ محدودی دارد؛ انبساط سهم کوچک‌تری دارد.',
        'غبار پاسخ نیست: هر چیزی که نور را جذب کند، خودش می‌تابد.',
      ],
    },
  ],
};
