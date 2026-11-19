/**
 * The app's edge: reads the clock and browser storage once at start-up, wires side effects, and
 * persists state changes. Everything else is pure (state.ts reducer + core/).
 */
import { render } from 'preact';
import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import sampleMarkdown from '../sample/decisions.md';
import { formatDate, toIsoDate } from '../core/dates.ts';
import { serializeLedger } from '../core/markdown.ts';
import { createInitialState, reducer, type State } from './state.ts';
import { cardSrc, fromQuery, pageKey, toQuery } from './url.ts';
import { STORAGE_KEYS, copyText, createBrowserStore, downloadText, fetchText, putText, readTextFile, type Store } from './io.ts';
import { Header } from './components/Header.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { AdrView } from './components/AdrView.tsx';
import { EditForm } from './components/EditForm.tsx';
import { MarkdownView } from './components/MarkdownView.tsx';
import { CardDesigner } from './components/CardDesigner.tsx';
import { OpenDialog } from './components/OpenDialog.tsx';
import { NewDialog } from './components/NewDialog.tsx';
import { packLedger, unpackLedger } from '../core/share.ts';
import type { Effects } from './components/common.tsx';

interface AppProps {
  /** Whether to autosave the records in this browser. Off when they came from ?src=, so a shared file never overwrites local work. */
  readonly saveMarkdown: boolean;
  /** The ?src the ledger was loaded from, or null (saved file, sample or share link). */
  readonly src: string | null;
  /** Calendar day used for every "revisit due" calculation. Injected so the UI is deterministic. */
  readonly today: string;
  readonly initial: State;
  readonly store: Store | null;
  readonly storage: { available: true } | { available: false; reason: string };
  /** URL that File → Save writes back to (served by the `adr` CLI), or null when there is none. */
  readonly saveUrl: string | null;
  /** Why the requested ?src= or #data= could not be opened, shown as a modal until dismissed. */
  readonly loadError: string | null;
}

/** A blocking notice for a source or file that failed to open, so what is showing is never mistaken for it. */
const LoadErrorDialog = ({ text, onClose }: { text: string; onClose: () => void }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d === null) throw new Error('bug: load error dialog not mounted');
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog ref={dialog} class="modal" role="alertdialog" aria-labelledby="load-err-h" aria-describedby="load-err-t" onClose={onClose}>
      <div class="modal-body stack-m">
        <h2 id="load-err-h" class="display-s">
          Could not open that file
        </h2>
        <span id="load-err-t" class="small-plus">
          {text}
        </span>
        <div class="row-s">
          <button type="button" class="btn" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </dialog>
  );
};

