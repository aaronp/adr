/**
 * The address bar as state: which screen, record, chart and theme are showing. Pure — main.tsx reads
 * location and writes history; these functions only translate between query strings and state.
 *
 *   ?page=dashboard|markdown|card   ?layout=list|tree|sankey   ?adr=<id> (opens that record)   ?viz=matrix|radar|weighted|heatmap   ?theme=<id>
 *
 * Other params (such as ?src=) are left as they are. Unknown values are ignored.
 */
import { LAYOUTS, VIZ, type LayoutId, type State, type VizId } from './state.ts';
import { isThemeId, type ThemeId } from './themes.ts';

export type UrlPage = { readonly kind: 'dashboard' } | { readonly kind: 'view'; readonly id: string } | { readonly kind: 'markdown' } | { readonly kind: 'card' };
export interface UrlPrefs {
  readonly page?: UrlPage;
  readonly viz?: VizId;
  readonly layout?: LayoutId;
  readonly theme?: ThemeId;
}

const DEFAULT_VIZ: VizId = 'radar';
const DEFAULT_THEME: ThemeId = 'paper';
const isVizId = (v: string): v is VizId => VIZ.some((x) => x.id === v);
const isLayoutId = (v: string): v is LayoutId => LAYOUTS.some((x) => x.id === v);

export const fromQuery = (search: string): UrlPrefs => {
  const q = new URLSearchParams(search);
  const adr = (q.get('adr') ?? '').trim();
  const pageParam = q.get('page');
  const page: UrlPage | null =
    adr !== '' ? { kind: 'view', id: adr } : pageParam === 'markdown' ? { kind: 'markdown' } : pageParam === 'card' ? { kind: 'card' } : pageParam === 'dashboard' ? { kind: 'dashboard' } : null;
  const viz = q.get('viz');
  const theme = q.get('theme');
  const layout = q.get('layout');
  return {
    ...(layout !== null && isLayoutId(layout) ? { layout } : {}),
    ...(page !== null ? { page } : {}),
    ...(viz !== null && isVizId(viz) ? { viz } : {}),
    ...(theme !== null && isThemeId(theme) ? { theme } : {})
  };
};

/** The query string for a state, keeping unrelated params; null while editing (a draft has no address). */
export const toQuery = (s: State, search: string): string | null => {
  if (s.screen.kind === 'edit') return null;
  const q = new URLSearchParams(search);
  for (const k of ['page', 'adr', 'viz', 'theme', 'layout']) q.delete(k);
  if (s.screen.kind === 'view') q.set('adr', s.screen.id);
  if (s.screen.kind === 'markdown') q.set('page', 'markdown');
  if (s.screen.kind === 'card') q.set('page', 'card');
  if (s.screen.kind === 'dashboard' && s.layout !== 'list') q.set('layout', s.layout);
  if (s.viz !== DEFAULT_VIZ) q.set('viz', s.viz);
  if (s.theme !== DEFAULT_THEME) q.set('theme', s.theme);
  const out = q.toString().replace(/%2F/gi, '/').replace(/%3A/gi, ':');
  return out === '' ? '' : `?${out}`;
};

/** Which screen a state is on, as a history key: a change here is a new history entry, anything else replaces it. */
export const pageKey = (s: State): string => (s.screen.kind === 'view' ? `view:${s.screen.id}` : s.screen.kind);

/** Where the card settings for a markdown URL live: decisions.md → decisions.card.json, keeping any ?query or #hash. */
export const sidecarUrl = (src: string): string => {
  const cut = src.search(/[?#]/);
  const [path, rest] = cut === -1 ? [src, ''] : [src.slice(0, cut), src.slice(cut)];
  return path.replace(/\.md$/i, '') + '.card.json' + rest;
};

/** A card link that is safe to put in an href: http(s) or a relative path. Anything else (javascript:, data:) is dropped. */
export const safeHref = (u: string | undefined): string | undefined => {
  if (u === undefined) return undefined;
  try {
    return ['http:', 'https:'].includes(new URL(u, 'https://relative.invalid/').protocol) ? u : undefined;
  } catch {
    return undefined;
  }
};

/** The ?src the card designer should read its sidecar beside: only when that file is what is showing (it loaded). */
export const cardSrc = (srcParam: string | null, loaded: boolean): string | null => (loaded ? srcParam : null);
