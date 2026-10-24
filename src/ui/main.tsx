/**
 * The app's edge: reads the clock and browser storage once at start-up, wires side effects, and
 * persists state changes. Everything else is pure (state.ts reducer + core/).
 */
import { render } from 'preact';
import { useEffect, useMemo, useReducer, useRef } from 'preact/hooks';
import sampleMarkdown from '../sample/decisions.md';
import { formatDate, toIsoDate } from '../core/dates.ts';
import { serializeLedger } from '../core/markdown.ts';
import { createInitialState, reducer, type State } from './state.ts';
import { fromQuery, pageKey, toQuery } from './url.ts';
import { STORAGE_KEYS, copyText, createBrowserStore, downloadText, fetchText, readTextFile, type Store } from './io.ts';
import { Header } from './components/Header.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { AdrView } from './components/AdrView.tsx';
import { EditForm } from './components/EditForm.tsx';
import { MarkdownView } from './components/MarkdownView.tsx';
import { OpenDialog } from './components/OpenDialog.tsx';
import type { Effects } from './components/common.tsx';

interface AppProps {
  /** Whether to autosave the records in this browser. Off when they came from ?src=, so a shared file never overwrites local work. */
  readonly saveMarkdown: boolean;
  /** Calendar day used for every "revisit due" calculation. Injected so the UI is deterministic. */
  readonly today: string;
  readonly initial: State;
  readonly store: Store | null;
  readonly storage: { available: true } | { available: false; reason: string };
}

