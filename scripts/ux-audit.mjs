#!/usr/bin/env node
/**
 * The accessibility checks a machine can actually make.
 *
 * TalkBack, a launcher icon and a cold start need a device — those are in
 * `docs/runbooks/native-qa.md` and only a person can sign them off. What a
 * headless browser *can* do is measure every interactive element on a screen
 * and every text colour against what it actually sits on, in both languages,
 * both themes, and at 200% text — which is where the failures cluster.
 *
 * It renders the real app: `CI=1 npx expo start --web` must already be running.
 *
 *   npm run ux:audit
 *   npm run ux:audit -- --shots docs/qa/2026-09-05
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.UX_AUDIT_URL ?? 'http://localhost:8081';
const shotIndex = process.argv.indexOf('--shots');
const shotDir = shotIndex > -1 ? process.argv[shotIndex + 1] : null;
if (shotDir) mkdirSync(shotDir, { recursive: true });

/** Every screen a tester reaches without signing in. */
const ROUTES = ['/', '/explore', '/garden', '/search', '/settings/notifications'];

/**
 * The app past onboarding, and in the language under test.
 *
 * Seeded into storage rather than clicked through, because otherwise every
 * route renders the onboarding screen and the audit measures the same two
 * buttons sixteen times.
 *
 * The language comes from **stored state, not the browser**: Persian is the
 * default and the device language is deliberately not consulted, because seeds
 * ship in Persian. Driving it with the browser locale would have tested
 * something the app does not do.
 */
const seedStorage = (locale) => ({
  'dananeh.locale.v1': locale,
  'dananeh.session.v1': JSON.stringify({
    onboarded: true,
    interests: ['astronomy', 'psychology'],
    pace: 'one',
    timeOfDay: 'evening',
    notificationsAsked: true,
    notificationsEnabled: false,
    reminderTime: '20:30',
    accountOfferSeen: true,
    onboardingStartedAt: '2026-09-05T12:00:00.000Z',
  }),
});

const MIN_TARGET = 44;
const MIN_CONTRAST = 4.5;

let failures = 0;
const lines = [];

const say = (ok, text) => {
  if (!ok) failures += 1;
  lines.push(`  ${ok ? '✓' : '✗'} ${text}`);
};

/**
 * Runs inside the page.
 *
 * Walks the rendered DOM rather than the source, because the question is what
 * the reader can hit and read — which depends on layout, not on a className.
 */
const AUDIT = () => {
  const channel = (value) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };

  const parse = (colour) => {
    const match = colour.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const [r, g, b, a = '1'] = match[1].split(',').map((part) => parseFloat(part));
    return { r, g, b, a: Number(a) };
  };

  const luminance = ({ r, g, b }) =>
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

  /** The first ancestor that actually paints something. */
  const backgroundOf = (element) => {
    let node = element;
    while (node) {
      const colour = parse(getComputedStyle(node).backgroundColor);
      if (colour && colour.a > 0.5) return colour;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };

  const ratio = (a, b) => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
  };

  const visible = (element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      box.width > 0 &&
      box.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      Number(style.opacity) > 0.1
    );
  };

  const clickable = [
    ...document.querySelectorAll(
      'button, a[href], [role="button"], [role="tab"], [role="link"], [role="switch"], input, select'
    ),
  ].filter(visible);

  /**
   * A control inside a bigger tappable box is fine.
   *
   * A `Switch` is drawn 40×20 wherever it appears; what matters is whether the
   * region a reader aims at responds, so an element whose clickable ancestor
   * meets the floor passes — and one that has no such ancestor does not.
   */
  const coveredByAncestor = (element) => {
    let node = element.parentElement;
    while (node) {
      const role = node.getAttribute('role');
      if (role === 'button' || role === 'switch' || role === 'tab' || role === 'link') {
        const box = node.getBoundingClientRect();
        if (box.width >= 44 && box.height >= 44) return true;
      }
      node = node.parentElement;
    }
    return false;
  };

  const small = clickable
    .map((element) => ({ element, box: element.getBoundingClientRect() }))
    .filter(({ element, box }) => (box.width < 44 || box.height < 44) && !coveredByAncestor(element))
    .map(({ element, box }) => ({
      label: (element.getAttribute('aria-label') || element.textContent || element.tagName)
        .trim()
        .slice(0, 60),
      width: Math.round(box.width),
      height: Math.round(box.height),
    }));

  const textNodes = [...document.querySelectorAll('div, span, p, h1, h2, h3, a, button')].filter(
    (element) =>
      visible(element) &&
      [...element.childNodes].some(
        (node) => node.nodeType === 3 && node.textContent.trim().length > 1
      )
  );

  const lowContrast = textNodes
    .map((element) => {
      const style = getComputedStyle(element);
      const foreground = parse(style.color);
      if (!foreground) return null;

      return {
        text: element.textContent.trim().slice(0, 40),
        size: parseFloat(style.fontSize),
        ratio: Math.round(ratio(foreground, backgroundOf(element)) * 10) / 10,
      };
    })
    .filter((entry) => entry && entry.ratio < (entry.size >= 24 ? 3 : 4.5));

  return {
    direction: document.documentElement.getAttribute('dir'),
    onboarding: /شروع کنیم|Let’s begin/.test(document.body.textContent ?? ''),
    lang: document.documentElement.getAttribute('lang'),
    clickable: clickable.length,
    small,
    text: textNodes.length,
    lowContrast,
    // A horizontal scrollbar on the body is the classic RTL layout failure.
    overflows: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
};

