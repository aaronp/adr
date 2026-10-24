import { useEffect, useRef, useState } from 'preact/hooks';
import { plural } from '../../core/dates.ts';
import type { MarkdownPane } from '../state.ts';
import { Icon, Kicker, type Dispatch, type Effects } from './common.tsx';

const LINE_HEIGHT = 22; // must match .md-editor line-height in styles.css
const FILE_NAME = 'decisions.md';

/** Records found in the text by their "id:" line — works even while the text does not parse. */
export const outline = (text: string): { id: string; title: string; line: number }[] => {
  const lines = text.split('\n');
  const out: { id: string; title: string; line: number }[] = [];
  lines.forEach((l, i) => {
    const m = /^id:\s*(ADR-\d{4})\s*$/.exec(l);
    if (m === null) return;
    const titleLine = lines[i + 1] ?? '';
    const t = /^title:\s*(.*)$/.exec(titleLine);
    out.push({ id: m[1] as string, title: t === null ? '' : (t[1] as string), line: i }); // i = line of "---" (1-based i)
  });
  return out;
};

export interface MarkdownViewProps {
  readonly md: MarkdownPane;
  readonly focusId: string | null;
  readonly sampleMarkdown: string;
  readonly storage: { available: true } | { available: false; reason: string };
  readonly dispatch: Dispatch;
  readonly fx: Effects;
}

