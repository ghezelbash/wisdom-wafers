# ممیزی آمادگی انتشار دانانه

تاریخ بررسی: ۱۴ شهریور ۱۴۰۵ / 4 September 2026  
مخزن بررسی‌شده: `/Users/erfan/Projects/Personal/wisdom-wafers`  
هدف: رسیدن از skeleton فعلی به یک محصول واقعی که کاربر اندروید بتواند دانلود، نصب، ورود/ثبت‌نام، دریافت محتوا، یادگیری و ادامه‌ی استفاده را تجربه کند.

---

> ## به‌روزرسانی — پایان Goal 9 · ۱۴ شهریور ۱۴۰۵
>
> **P0-2 تا P0-6 بسته شدند.** P0-1 و P0-7 از سمت کد بسته‌اند و فقط منتظر
> credential هستند. جزئیات هر کدام در همان بخش خودش پایین‌تر آمده است.
>
> | بررسی | قبل | حالا |
> |---|---|---|
> | Unit/component tests | ۱۲ suite · ۱۴۱ تست | **۱۹ suite · ۲۵۳ تست** |
> | Emulator/integration tests | ۹ suite · ۹۶ تست | **۱۶ suite · ۱۶۷ تست** |
> | Config validation | نداشت | **۱۲ بررسی** (`npm run check:config`) |
> | Android native verification | نداشت | **۱۱ بررسی** (`npm run check:android`) |
> | E2E | نداشت | **۹ flow در `.maestro/`** |
> | typecheck / lint | Pass | Pass · ۰ error |
>
> **Go/No-Go:** برای ساخت APK داخلی، **Go مشروط** — همه‌ی کارهای کدی انجام
> شده و فقط credential لازم است. برای Play Store همچنان **No-Go**.
>
> فهرست دقیق آنچه از شما لازم است: انتهای `docs/runbooks/environments.md`.
> یادداشت‌های انتشار و checklist نصب: `docs/internal-beta.md`.

---

## 1. حکم نهایی

دانانه اکنون یک **prototype بصری بسیار خوب و یک codebase مهندسی‌شده‌ی امیدوارکننده** است، اما هنوز **Release Candidate** نیست. در وضعیت فعلی می‌توان UI را نمایش داد و مسیرهای محلی را تجربه کرد؛ نمی‌توان با اطمینان یک APK production به کاربر واقعی داد و انتظار داشت Firebase، ورود، محتوای آنلاین، sync، گزارش خطا و حذف حساب درست کار کنند.

### ارزیابی هر لایه

| لایه | وضعیت | جمع‌بندی |
|---|---:|---|
| هویت بصری و UX داخل اپ | خوب | RTL، تایپوگرافی، onboarding و seed player منسجم و باکیفیت‌اند |
| دامنه و مدل محتوا | خوب | schema مشترک، block registry، revision و checksum طراحی مناسبی دارند |
| قابلیت‌های محلی | متوسط رو به خوب | progress، review، search و recommendation کار می‌کنند؛ offline واقعی یکپارچه نشده |
| backend و sync واقعی | مسدود | Firebase فعلی معتبر/قابل‌دسترسی نیست و چند قرارداد client/server با هم نمی‌خوانند |
| امنیت و data lifecycle | ناقص | rules پایه خوب است، ولی CMS قابل دورزدن و حذف حساب فعلی نمایشی است |
| observability | نمایشی | taxonomy وجود دارد؛ Analytics/Crashlytics/Performance sink واقعی ندارند |
| Android release | آماده‌ی شروع، نه آماده‌ی تحویل | prebuild موفق است؛ APK امضاشده و EAS-linked هنوز تولید نشده |
| محتوای launch | ناکافی | یک seed دست‌ساز خوب، ۱۱ محتوای legacy و یک fixture عمداً نامعتبر در runtime وجود دارد |

**نتیجه‌ی Go/No-Go:**

- برای demo داخلی UI: **Go**
- برای APK تست محدود پس از رفع Blockerهای P0: **Go مشروط**
- برای کاربر عمومی یا Play Store: **No-Go فعلی**

---

## 2. شواهدی که اجرا و بررسی شد

