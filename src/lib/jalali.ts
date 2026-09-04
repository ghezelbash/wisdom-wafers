/**
 * Gregorian ⇄ Jalali conversion.
 *
 * Dates are stored as ISO UTC and rendered as Jalali — one calendar, no
 * switcher. Implemented here rather than through `Intl` because the Persian
 * calendar is not reliably available on every JS engine the app runs on.
 *
 * Algorithm: Borkowski's, as used by the jalaali reference implementation.
 */

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 1717, 1795, 1844, 1903, 1928, 1963,
  2018, 2075, 2110, 2145, 2185, 2280, 2337, 2394, 2456, 2492, 2551, 2601, 2696, 2757, 2810, 2905,
  3000, 3021, 3186, 3223, 3253, 3299, 3308, 3448, 3512, 3541, 3556, 3675, 3712, 3746, 3781, 3796,
  3844, 3888, 3901, 3922, 3956, 3987, 4002, 4023, 4041, 4114, 4139, 4176, 4188, 4207,
];

interface JalaliCalendar {
  leap: number;
  gy: number;
  march: number;
}

function jalCal(jy: number): JalaliCalendar {
  let jump = 0;
  let leapJ = -14;
  let jp = BREAKS[0];

  if (jy < jp || jy >= BREAKS[BREAKS.length - 1]) {
    throw new RangeError(`Jalali year ${jy} is out of range`);
  }

  for (let i = 1; i < BREAKS.length; i += 1) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(jy + 621, 4) - div(jy + 621, 100) + div(jy + 621, 400) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy: jy + 621, march };
}

const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

function g2d(gy: number, gm: number, gd: number): number {
  const d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

function d2j(jdn: number): { jy: number; jm: number; jd: number } {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;

  if (k >= 0) {
    if (k <= 185) {
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (jalCal(jy).leap === 1) k += 1;
  }

  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

export interface JalaliDate {
  year: number;
  month: number;
  day: number;
}

export function toJalali(date: Date): JalaliDate {
  const { jy, jm, jd } = d2j(g2d(date.getFullYear(), date.getMonth() + 1, date.getDate()));
  return { year: jy, month: jm, day: jd };
}

export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export const JALALI_WEEKDAYS = [
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
  'شنبه',
];
