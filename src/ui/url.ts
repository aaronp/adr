/**
 * The address bar as state: which screen, record, chart and theme are showing. Pure — main.tsx reads
 * location and writes history; these functions only translate between query strings and state.
 *
 *   ?page=dashboard|markdown   ?adr=<id> (opens that record)   ?viz=matrix|radar|weighted|heatmap   ?theme=<id>
 *
 * Other params (such as ?src=) are left as they are. Unknown values are ignored.
 */
import { VIZ, type State, type VizId } from './state.ts';
import { isThemeId, type ThemeId } from './themes.ts';

export type UrlPage = { readonly kind: 'dashboard' } | { readonly kind: 'view'; readonly id: string } | { readonly kind: 'markdown' };
export interface UrlPrefs {
  readonly page?: UrlPage;
  readonly viz?: VizId;
  readonly theme?: ThemeId;
}

const DEFAULT_VIZ: VizId = 'radar';
const DEFAULT_THEME: ThemeId = 'paper';
const isVizId = (v: string): v is VizId => VIZ.some((x) => x.id === v);

export const fromQuery = (search: string): UrlPrefs => {
  const q = new URLSearchParams(search);
  const adr = (q.get('adr') ?? '').trim();
  const pageParam = q.get('page');
  const page: UrlPage | null =
    adr !== '' ? { kind: 'view', id: adr } : pageParam === 'markdown' ? { kind: 'markdown' } : pageParam === 'dashboard' ? { kind: 'dashboard' } : null;
  const viz = q.get('viz');
  const theme = q.get('theme');
  return {
    ...(page !== null ? { page } : {}),
    ...(viz !== null && isVizId(viz) ? { viz } : {}),
    ...(theme !== null && isThemeId(theme) ? { theme } : {})
  };
};

/** The query string for a state, keeping unrelated params; null while editing (a draft has no address). */
export const toQuery = (s: State, search: string): string | null => {
  if (s.screen.kind === 'edit') return null;
  const q = new URLSearchParams(search);
  for (const k of ['page', 'adr', 'viz', 'theme']) q.delete(k);
  if (s.screen.kind === 'view') q.set('adr', s.screen.id);
  if (s.screen.kind === 'markdown') q.set('page', 'markdown');
  if (s.viz !== DEFAULT_VIZ) q.set('viz', s.viz);
  if (s.theme !== DEFAULT_THEME) q.set('theme', s.theme);
  const out = q.toString().replace(/%2F/gi, '/').replace(/%3A/gi, ':');
  return out === '' ? '' : `?${out}`;
};

/** Which screen a state is on, as a history key: a change here is a new history entry, anything else replaces it. */
export const pageKey = (s: State): string => (s.screen.kind === 'view' ? `view:${s.screen.id}` : s.screen.kind);
