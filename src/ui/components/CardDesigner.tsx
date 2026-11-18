/**
 * Card designer (?page=card): edits the sidecar (<name>.card.json) that sets what the ledger's dashboard
 * card and badge say, with a live preview of both. The sidecar is loaded from beside ?src= when there is
 * one, otherwise from browser storage; Download writes it for committing next to the markdown.
 */
import { useEffect, useState } from 'preact/hooks';
import type { Adr, Status } from '../../core/schema.ts';
import { STATUSES } from '../../core/schema.ts';
import { DEFAULT_COLORS, card, parsePrefs, type Card, type CardPrefs } from '../../core/card.ts';
import { badgeSvg } from '../../core/badge.ts';
import { STORAGE_KEYS, fetchText, type Store } from '../io.ts';
import { safeHref, sidecarUrl } from '../url.ts';
import { Icon, Kicker, type Dispatch, type Effects } from './common.tsx';

interface Row {
  readonly id: Status;
  readonly on: boolean;
  readonly label: string;
  readonly color: string;
  readonly url: string;
}
interface Design {
  readonly title: string;
  readonly subtitle: string;
  readonly primary: 'total' | Status;
  readonly label: string;
  /** All five statuses, in legend order; `on` ones are shown. */
  readonly rows: readonly Row[];
  readonly sourceLabel: string;
  readonly sourceUrl: string;
}

const DEFAULT_LABEL = Object.fromEntries(card([], {}, '', '').legend.map((l) => [l.id, l.label])) as Record<Status, string>;

const fromPrefs = (p: CardPrefs, sourceLabel: string): Design => {
  const c = card([], p, '', sourceLabel);
  const listed: NonNullable<CardPrefs['legend']> = p.legend ?? STATUSES.map((id) => ({ id }));
  const ids = [...listed.map((l) => l.id), ...STATUSES.filter((s) => !listed.some((l) => l.id === s))];
  return {
    title: c.title,
    subtitle: c.subtitle,
    primary: p.heading?.primary ?? 'total',
    label: c.heading.label,
    rows: ids.map((id) => {
      const l = listed.find((x) => x.id === id);
      return { id, on: l !== undefined, label: l?.label ?? DEFAULT_LABEL[id], color: l?.color ?? DEFAULT_COLORS[id], url: l?.url ?? '' };
    }),
    sourceLabel: c.source.label,
    sourceUrl: c.source.url ?? ''
  };
};

const toPrefs = (d: Design): CardPrefs => ({
  title: d.title,
  subtitle: d.subtitle,
  heading: { primary: d.primary, label: d.label },
  legend: d.rows.filter((r) => r.on).map((r) => ({ id: r.id, label: r.label, color: r.color, ...(r.url !== '' ? { url: r.url } : {}) })),
  source: { label: d.sourceLabel, ...(d.sourceUrl !== '' ? { url: d.sourceUrl } : {}) }
});

/** The design as last edited, kept while the page is open so leaving the designer and coming back keeps unsaved edits. */
let kept: { readonly src: string | null; readonly design: Design } | null = null;

const TONE: Record<Card['status']['tone'], string> = { good: 'cd-good', warn: 'cd-warn', bad: 'cd-bad', neutral: 'cd-neutral' };

