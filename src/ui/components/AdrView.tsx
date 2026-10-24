import type { Adr, Role } from '../../core/schema.ts';
import { ROLES } from '../../core/schema.ts';
import { formatDate, plural, revisitInfo } from '../../core/dates.ts';
import { findRow, scoreLabel, scoreModel, scoreOf } from '../../core/scoring.ts';
import { serializeAdr } from '../../core/markdown.ts';
import { seriesColor } from '../themes.ts';
import { VIZ, type VizId } from '../state.ts';
import { Avatar, Dots, Icon, Kicker, RevisitBadge, StatusPill, Swatch, type Dispatch, type Effects } from './common.tsx';
import { Heatmap, MatrixChart, RadarChart, WeightedBars } from './Charts.tsx';

const ROLE_GROUP: Record<Role, string> = { decider: 'Deciders', author: 'Authors', consulted: 'Consulted', informed: 'Informed' };

export interface AdrViewProps {
  readonly adr: Adr;
  readonly today: string;
  readonly viz: VizId;
  readonly expanded: Readonly<Record<string, boolean>>;
  readonly hidden: Readonly<Record<string, boolean>>;
  readonly dispatch: Dispatch;
  readonly fx: Effects;
}

export const AdrView = ({ adr, today, viz, expanded, hidden, dispatch, fx }: AdrViewProps) => {
  const model = scoreModel(adr);
  const chosen = adr.decision === null ? null : findRow(model, adr.decision);
  const rv = revisitInfo(adr.revisit, today);
  const n = adr.criteria.length;
  const outcome =
    chosen !== null
      ? { kicker: 'Chosen solution', name: chosen.solution.name, color: seriesColor(chosen.index), detail: `${scoreLabel(chosen)} / 5 weighted · ranked #${chosen.rank} of ${model.rows.length}` }
      : model.leader !== null
        ? { kicker: 'No decision yet · leading', name: model.leader.solution.name, color: seriesColor(model.leader.index), detail: `${scoreLabel(model.leader)} / 5 weighted · ${plural(model.rows.length, 'option')}` }
        : { kicker: 'No decision yet', name: 'Scoring incomplete', color: 'var(--border-strong)', detail: `${plural(model.rows.length, 'option')} still need scores` };
  const md = serializeAdr(adr);
  const fileName = `${adr.id.toLowerCase()}.md`;

  return (
    <main>
      <section class="hero">
        <div class="wrap hero-inner hero-tight">
          <button type="button" class="back" onClick={() => dispatch({ type: 'nav/dashboard' })}>
            <Icon name="back" /> All decisions
          </button>
          <div class="hero-split">
            <div class="stack-s grow-main">
              <div class="row-s wrap-row">
                <span class="mono strong text-2">{adr.id}</span>
                <StatusPill status={adr.status} large />
                <span class="mono small muted">Decided {formatDate(adr.date)}</span>
                <RevisitBadge info={rv} long />
              </div>
              <h1 class="display-l">{adr.title}</h1>
              <div class="tags">
                {adr.tags.map((t) => (
                  <span key={t} class="tag tag-outline">
                    #{t}
                  </span>
                ))}
              </div>
            </div>
            <div class="row-s wrap-row">
              <button type="button" class="btn" onClick={() => fx.copy(md, `${adr.id} markdown`)}>
                <Icon name="copy" /> Copy markdown
              </button>
              <button type="button" class="btn" onClick={() => fx.download(fileName, md)}>
                <Icon name="download" /> {fileName}
              </button>
              <button type="button" class="btn" onClick={() => dispatch({ type: 'nav/markdown', focusId: adr.id })}>
                <Icon name="code" /> Edit as markdown
              </button>
              <button type="button" class="btn btn-primary" onClick={() => dispatch({ type: 'edit/start', id: adr.id })}>
                <Icon name="edit" /> Edit ADR
              </button>
            </div>
          </div>
        </div>
      </section>

      <div class="wrap page split">
        <div class="split-main stack-l">
          <section aria-labelledby="goal-h" class="stack-s">
            <Kicker as="h2" id="goal-h">
              Goal
            </Kicker>
            <p class="lead">{adr.goal}</p>
          </section>

          <section aria-labelledby="cmp-h" class="card pad stack-m">
            <div class="row-between wrap-row">
              <div class="stack-xs">
                <Kicker>Comparison</Kicker>
                <h2 id="cmp-h" class="display-m">
                  {plural(model.rows.length, 'solution')} × {n} {n === 1 ? 'criterion' : 'criteria'}
                </h2>
              </div>
              <div class="segmented" role="group" aria-label="Comparison view">
                {VIZ.map((v) => (
                  <button key={v.id} type="button" class={viz === v.id ? 'on' : ''} aria-pressed={viz === v.id} onClick={() => dispatch({ type: 'view/viz', viz: v.id })}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            {viz === 'matrix' ? (
              <MatrixChart model={model} decision={adr.decision} />
            ) : viz === 'radar' ? (
              <RadarChart model={model} decision={adr.decision} hidden={hidden} dispatch={dispatch} />
            ) : viz === 'weighted' ? (
              <WeightedBars model={model} decision={adr.decision} />
            ) : (
              <Heatmap model={model} decision={adr.decision} />
            )}
          </section>

          <section aria-labelledby="crit-h" class="card pad stack-m">
            <div class="row-between wrap-row">
              <h2 id="crit-h" class="display-m">
                Criteria &amp; weights
              </h2>
              <span class="mono small muted">weights 1–5 · share of total</span>
            </div>
            <div>
              {adr.criteria.map((c) => (
                <div key={c.id} class="crit-row">
                  <div class="grow-main stack-xxs">
                    <span class="strong">{c.name}</span>
                    <span class="small-plus muted">{c.description}</span>
                  </div>
                  <div class="row-s crit-weight">
                    <span class="pips" role="img" aria-label={`Weight ${c.weight} of 5`}>
                      {[1, 2, 3, 4, 5].map((k) => (
                        <span key={k} class={k <= c.weight ? 'pip on' : 'pip'} />
                      ))}
                    </span>
                    <span class="mono strong share">{model.totalWeight > 0 ? Math.round((c.weight / model.totalWeight) * 100) : 0}%</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="sol-h" class="card pad stack-s">
            <div class="row-between wrap-row">
              <h2 id="sol-h" class="display-m">
                Proposed solutions
              </h2>
              <div class="row-xs">
                <button type="button" class="link-btn" onClick={() => dispatch({ type: 'view/setAll', open: true })}>
                  Expand all
                </button>
                <button type="button" class="link-btn" onClick={() => dispatch({ type: 'view/setAll', open: false })}>
                  Collapse all
                </button>
              </div>
            </div>
            <div>
              {model.rows.map((r) => {
                const s = r.solution;
                const open = expanded[s.id] === true;
                const isChosen = adr.decision === s.id;
                const isLeader = model.leader !== null && model.leader.solution.id === s.id;
                return (
                  <div key={s.id} class="acc">
                    <button type="button" class="acc-head" aria-expanded={open} onClick={() => dispatch({ type: 'view/toggle', solutionId: s.id })}>
                      <span class="mono small muted acc-rank">#{r.rank}</span>
                      <Swatch color={seriesColor(r.index)} size={12} />
                      <span class="grow-main row-s wrap-row">
                        <span class="acc-title">{s.name}</span>
                        {isChosen ? <span class="flag flag-solid">Chosen</span> : null}
                        {isLeader && !isChosen ? <span class="flag">Highest score</span> : null}
                      </span>
                      <span class="acc-score">
                        <span class="mono strong">{scoreLabel(r)}</span>
                        <span class="meter meter-s">
                          <span style={{ width: `${r.pct}%`, background: seriesColor(r.index) }} />
                        </span>
                      </span>
                      <Icon name={open ? 'up' : 'down'} size={20} />
                    </button>
                    {open ? (
                      <div class="acc-body stack-m">
                        {s.summary !== '' ? <p class="text-2 measure">{s.summary}</p> : null}
                        <div class="bordered">
                          {adr.criteria.map((c) => {
                            const v = scoreOf(s, c.id);
                            return (
                              <div key={c.id} class="score-row">
                                <span class="grow-main small-plus">{c.name}</span>
                                <Dots value={v} color={seriesColor(r.index)} size={12} />
                                <span class="mono small muted score-calc">{v === null ? 'unscored' : `${v} × ${c.weight} = ${v * c.weight}`}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div class="two-col">
                          <div class="stack-xs">
                            <span class="kicker good">Pros</span>
                            {s.pros.length === 0 ? <span class="small muted">None recorded.</span> : null}
                            {s.pros.map((t) => (
                              <span key={t} class="bullet good">
                                <Icon name="plus" />
                                <span class="ink">{t}</span>
                              </span>
                            ))}
                          </div>
                          <div class="stack-xs">
                            <span class="kicker bad">Cons</span>
                            {s.cons.length === 0 ? <span class="small muted">None recorded.</span> : null}
                            {s.cons.map((t) => (
                              <span key={t} class="bullet bad">
                                <Icon name="minus" />
                                <span class="ink">{t}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="dec-h" class="card pad stack-s">
            <h2 id="dec-h" class="display-m">
              Decision &amp; rationale
            </h2>
            <span class="strong">{chosen !== null ? `Chosen: ${chosen.solution.name}` : 'No solution chosen yet.'}</span>
            <p class="text-2 measure pre-line">{adr.rationale === '' ? 'No rationale recorded yet.' : adr.rationale}</p>
          </section>
        </div>

        <aside class="split-side stack-m">
          <section aria-label="Outcome" class="outcome">
            <span class="kicker on-chrome-muted">{outcome.kicker}</span>
            <span class="outcome-name">
              <Swatch color={outcome.color} size={14} />
              {outcome.name}
            </span>
            <span class="mono small on-chrome-muted">{outcome.detail}</span>
          </section>

          <section aria-labelledby="hyp-h" class="card pad stack-s">
            <Kicker as="h2" id="hyp-h">
              Goal hypothesis
            </Kicker>
            <div class="hyp">
              <span class="hyp-label">We believe</span>
              <span class="text-2">{adr.hypothesis.believe}</span>
            </div>
            <div class="hyp">
              <span class="hyp-label">will result in</span>
              <span class="text-2">{adr.hypothesis.willResultIn}</span>
            </div>
            <div class="hyp">
              <span class="hyp-label">We’ll know we’re right when</span>
              <span class="text-2">{adr.hypothesis.measuredBy}</span>
            </div>
          </section>

          <section aria-labelledby="ppl-h" class="card pad stack-m">
            <Kicker as="h2" id="ppl-h">
              People
            </Kicker>
            {ROLES.map((role) => {
              const people = adr.people.filter((p) => p.role === role);
              if (people.length === 0) return null;
              return (
                <div key={role} class="stack-xs">
                  <span class="small strong text-2">{ROLE_GROUP[role]}</span>
                  {people.map((p) => (
                    <span key={p.name} class="row-s">
                      <Avatar person={p} />
                      {p.name}
                    </span>
                  ))}
                </div>
              );
            })}
          </section>

          <section aria-labelledby="tl-h" class="card pad stack-s">
            <Kicker as="h2" id="tl-h">
              Timeline
            </Kicker>
            <div class="row-between">
              <span class="muted">Decided</span>
              <span class="mono">{formatDate(adr.date)}</span>
            </div>
            <div class="row-between">
              <span class="muted">Revisit</span>
              <span class="mono">{adr.revisit === null ? 'Not set' : formatDate(adr.revisit)}</span>
            </div>
            <span>
              <RevisitBadge info={rv} long />
            </span>
          </section>
        </aside>
      </div>
    </main>
  );
};
