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

/** Every whitespace-separated token in the query must appear somewhere in the record. Newest first. */
export const searchAdrs = (adrs: readonly Adr[], query: string, filter: Filter, today: string): Adr[] => {
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t !== '');
  return adrs
    .filter((a) => matchesFilter(a, filter, today))
    .filter((a) => {
      const h = haystack(a);
      return tokens.every((t) => h.includes(t));
    })
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
};