| بررسی | نتیجه |
|---|---|
| TypeScript برای app، tests، schema، functions و admin | Pass |
| Unit/component tests | ۱۲ suite و ۱۴۱ تست Pass |
| Firebase emulator/integration tests | ۹ suite و ۹۶ تست Pass؛ process یک open handle دارد و تمیز exit نمی‌کند |
| **پس از Goal 1** — unit tests | ۱۲ suite و ۱۴۱ تست Pass |
| **پس از Goal 1** — emulator/integration tests | ۱۰ suite و ۱۱۱ تست Pass، شامل `content-delivery.test.ts` که bundle را از Storage emulator واقعی دانلود می‌کند |
| **پس از Goal 1** — typecheck (۵ پروژه) و lint | Pass؛ همان ۲ warning قبلی در `src/i18n.ts` |
| **پس از Goal 1** — web export و smoke مرورگر ۳۹۰×۸۴۴ | Pass؛ onboarding، Home، Explore و مدیریت فضا بدون خطای console |
| **پس از Goal 2** — unit tests | ۱۵ suite و ۱۷۱ تست Pass |
| **پس از Goal 2** — emulator/integration tests | ۱۱ suite و ۱۱۹ تست Pass، شامل `outbox-delivery.test.ts` (offline → force-stop → reconnect → دقیقاً یک‌بار در Firestore) |
| **پس از Goal 2** — typecheck و lint | Pass؛ ۰ error |
| **پس از Goal 3** — unit tests | ۱۵ suite و ۱۷۴ تست Pass |
| **پس از Goal 3** — emulator/integration tests | ۱۳ suite و ۱۳۰ تست Pass، شامل `identity-migration.test.ts` (guest → completion → signup و ورود به حساب موجود) |
| **پس از Goal 4** — unit tests | ۱۶ suite و ۱۸۴ تست Pass |
| **پس از Goal 4** — emulator/integration tests | ۱۴ suite و ۱۳۷ تست Pass، شامل `account-lifecycle.test.ts` (حذف واقعی، recent-auth، resume پس از شکست) |
| **پس از Goal 5** — unit tests | ۱۶ suite و ۱۹۲ تست Pass |
| **پس از Goal 5** — smoke مرورگر با launch catalogue | Home، Explore (۳ موضوع، ۱ رویش)، و هر دو دانه‌ی تازه در player بدون خطای console |
| **پس از Goal 6** — emulator/integration tests | ۱۵ suite و ۱۵۳ تست Pass، شامل تست‌های deny برای CMS و یک secret scan |
| **پس از Goal 7** — unit tests | ۱۷ suite و ۲۱۰ تست Pass |
| **پس از Goal 7** — `npm run check:config` | ۱۲ بررسی Pass: هویت هر variant، و شکست ۶ misconfiguration |
| **پس از Goal 8** — unit tests | ۱۸ suite و ۲۳۵ تست Pass |
| **پس از Goal 8** — `npm run check:android` | ۱۱ بررسی Pass روی prebuild واقعی؛ دو نقص واقعی (`POST_NOTIFICATIONS`، `allowBackup`) پیدا و رفع شد |
| **پس از Goal 9** — unit tests | ۱۹ suite و ۲۵۳ تست Pass |
| **پس از Goal 9** — emulator/integration tests | ۱۶ suite و ۱۶۷ تست Pass، شامل `telemetry.test.ts` (funnel و رد شدن PII) |
| Lint | بدون error؛ ۲ warning در `src/i18n.ts` |
| Expo web export | Pass |
| Expo Android JS export | Pass؛ این APK یا native build نیست |
| Expo prebuild اندروید در فضای موقت | Pass |
| Gradle APK build محلی | اجرا نشد؛ روی این Mac، Java/Android toolchain نصب نیست |
| Expo Doctor | Fail: نسخه‌ی AsyncStorage با نسخه‌ی توصیه‌شده‌ی Expo 57 سازگار نیست (`3.1.1` در برابر `2.2.0`) |
| live Firebase probe | Fail: درخواست Auth پاسخ `API key not valid` داد؛ Firestore نیز HTTP 403 برگرداند |
| visual smoke test در viewport موبایل 390×844 | onboarding، انتخاب علایق و seed player بدون crash و با RTL خوب اجرا شدند |
| runtime console | چند warning برای route names در root Stack و warning مخصوص animation روی web |
| وضعیت Git | ۱۱۷ فایل تغییرکرده/جدید و فقط یک commit قدیمی؛ هنوز baseline قابل‌بازگشت برای این پیاده‌سازی وجود ندارد |

نکته: خروجی `expo export --platform android` فقط ثابت می‌کند JavaScript bundle ساخته می‌شود. Installable APK زمانی اثبات می‌شود که EAS/Gradle یک binary امضاشده بسازد و آن binary روی حداقل دو دستگاه واقعی نصب و smoke-test شود.

---

## 3. چه چیزهایی واقعاً انجام شده‌اند؟

### انجام‌شده و قابل اتکا

- Design tokens، dark/light theme، فونت فارسی و layout راست‌به‌چپ
- Guest-first onboarding و دسترسی بدون login wall
- Seed player با ۱۱ نوع block، پاسخ‌دهی، feedback، source و report sheet
- progress محلی، review scheduling، Garden، Explore و Persian search normalization
- recommendation v1 با scoring قابل‌توضیح، diversity، exploration floor و تست‌ها؛ `BUILD_TODO.md` در این بخش قدیمی است
- schema مشترک Zod میان client، Functions و CMS
- publish/rollback و progress ingestion در emulator
- Firestore/Storage rules با deny-by-default و تست‌های emulator
- ساختار اولیه‌ی CMS و workflow تحریریه
- CI برای lint/typecheck/unit/emulator/web export

### فقط scaffold یا نیمه‌متصل

- SQLite schema و outbox مقاوم نوشته و تست شده‌اند، اما مسیر واقعی اپ هنوز از outbox ساده‌ی AsyncStorage استفاده می‌کند
- remote flags API وجود دارد، اما هیچ Remote Config fetch/apply در runtime وجود ندارد
- analytics event map و PII guard وجود دارد، اما sink واقعی ثبت داده وجود ندارد
- Firebase Functions نوشته شده‌اند، اما deployment واقعی یا دسترسی production تأیید نشده است
- EAS profiles نوشته شده‌اند، ولی پروژه به EAS link نشده و env/credential واقعی ثابت نشده است
- CMS می‌تواند draftهای موجود را ویرایش کند، اما create draft، topic/path management، media upload و deployment آماده ندارد
- notification code محلی وجود دارد، اما روی دستگاه Android و permission/channel واقعی تست نشده است
- پکیج هویت بصری production از روی نشان منتخب ساخته و به Expo متصل شده است: SVG master و wordmark/lockupهای outline، آیکن opaque برای iOS، adaptive و monochrome برای Android، splash روشن/تاریک، notification icon و favicon در `assets/brand/`

### انجام‌نشده یا خارج از scope فعلی

- App Check، Crashlytics، Performance Monitoring و native Analytics
- sync واقعی preferences/progress میان دستگاه‌ها
- پاک‌سازی واقعی حساب و داده‌های Firebase/device
- audio/video block و pipeline مربوط به media
- privacy policy، terms، support/about screens و Play Data Safety answers
- native E2E test و Android build gate در CI
- محتوای launch کافی و media واقعی برای seed اول

---

## 4. Blockerهای P0 پیش از هر APK بیرونی