export const MarkdownView = ({ md, focusId, sampleMarkdown, storage, dispatch, fx }: MarkdownViewProps) => {
  const area = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dirty = md.text !== md.base;
  const lineCount = md.text.split('\n').length;
  const records = outline(md.text);

  const jumpTo = (line: number) => {
    const el = area.current;
    if (el === null) throw new Error('bug: markdown editor not mounted');
    const lines = md.text.split('\n');
    const offset = lines.slice(0, Math.max(0, line - 1)).reduce((n, l) => n + l.length + 1, 0);
    el.focus({ preventScroll: true });
    el.setSelectionRange(offset, offset + (lines[line - 1]?.length ?? 0));
    // The browser scrolls the caret into view after selection changes; set our position after that.
    requestAnimationFrame(() => {
      el.scrollTop = Math.max(0, (line - 4) * LINE_HEIGHT);
      el.scrollIntoView({ block: 'nearest' });
    });
  };

  useEffect(() => {
    if (focusId === null) return;
    const r = outline(md.text).find((x) => x.id === focusId);
    if (r !== undefined) jumpTo(r.line);
    // Only when the requested record changes; not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files[0];
    if (file === undefined) {
      dispatch({ type: 'toast/show', kind: 'error', text: 'Drop a .md file to open it.' });
      return;
    }
    fx.openFile(file);
  };

  return (
    <main>
      <section class="hero">
        <div class="wrap hero-inner hero-tight">
          <button type="button" class="back" onClick={() => dispatch({ type: 'nav/dashboard' })}>
            <Icon name="back" /> All decisions
          </button>
          <div class="hero-split">
            <div class="stack-xs">
              <Kicker>Source of truth · {FILE_NAME}</Kicker>
              <h1 class="display-l">Markdown</h1>
              <span class="muted small-plus measure">Every record lives in this one file. Edit it here, or open your own; download it to keep it in git alongside your code.</span>
            </div>
            <div class="row-s wrap-row">
              <input
                ref={fileInput}
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                class="visually-hidden"
                aria-label="Open a markdown file"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  e.currentTarget.value = '';
                  if (f !== undefined) fx.openFile(f);
                }}
              />
              <button type="button" class="btn" onClick={() => fileInput.current?.click()}>
                <Icon name="upload" /> Open .md…
              </button>
              <button type="button" class="btn" onClick={() => fx.copy(md.text, 'Markdown')}>
                <Icon name="copy" /> Copy
              </button>
              <button type="button" class="btn" onClick={() => fx.download(FILE_NAME, md.text)}>
                <Icon name="download" /> Download {FILE_NAME}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div class="wrap page split">
        <div class="split-main stack-s">
          {md.error !== null ? (
            <div role="alert" class="alert alert-bad stack-xs">
              <strong>Not applied — fix the markdown and try again</strong>
              <span class="mono small pre-line">{md.error.message}</span>
              {md.error.line !== null ? (
                <span>
                  <button type="button" class="btn btn-s" onClick={() => md.error !== null && md.error.line !== null && jumpTo(md.error.line)}>
                    Go to line {md.error.line}
                  </button>
                </span>
              ) : null}
            </div>
          ) : null}
          {md.notice !== null ? (
            <div role="status" class="alert alert-good">
              {md.notice}
            </div>
          ) : null}

          <div
            class={`md-shell${dragging ? ' dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <div class="md-bar">
              <label for="md-src" class="mono small">
                {FILE_NAME}
              </label>
              <span class="mono small md-muted">
                {dirty ? 'edited · not applied' : 'in sync'} · {plural(lineCount, 'line')}
              </span>
            </div>
            <div class="md-body">
              <div ref={gutter} class="md-gutter mono" aria-hidden="true">
                {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
              </div>
              <textarea
                ref={area}
                id="md-src"
                class="md-editor mono"
                spellcheck={false}
                value={md.text}
                onInput={(e) => dispatch({ type: 'md/text', value: e.currentTarget.value })}
                onScroll={(e) => {
                  if (gutter.current !== null) gutter.current.scrollTop = e.currentTarget.scrollTop;
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    dispatch({ type: 'md/apply' });
                  }
                }}
              />
            </div>
            {dragging ? <div class="md-drop">Drop a .md file to open it</div> : null}
          </div>
          <div class="row-s wrap-row">
            <button type="button" class="btn btn-primary" disabled={!dirty} onClick={() => dispatch({ type: 'md/apply' })}>
              <Icon name="check" /> Apply changes
            </button>
            <button type="button" class="btn" disabled={!dirty} onClick={() => dispatch({ type: 'md/discard' })}>
              <Icon name="reset" /> Discard edits
            </button>
            <span class="small muted">Ctrl/⌘ + Enter applies.</span>
          </div>
        </div>

        <aside class="split-side stack-m">
          <section aria-labelledby="out-h" class="card pad stack-s">
            <Kicker as="h2" id="out-h">
              Records in this file
            </Kicker>
            {records.length === 0 ? <span class="small muted">No records yet.</span> : null}
            {records.map((r) => (
              <button key={`${r.id}-${r.line}`} type="button" class="outline-btn" onClick={() => jumpTo(r.line)}>
                <span class="mono small strong">{r.id}</span>
                <span class="small-plus clamp-1">{r.title}</span>
                <span class="mono tiny muted">L{r.line}</span>
              </button>
            ))}
          </section>

          <section aria-labelledby="fmt-h" class="card pad stack-s small-plus">
            <Kicker as="h2" id="fmt-h">
              Format
            </Kicker>
            <span>Parsing is strict: anything unexpected is rejected with its line number, and nothing changes until the whole file is valid.</span>
            <div class="fmt-block">
              <span class="strong">Each record starts with frontmatter — every key required</span>
              <code class="fmt-code">{'---\nid · title · status · date\nrevisit · tags · decision\n---'}</code>
              <span class="small muted">Leave revisit, tags or decision empty when they do not apply.</span>
            </div>
            <div class="fmt-block">
              <span class="strong">Then these sections</span>
              <code class="fmt-code">{'## Goal\n## Hypothesis\n## People\n## Criteria\n## Solution: id — Name\n## Decision'}</code>
            </div>
            <div class="fmt-block">
              <span class="strong">Scores &amp; weights</span>
              <span class="small muted">Whole numbers 1–5. Each solution has one score row per criterion id; use - for unscored.</span>
            </div>
          </section>

          <section aria-labelledby="sv-h" class="card pad stack-s small-plus">
            <Kicker as="h2" id="sv-h">
              Saving
            </Kicker>
            {storage.available ? (
              <span>Applied changes are saved in this browser automatically. The downloaded .md file is the copy to keep and share.</span>
            ) : (
              <span class="bad">This browser is blocking storage ({storage.reason}). Nothing will be remembered — download the file before you close the page.</span>
            )}
            <button type="button" class="btn btn-s" onClick={() => dispatch({ type: 'md/load', text: sampleMarkdown, source: 'the sample file' })}>
              Replace with sample records
            </button>
          </section>
        </aside>
      </div>
    </main>
  );
};