/** A plain rendering of card.json, shaped like a dashboard tile. Only a preview: dashboards style cards their own way. */
const CardPreview = ({ c }: { c: Card }) => {
  const items = c.legend.map((l) => ({ ...l, n: c.report[l.id] ?? 0 }));
  const total = items.reduce((a, b) => a + b.n, 0);
  return (
    <div class="cd-card">
      <div class="row-between">
        <div class="stack-xxs">
          <strong class="cd-title">{c.title}</strong>
          {c.subtitle !== '' ? <span class="muted">{c.subtitle}</span> : null}
        </div>
        <span class={`cd-pill ${TONE[c.status.tone]}`}>{c.status.label}</span>
      </div>
      <div class="cd-heading">
        <span class="cd-primary">{c.heading.primary}</span> <span class="muted">{c.heading.label}</span>
      </div>
      <div class="cd-bar">{total === 0 ? <span style={{ flex: 1 }} /> : items.filter((i) => i.n > 0).map((i) => <span key={i.id} style={{ flex: i.n, background: i.color }} title={`${i.label} ${i.n}`} />)}</div>
      <div class="cd-legend">
        {items.map((i) => (
          <span key={i.id} class="row-xs">
            <span class="cd-swatch" style={{ background: i.color }} /> {safeHref(i.url) !== undefined ? <a href={safeHref(i.url)}>{i.label}</a> : i.label} <strong>{i.n}</strong>
          </span>
        ))}
      </div>
      <div class="row-between cd-foot">
        <span class="mono small">{c.source.label}</span>
        {safeHref(c.source.url) !== undefined ? <a href={safeHref(c.source.url)}>Open →</a> : <span class="muted">Open →</span>}
      </div>
    </div>
  );
};