### P0-1 — محیط Firebase واقعی کار نمی‌کند — **کد بسته شد؛ منتظر credential (۱۴ شهریور ۱۴۰۵)**

> **Status: the code side is done; the remaining work needs your credentials.**
> `config/env.js` validates the environment at build time (`app.config.ts`) and
> at startup, and a staging or production build with missing, placeholder or
> mismatched configuration now **fails** instead of falling back to a
> device-local identity. `EXPO_PUBLIC_ENV_NAME` must equal `APP_VARIANT`, which
> is what stops a staging build carrying production's project. `eas.json` has an
> explicit `internal-apk` profile and every profile names an EAS environment.
> `npm run check:config` is a CI gate covering identity per variant and six
> misconfigurations. **What is still needed from the project owner is listed at
> the end of `docs/runbooks/environments.md`** — Firebase projects, the six web
> config values per environment, the EAS project id, and the Android signing
> decision. Decision in `docs/adr/0016-environment-validation-fails-the-build.md`.

شرح اصلی مشکل، برای سابقه:

`.env` به پروژه‌ای با نام `wisdom-wafers` اشاره می‌کند، در حالی که aliasهای `.firebaserc` نام‌های `dananeh-dev/staging/prod` دارند. probe زنده نشان داد API key معتبر نیست و Firestore نیز 403 می‌دهد. علاوه بر آن، `.env` در Git نادیده گرفته می‌شود و `eas.json` فقط `APP_VARIANT` و `EXPO_PUBLIC_CONTENT_SOURCE` را تعیین می‌کند؛ پس EAS Build الزاماً Firebase config لازم را دریافت نمی‌کند.

**پیامد:** anonymous auth، login، password reset، Firestore catalog، Functions و CMS production قابل‌اعتماد نیستند.

**رفع:** سه Firebase project واقعی بسازید/تثبیت کنید؛ Android app را با package درست در هرکدام ثبت کنید؛ Auth providers، Firestore، Storage و Functions را deploy کنید؛ envها را در EAS Environment نگه دارید؛ سپس smoke test را روی staging واقعی اجرا کنید.

### P0-2 — remote content path قابل دانلود نیست — **بسته شد (۱۴ شهریور ۱۴۰۵)**

> **وضعیت فعلی:** رفع شد. `SeedManifest` در `packages/content-schema` قرارداد
> مشترک publisher و client است و `publishSeed`/`rollbackSeed` هر هفت فیلد
> (`seedId`، `revision`، `storagePath`، `checksum`، `bytes`، `schemaVersion`،
> `publishedAt`) را می‌نویسند. `storagePath` یک object path است و schema هر
> مقداری با scheme، اسلش ابتدایی یا `..` را رد می‌کند؛ `assertStoragePath` همان
> قاعده را دوباره در لایه‌ی transport اعمال می‌کند. دریافت bytes از طریق
> `getDownloadURL` و پشت interface `BundleStorage` انجام می‌شود، پس هیچ مسیری
> مستقیم به `fetch()` نمی‌رود. `DeviceCatalog` تنها مسیر state دستگاه است؛
> commit دانلود یک transaction است و در صورت شکست فایل حذف می‌شود. اثبات:
> `tests/integration/content-delivery.test.ts` روی Storage emulator واقعی.
> جزئیات تصمیم در `docs/adr/0011-seed-manifest-as-the-delivery-contract.md`.

شرح اصلی مشکل، برای سابقه:

Function مقدار `bundlePath` مانند `content/seeds/.../bundle.json` را در Firestore ذخیره می‌کند، ولی client آن را مستقیماً به `fetch(path)` می‌دهد (`CatalogContext.tsx:249-252`). این یک URL نیست. همچنین بعد از `bundleToSeed`، `bundleUrl/checksum` روی مدل `Seed` نگه داشته نمی‌شود، در حالی که download flow آن دو فیلد را از `Seed` cast می‌کند (`CatalogContext.tsx:162-165`).

**پیامد:** catalog remote ممکن است metadata را ببیند، ولی bundleها و دانلود offline واقعی fail یا simulate می‌شوند.

**رفع:** manifest محلی شامل `storagePath`, `revision`, `checksum`, `bytes` نگه دارید و از Firebase Storage SDK (`ref` + `getDownloadURL/getBytes`) یا URL امضاشده/CDN استفاده کنید. manifest و seed payload باید با هم و به‌صورت atomic در SQLite ثبت شوند.

### P0-3 — completion sync و report delivery عملاً از دست می‌روند — **بسته شد (۱۴ شهریور ۱۴۰۵)**

> **Status: fixed.** One outbox now (`SqlOutboxStore` on device, key-value
> elsewhere) behind `src/lib/outbox.ts`; the parallel AsyncStorage queue is
> gone. Envelopes are built and validated against `ProgressEventSchema` in
> `src/domain/progress/events.ts` before they are queued. The transport answers
> per item: `applied`/`duplicate` delete, `rejected` dead-letters with its
> reason, a thrown error retries with backoff, and an unrecognised answer is
> never read as delivery. Reports go through a new `submitReport` callable and
> `firestore.rules` refuses every client write to `reports`. Proof:
> `tests/integration/outbox-delivery.test.ts` and `src/lib/__tests__/outbox.test.ts`.
> Decision recorded in `docs/adr/0012-one-typed-outbox-with-per-item-acknowledgement.md`.

Original problem, for the record:

Client completion را فقط با `{seedId, revision, completedAt}` enqueue می‌کند (`seed/[id]/index.tsx:214`)، در حالی که server schema فیلدهای `id`, `uid`, `type`, `occurredAtDevice`, `timezone`, `appVersion` را لازم دارد. Function این event را rejected می‌کند، اما sender پاسخ `rejected` را بررسی نمی‌کند و outbox آن را sent تلقی و حذف می‌کند.