const App = ({ today, initial, store, storage, saveMarkdown }: AppProps) => {
  const [state, dispatch] = useReducer(reducer, initial);

  // Persist applied records (not unapplied editor text) and the theme.
  useEffect(() => {
    if (store === null || !saveMarkdown) return;
    try {
      store.write(STORAGE_KEYS.markdown, serializeLedger(state.adrs));
    } catch (e) {
      dispatch({ type: 'toast/show', kind: 'error', text: `Could not save in this browser: ${e instanceof Error ? e.message : String(e)}. Download the file to keep your work.` });
    }
  }, [state.adrs, store, saveMarkdown]);
  useEffect(() => {
    if (store === null) return;
    try {
      store.write(STORAGE_KEYS.theme, state.theme);
    } catch {
      // The markdown effect above reports storage failures; a theme that is not remembered is not worth a second toast.
    }
  }, [state.theme, store]);

  useEffect(() => {
    document.documentElement.dataset['theme'] = state.theme;
  }, [state.theme]);

  // Keep the address bar in step: a new screen is a history entry (so Back works), a chart or theme change replaces it.
  const lastPage = useRef(pageKey(initial));
  const popping = useRef(false);
  useEffect(() => {
    const query = toQuery(state, location.search);
    if (query === null) return;
    const url = location.pathname + query + location.hash;
    const key = pageKey(state);
    if (key !== lastPage.current && !popping.current) history.pushState(null, '', url);
    else if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
    lastPage.current = key;
    popping.current = false;
  }, [state.screen, state.viz, state.theme]);
  useEffect(() => {
    // Back/Forward: show what the URL says (no ?page or ?adr means the dashboard); the effect above then only tidies the URL.
    const onPop = () => {
      popping.current = true;
      dispatch({ type: 'url/apply', prefs: { page: { kind: 'dashboard' }, ...fromQuery(location.search) } });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (state.toast === null) return;
    const id = state.toast.id;
    const t = setTimeout(() => dispatch({ type: 'toast/clear', id }), 4000);
    return () => clearTimeout(t);
  }, [state.toast]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [state.screen.kind, state.screen.kind === 'view' ? state.screen.id : null]);

  const fx: Effects = useMemo(
    () => ({
      copy: (text, what) => {
        copyText(text).then(
          () => dispatch({ type: 'toast/show', kind: 'ok', text: `${what} copied to the clipboard.` }),
          (e: unknown) => dispatch({ type: 'toast/show', kind: 'error', text: e instanceof Error ? e.message : String(e) })
        );
      },
      download: (fileName, text) => {
        try {
          downloadText(fileName, text);
          dispatch({ type: 'toast/show', kind: 'ok', text: `Downloaded ${fileName}.` });
        } catch (e) {
          dispatch({ type: 'toast/show', kind: 'error', text: `Download failed: ${e instanceof Error ? e.message : String(e)}` });
        }
      },
      openFile: (file) => {
        readTextFile(file).then(
          (text) => dispatch({ type: 'md/load', text, source: file.name }),
          (e: unknown) => dispatch({ type: 'toast/show', kind: 'error', text: e instanceof Error ? e.message : String(e) })
        );
      },
      openUrl: (url) =>
        fetchText(url).then(
          (r) => dispatch({ type: 'md/load', text: r.markdown, source: r.url }),
          (e: unknown) => {
            throw new Error(`Could not open ${url}: ${e instanceof Error ? e.message : String(e)}. A URL on another site must allow cross-origin requests (GitHub Pages and raw.githubusercontent.com do).`);
          }
        )
    }),
    []
  );

  const onNew = () => dispatch({ type: 'edit/new', today });
  const s = state.screen;
  let body;
  switch (s.kind) {
    case 'dashboard':
      body = <Dashboard adrs={state.adrs} query={state.query} filter={state.filter} today={today} dispatch={dispatch} onNew={onNew} />;
      break;
    case 'view': {
      const adr = state.adrs.find((a) => a.id === s.id);
      if (adr === undefined) throw new Error(`bug: viewing missing record ${s.id}`);
      body = <AdrView adr={adr} today={today} viz={state.viz} expanded={state.expanded} hidden={state.hidden} dispatch={dispatch} fx={fx} />;
      break;
    }
    case 'edit':
      body = <EditForm draft={s.draft} originalId={s.originalId} triedSave={s.triedSave} open={s.open} adrs={state.adrs} dispatch={dispatch} />;
      break;
    case 'markdown':
      body = <MarkdownView md={state.md} focusId={s.focusId} sampleMarkdown={sampleMarkdown} storage={storage} dispatch={dispatch} fx={fx} />;
      break;
    default: {
      const never: never = s;
      throw new Error(`bug: unknown screen ${JSON.stringify(never)}`);
    }
  }

  return (
    <div class="app">
      <Header theme={state.theme} todayLabel={formatDate(today)} onNew={onNew} dispatch={dispatch} />
      {body}
      {state.openDialog ? <OpenDialog dispatch={dispatch} fx={fx} /> : null}
      <div class="toast-host" aria-live="polite">
        {state.toast !== null ? (
          <div class={`toast toast-${state.toast.kind}`} role={state.toast.kind === 'error' ? 'alert' : 'status'}>
            {state.toast.text}
          </div>
        ) : null}
      </div>
    </div>
  );
};

// ---- edge: read the world once, then hand pure data to the app ----
const root = document.getElementById('app');
if (root === null) throw new Error('bug: #app element missing from the page');
const browser = createBrowserStore();
const store = browser.available ? browser.store : null;
const read = (key: string): string | null => (store === null ? null : store.read(key));
const storage = browser.available ? ({ available: true } as const) : ({ available: false, reason: browser.reason } as const);
/** ?src=<url> (alias ?ours=), absolute or relative to the page: the markdown to show instead of the stored or sample file. */
const srcParam = new URLSearchParams(location.search).get('src') ?? new URLSearchParams(location.search).get('ours');

const boot = (source: { url: string; markdown: string } | null, loadError: string | null) => {
  const initial = createInitialState({ source, storedMarkdown: read(STORAGE_KEYS.markdown), storedTheme: read(STORAGE_KEYS.theme), sampleMarkdown, prefs: fromQuery(location.search) });
  const warning = loadError ?? (browser.available ? null : 'This browser is blocking storage, so nothing will be remembered. Download decisions.md to keep your work.');
  const withWarning: State = warning === null ? initial : { ...initial, seq: initial.seq + 1, toast: { id: initial.seq, kind: 'error', text: warning } };
  render(<App today={toIsoDate(new Date())} initial={withWarning} store={store} storage={storage} saveMarkdown={source === null} />, root);
};

if (srcParam === null) boot(null, null);
else {
  fetchText(srcParam).then(
    (r) => boot(r, null),
    (e: unknown) => boot(null, `Could not load ${srcParam}: ${e instanceof Error ? e.message : String(e)}. Showing your saved file instead.`)
  );
}