export const CardDesigner = ({ adrs, today, src, store, save, dispatch, fx }: { adrs: readonly Adr[]; today: string; src: string | null; store: Store | null; save: boolean; dispatch: Dispatch; fx: Effects }) => {
  const defaultSource = src ?? 'decisions.md';
  const [design, setDesign] = useState<Design | null>(null);
  const [notes, setNotes] = useState<readonly string[]>([]);

  useEffect(() => {
    if (kept !== null && kept.src === src) {
      setDesign(kept.design);
      return;
    }
    const load = (text: string | null, where: string, extra: string[] = []) => {
      if (text === null) {
        setDesign(fromPrefs({}, defaultSource));
        setNotes(extra);
        return;
      }
      try {
        const { prefs, warnings } = parsePrefs(JSON.parse(text));
        setDesign(fromPrefs(prefs, defaultSource));
        setNotes([...extra, ...warnings.map((w) => `${where}: ${w}`)]);
      } catch (e) {
        setDesign(fromPrefs({}, defaultSource));
        setNotes([...extra, `${where}: ${e instanceof Error ? e.message : String(e)}. Using the defaults.`]);
      }
    };
    if (src === null) {
      load(store?.read(STORAGE_KEYS.card) ?? null, 'Saved card settings');
      return;
    }
    const url = sidecarUrl(src);
    fetchText(url).then(
      (r) => load(r.markdown, url),
      (e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        load(null, url, msg === 'HTTP 404' ? [] : [`Could not load ${url}: ${msg}. Using the defaults.`]);
      }
    );
  }, [src]);

  useEffect(() => {
    if (design !== null) kept = { src, design };
    if (design === null || !save || store === null) return;
    try {
      store.write(STORAGE_KEYS.card, JSON.stringify(toPrefs(design)));
    } catch {
      /* Storage full or blocked: the designer still works; Download keeps the settings. */
    }
  }, [design, save, store]);

  const header = (
    <section class="hero">
      <div class="wrap hero-inner hero-tight">
        <button type="button" class="back" onClick={() => dispatch({ type: 'nav/dashboard' })}>
          <Icon name="back" /> All decisions
        </button>
        <div class="stack-xs">
          <Kicker>Dashboard card · {defaultSource.split('/').pop()?.replace(/\.md$/i, '') ?? 'decisions'}.card.json</Kicker>
          <h1 class="display-l">Card designer</h1>
          <span class="muted small-plus measure">What this ledger's dashboard card and badge say. Download the settings and commit them next to the markdown; <code>adr card</code> and <code>adr badge</code> read them in CI.</span>
        </div>
      </div>
    </section>
  );
  if (design === null) return <main>{header}<div class="wrap page muted">Loading…</div></main>;

  const set = (patch: Partial<Design>) => setDesign({ ...design, ...patch });
  const setRow = (i: number, patch: Partial<Row>) => set({ rows: design.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const move = (i: number, by: -1 | 1) => {
    const rows = [...design.rows];
    const [r] = rows.splice(i, 1);
    if (r === undefined) return;
    rows.splice(i + by, 0, r);
    set({ rows });
  };
  const prefs = toPrefs(design);
  const c = card(adrs, prefs, today, defaultSource);
  const svg = badgeSvg(c);
  const fileName = `${defaultSource.split(/[/?#]/).filter((s) => s !== '').find((s) => /\.md$/i.test(s))?.replace(/\.md$/i, '') ?? 'decisions'}.card.json`;
  const text = (label: string, value: string, on: (v: string) => void, mono = false) => (
    <div class="field">
      <label>
        {label}
        <input class={`input${mono ? ' mono' : ''}`} value={value} onInput={(e) => on(e.currentTarget.value)} />
      </label>
    </div>
  );

  return (
    <main>
      {header}
      <div class="wrap page cd-grid">
        <div class="stack-m">
          {notes.length > 0 ? (
            <div role="alert" class="alert alert-bad stack-xs">
              {notes.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>
          ) : null}
          <div class="row-fields">
            <div class="grow-main">{text('Title', design.title, (v) => set({ title: v }))}</div>
            <div class="grow-main">{text('Subtitle', design.subtitle, (v) => set({ subtitle: v }))}</div>
          </div>
          <div class="row-fields">
            <div class="field">
              <label>
                Big number
                <select class="input" value={design.primary} onChange={(e) => set({ primary: e.currentTarget.value as Design['primary'] })}>
                  <option value="total">Total records</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {DEFAULT_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div class="grow-main">{text('Label', design.label, (v) => set({ label: v }))}</div>
          </div>
          <fieldset class="cd-rows stack-xs">
            <legend class="field-label">Legend</legend>
            {design.rows.map((r, i) => (
              <div key={r.id} class="cd-row">
                <span class="row-xs">
                  <button type="button" class="icon-btn" aria-label={`Move ${r.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <Icon name="up" />
                  </button>
                  <button type="button" class="icon-btn" aria-label={`Move ${r.label} down`} disabled={i === design.rows.length - 1} onClick={() => move(i, 1)}>
                    <Icon name="down" />
                  </button>
                </span>
                <label class="row-xs">
                  <input type="checkbox" checked={r.on} onChange={(e) => setRow(i, { on: e.currentTarget.checked })} /> <span class="mono small">{r.id}</span>
                </label>
                <input class="input" aria-label={`${r.id} label`} value={r.label} onInput={(e) => setRow(i, { label: e.currentTarget.value })} />
                <input type="color" class="cd-color" aria-label={`${r.id} colour`} value={r.color} onInput={(e) => setRow(i, { color: e.currentTarget.value.toUpperCase() })} />
                <input class="input" aria-label={`${r.id} link`} placeholder="Link (optional)" value={r.url} onInput={(e) => setRow(i, { url: e.currentTarget.value })} />
              </div>
            ))}
          </fieldset>
          <div class="row-fields">
            <div class="grow-main">{text('Source path', design.sourceLabel, (v) => set({ sourceLabel: v }), true)}</div>
            <div class="grow-main">{text('Open link', design.sourceUrl, (v) => set({ sourceUrl: v }))}</div>
          </div>
        </div>
        <div class="stack-s">
          <span class="field-label">Card preview</span>
          <CardPreview c={c} />
          <span class="field-label">Badge</span>
          <img class="cd-badge" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={c.title} />
          <div class="row-s wrap-row">
            <button type="button" class="btn btn-primary btn-s" onClick={() => fx.download(fileName, JSON.stringify(prefs, null, 2) + '\n', 'application/json')}>
              <Icon name="download" /> Download {fileName}
            </button>
            <button type="button" class="btn btn-s" onClick={() => fx.download('badge.svg', svg, 'image/svg+xml')}>
              <Icon name="download" /> Download badge.svg
            </button>
            <button type="button" class="btn btn-s" onClick={() => fx.copy(JSON.stringify(c, null, 2) + '\n', 'card.json')}>
              <Icon name="copy" /> Copy card.json
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};