برای report وضعیت بدتر است: sender هر item غیر از `completion` را filter می‌کند و بدون خطا return می‌دهد (`progress-sender.ts:32-36`)؛ بنابراین report از outbox پاک می‌شود بدون اینکه جایی ثبت شود.

**پیامد:** streak/stat/progress server-side ساخته نمی‌شود و گزارش محتوای کاربر silently lost می‌شود.

**رفع:** یک outbox واحد و typed بسازید؛ envelope کامل را زمان enqueue ثبت کنید؛ transport جدا برای `progress-event` و `content-report` داشته باشید؛ تنها پس از ack صریح item حذف شود؛ rejected item باید retryable یا dead-letter با reason شود.

### P0-4 — offline معماری نوشته شده ولی به runtime وصل نیست — **بسته شد (۱۴ شهریور ۱۴۰۵)**

> **وضعیت فعلی:** بخش catalog/downloads بسته شد. remote seeds اکنون در SQLite
> (`replaceCatalog`) ذخیره می‌شوند و startup از همان‌جا hydrate می‌کند؛ هر نسخه‌ی
> نگه‌داشته‌شده پیش از نمایش دوباره verify می‌شود و در صورت عدم تطابق به
> `corrupt` تبدیل و دوباره دانلود می‌شود. `revision` دیگر hard-code نیست، حذف
> دانلود هم row و هم فایل را پاک می‌کند، و `lastSyncedAt` فقط با commit موفق
> جلو می‌رود. Progress و outbox نیز در Goal 2 به همان SQLite منتقل شدند و یک
> boundary test تضمین می‌کند هیچ screen مستقیماً storage را صدا نمی‌زند.

شرح اصلی مشکل، برای سابقه:

`src/data/local/local-store.ts` دارای SQLite outbox/backoff/dead-letter و catalog table است؛ اپ واقعی از `src/lib/outbox.ts` مبتنی بر AsyncStorage استفاده می‌کند. remote seeds فقط در singleton حافظه hydrate می‌شوند و در SQLite با `putSeeds` ذخیره نمی‌شوند. دانلودشده‌ها نیز هنگام startup از فایل خوانده و به catalog تزریق نمی‌شوند.

همچنین `saveCatalog` revision را همیشه `1` ذخیره می‌کند و حذف entry فقط state حافظه را حذف می‌کند؛ row و فایل واقعی حذف نمی‌شوند. `lastSyncedAt` حتی در صورت شکست remote fetch به زمان اکنون تغییر می‌کند (`CatalogContext.tsx:266-272`).

**پیامد:** cold start آفلاین، delete download، revision update و «آخرین sync موفق» قابل اعتماد نیستند.

**رفع:** یک `DeviceRepository` واحد روی SQLite تعریف و همه‌ی read/writeها را از آن عبور دهید. AsyncStorage فقط برای تنظیمات بسیار کوچک باقی بماند.

### P0-5 — Delete Account واقعی نیست — **بسته شد (۱۴ شهریور ۱۴۰۵)**

> **Status: fixed.** `deleteMyAccount` is a callable that requires a sign-in
> within the last five minutes and runs a resumable job recorded in
> `deletionJobs/{uid}`: user subcollections, `feeds`, `userStats`,
> `entitlements`, Storage under `users/` and `quarantine/users/`, push tokens,
> the `users/{uid}` document and finally the Auth record — last, so a failed run
> can still be retried by the reader. Reports are anonymised rather than
> destroyed. The device wipes (SQLite tables, bundle files, every owned
> AsyncStorage key) **only after** the server reports `done`, then a fresh
> anonymous identity is created. Proof:
> `tests/integration/account-lifecycle.test.ts`, including a run that dies at
> the Storage step and is resumed. Decision in
> `docs/adr/0014-account-sync-and-deletion.md`.

شرح اصلی مشکل، برای سابقه:

CTA نهایی فقط `SessionContext.reset()` و navigation انجام می‌دهد (`settings/delete-account.tsx:90-93`). Firebase Auth account، subcollectionها، local progress/reflection، downloads، push tokens و SQLite پاک نمی‌شوند.

**پیامد:** رفتار UI خلاف وعده‌ی محصول و الزامات data deletion است.

**رفع:** Callable Function با recent-auth requirement، حذف recursive Firestore/Storage/Auth، job status و idempotency؛ سپس wipe کامل local DB/files/AsyncStorage و ساخت anonymous identity جدید. Export نیز باید قبل از حذف از server و device داده‌ی واقعی بسازد.

### P0-6 — runtime production حاوی fixture تست و محتوای legacy است — **بسته شد (۱۴ شهریور ۱۴۰۵)**

> **Status: fixed.** The runtime catalogue is now `LAUNCH_SEEDS`: three
> authored Persian seeds (`seed-sky-darkness`, `seed-anchoring`,
> `seed-sleep-and-memory`), each passing `parseSeedStrict` and compiling into a
> bundle the publish gate accepts. `unknownBlockSeed` moved to
> `src/data/__fixtures__/` and is asserted *absent* from the catalogue;
> `generatedData.ts`, `mockLessons.ts`, `store.ts`, `models/lesson.ts`,
> `lessonToSeed` and `scripts/generateLessons.js` are deleted. Every source now
> cites a specific paper via a resolvable DOI — the two homepage links in the
> bundled seed (P1-11) are replaced with Wesson 1991 (ApJ 367:399) and
> Harrison's *Darkness at Night*, and the seed's claim about expansion was
> corrected to match what that paper actually reports. The registry fallback
> keeps a dedicated test.

شرح اصلی مشکل، برای سابقه:

Catalog پیش‌فرض شامل `unknownBlockSeed` عمداً نامعتبر و ۱۱ lesson تولیدشده‌ی legacy است (`content-repository.ts:96-111`). اگر remote fail شود—که اکنون می‌شود—همین‌ها به کاربر production نمایش داده می‌شوند.