const App = ({ today, initial, store, storage, saveMarkdown, src, saveUrl: initialSaveUrl, loadError }: AppProps) => {
  const [state, rawDispatch] = useReducer(reducer, initial);
  const [saveUrl, setSaveUrl] = useState(initialSaveUrl);
  // Loading another file (Open, or the sample) means Save would overwrite the served file with unrelated content, so it goes away.
  const dispatch: typeof rawDispatch = useMemo(
    () => (a) => {
      if (a.type === 'md/load') setSaveUrl(null);
      rawDispatch(a);
    },
    []
  );
  const [alert, setAlert] = useState(loadError);

  // Persist applied records (not unapplied editor text) and the theme.
  useEffect(() => {
    if (store === null || !saveMarkdown) return;
    try {
      store.write(STORAGE_KEYS.markdown, serializeLedger(state.adrs));
    } catch (e) {
      dispatch({ type: 'toast/show', kind: 'error', text: `Could not save in this browser: ${e instanceof Error ? e.message : String(e)}. Download the file to keep your work.` });
    }
  }, [state.adrs, store, saveMarkdown]);
  // Write applied records back to the served file (see fx.save): `saved` is the text known to be on disk.
  const text = useMemo(() => serializeLedger(state.adrs), [state.adrs]);
  const [saved, setSaved] = useState(text);
  const [saveFailed, setSaveFailed] = useState(false);
  const [autosave, setAutosave] = useState(() => store?.read(STORAGE_KEYS.autosave) !== '0');
  const writeFile = (url: string, body: string, keepalive: boolean) =>
    putText(url, body, keepalive).then(
      () => {
        setSaved(body);
        setSaveFailed(false);
      },
      (e: unknown) => {
        setSaveFailed(true);
        throw e;
      }
    );
  // Autosave, debounced so typing in a form is one write. A failed write retries on the next edit.
  useEffect(() => {
    if (saveUrl === null || !autosave || text === saved) return;
    const write = (keepalive: boolean) =>
      writeFile(saveUrl, text, keepalive).catch((e: unknown) =>
        dispatch({ type: 'toast/show', kind: 'error', text: `Could not autosave: ${e instanceof Error ? e.message : String(e)}. Download the file to keep your work.` })
      );
    const t = setTimeout(() => write(false), 800);
    // Closing the tab inside the debounce window still writes the last edit.
    const flush = () => write(true);
    window.addEventListener('pagehide', flush);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pagehide', flush);
    };
  }, [text, saved, saveUrl, autosave]);
  const fileStatus =
    saveUrl === null
      ? null
      : {
          state: saveFailed ? ('error' as const) : text === saved ? ('saved' as const) : autosave ? ('saving' as const) : ('unsaved' as const),
          autosave,
          toggleAutosave: () => {
            const on = !autosave;
            setAutosave(on);
            try {
              store?.write(STORAGE_KEYS.autosave, on ? '1' : '0');
            } catch {
              // Not remembered next time; the markdown autosave already reports blocked storage.
            }
          }
        };
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
  }, [state.screen, state.viz, state.theme, state.layout]);
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
      download: (fileName, text, mime) => {
        try {
          downloadText(fileName, text, mime);
          dispatch({ type: 'toast/show', kind: 'ok', text: `Downloaded ${fileName}.` });
        } catch (e) {
          dispatch({ type: 'toast/show', kind: 'error', text: `Download failed: ${e instanceof Error ? e.message : String(e)}` });
        }
      },
      openFile: (file) => {
        readTextFile(file).then(
          (text) => dispatch({ type: 'md/load', text, source: file.name }),
          (e: unknown) => setAlert(e instanceof Error ? e.message : String(e))
        );
      },
      share: (markdown) => {
        packLedger(markdown)
          .then((packed) => copyText(`${location.href.split(/[?#]/)[0]}#data=${packed}`))
          .then(
            () => dispatch({ type: 'toast/show', kind: 'ok', text: 'Share link copied: it holds the whole ledger, so anyone who opens it sees this copy.' }),
            (e: unknown) => dispatch({ type: 'toast/show', kind: 'error', text: `Could not copy a share link: ${e instanceof Error ? e.message : String(e)}` })
          );
      },
      openUrl: (url) =>
        fetchText(url).then(
          (r) => dispatch({ type: 'md/load', text: r.markdown, source: r.url }),
          (e: unknown) => {
            throw new Error(`Could not open ${url}: ${e instanceof Error ? e.message : String(e)}. A URL on another site must allow cross-origin requests (GitHub Pages and raw.githubusercontent.com do).`);
          }
        ),
      save:
        saveUrl === null
          ? null
          : (markdown) => {
              writeFile(saveUrl, markdown, false).then(
                () => dispatch({ type: 'toast/show', kind: 'ok', text: `Saved ${decodeURIComponent(new URL(saveUrl).pathname.split('/').pop() ?? saveUrl)}.` }),
                (e: unknown) => dispatch({ type: 'toast/show', kind: 'error', text: `Could not save: ${e instanceof Error ? e.message : String(e)}. Download the file to keep your work.` })
              );
            }
    }),
    [saveUrl]
  );

  const onNew = () => dispatch({ type: 'edit/new', today });
  const s = state.screen;
  let body;
  switch (s.kind) {
    case 'dashboard':
      body = <Dashboard adrs={state.adrs} query={state.query} filter={state.filter} tags={state.tags} layout={state.layout} today={today} dispatch={dispatch} onNew={onNew} />;
      break;
    case 'view': {
      const adr = state.adrs.find((a) => a.id === s.id);
      if (adr === undefined) throw new Error(`bug: viewing missing record ${s.id}`);
      body = <AdrView adr={adr} adrs={state.adrs} today={today} onNewChild={() => dispatch({ type: 'edit/new', today, parent: adr.id })} viz={state.viz} expanded={state.expanded} hidden={state.hidden} dispatch={dispatch} fx={fx} />;
      break;
    }
    case 'edit':
      body = <EditForm draft={s.draft} originalId={s.originalId} triedSave={s.triedSave} open={s.open} focus={s.focus} adrs={state.adrs} dispatch={dispatch} />;
      break;
    case 'markdown':
      body = <MarkdownView md={state.md} focusId={s.focusId} sampleMarkdown={sampleMarkdown} storage={storage} dispatch={dispatch} fx={fx} />;
      break;
    case 'card':
      body = <CardDesigner adrs={state.adrs} today={today} src={src} store={store} save={saveMarkdown} dispatch={dispatch} fx={fx} />;
      break;
    default: {
      const never: never = s;
      throw new Error(`bug: unknown screen ${JSON.stringify(never)}`);
    }
  }

  return (
    <div class="app">
      <Header theme={state.theme} todayLabel={formatDate(today)} onNew={onNew} adrs={state.adrs} file={fileStatus} dispatch={dispatch} fx={fx} />
      {body}
      {state.openDialog ? <OpenDialog dispatch={dispatch} fx={fx} /> : null}
      {alert !== null ? <LoadErrorDialog text={alert} onClose={() => setAlert(null)} /> : null}
      {state.newDialog ? <NewDialog count={state.adrs.length} onDownload={() => fx.download('decisions.md', serializeLedger(state.adrs))} dispatch={dispatch} /> : null}
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

const boot = (source: { url: string; markdown: string; writable?: boolean } | null, loadError: string | null) => {
  const initial = createInitialState({ source, storedMarkdown: read(STORAGE_KEYS.markdown), storedTheme: read(STORAGE_KEYS.theme), sampleMarkdown, prefs: fromQuery(location.search) });
  const warning = browser.available ? null : 'This browser is blocking storage, so nothing will be remembered. Download decisions.md to keep your work.';
  const withWarning: State = warning === null ? initial : { ...initial, seq: initial.seq + 1, toast: { id: initial.seq, kind: 'error', text: warning } };
  render(<App today={toIsoDate(new Date())} initial={withWarning} store={store} storage={storage} saveMarkdown={source === null} src={cardSrc(srcParam, source !== null)} saveUrl={source?.writable === true ? source.url : null} loadError={loadError} />, root);
};

/** #data=<packed> (from File → Copy share link): the whole ledger carried in the link itself. Like ?src=, it is not autosaved. */
/** What shows instead when a requested source fails, so nobody mistakes it for that source. */
const fallback = read(STORAGE_KEYS.markdown) === null ? 'Showing the built-in sample decisions instead.' : 'Showing your saved file instead.';
const dataParam = new URLSearchParams(location.hash.slice(1)).get('data');

if (dataParam !== null) {
  unpackLedger(dataParam).then(
    (markdown) => boot({ url: 'The shared link', markdown }, null),
    (e: unknown) => boot(null, `Could not open the shared link: ${e instanceof Error ? e.message : String(e)}. ${fallback}`)
  );
} else if (srcParam === null) boot(null, null);
else {
  fetchText(srcParam).then(
    (r) => boot(r, null),
    (e: unknown) => boot(null, `Could not load ${srcParam}: ${e instanceof Error ? e.message : String(e)}. ${fallback}`)
  );
}
