import { SEED_SCHEMA_VERSION, type Seed } from '@/models/seed';

/**
 * خواب و تثبیت حافظه.
 *
 * Launch content. It carries no image block on purpose: the first release ships
 * text, quizzes and review, and a seed that promised a diagram it does not have
 * would show a missing-asset state to every reader who opened it.
 */
export const sleepAndMemorySeed: Seed = {
  id: 'seed-sleep-and-memory',
  schemaVersion: SEED_SCHEMA_VERSION,
  revision: 1,
  topicId: 'biology',
  title: 'چرا بعد از یادگیری باید بخوابی؟',
  promise: 'می‌فهمی خواب چه کاری با چیزی که امروز یاد گرفته‌ای می‌کند.',
  difficulty: 'intro',
  estimatedMinutes: 7,
  lastReviewedAt: '2026-08-30T00:00:00.000Z',
  reviewedBy: 'تحریریه‌ی دانانه',
  recall: [
    {
      id: 'r1',
      prompt: 'بدون نگاه‌کردن به دانه: نقش خواب در یادگیری چیست؟',
      answer:
        'خواب حافظه را از حالت شکننده به حالت پایدار می‌برد؛ الگوهای فعالیتِ روز دوباره بازپخش می‌شوند و به حافظه‌ی بلندمدت منتقل می‌شوند.',
    },
    {
      id: 'r2',
      prompt: 'چرا «بیشتر بیدار بمان و بیشتر بخوان» معمولاً جواب نمی‌دهد؟',
      answer:
        'ساعت‌های اضافه‌ی مطالعه به قیمت حذف مرحله‌ای تمام می‌شود که حافظه در آن تثبیت می‌شود، و یادگیریِ همان ساعت‌ها را هم تضعیف می‌کند.',
    },
  ],
  sources: [
    {
      id: 'src-rasch-born-2013',
      title: 'About Sleep’s Role in Memory',
      publisher: 'Physiological Reviews, vol. 93, no. 2, pp. 681–766',
      year: 2013,
      era: 'ce',
      kind: 'مقاله‌ی مروری',
      url: 'https://doi.org/10.1152/physrev.00032.2012',
      latin: true,
    },
    {
      id: 'src-walker-2004',
      title: 'Sleep-Dependent Learning and Memory Consolidation',
      publisher: 'Neuron, vol. 44, no. 1, pp. 121–133',
      year: 2004,
      era: 'ce',
      kind: 'مقاله‌ی مروری',
      url: 'https://doi.org/10.1016/j.neuron.2004.08.031',
      latin: true,
    },
  ],
  blocks: [
    {
      id: 'b1',
      type: 'richText',
      eyebrow: 'تثبیت حافظه',
      heading: 'یادگیری در بیداری شروع می‌شود، اما در خواب تمام می‌شود',
      paragraphs: [
        'وقتی چیزی یاد می‌گیری، ردّ آن در ابتدا شکننده است: به‌راحتی با یادگیری بعدی مخدوش می‌شود و به‌سرعت رنگ می‌بازد.',
        'در خواب، همان الگوهای فعالیتی که هنگام یادگیری فعال بودند دوباره بازپخش می‌شوند. این بازپخش، ردّ شکننده را به چیزی پایدارتر تبدیل می‌کند — فرآیندی که به آن «تثبیت» می‌گویند.',
      ],
    },
    {
      id: 'b2',
      type: 'callout',
      tone: 'note',
      title: 'خوب است بدانی',
      body: 'اثر خواب فقط بر حافظه‌ی واقعیت‌ها نیست. مهارت‌های حرکتی — نواختن یک قطعه، تایپ یک الگو — هم بعد از یک شب خواب بهتر اجرا می‌شوند، بدون تمرین اضافه.',
    },
    {
      id: 'b3',
      type: 'callout',
      tone: 'misconception',
      title: 'اشتباه رایج',
      body: '«خواب فقط استراحت است.» مغز در خواب کم‌کارتر نیست؛ الگوی کارش عوض می‌شود. بخشی از شب صرف کاری می‌شود که در بیداری انجام‌شدنی نیست.',
    },
    {
      id: 'b4',
      type: 'quote',
      text: 'خواب پس از یادگیری اجباری است، اگر بخواهیم آن یادگیری باقی بماند.',
      attribution: 'نقل به مضمون از مرور راش و بورن',
      period: '۲۰۱۳',
    },
    {
      id: 'b5',
      type: 'multipleChoice',
      question: 'در خواب، چه چیزی باعث پایدار شدن یک خاطره‌ی تازه می‌شود؟',
      sourceId: 'src-rasch-born-2013',
      options: [
        { id: 'o1', text: 'کاهش کامل فعالیت مغز و استراحت آن', isCorrect: false },
        { id: 'o2', text: 'بازپخش الگوهای فعالیتِ زمان یادگیری', isCorrect: true },
        { id: 'o3', text: 'پاک شدن خاطرات قدیمی برای باز شدن جا', isCorrect: false },
        { id: 'o4', text: 'افزایش دمای بدن در نیمه‌ی دوم شب', isCorrect: false },
      ],
      explanation:
        'همان شبکه‌های فعال هنگام یادگیری در خواب دوباره فعال می‌شوند، و همین بازپخش است که ردّ حافظه را تثبیت می‌کند.',
    },
    {
      id: 'b6',
      type: 'multiSelect',
      question: 'کدام‌ها با شواهد این دانه سازگارند؟',
      options: [
        { id: 'o1', text: 'مهارت حرکتی بعد از یک شب خواب بهتر اجرا می‌شود', isCorrect: true },
        { id: 'o2', text: 'خاطره‌ی تازه بلافاصله پس از یادگیری شکننده است', isCorrect: true },
        { id: 'o3', text: 'کم‌خوابی فقط بر خلق‌وخو اثر می‌گذارد، نه بر حافظه', isCorrect: false },
        { id: 'o4', text: 'تثبیت حافظه فقط در بیداری ممکن است', isCorrect: false },
      ],
      explanation:
        'کم‌خوابی هم یادگیری تازه را دشوارتر می‌کند و هم تثبیت آنچه پیش‌تر یاد گرفته‌ای را ناقص می‌گذارد.',
    },
    {
      id: 'b7',
      type: 'trueFalse',
      statement: 'مرور یک مطلب درست پیش از خواب، شانس ماندگاری‌اش را بیشتر می‌کند.',
      answer: true,
      explanation:
        'فاصله‌ی کمتر میان یادگیری و خواب، فرصت کمتری برای تداخل با مطالب بعدی می‌گذارد و بازپخش زودتر اتفاق می‌افتد.',
    },
    {
      id: 'b8',
      type: 'matchPairs',
      prompt: 'هر مفهوم را به توضیحش وصل کن',
      pairs: [
        { id: 'p1', concept: 'تثبیت', description: 'پایدار شدن ردّ شکننده‌ی حافظه' },
        { id: 'p2', concept: 'بازپخش', description: 'فعال شدن دوباره‌ی الگوی زمان یادگیری' },
        { id: 'p3', concept: 'تداخل', description: 'مخدوش شدن خاطره با یادگیری بعدی' },
      ],
      distractors: ['فراموشی وابسته به بافت'],
    },
    {
      id: 'b9',
      type: 'reflection',
      prompt: 'اگر قرار بود یک ساعت از شب‌بیداری‌ات را به خواب بدهی، آن ساعت را از کجا برمی‌داشتی؟',
      maxLength: 600,
    },
    {
      id: 'b10',
      type: 'summary',
      points: [
        'خاطره‌ی تازه شکننده است و به‌راحتی با یادگیری بعدی مخدوش می‌شود.',
        'خواب همان الگوها را بازپخش می‌کند و ردّ حافظه را تثبیت می‌کند.',
        'ساعت‌های اضافه‌ی مطالعه به قیمت حذف همان مرحله تمام می‌شود.',
      ],
    },
  ],
};