**رفع پیشنهادی با توجه به نبود backward compatibility:** legacy adapter، `generatedData` و invalid fixture را از runtime حذف کنید. fixtureها فقط در test import شوند. binary production فقط ۱ تا ۳ seed کاملاً editorial و media-complete داشته باشد.

### P0-7 — زنجیره‌ی build production هنوز متصل نیست — **کد بسته شد؛ منتظر credential**

> **Status: the code side is done.** `eas.json` has an explicit `internal-apk`
> profile (Android APK, staging backend, internal distribution, `preview`
> channel) and every profile names an EAS environment and sets
> `EXPO_PUBLIC_ENV_NAME`. `app.config.ts` reads `EAS_PROJECT_ID` from the
> environment. `npm run check:config` (12 checks) and `npm run check:android`
> (11 checks against a real prebuild) are CI gates; the latter found and fixed
> two real native defects. What remains is EAS login, the project link and the
> signing key — see `docs/runbooks/environments.md`.

شرح اصلی مشکل، برای سابقه:

asset pack نهایی دانانه اکنون ساخته شده، در `assets/brand/` قرار دارد و `app.config.ts` به آیکن iOS، adaptive/monochrome Android، splash روشن/تاریک، notification icon و favicon جدید اشاره می‌کند. prebuild آزمایشی Android نیز تولید صحیح resourceها را تأیید کرده است. با این حال EAS project ID در `app.config.ts` نیست؛ EAS login/linkage تأیید نشده؛ Java/Android SDK محلی هم نصب نیست. profile فعلی `preview` APK می‌دهد، اما با package و نام staging، نه یک APK مستقیم production.

**رفع باقی‌مانده:** EAS project linkage، signing key پایدار، envهای staging/production و یک profile صریح `internal-apk` اضافه شود.

---

## 5. ایرادهای P1 که پیش از public beta باید بسته شوند

1. ~~**Analytics wiring ناقص:** `seed_completed.duration_ms` همیشه صفر بود~~ — **رفع شد در Goal 2**؛ اکنون از لحظه‌ی باز شدن seed اندازه‌گیری می‌شود.
1. ~~**Auth fallback trap**~~ — **fixed in Goal 3** (ADR 13). `recoverFromLocalOnly()` runs on reconnect and before any credential action, so a reader who launched offline can sign in without restarting. `migrateIdentity` rewrites the uid on every queued envelope and revives `uid-mismatch` dead letters. Proof: `tests/integration/identity-migration.test.ts`.
1. **Auth fallback trap (original):** اگر anonymous auth در startup یک‌بار fail کند، `isLocalOnly=true` می‌شود و sign-in/sign-up تا restart همیشه از repository محلی خطای network می‌گیرند. recovery online و migration `local-* → Firebase uid` وجود ندارد.
2. ~~**Account sync ادعایی نیست**~~ — **fixed in Goal 4**: `AccountSync` reads `users/{uid}` progress, saved and reviews; `restoreAccount` merges them into the device on sign-in with the deterministic §8.3 policy. Preferences push-on-change is still open. Original text: هیچ client write/read برای `users/{uid}` یا progress/saved/reviews server-side وجود ندارد؛ ورود در دستگاه دوم progress را برنمی‌گرداند.
3. ~~**CMS rules قابل دورزدن است**~~ — **fixed in Goal 6** (ADR 15). `cmsDrafts` now allows content-only writes (`seed`, `title`, `updatedAt`) and only while a draft is editable; create requires `authorUid == request.auth.uid` and `state == 'draft'`; `cmsReviews` is `write: if false`. Deny cases are tested for every role. Original text: `cmsDrafts` به همه‌ی editorialها create/update کامل می‌دهد و `cmsReviews` به reviewer اجازه‌ی create مستقیم می‌دهد. یک client مخرب می‌تواند state/author/audit را خارج از Functions تغییر دهد. transitionها باید فقط server-write باشند.
4. ~~**Observability واقعی صفر است**~~ — **partly fixed in Goal 9**: analytics events and crash reports now ship through the outbox to `recordTelemetryBatch`, with the PII guard applied on both sides; the ErrorBoundary reports fatals with route/seed/revision and a redacted message. Crashlytics/Performance/App Check still need native modules — see `docs/runbooks/observability.md`. Original text: default analytics sink فقط در dev log می‌کند؛ Crashlytics/Performance/App Check نصب نیست. release بدون crash telemetry کور است.
5. **Analytics wiring ناقص است:** impression، notification، download و account-link eventها عملاً ثبت نمی‌شوند؛ `seed_completed.duration_ms` همیشه صفر است و source همیشه `direct` است.
6. ~~**Feature flags remote نیست**~~ — **fixed in Goal 9**: `appConfig/public` drives flags, maintenance and minimum version, all failing open. Narrow-only was documented but not enforced; it is now.
7. **OTA واقعاً فعال نیست:** generated Android manifest مقدار `expo.modules.updates.ENABLED=false` داشت؛ runbook فعلی درباره‌ی EAS Update زودتر از implementation نوشته شده است.
8. ~~**CI native را نمی‌سازد**~~ — **fixed in Goal 7**: CI now runs `npm run check:config` and an Android `prebuild` + `assembleDebug`. Expo Doctor remains `continue-on-error` pending the AsyncStorage version decision.
9. ~~**Native QA وجود ندارد**~~ — **fixed in Goal 8** (ADR 17). `npm run check:android` asserts eleven things out of the generated manifest/resources and is a CI gate; nine Maestro flows cover the tester paths; `docs/runbooks/native-qa.md` lists what only a device can answer. Original text: SQLite، notifications، file system، deep link، keyboard و RTL فقط با unit/web پوشش داده شده‌اند؛ Maestro/Detox/EAS device smoke test وجود ندارد.
10. **اسناد وضعیت گمراه‌کننده‌اند:** `BUILD_TODO.md` بعضی بخش‌های وصل‌نشده را done اعلام کرده و recommendation پیاده‌شده را undone نشان می‌دهد. README نیز هنوز README پیش‌فرض Expo است.
11. **محتوای اولین تجربه ناقص است:** seed اول image block دارد ولی asset واقعی ندارد و fallback متن جایگزین نشان داده می‌شود. source URLها نیز به homepage ناشر اشاره می‌کنند، نه صفحه‌ی دقیق منبع.
12. **حقوقی/پشتیبانی:** privacy policy، terms، support contact، data retention، account deletion URL و Data Safety answers وجود ندارند.
13. ~~**Backup privacy**~~ — **fixed in Goal 8**: `android.allowBackup: false`, asserted by `check:android`. The trade — a reader changing phones loses on-device progress without an account — is recorded in ADR 17.
14. **Audio/video:** هیچ schema/player/pipeline برای audio یا video وجود ندارد. یا باید صریحاً از MVP حذف شود، یا قبل از ادعای Nibble-like بودن اضافه شود.
15. **Dependency health:** Expo Doctor باید gate شود و AsyncStorage به نسخه‌ی سازگار با Expo 57 برگردد/ارتقا داده شود. dependency vulnerability scan نیز به CI افزوده شود.

