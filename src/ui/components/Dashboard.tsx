import type { Adr } from '../../core/schema.ts';
import { STATUSES } from '../../core/schema.ts';
import { formatDate, plural, revisitInfo } from '../../core/dates.ts';
import { findRow, scoreLabel, scoreModel } from '../../core/scoring.ts';
import { isRevisitDue, searchAdrs, type Filter } from '../../core/search.ts';
import { seriesColor } from '../themes.ts';
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

export const Dashboard = ({ adrs, query, filter, today, dispatch, onNew }: { adrs: readonly Adr[]; query: string; filter: Filter; today: string; dispatch: Dispatch; onNew: () => void }) => {
  const count = (st: Adr['status']) => adrs.filter((a) => a.status === st).length;
  const overdue = adrs.filter((a) => revisitInfo(a.revisit, today).kind === 'overdue').length;
  const due = adrs.filter((a) => isRevisitDue(a, today)).length;
  const results = searchAdrs(adrs, query, filter, today);
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
        <div class="toolbar">
          <div class="search">
            <label for="adr-search" class="kicker">
              Search title, goal, people, tags or options
            </label>
            <div class="search-box">
              <Icon name="search" size={18} />
              <input id="adr-search" type="search" class="input" value={query} placeholder="e.g. kafka, Priya, infrastructure" onInput={(e) => dispatch({ type: 'dash/query', value: e.currentTarget.value })} />
            </div>
          </div>
          <div class="chips" role="group" aria-label="Filter by status">
            {chips.map((c) => (
              <button key={c.id} type="button" class={`chip${filter === c.id ? ' on' : ''}`} aria-pressed={filter === c.id} onClick={() => dispatch({ type: 'dash/filter', filter: c.id })}>
                {c.label}
                <span class="mono small">{c.n}</span>
              </button>
            ))}
          </div>
        </div>
        <span class="mono small muted">
          {results.length} of {plural(adrs.length, 'record')} · newest first
        </span>

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
              }}
            >
              Clear search and filters
            </button>
          </div>
        ) : (
          <div class="card list">
            {results.map((a) => {
              const o = outcomeOf(a);
              const deciders = a.people.filter((p) => p.role === 'decider');
              const firstDecider = deciders[0];
              return (
                <button key={a.id} type="button" class="list-row" onClick={() => dispatch({ type: 'nav/view', id: a.id })}>
                  <span class="list-main">
                    <span class="row-s wrap-row">
                      <span class="mono strong muted">{a.id}</span>
                      <StatusPill status={a.status} />
                      <span class="mono small faint">{formatDate(a.date)}</span>
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
            })}
          </div>
        )}
      </div>
    </main>
  );
};
