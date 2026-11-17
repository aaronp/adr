import type { Adr } from '../../core/schema.ts';
import { STATUSES } from '../../core/schema.ts';
import { formatDate, plural, revisitInfo } from '../../core/dates.ts';
import { findRow, scoreLabel, scoreModel } from '../../core/scoring.ts';
import { isRevisitDue, searchAdrs, tagCounts, type Filter } from '../../core/search.ts';
import { useEffect, useRef, useState } from 'preact/hooks';
import { seriesColor } from '../themes.ts';
import { forest, type TreeNode } from '../../core/hierarchy.ts';
import { LAYOUTS, type LayoutId } from '../state.ts';
import { Sankey } from './Sankey.tsx';
import { Avatar, Icon, Kicker, RevisitBadge, StatusPill, Swatch, statusLabel, type Dispatch } from './common.tsx';

const outcomeOf = (a: Adr): { caption: string; name: string; score: string; color: string } => {
  const m = scoreModel(a);
  if (a.decision !== null) {
    const r = findRow(m, a.decision);
    return { caption: 'Chosen', name: r.solution.name, score: `${scoreLabel(r)} / 5`, color: seriesColor(r.index) };
  }
  if (m.leader !== null) return { caption: 'Leading option', name: m.leader.solution.name, score: `${scoreLabel(m.leader)} / 5`, color: seriesColor(m.leader.index) };
  return { caption: 'Not yet scored', name: plural(a.solutions.length, 'option'), score: '—', color: 'var(--control-border)' };
};

const listRow = (a: Adr, depth: number, today: string, dispatch: Dispatch) => {
  const o = outcomeOf(a);
  const deciders = a.people.filter((p) => p.role === 'decider');
  const firstDecider = deciders[0];
  return (
    <button key={a.id} type="button" class="list-row" style={depth > 0 ? { paddingLeft: 24 + depth * 32 } : undefined} onClick={() => dispatch({ type: 'nav/view', id: a.id })}>
      <span class="list-main">
        <span class="row-s wrap-row">
          {depth > 0 ? <span class="faint" aria-hidden="true">↳</span> : null}
          <span class="mono strong muted">{a.id}</span>
          <StatusPill status={a.status} />
          <span class="mono small faint">{a.date === '' ? 'Undated' : formatDate(a.date)}</span>
        </span>
        <span class="display-s">{a.title}</span>
        <span class="clamp-2 muted small-plus">{a.goal}</span>
        <span class="tags">
          {a.tags.map((t) => (
            <span key={t} class="tag">
              #{t}
            </span>
          ))}
        </span>
      </span>
      <span class="list-meta">
        <span class="list-outcome">
          <span class="kicker">{o.caption}</span>
          <span class="row-s strong">
            <Swatch color={o.color} />
            {o.name}
          </span>
          <span class="mono small muted">
            {o.score} · {plural(a.solutions.length, 'option')}, {a.criteria.length} criteria
          </span>
        </span>
        <span class="list-people">
          <span class="avatar-stack">
            {deciders.map((p) => (
              <Avatar key={p.name} person={p} ring />
            ))}
          </span>
          <span class="small muted">{firstDecider === undefined ? 'No decider' : deciders.length === 1 ? firstDecider.name : plural(deciders.length, 'decider')}</span>
        </span>
        <span class="list-revisit">
          <RevisitBadge info={revisitInfo(a.revisit, today)} />
        </span>
      </span>
    </button>
  );
};

const flatten = (nodes: readonly TreeNode[], depth = 0): [Adr, number][] => nodes.flatMap((n) => [[n.adr, depth] as [Adr, number], ...flatten(n.children, depth + 1)]);