---

## 6. معماری هدف پیشنهادی قبل از launch

چون هنوز کاربر production ندارید، اکنون بهترین زمان برای حذف لایه‌های موازی است. backward compatibility داخلی ارزش نگه‌داشتن complexity فعلی را ندارد.

### تصمیم 1 — یک Firebase stack روی native

مهاجرت adapterها به React Native Firebase را **الان و یک‌باره** انجام دهید: App/Auth/Firestore/Storage/Functions/Analytics/Crashlytics/Performance/App Check. interfaceهای دامنه حفظ شوند، اما Firebase JS و RNFirebase هم‌زمان برای یک سرویس استفاده نشوند.

علت این تصمیم:

- App Check با Play Integrity، Crashlytics و native Analytics قبل از beta عمومی لازم‌اند.
- پروژه هنوز user/data production ندارد و migration cost اکنون کمترین است.
- adapter boundaries از قبل آماده‌اند.

### تصمیم 2 — SQLite تنها منبع حقیقت دستگاه

```text
UI / hooks
   ↓
Domain services
   ↓
DeviceRepository (SQLite + document files)
   ↕ background sync
Firebase adapters (Auth / Firestore / Storage / Functions)
```

قواعد:

- Home/Search/Player فقط از DB محلی بخوانند؛ network هرگز render را block نکند.
- catalog refresh در transaction/atomic swap انجام شود.
- bundle ابتدا download، سپس checksum verify، سپس rename و DB commit شود.
- manifest شامل revision/checksum/storagePath/bytes/locale/minAppVersion باشد.
- outbox یک table و یک worker داشته باشد؛ ack/rejected/retry/dead-letter شفاف باشد.
- reflection در outbox یا analytics وارد نشود.
- حذف download هم row و هم فایل را پاک کند.
- sync timestamp تنها پس از commit موفق تغییر کند.

### تصمیم 3 — قرارداد sync نسخه‌دار

هر event باید envelope کامل و schema-versioned داشته باشد:

```json
{
  "id": "uuid",
  "schemaVersion": 1,
  "uid": "firebase-uid",
  "type": "completed",
  "seedId": "seed-id",
  "revision": 4,
  "occurredAtDevice": "ISO-8601",
  "timezone": "Asia/Tehran",
  "appVersion": "1.0.0"
}
```

Function باید برای هر item نتیجه‌ی `applied | duplicate | rejected(reason)` بدهد. Client فقط applied/duplicate را حذف کند.

### تصمیم 4 — launch scope شفاف

برای اولین beta پیشنهاد می‌شود text/image/quiz/review را ship کنید و audio/video را به Goal بعدی ببرید. اگر audio/video جزو promise بازاریابی نسخه‌ی اول است، schema، CMS، streaming/download، background audio، caption/transcript و quota/cost باید پیش از beta اضافه شوند.

---

## 7. Roadmap اجرایی برای Claude Code

ترتیب زیر dependency-aware است. Goal بعدی تا pass شدن acceptance قبلی شروع نشود.

### Goal 0 — Baseline و حذف ambiguity

**کارها**

- همه‌ی ۱۱۷ تغییر فعلی را review و در یک baseline commit ثبت کنید؛ artifactهای zip/screenshot را از source tree خارج کنید.
- README واقعی با setup، env matrix، emulator، build و release بنویسید.
- `BUILD_TODO.md` را بر اساس واقعیت code path اصلاح کنید.
- scope نسخه‌ی 1.0 را درباره‌ی audio/video و direct APK vs Play مشخص کنید.
- fixtureهای test را از runtime production جدا کنید.

**Acceptance criteria**

- `git status` تمیز است.
- clone تازه با `npm ci` و env example قابل اجراست.
- هیچ `unknownBlockSeed` یا legacy generated lesson در production catalog نیست.
- ADR کوتاه برای native Firebase و distribution channel ثبت شده است.

**Dependency:** ندارد.

### Goal 1 — Environments، EAS و Firebase واقعی

**کارها**

- Firebase dev/staging/prod واقعی؛ ثبت Android packageهای `.dev`, `.staging`, production.
- enable کردن Anonymous و Email/Password Auth.
- deploy rules/indexes/storage/functions به dev و staging.
- ساخت role bootstrap امن برای admin/editor/reviewer.
- `eas init` و ثبت `extra.eas.projectId`.
- EAS Environments برای متغیرهای public و credential files؛ بدون تکیه به `.env` محلی.
- افزودن `internal-apk` و `production` profiles با versioning روشن.
- مهاجرت adapterها به RNFirebase و dev client.

