/** Pure date helpers. All dates are ISO calendar dates (YYYY-MM-DD) interpreted in UTC. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const DAY_MS = 86_400_000;

/** Parses YYYY-MM-DD to UTC epoch ms. Throws on malformed or impossible dates (e.g. 2026-02-30). */
export const parseDate = (iso: string): number => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m === null) throw new Error(`invalid date "${iso}" (expected YYYY-MM-DD)`);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const t = Date.UTC(y, mo, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo || back.getUTCDate() !== d) {
    throw new Error(`invalid date "${iso}" (no such day)`);
  }
  return t;
};

export const isDate = (iso: string): boolean => {
  try {
    parseDate(iso);
    return true;
  } catch {
    return false;
  }
};

/** "2026-09-14" → "14 Sep 2026". */
export const formatDate = (iso: string): string => {
  const d = new Date(parseDate(iso));
  const month = MONTHS[d.getUTCMonth()];
  if (month === undefined) throw new Error('bug: month index out of range');
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
};

/** Whole days from a to b (positive when b is later). */
export const daysBetween = (a: string, b: string): number => Math.round((parseDate(b) - parseDate(a)) / DAY_MS);

/** Converts a JS Date to its local calendar day as YYYY-MM-DD. Only call this at the app's edge. */
export const toIsoDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const plural = (n: number, word: string, many = word + 's'): string => `${n} ${n === 1 ? word : many}`;

export type RevisitKind = 'none' | 'overdue' | 'soon' | 'scheduled';
export interface RevisitInfo {
  readonly kind: RevisitKind;
  /** Sentence form, e.g. "Revisit due in 8 days". */
  readonly label: string;
  /** Badge form, e.g. "Due in 8d". */
  readonly short: string;
}

/** Window (days) in which an upcoming revisit counts as "due soon". */
export const REVISIT_SOON_DAYS = 30;

export const revisitInfo = (revisit: string | null, today: string): RevisitInfo => {
  if (revisit === null) return { kind: 'none', label: 'No revisit date', short: 'No revisit' };
  const d = daysBetween(today, revisit);
  if (d < 0) return { kind: 'overdue', label: `Revisit overdue by ${plural(-d, 'day')}`, short: `Overdue ${-d}d` };
  if (d === 0) return { kind: 'soon', label: 'Revisit due today', short: 'Due today' };
  if (d <= REVISIT_SOON_DAYS) return { kind: 'soon', label: `Revisit due in ${plural(d, 'day')}`, short: `Due in ${d}d` };
  return { kind: 'scheduled', label: `Revisit in ${plural(d, 'day')}`, short: `Revisit ${formatDate(revisit)}` };
};