export const Dashboard = ({ adrs, query, filter, tags, layout, today, dispatch, onNew }: { adrs: readonly Adr[]; query: string; filter: Filter; tags: readonly string[]; layout: LayoutId; today: string; dispatch: Dispatch; onNew: () => void }) => {
  const count = (st: Adr['status']) => adrs.filter((a) => a.status === st).length;
  const overdue = adrs.filter((a) => revisitInfo(a.revisit, today).kind === 'overdue').length;
  const due = adrs.filter((a) => isRevisitDue(a, today)).length;
  const allTags = tagCounts(adrs);
  /* Chosen tags no longer in the file (after opening another one) are ignored rather than hiding everything. */
  const activeTags = tags.filter((t) => allTags.some(([x]) => x === t));
  const [tagPanel, setTagPanel] = useState(false);
  const [statusPanel, setStatusPanel] = useState(false);
  /* Search is a magnifier until clicked; it stays open while it holds a query. */
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);
  const results = searchAdrs(adrs, query, filter, today, activeTags);
  const tiles: { label: string; value: number; sub: string; filter: Filter; tone: string }[] = [
    { label: 'Decisions', value: adrs.length, sub: 'All records', filter: 'all', tone: 'var(--ink)' },
    { label: 'Accepted', value: count('accepted'), sub: 'In force today', filter: 'accepted', tone: 'var(--good)' },
    { label: 'Proposed', value: count('proposed'), sub: 'Awaiting a decision', filter: 'proposed', tone: 'var(--accent)' },
    { label: 'Revisit due', value: due, sub: `${overdue} overdue · ${due - overdue} within 30 days`, filter: 'revisit', tone: 'var(--bad)' }
  ];
  const chips: { id: Filter; label: string; n: number }[] = [
    { id: 'all', label: 'All', n: adrs.length },
    ...STATUSES.map((st) => ({ id: st as Filter, label: statusLabel(st), n: count(st) })),
    { id: 'revisit', label: 'Revisit due', n: due }
  ];

  return (
    <main>
      <section class="hero">
        <div class="wrap hero-inner">
          <div class="stack-s">
            <Kicker>Architecture decision records</Kicker>
            <h1 class="display-xl">Decisions, and the reasons behind them.</h1>
          </div>
          <div class="tiles">
            {tiles.map((t) => (
              <button key={t.label} type="button" class={`tile${filter === t.filter ? ' on' : ''}`} aria-pressed={filter === t.filter} onClick={() => dispatch({ type: 'dash/filter', filter: t.filter })}>
                <Kicker>{t.label}</Kicker>
                <span class="tile-value" style={{ color: t.tone }}>
                  {t.value}
                </span>
                <span class="small muted">{t.sub}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div class="wrap page stack-m">
        <div class="stack-s">
          <div class="toolbar">
            {searchOpen || query !== '' ? (
              <div class="search-box">
                <Icon name="search" size={18} />
                <input
                  ref={searchInput}
                  id="adr-search"
                  type="search"
                  class="input"
                  aria-label="Search title, goal, people, tags or options"
                  value={query}
                  placeholder="Search title, goal, people, tags or options"
                  onInput={(e) => dispatch({ type: 'dash/query', value: e.currentTarget.value })}
                  onBlur={() => query === '' && setSearchOpen(false)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Escape') return;
                    dispatch({ type: 'dash/query', value: '' });
                    setSearchOpen(false);
                  }}
                />
              </div>
            ) : (
              <button type="button" class="chip tool-btn" title="Search" aria-label="Search" onClick={() => setSearchOpen(true)}>
                <Icon name="search" />
              </button>
            )}
            <button
              type="button"
              class={`chip tool-btn${tagPanel ? ' on' : ''}`}
              aria-expanded={tagPanel}
              aria-controls="tag-panel"
              title="Filter by tag"
              aria-label="Filter by tag"
              onClick={() => setTagPanel(!tagPanel)}
            >
              <Icon name="filter" />
            </button>
            {!tagPanel && activeTags.length > 0 ? (
              <button type="button" class="filter-badge" title="Clear tag filters" aria-label={`${plural(activeTags.length, 'tag filter')} on; clear`} onClick={() => dispatch({ type: 'dash/clearTags' })}>
                {activeTags.length} <Icon name="x" size={12} />
              </button>
            ) : null}
            <button type="button" class={`chip tool-btn${statusPanel ? ' on' : ''}`} aria-expanded={statusPanel} aria-controls="status-panel" onClick={() => setStatusPanel(!statusPanel)}>
              Status{filter === 'all' ? '' : `: ${chips.find((c) => c.id === filter)?.label ?? filter}`}
              <Icon name={statusPanel ? 'up' : 'down'} size={14} />
            </button>
            {!statusPanel && filter !== 'all' ? (
              <button type="button" class="filter-badge" title="Clear status filter" aria-label="Clear status filter" onClick={() => dispatch({ type: 'dash/filter', filter: 'all' })}>
                1 <Icon name="x" size={12} />
              </button>
            ) : null}
            <div class="toolbar-end row-s">
              <span class="kicker">View</span>
              <div class="segmented" role="group" aria-label="Dashboard layout">
                {LAYOUTS.map((l) => (
                  <button key={l.id} type="button" class={layout === l.id ? 'on' : ''} aria-pressed={layout === l.id} onClick={() => dispatch({ type: 'dash/layout', layout: l.id })}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {statusPanel ? (
            <div id="status-panel" class="tag-panel" role="group" aria-label="Filter by status">
              {chips.map((c) => (
                <button key={c.id} type="button" class={`chip chip-sm${filter === c.id ? ' on' : ''}`} aria-pressed={filter === c.id} onClick={() => dispatch({ type: 'dash/filter', filter: c.id })}>
                  {c.label}
                  <span class="mono small">{c.n}</span>
                </button>
              ))}
            </div>
          ) : null}
          {tagPanel ? (
            <div id="tag-panel" class="tag-panel" role="group" aria-label="Filter by tag">
              {allTags.length === 0 ? (
                <span class="small muted">No records have tags yet.</span>
              ) : (
                allTags.map(([t, n]) => {
                  const on = activeTags.includes(t);
                  return (
                    <button key={t} type="button" class={`chip chip-sm${on ? ' on' : ''}`} aria-pressed={on} onClick={() => dispatch({ type: 'dash/toggleTag', tag: t })}>
                      #{t}
                      <span class="mono small">{n}</span>
                    </button>
                  );
                })
              )}
              {activeTags.length > 0 ? (
                <button type="button" class="link-btn" onClick={() => dispatch({ type: 'dash/clearTags' })}>
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}
          <span class="mono small muted">
            {results.length} of {plural(adrs.length, 'record')} · {layout === 'sankey' ? 'flow of decisions into sub-decisions' : layout === 'tree' ? 'children under their parent' : 'newest first'}
          </span>
        </div>

        {adrs.length === 0 ? (
          <div class="empty">
            <span class="display-m">No records yet.</span>
            <span class="muted">Create one with the form, or open a decisions.md file in the Markdown view.</span>
            <div class="row-s">
              <button type="button" class="btn btn-primary" onClick={onNew}>
                <Icon name="plus" /> New ADR
              </button>
              <button type="button" class="btn" onClick={() => dispatch({ type: 'nav/markdown', focusId: null })}>
                <Icon name="code" /> Open markdown
              </button>
            </div>
          </div>
        ) : results.length === 0 ? (
          <div class="empty">
            <span class="display-m">No records match.</span>
            <span class="muted">Nothing matches this search and filter combination.</span>
            <button
              type="button"
              class="btn"
              onClick={() => {
                dispatch({ type: 'dash/query', value: '' });
                dispatch({ type: 'dash/filter', filter: 'all' });
                dispatch({ type: 'dash/clearTags' });
              }}
            >
              Clear search and filters
            </button>
          </div>
        ) : layout === 'sankey' ? (
          <Sankey adrs={results} dispatch={dispatch} />
        ) : (
          <div class="card list">
            {layout === 'list' ? results.map((a) => listRow(a, 0, today, dispatch)) : flatten(forest(results)).map(([a, depth]) => listRow(a, depth, today, dispatch))}
          </div>
        )}
      </div>
    </main>
  );
};