**Acceptance criteria**

- staging APK امضاشده روی دستگاه واقعی نصب و cold-start می‌شود.
- anonymous user واقعاً در Firebase Auth دیده می‌شود.
- create account همان uid را حفظ می‌کند.
- query منتشرشده‌ی `status == published` از staging پاسخ می‌دهد.
- Function callable و Storage download روی دستگاه واقعی موفق است.
- config هیچ environment به project دیگری نشت نمی‌کند.

**Dependency:** Goal 0.

### Goal 2 — بازنویسی Content/Offline/Outbox integration

**کارها**

- `DeviceRepository` واحد و حذف AsyncStorage catalog/outbox موازی.
- persist کردن catalog + topics + paths + manifests در SQLite.
- دریافت bundle با Storage SDK، checksum و atomic write.
- startup hydration از SQLite/files، نه fixture singleton.
- typed outbox برای progress و report؛ بررسی per-item ack.
- sync user progress/saved/reviews با conflict policy موجود.
- cleanup واقعی download و media؛ quota بر اساس فایل واقعی.

**Acceptance criteria**

- fresh online install → catalog sync → seed opens.
- airplane mode + force-stop + relaunch → downloaded seed، search و progress کار می‌کنند.
- قطع network وسط download → فایل ناقص render نمی‌شود و retry موفق است.
- completion آفلاین بعد از reconnect دقیقاً یک‌بار در Firestore ثبت می‌شود.
- report آفلاین بعد از reconnect در `reports` دیده می‌شود.
- حذف download پس از relaunch برنمی‌گردد.
- timestamp sync در failure تغییر نمی‌کند.

**Dependency:** Goal 1.

### Goal 3 — Identity، account merge و data lifecycle

**کارها**

- recovery از local-only session بدون نیاز به restart.
- migration مشخص local uid به anonymous/account uid.
- policy برای sign-in به حساب موجود: merge local device progress با server یا prompt روشن.
- users/preferences sync.
- password reset و email verification UX واقعی.
- export server+device data.
- callable delete account با recursive deletion و local wipe.

**Acceptance criteria**

- startup آفلاین → کار محلی → آنلاین → ساخت حساب، بدون از دست رفتن progress.
- login روی دستگاه دوم، progress/saved/preferences را بازمی‌گرداند.
- duplicate completion merge می‌شود و streak دو بار زیاد نمی‌شود.
- delete account واقعاً Auth، Firestore، Storage، tokenها، SQLite و files را پاک می‌کند.
- کاربر پس از حذف با anonymous uid تازه وارد app می‌شود.

**Dependency:** Goals 1 و 2.

### Goal 4 — Content production و CMS امن

**کارها**

- بستن bypass rules: state transition، review و publish فقط از Functions/Admin SDK.
- create/duplicate draft، topic/path CRUD، media upload، source validation و publish job status.
- quarantine/scan یا حداقل staff-only media upload با MIME/size validation.
- لینک دقیق منبع، تاریخ review، owner و rollback drill.
- تولید حداقل ۲۰ تا ۳۰ seed launch-quality در چند topic با media دارای مجوز.
- حداقل ۳ seed کاملاً همراه binary برای first-run آفلاین.

**Acceptance criteria**

- editor نمی‌تواند draft خود را approve کند، نه از UI و نه با REST/SDK مستقیم.
- reviewer نمی‌تواند audit/state جعلی بنویسد.
- publish از CMS در staging، bundle قابل دانلود و قابل render می‌سازد.
- تمام content با strict schema، source checklist، image alt و editorial review پاس می‌شود.
- production fallback فقط محتوای واقعی نشان می‌دهد.

**Dependency:** Goals 1 و 2؛ تولید محتوا می‌تواند موازی با Goal 3 باشد.

### Goal 5 — Observability، security و release gates

**کارها**

- Crashlytics، Analytics و Performance sink واقعی با consent/data policy مناسب.
- App Check با Play Integrity: ابتدا monitor، سپس staging enforce، سپس production تدریجی.
- Remote Config/appConfig برای maintenance، minimum version و kill switches.
- GitHub CI: Expo Doctor سخت‌گیر، Android JS export، native/EAS preview build دوره‌ای، rules tests بدون open handle.
- Maestro E2E برای onboarding، guest seed، account link، offline relaunch، report، notification denial و delete account.
- dependency/security scan، secret scan و backup/restore drill.

**Acceptance criteria**

- forced crash در Crashlytics با route/seed/revision و بدون PII دیده می‌شود.
- funnel واقعی onboarding → start → complete در Analytics دیده می‌شود.
- App Check metrics سالم است و sideload strategy با تنظیمات Play Integrity تضاد ندارد.
- CI با Expo Doctor warning یا native build failure قرمز می‌شود.
- یک restore از backup در staging واقعاً انجام و زمان آن ثبت می‌شود.

**Dependency:** Goals 1 تا 4.

### Goal 6 — Android internal beta APK

**کارها**

- تأیید نهایی app icon/splash/notification icon روی build release و چند launcher واقعی.
- privacy/support pages و لینک public.
- ساخت `internal-apk` با staging backend و signing key پایدار.
- تست روی حداقل Android 10، 13، 15 و 16؛ یک Samsung و یک Pixel/stock Android.
- تست شبکه‌ی واقعی کاربران هدف، مخصوصاً اگر کاربران داخل ایران‌اند.
- beta با ۱۵ تا ۳۰ tester و feedback channel مشخص.

**Acceptance criteria**

- APK از URL روی دستگاه clean نصب می‌شود و به Metro/کامپیوتر نیاز ندارد.
- نصب، cold start، guest use، login/signup/reset، content sync، download/offline، review، notification و report pass هستند.
- crash-free users ≥ 99.5% در دوره‌ی beta و هیچ P0/P1 باز نیست.
- p95 cold start و seed open budget تعریف‌شده را پاس می‌کند.
- uninstall/reinstall و upgrade از beta build قبلی بررسی شده است.

