/**
 * All app state and every transition, as a pure reducer. Side effects (storage, clipboard, file
 * download/upload, the clock) live in io.ts and main.tsx and reach the reducer only as data.
 */
import type { Adr } from '../core/schema.ts';
import { MarkdownError, parseLedger, serializeLedger } from '../core/markdown.ts';
import { validateAdr, validateLedger } from '../core/validate.ts';
import { addCriterion, addSolution, blankDraft, fromDraft, nextAdrId, toDraft, type Draft } from '../core/form.ts';
import { FILTERS, type Filter } from '../core/search.ts';
import { isThemeId, type ThemeId } from './themes.ts';
import type { UrlPrefs } from './url.ts';

export const VIZ = [
  { id: 'matrix', label: 'Matrix' },
  { id: 'radar', label: 'Radar' },
  { id: 'weighted', label: 'Weighted bars' },
  { id: 'heatmap', label: 'Heatmap' }
] as const;
export type VizId = (typeof VIZ)[number]['id'];

export type Screen =
  | { readonly kind: 'dashboard' }
  | { readonly kind: 'view'; readonly id: string }
  | {
      readonly kind: 'edit';
      readonly draft: Draft;
      readonly originalId: string | null;
      readonly triedSave: boolean;
      readonly open: Readonly<Record<string, boolean>>;
      /** Form field id to open and focus first (e.g. "cn-ops", "sn-kafka", "f-goal"), or null for the top. */
      readonly focus: string | null;
    }
  | { readonly kind: 'markdown'; readonly focusId: string | null };

export interface MarkdownPane {
  /** What is in the editor right now. */
  readonly text: string;
  /** The serialised ledger the editor was last in sync with; text !== base means unapplied edits. */
  readonly base: string;
  readonly error: { readonly message: string; readonly line: number | null } | null;
  readonly notice: string | null;
}

export interface Toast {
  readonly id: number;
  readonly kind: 'ok' | 'error';
  readonly text: string;
}

export interface State {
  readonly adrs: readonly Adr[];
  readonly screen: Screen;
  readonly viz: VizId;
  readonly theme: ThemeId;
  readonly query: string;
  readonly filter: Filter;
  /** Accordion state on the ADR view, by solution id. */
  readonly expanded: Readonly<Record<string, boolean>>;
  /** Radar series hidden by the user, by solution id. */
  readonly hidden: Readonly<Record<string, boolean>>;
  readonly md: MarkdownPane;
  /** Monotonic counter for generated ids (criteria, solutions, people, toasts) — keeps the reducer deterministic. */
  readonly seq: number;
  readonly toast: Toast | null;
  /** The Open dialog (drop, pick or fetch a file) is showing. */
  readonly openDialog: boolean;
}

export interface InitInput {
  /** Markdown fetched from the page's ?src= URL, with that URL, or null when there is no ?src=. It wins over anything stored. */
  readonly source?: { readonly url: string; readonly markdown: string } | null;
  /** Markdown saved in this browser by an earlier visit, or null if none. */
  readonly storedMarkdown: string | null;
  /** Theme id saved in this browser, or null if none. */
  readonly storedTheme: string | null;
  /** The bundled example file, used when nothing is stored. */
  readonly sampleMarkdown: string;
  /** Screen, chart and theme from the address bar; they win over the stored theme. */
  readonly prefs?: UrlPrefs;
}

const firstOpen = (adr: Adr): Record<string, boolean> => {
  const first = adr.solutions[0];
  return first === undefined ? {} : { [first.id]: true };
};

const findAdr = (adrs: readonly Adr[], id: string): Adr => {
  const a = adrs.find((x) => x.id === id);
  if (a === undefined) throw new Error(`bug: no ADR "${id}"`);
  return a;
};

const describeError = (e: unknown): { message: string; line: number | null } => {
  if (e instanceof MarkdownError) return { message: e.message, line: e.line };
  if (e instanceof Error) return { message: e.message, line: null };
  throw e;
};

