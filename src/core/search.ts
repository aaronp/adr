/** Dashboard filtering — pure, so it is easy to test and reason about. */
import { STATUSES, type Adr, type Status } from './schema.ts';
import { revisitInfo } from './dates.ts';

export type Filter = 'all' | 'revisit' | Status;
export const FILTERS: readonly Filter[] = ['all', ...STATUSES, 'revisit'];

export const isRevisitDue = (adr: Adr, today: string): boolean => {
  const k = revisitInfo(adr.revisit, today).kind;
  return k === 'overdue' || k === 'soon';
};

const matchesFilter = (adr: Adr, filter: Filter, today: string): boolean => {
  if (filter === 'all') return true;
  if (filter === 'revisit') return isRevisitDue(adr, today);
  return adr.status === filter;
};

const haystack = (a: Adr): string =>
  [a.id, a.title, a.goal, a.status, ...a.tags, ...a.people.map((p) => p.name), ...a.solutions.map((s) => s.name), ...a.criteria.map((c) => c.name)]
    .join(' ')
    .toLowerCase();

/** Every tag used in the ledger with how many records carry it, most used first. */
export const tagCounts = (adrs: readonly Adr[]): [string, number][] => {
  const m = new Map<string, number>();
  for (const t of adrs.flatMap((a) => a.tags)) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

/**
 * Every whitespace-separated token in the query must appear somewhere in the record, and when tags are chosen the
 * record must carry at least one of them. Newest first.
 */
export const searchAdrs = (adrs: readonly Adr[], query: string, filter: Filter, today: string, tags: readonly string[] = []): Adr[] => {
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t !== '');
  return adrs
    .filter((a) => matchesFilter(a, filter, today))
    .filter((a) => tags.length === 0 || a.tags.some((t) => tags.includes(t)))
    .filter((a) => {
      const h = haystack(a);
      return tokens.every((t) => h.includes(t));
    })
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
};