const browser = await chromium.launch();

async function audit({ locale, theme, scale }) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });

  await context.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, seedStorage(locale));

  const page = await context.newPage();

  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    if (scale !== 1) {
      // 200% text, the way an Android accessibility setting does it.
      await page.addStyleTag({ content: `html { font-size: ${16 * scale}px }` });
      await page.evaluate((factor) => {
        for (const element of document.querySelectorAll('*')) {
          const size = parseFloat(getComputedStyle(element).fontSize);
          if (size) element.style.fontSize = `${size * factor}px`;
        }
      }, scale);
      await page.waitForTimeout(400);
    }

    const result = await page.evaluate(AUDIT);
    const label = `${locale} ${theme} ${scale === 1 ? '100%' : '200%'} ${route}`;

    if (route === '/') {
      // On web the direction has to be on the document: react-native-web maps
      // `marginStart` onto CSS logical properties, and `I18nManager` alone
      // leaves the DOM laid out left-to-right.
      const expected = locale.startsWith('fa') ? 'rtl' : 'ltr';
      say(
        result.direction === expected,
        `${locale}: the document direction is ${result.direction ?? 'unset'}, expected ${expected}`
      );
      say(
        !result.onboarding,
        `${locale} ${theme}: the audit is past onboarding, on the real screens`
      );
    }

    say(!result.overflows, `${label}: no horizontal overflow`);
    say(
      result.small.length === 0,
      `${label}: ${result.clickable} target(s) ≥ ${MIN_TARGET}pt` +
        (result.small.length
          ? ` — too small: ${result.small
              .map((entry) => `${entry.label} (${entry.width}×${entry.height})`)
              .join(', ')}`
          : '')
    );
    say(
      result.lowContrast.length === 0,
      `${label}: ${result.text} text run(s) ≥ ${MIN_CONTRAST}:1` +
        (result.lowContrast.length
          ? ` — too low: ${result.lowContrast
              .map((entry) => `"${entry.text}" ${entry.ratio}:1`)
              .join(', ')}`
          : '')
    );

    if (shotDir) {
      const name = `${locale}-${theme}-${scale === 1 ? '100' : '200'}${route.replace(/\//g, '_')}.png`;
      await page.screenshot({ path: join(shotDir, name), fullPage: true });
    }
  }

  await context.close();
}

console.log(`\nDananeh UX audit · ${BASE}\n`);

for (const locale of ['fa-IR', 'en']) {
  for (const theme of ['light', 'dark']) {
    for (const scale of [1, 2]) {
      await audit({ locale, theme, scale });
    }
  }
}

await browser.close();
console.log(lines.join('\n'));

if (failures) {
  console.error(`\n${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log(`\nAll UX checks passed${shotDir ? ` — screenshots in ${shotDir}` : ''}.\n`);