/** Parses and validates a whole file. Returns records, or an error to show — never a partial result. */
export const readLedger = (text: string): { ok: true; adrs: Adr[] } | { ok: false; error: { message: string; line: number | null } } => {
  let adrs: Adr[];
  try {
    adrs = parseLedger(text);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  const problems = validateLedger(adrs);
  if (problems.length > 0) return { ok: false, error: { message: `Parsed, but ${problems.length === 1 ? 'a record is' : 'records are'} invalid:\n• ${problems.join('\n• ')}`, line: null } };
  return { ok: true, adrs };
};

/** Builds a complete initial state. A stored file that no longer parses opens the markdown view with the error — it is never silently replaced. */
export const createInitialState = (input: InitInput): State => applyPrefs(createStartState(input), input.prefs ?? {});

const createStartState = (input: InitInput): State => {
  const base = {
    viz: 'radar' as VizId,
    query: '',
    filter: 'all' as Filter,
    expanded: {},
    hidden: {},
    seq: 1,
    openDialog: false
  };
  const badTheme = input.storedTheme !== null && !isThemeId(input.storedTheme);
  const theme: ThemeId = input.storedTheme !== null && isThemeId(input.storedTheme) ? input.storedTheme : 'paper';
  const themeToast: Toast | null = badTheme ? { id: 0, kind: 'error', text: `Ignored unknown saved theme "${input.storedTheme}".` } : null;

  const fromUrl = input.source ?? null;
  const source = fromUrl !== null ? fromUrl.markdown : input.storedMarkdown ?? input.sampleMarkdown;
  const read = readLedger(source);
  if (!read.ok) {
    if (fromUrl === null && input.storedMarkdown === null) throw new Error(`bug: bundled sample is invalid — ${read.error.message}`);
    const what = fromUrl !== null ? `${fromUrl.url} could not be loaded` : 'Your saved markdown could not be loaded';
    return {
      ...base,
      theme,
      adrs: [],
      screen: { kind: 'markdown', focusId: null },
      md: { text: source, base: '', error: { message: `${what}. Fix it below, or open another file.\n${read.error.message}`, line: read.error.line }, notice: null },
      toast: themeToast
    };
  }
  const normal = serializeLedger(read.adrs);
  return {
    ...base,
    theme,
    adrs: read.adrs,
    screen: { kind: 'dashboard' },
    md: { text: normal, base: normal, error: null, notice: null },
    toast: themeToast
  };
};

/** Applies address-bar prefs. A file that failed to load stays on its error; an unknown record id is reported, not guessed. */
export const applyPrefs = (s: State, p: UrlPrefs): State => {
  const styled = { ...s, ...(p.theme !== undefined ? { theme: p.theme } : {}), ...(p.viz !== undefined ? { viz: p.viz } : {}) };
  if (p.page === undefined || (s.screen.kind === 'markdown' && s.md.error !== null)) return styled;
  switch (p.page.kind) {
    case 'dashboard':
      return reducer(styled, { type: 'nav/dashboard' });
    case 'markdown':
      return reducer(styled, { type: 'nav/markdown', focusId: null });
    case 'view': {
      const id = p.page.id;
      return styled.adrs.some((a) => a.id === id) ? reducer(styled, { type: 'nav/view', id }) : toast(reducer(styled, { type: 'nav/dashboard' }), 'error', `There is no record "${id}" in this file.`);
    }
  }
};

export type Action =
  | { type: 'url/apply'; prefs: UrlPrefs }
  | { type: 'open/show' }
  | { type: 'open/hide' }
  | { type: 'nav/dashboard' }
  | { type: 'nav/view'; id: string }
  | { type: 'nav/markdown'; focusId: string | null }
  | { type: 'theme/set'; theme: ThemeId }
  | { type: 'dash/query'; value: string }
  | { type: 'dash/filter'; filter: Filter }
  | { type: 'view/viz'; viz: VizId }
  | { type: 'view/toggle'; solutionId: string }
  | { type: 'view/setAll'; open: boolean }
  | { type: 'view/toggleSeries'; solutionId: string }
  | { type: 'edit/start'; id: string; focus?: string }
  | { type: 'edit/new'; today: string }
  | { type: 'edit/update'; update: (d: Draft) => Draft }
  | { type: 'edit/toggleOpen'; solutionId: string }
  | { type: 'edit/addPerson' }
  | { type: 'edit/addCriterion' }
  | { type: 'edit/addSolution' }
  | { type: 'edit/save' }
  | { type: 'edit/cancel' }
  | { type: 'edit/delete' }
  | { type: 'md/text'; value: string }
  | { type: 'md/apply' }
  | { type: 'md/discard' }
  | { type: 'md/load'; text: string; source: string }
  | { type: 'toast/show'; kind: Toast['kind']; text: string }
  | { type: 'toast/clear'; id: number };

/** Replaces the records and keeps the markdown pane in step (unless it holds unapplied edits). */
const withAdrs = (s: State, adrs: readonly Adr[]): State => {
  const normal = serializeLedger(adrs);
  const dirty = s.md.text !== s.md.base;
  return { ...s, adrs, md: dirty ? { ...s.md, base: normal } : { text: normal, base: normal, error: null, notice: null } };
};

const toast = (s: State, kind: Toast['kind'], text: string): State => ({ ...s, seq: s.seq + 1, toast: { id: s.seq, kind, text } });

const editScreen = (s: State): Extract<Screen, { kind: 'edit' }> => {
  if (s.screen.kind !== 'edit') throw new Error(`bug: edit action on the ${s.screen.kind} screen`);
  return s.screen;
};

export const reducer = (s: State, a: Action): State => {
  switch (a.type) {
    case 'url/apply':
      return applyPrefs(s, a.prefs);
    case 'open/show':
      return { ...s, openDialog: true };
    case 'open/hide':
      return { ...s, openDialog: false };
    case 'nav/dashboard':
      return { ...s, screen: { kind: 'dashboard' } };
    case 'nav/view': {
      const adr = findAdr(s.adrs, a.id);
      return { ...s, screen: { kind: 'view', id: a.id }, expanded: firstOpen(adr), hidden: {} };
    }
    case 'nav/markdown': {
      const clean = s.md.text === s.md.base;
      return { ...s, screen: { kind: 'markdown', focusId: a.focusId }, md: clean ? { ...s.md, error: null, notice: null } : s.md };
    }
    case 'theme/set':
      return { ...s, theme: a.theme };
    case 'dash/query':
      return { ...s, query: a.value };
    case 'dash/filter':
      if (!FILTERS.includes(a.filter)) throw new Error(`bug: unknown filter "${a.filter}"`);
      return { ...s, filter: a.filter };
    case 'view/viz':
      return { ...s, viz: a.viz };
    case 'view/toggle':
      return { ...s, expanded: { ...s.expanded, [a.solutionId]: s.expanded[a.solutionId] !== true } };
    case 'view/setAll': {
      if (s.screen.kind !== 'view') throw new Error('bug: view/setAll outside the view screen');
      const adr = findAdr(s.adrs, s.screen.id);
      return { ...s, expanded: Object.fromEntries(adr.solutions.map((x) => [x.id, a.open])) };
    }
    case 'view/toggleSeries':
      return { ...s, hidden: { ...s.hidden, [a.solutionId]: s.hidden[a.solutionId] !== true } };

    case 'edit/start': {
      const adr = findAdr(s.adrs, a.id);
      /* Jumping to a solution opens its card so its fields exist to focus. */
      const focus = a.focus ?? null;
      const sol = focus !== null && focus.startsWith('sn-') ? focus.slice(3) : null;
      return { ...s, screen: { kind: 'edit', draft: toDraft(adr), originalId: adr.id, triedSave: false, open: sol === null ? firstOpen(adr) : { [sol]: true }, focus } };
    }
    case 'edit/new':
      return { ...s, screen: { kind: 'edit', draft: blankDraft(nextAdrId(s.adrs), a.today), originalId: null, triedSave: false, open: {}, focus: null } };
    case 'edit/update': {
      const e = editScreen(s);
      return { ...s, screen: { ...e, draft: a.update(e.draft) } };
    }
    case 'edit/toggleOpen': {
      const e = editScreen(s);
      return { ...s, screen: { ...e, open: { ...e.open, [a.solutionId]: e.open[a.solutionId] !== true } } };
    }
    case 'edit/addPerson': {
      const e = editScreen(s);
      return { ...s, seq: s.seq + 1, screen: { ...e, draft: { ...e.draft, people: [...e.draft.people, { rowId: `p-${s.seq}`, name: '', role: 'consulted' }] } } };
    }
    case 'edit/addCriterion': {
      const e = editScreen(s);
      return { ...s, seq: s.seq + 1, screen: { ...e, draft: addCriterion(e.draft, `crit-${s.seq}`) } };
    }
    case 'edit/addSolution': {
      const e = editScreen(s);
      const id = `sol-${s.seq}`;
      return { ...s, seq: s.seq + 1, screen: { ...e, draft: addSolution(e.draft, id), open: { ...e.open, [id]: true } } };
    }
    case 'edit/save': {
      const e = editScreen(s);
      const adr = fromDraft(e.draft);
      if (validateAdr(adr, s.adrs, e.originalId).length > 0) return { ...s, screen: { ...e, triedSave: true } };
      const adrs = e.originalId === null ? [...s.adrs, adr] : s.adrs.map((x) => (x.id === e.originalId ? adr : x));
      return toast({ ...withAdrs(s, adrs), screen: { kind: 'view', id: adr.id }, expanded: firstOpen(adr), hidden: {} }, 'ok', `Saved ${adr.id}.`);
    }
    case 'edit/cancel': {
      const e = editScreen(s);
      return { ...s, screen: e.originalId === null ? { kind: 'dashboard' } : { kind: 'view', id: e.originalId } };
    }
    case 'edit/delete': {
      const e = editScreen(s);
      if (e.originalId === null) throw new Error('bug: delete on an unsaved record');
      const id = e.originalId;
      return toast({ ...withAdrs(s, s.adrs.filter((x) => x.id !== id)), screen: { kind: 'dashboard' } }, 'ok', `Deleted ${id}.`);
    }

    case 'md/text':
      return { ...s, md: { ...s.md, text: a.value, notice: null } };
    case 'md/apply':
    case 'md/load': {
      const text = a.type === 'md/load' ? a.text : s.md.text;
      const read = readLedger(text);
      if (!read.ok) return { ...s, openDialog: false, screen: { kind: 'markdown', focusId: null }, md: { ...s.md, text, error: read.error, notice: null } };
      const normal = serializeLedger(read.adrs);
      const what = a.type === 'md/load' ? `Loaded ${a.source}` : 'Applied';
      const notice = `${what}: ${read.adrs.length} record${read.adrs.length === 1 ? '' : 's'}${normal === text ? '' : ' (tidied into the standard layout)'}.`;
      return { ...s, openDialog: false, adrs: read.adrs, md: { text: normal, base: normal, error: null, notice } };
    }
    case 'md/discard':
      return { ...s, md: { text: s.md.base, base: s.md.base, error: null, notice: null } };

    case 'toast/show':
      return toast(s, a.kind, a.text);
    case 'toast/clear':
      return s.toast !== null && s.toast.id === a.id ? { ...s, toast: null } : s;
    default: {
      const never: never = a;
      throw new Error(`bug: unhandled action ${JSON.stringify(never)}`);
    }
  }
};