**Dependency:** Goals 1 تا 5.

### Goal 7 — انتشار عمومی

**کارها**

- production AAB، Play App Signing، store listing، screenshots، content rating و Data Safety.
- target Android 16 / API 36 برای submissionهای بعد از 31 August 2026.
- internal test → closed test → rollout 5% → 25% → 100%.
- اگر حساب Play شخصی بعد از 13 November 2023 ساخته شده، closed test با حداقل ۱۲ tester برای ۱۴ روز پیوسته.
- direct APK فقط به‌عنوان کانال مکمل، با update policy و checksum/signature verification روشن.

**Acceptance criteria**

- Play pre-launch report بدون blocker.
- production backend، app signing، privacy declaration و app behavior با هم منطبق‌اند.
- rollout dashboard، incident owner و rollback/kill-switch آماده‌اند.
- rollout فقط وقتی بالا می‌رود که crash، auth error، bundle failure و outbox rejection در threshold باشند.

**Dependency:** Goal 6.

---

## 8. سریع‌ترین مسیر امن به اولین APK قابل‌نصب

این مسیر برای **beta داخلی** است، نه public launch:

1. Blockerهای P0-1 تا P0-4 و P0-7 را ببندید.
2. EAS project را link و credential/env staging را تنظیم کنید.
3. profile صریح بسازید:

```json
{
  "build": {
    "internal-apk": {
      "distribution": "internal",
      "channel": "preview",
      "env": {
        "APP_VARIANT": "staging",
        "EXPO_PUBLIC_CONTENT_SOURCE": "remote"
      },
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

4. سپس:

```bash
npx expo install --check
npm run typecheck
npm run lint
npm test -- --ci
npm run test:emulator
npx eas-cli@latest build --platform android --profile internal-apk
```

5. URL خروجی EAS را روی یک گوشی clean باز و نصب کنید.
6. smoke checklist Goal 6 را کامل کنید و build ID/commit SHA را ثبت کنید.

EAS با `distribution: internal` برای Android به‌صورت پیش‌فرض APK installable و URL قابل اشتراک می‌سازد. production profile به‌صورت پیش‌فرض AAB می‌سازد که مستقیماً نصب نمی‌شود و برای Play Store مناسب است.

---

## 9. Definition of Done برای «محصول کامل»

محصول تنها وقتی کامل تلقی شود که یک tester تازه، بدون کمک تیم، بتواند:

1. APK یا Play build را دانلود و نصب کند.
2. در first launch آفلاین حداقل یک محتوای واقعی ببیند.
3. onboarding را با RTL صحیح کامل کند.
4. به‌صورت guest یک seed را شروع و تمام کند.
5. حساب بسازد یا login کند و progress خود را از دست ندهد.
6. اپ را روی دستگاه دوم نصب کند و progress/saved content را ببیند.
7. محتوا را دانلود، force-stop و آفلاین دوباره باز کند.
8. reminder را فعال/رد کند و UI با permission واقعی هماهنگ بماند.
9. خطای محتوا را آفلاین report کند و پس از اتصال، report در backend دیده شود.
10. داده‌اش را export و سپس حساب را واقعاً حذف کند.
11. در صورت crash، تیم رویداد را در observability ببیند.
12. در صورت محتوای بد، تیم بتواند بدون build جدید rollback/withdraw کند.

---

## 10. اولویت پیشنهادی همین هفته

اگر فقط پنج کار انجام می‌دهید، این پنج مورد بیشترین اثر را دارند:

1. baseline commit و تمیزکردن runtime از fixture/legacy.
2. Firebase staging واقعی + EAS linkage + اولین signed staging APK.
3. اصلاح کامل remote bundle retrieval و SQLite hydration.
4. یکپارچه‌کردن outbox و اصلاح progress/report contract.
5. تست end-to-end روی گوشی واقعی: guest → account → online content → offline relaunch.

بعد از این پنج مورد، دانانه از «دموی زیبا» به «alpha واقعی» عبور می‌کند. حذف حساب، CMS security، observability، محتوا و legal آن را به beta و سپس launch می‌رسانند.

---

## 11. منابع رسمی به‌روز

- Expo، ساخت APK و تفاوت APK/AAB: https://docs.expo.dev/build-reference/apk/
- Expo، internal distribution و URL نصب: https://docs.expo.dev/build/internal-distribution/
- Expo، راه‌اندازی EAS Build: https://docs.expo.dev/build/setup/
- Expo SDK 57 / React Native 0.86: https://expo.dev/sdk/57
- Google Play، الزام Target API از 31 August 2026: https://support.google.com/googleplay/android-developer/answer/11926878
- Google Play، تست اجباری حساب‌های شخصی جدید: https://support.google.com/googleplay/android-developer/answer/14151465
- Firebase، anonymous auth و account linking: https://firebase.google.com/docs/auth/web/anonymous-auth
- Firebase، App Check با Play Integrity: https://firebase.google.com/docs/app-check/android/play-integrity-provider

---

## 12. مرز این ممیزی

- هیچ deploy، account creation، EAS build پولی/remote یا تغییر cloud انجام نشد.
- هیچ فایل source پروژه عمداً تغییر داده نشد.
- Gradle build محلی به علت نبود Java/Android SDK روی دستگاه ممیزی کامل نشد.
- Firebase CLI روی این سیستم login نبود؛ بنابراین existence/config پروژه‌های aliasشده از طریق CLI قابل تأیید نبود. probe عمومی موجود برای config فعلی fail شد و برای No-Go کافی است.
- accessibility واقعی با TalkBack، notification scheduling، SQLite native و performance فقط روی دستگاه باید بسته شوند.
