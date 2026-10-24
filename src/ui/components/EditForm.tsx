import { useState } from 'preact/hooks';
import type { Role, Status } from '../../core/schema.ts';
import { ROLES, STATUSES } from '../../core/schema.ts';
import { plural } from '../../core/dates.ts';
import { scoreLabel, scoreModel, scoreOf } from '../../core/scoring.ts';
import { fromDraft, removeCriterion, removeSolution, setScore, type Draft } from '../../core/form.ts';
import { validateAdr } from '../../core/validate.ts';
import type { Adr } from '../../core/schema.ts';
import { rampColor, seriesColor } from '../themes.ts';
import { Avatar, Icon, Kicker, Swatch, statusLabel, type Dispatch } from './common.tsx';

const ROLE_LABEL: Record<Role, string> = { decider: 'Decider', author: 'Author', consulted: 'Consulted', informed: 'Informed' };

export interface EditFormProps {
  readonly draft: Draft;
  readonly originalId: string | null;
  readonly triedSave: boolean;
  readonly open: Readonly<Record<string, boolean>>;
  readonly adrs: readonly Adr[];
  readonly dispatch: Dispatch;
}

const Scale = ({ value, onPick, label }: { value: number | null; onPick: (n: number) => void; label: (n: number) => string }) => (
  <span class="scale">
    {[1, 2, 3, 4, 5].map((n) => (
      <button key={n} type="button" class={`scale-btn${value === n ? ' on' : ''}`} aria-pressed={value === n} aria-label={label(n)} onClick={() => onPick(n)}>
        {n}
      </button>
    ))}
  </span>
);

export const EditForm = ({ draft: d, originalId, triedSave, open, adrs, dispatch }: EditFormProps) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = (fn: (d: Draft) => Draft) => dispatch({ type: 'edit/update', update: fn });
  const errors = triedSave ? validateAdr(fromDraft(d), adrs, originalId) : [];
  const model = scoreModel(d);
  const isNew = originalId === null;
  const save = () => dispatch({ type: 'edit/save' });

  return (
    <main>
      <section class="hero">
        <div class="wrap hero-inner hero-tight hero-split">
          <div class="stack-xs">
            <Kicker>{isNew ? `New record · ${d.id}` : `Editing · ${originalId}`}</Kicker>
            <h1 class="display-l">{d.title === '' ? (isNew ? 'New architecture decision' : 'Untitled decision') : d.title}</h1>
          </div>
          <div class="row-s wrap-row">
            <button type="button" class="btn" onClick={() => dispatch({ type: 'edit/cancel' })}>
              Cancel
            </button>
            <button type="button" class="btn btn-primary" onClick={save}>
              <Icon name="check" /> Save ADR
            </button>
          </div>
        </div>
      </section>

      <div class="wrap page split">
        <form
          class="split-main stack-m"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {errors.length > 0 ? (
            <div role="alert" class="alert alert-bad stack-xs">
              <strong>Not saved — {plural(errors.length, 'thing')} to fix</strong>
              {errors.map((e) => (
                <span key={e} class="small-plus">
                  • {e}
                </span>
              ))}
            </div>
          ) : null}

          <fieldset class="card pad stack-m">
            <legend class="legend">
              <span class="mono legend-n">01</span>Basics
            </legend>
            <div class="grid-auto">
              <div class="field">
                <label for="f-id">ID</label>
                <input id="f-id" class="input mono" value={d.id} onInput={(e) => update((x) => ({ ...x, id: e.currentTarget.value }))} />
              </div>
              <div class="field">
                <label for="f-status">Status</label>
                <select id="f-status" class="input" value={d.status} onChange={(e) => update((x) => ({ ...x, status: e.currentTarget.value as Status }))}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div class="field">
                <label for="f-date">Decision date</label>
                <input id="f-date" type="date" class="input" value={d.date} onInput={(e) => update((x) => ({ ...x, date: e.currentTarget.value }))} />
              </div>
              <div class="field">
                <label for="f-revisit">
                  Revisit on <span class="normal muted">(optional)</span>
                </label>
                <div class="row-xs">
                  <input id="f-revisit" type="date" class="input" value={d.revisit} onInput={(e) => update((x) => ({ ...x, revisit: e.currentTarget.value }))} />
                  <button type="button" class="icon-btn" aria-label="Clear revisit date" onClick={() => update((x) => ({ ...x, revisit: '' }))}>
                    <Icon name="x" />
                  </button>
                </div>
              </div>
            </div>
            <div class="field">
              <label for="f-title">Title</label>
              <input id="f-title" class="input input-title" value={d.title} placeholder="Choose a … for …" onInput={(e) => update((x) => ({ ...x, title: e.currentTarget.value }))} />
            </div>
            <div class="field">
              <label for="f-tags">
                Tags <span class="normal muted">(comma separated)</span>
              </label>
              <input id="f-tags" class="input mono" value={d.tagsText} placeholder="data, infrastructure" onInput={(e) => update((x) => ({ ...x, tagsText: e.currentTarget.value }))} />
            </div>
          </fieldset>

          <fieldset class="card pad stack-m">
            <legend class="legend">
              <span class="mono legend-n">02</span>Goal &amp; hypothesis
            </legend>
            <div class="field">
              <label for="f-goal">Goal — what must this decision achieve?</label>
              <textarea id="f-goal" class="input input-lg" rows={3} value={d.goal} onInput={(e) => update((x) => ({ ...x, goal: e.currentTarget.value }))} />
            </div>
            <div class="grid-auto grid-wide">
              {(
                [
                  ['believe', 'We believe…', 'the change we are making'],
                  ['willResultIn', '…will result in…', 'the outcome we expect'],
                  ['measuredBy', 'We’ll know when…', 'the signal or metric that proves it']
                ] as const
              ).map(([key, label, ph]) => (
                <div key={key} class="field">
                  <label for={`f-h-${key}`} class="hyp-label">
                    {label}
                  </label>
                  <textarea
                    id={`f-h-${key}`}
                    class="input"
                    rows={3}
                    placeholder={ph}
                    value={d.hypothesis[key]}
                    onInput={(e) => {
                      const v = e.currentTarget.value;
                      update((x) => ({ ...x, hypothesis: { ...x.hypothesis, [key]: v } }));
                    }}
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset class="card pad stack-s">
            <legend class="legend">
              <span class="mono legend-n">03</span>People
            </legend>
            {d.people.map((p) => (
              <div key={p.rowId} class="row-fields">
                <Avatar person={p} size={36} />
                <div class="field grow-main">
                  <label for={`pn-${p.rowId}`}>Name</label>
                  <input
                    id={`pn-${p.rowId}`}
                    class="input"
                    value={p.name}
                    onInput={(e) => {
                      const v = e.currentTarget.value;
                      update((x) => ({ ...x, people: x.people.map((q) => (q.rowId === p.rowId ? { ...q, name: v } : q)) }));
                    }}
                  />
                </div>
                <div class="field field-role">
                  <label for={`pr-${p.rowId}`}>Role</label>
                  <select
                    id={`pr-${p.rowId}`}
                    class="input"
                    value={p.role}
                    onChange={(e) => {
                      const v = e.currentTarget.value as Role;
                      update((x) => ({ ...x, people: x.people.map((q) => (q.rowId === p.rowId ? { ...q, role: v } : q)) }));
                    }}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" class="icon-btn" aria-label={`Remove ${p.name === '' ? 'this person' : p.name}`} onClick={() => update((x) => ({ ...x, people: x.people.filter((q) => q.rowId !== p.rowId) }))}>
                  <Icon name="x" />
                </button>
              </div>
            ))}
            <button type="button" class="btn btn-dashed" onClick={() => dispatch({ type: 'edit/addPerson' })}>
              <Icon name="plus" /> Add person
            </button>
          </fieldset>

          <fieldset class="card pad stack-s">
            <legend class="legend">
              <span class="mono legend-n">04</span>Criteria &amp; weights
            </legend>
            <span class="small-plus muted">Weight each criterion 1 (nice to have) to 5 (critical). Shares update as you go.</span>
            {d.criteria.map((c) => {
              const name = c.name === '' ? 'this criterion' : c.name;
              return (
                <div key={c.id} class="sub-card stack-s">
                  <div class="row-fields">
                    <div class="field grow-main">
                      <label for={`cn-${c.id}`}>Criterion</label>
                      <input
                        id={`cn-${c.id}`}
                        class="input strong"
                        value={c.name}
                        onInput={(e) => {
                          const v = e.currentTarget.value;
                          update((x) => ({ ...x, criteria: x.criteria.map((q) => (q.id === c.id ? { ...q, name: v } : q)) }));
                        }}
                      />
                    </div>
                    <div class="field" role="group" aria-label={`Weight for ${name}`}>
                      <span class="field-label">Weight · {c.weight === null ? 'not set' : `${model.totalWeight > 0 ? Math.round((c.weight / model.totalWeight) * 100) : 0}% of total`}</span>
                      <Scale value={c.weight} label={(n) => `Weight ${n}`} onPick={(n) => update((x) => ({ ...x, criteria: x.criteria.map((q) => (q.id === c.id ? { ...q, weight: n } : q)) }))} />
                    </div>
                    <button type="button" class="icon-btn" aria-label={`Remove ${name}`} onClick={() => update((x) => removeCriterion(x, c.id))}>
                      <Icon name="x" />
                    </button>
                  </div>
                  <div class="field">
                    <label for={`cd-${c.id}`}>What a high score means</label>
                    <input
                      id={`cd-${c.id}`}
                      class="input"
                      value={c.description}
                      onInput={(e) => {
                        const v = e.currentTarget.value;
                        update((x) => ({ ...x, criteria: x.criteria.map((q) => (q.id === c.id ? { ...q, description: v } : q)) }));
                      }}
                    />
                  </div>
                </div>
              );
            })}
            <button type="button" class="btn btn-dashed" onClick={() => dispatch({ type: 'edit/addCriterion' })}>
              <Icon name="plus" /> Add criterion
            </button>
          </fieldset>

          <fieldset class="card pad stack-s">
            <legend class="legend">
              <span class="mono legend-n">05</span>Proposed solutions &amp; scores
            </legend>
            <span class="small-plus muted">Score every solution 1–5 against each criterion. Leave a score empty if it is not agreed yet — it shows as unscored, never as zero.</span>
            {model.rows.map((r) => {
              const s = r.solution;
              const isOpen = open[s.id] === true;
              const label = s.name === '' ? 'Untitled solution' : s.name;
              const setField = (field: 'name' | 'summary' | 'prosText' | 'consText', v: string) =>
                update((x) => ({ ...x, solutions: x.solutions.map((q) => (q.id === s.id ? { ...q, [field]: v } : q)) }));
              return (
                <div key={s.id} class="sol-card">
                  <div class="sol-head">
                    <button type="button" class="sol-toggle" aria-expanded={isOpen} onClick={() => dispatch({ type: 'edit/toggleOpen', solutionId: s.id })}>
                      <Swatch color={seriesColor(r.index)} size={12} />
                      <span class="grow-main strong">{label}</span>
                      <span class="mono small muted">
                        {d.criteria.length - r.missing}/{d.criteria.length} scored
                      </span>
                      <span class="mono strong sol-score">{r.complete ? scoreLabel(r) : '—'}</span>
                      <Icon name={isOpen ? 'up' : 'down'} size={20} />
                    </button>
                    <button type="button" class="icon-btn icon-btn-bad" aria-label={`Remove ${label}`} onClick={() => update((x) => removeSolution(x, s.id))}>
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                  {isOpen ? (
                    <div class="sol-body stack-m">
                      <div class="field">
                        <label for={`sn-${s.id}`}>Solution name</label>
                        <input id={`sn-${s.id}`} class="input strong" value={s.name} onInput={(e) => setField('name', e.currentTarget.value)} />
                      </div>
                      <div class="field">
                        <label for={`ss-${s.id}`}>Summary</label>
                        <textarea id={`ss-${s.id}`} class="input" rows={2} value={s.summary} onInput={(e) => setField('summary', e.currentTarget.value)} />
                      </div>
                      <div>
                        <span class="field-label">Scores against criteria</span>
                        {d.criteria.length === 0 ? <span class="small muted">Add criteria above to score this solution.</span> : null}
                        {d.criteria.map((c) => {
                          const v = scoreOf(s, c.id);
                          const cname = c.name === '' ? 'Untitled criterion' : c.name;
                          return (
                            <div key={c.id} class="score-edit" role="group" aria-label={`Score for ${label} on ${cname}`}>
                              <span class="grow-main stack-xxs">
                                <span class="small-plus medium">{cname}</span>
                                <span class="mono tiny muted">weight ×{c.weight === null ? '?' : c.weight}</span>
                              </span>
                              <Scale value={v} label={(n) => `Score ${n} for ${cname}`} onPick={(n) => update((x) => setScore(x, s.id, c.id, n))} />
                              <button type="button" class="scale-btn scale-clear" aria-label={`Clear score for ${cname}`} disabled={v === null} onClick={() => update((x) => setScore(x, s.id, c.id, null))}>
                                –
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div class="two-col">
                        <div class="field">
                          <label for={`sp-${s.id}`} class="good">
                            Pros <span class="normal muted">(one per line)</span>
                          </label>
                          <textarea id={`sp-${s.id}`} class="input" rows={3} value={s.prosText} onInput={(e) => setField('prosText', e.currentTarget.value)} />
                        </div>
                        <div class="field">
                          <label for={`sc-${s.id}`} class="bad">
                            Cons <span class="normal muted">(one per line)</span>
                          </label>
                          <textarea id={`sc-${s.id}`} class="input" rows={3} value={s.consText} onInput={(e) => setField('consText', e.currentTarget.value)} />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            <button type="button" class="btn btn-dashed" onClick={() => dispatch({ type: 'edit/addSolution' })}>
              <Icon name="plus" /> Add solution
            </button>
          </fieldset>

          <fieldset class="card pad stack-m">
            <legend class="legend">
              <span class="mono legend-n">06</span>Decision
            </legend>
            <div class="chips" role="group" aria-label="Chosen solution">
              {[{ id: '', name: 'No decision yet', color: 'var(--control-border)' }, ...model.rows.map((r) => ({ id: r.solution.id, name: r.solution.name === '' ? 'Untitled solution' : r.solution.name, color: seriesColor(r.index) }))].map(
                (o) => (
                  <button key={o.id} type="button" class={`chip chip-square${d.decision === o.id ? ' on' : ''}`} aria-pressed={d.decision === o.id} onClick={() => update((x) => ({ ...x, decision: o.id }))}>
                    <Swatch color={o.color} />
                    {o.name}
                  </button>
                )
              )}
            </div>
            <div class="field">
              <label for="f-rationale">Rationale &amp; consequences</label>
              <textarea id="f-rationale" class="input" rows={4} value={d.rationale} onInput={(e) => update((x) => ({ ...x, rationale: e.currentTarget.value }))} />
            </div>
          </fieldset>

          {isNew ? null : (
            <div class="danger-zone">
              {confirmDelete ? (
                <div class="row-s wrap-row">
                  <span class="small-plus">Delete {originalId} from the file? This cannot be undone (except by reloading a saved .md).</span>
                  <button type="button" class="btn btn-bad" onClick={() => dispatch({ type: 'edit/delete' })}>
                    <Icon name="trash" /> Delete
                  </button>
                  <button type="button" class="btn" onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </button>
                </div>
              ) : (
                <button type="button" class="link-btn bad" onClick={() => setConfirmDelete(true)}>
                  <Icon name="trash" /> Delete this ADR…
                </button>
              )}
            </div>
          )}
        </form>

        <aside class="split-side stack-m">
          <section aria-labelledby="prev-h" class="card pad stack-s">
            <Kicker as="h2" id="prev-h">
              Live ranking
            </Kicker>
            {d.criteria.length > 0 && d.solutions.length > 0 ? (
              model.ranked.map((r) => (
                <div key={r.solution.id} class="stack-xxs">
                  <div class="row-between small-plus">
                    <span class="row-s strong">
                      <Swatch color={seriesColor(r.index)} />
                      {r.solution.name === '' ? 'Untitled solution' : r.solution.name}
                    </span>
                    <span class="mono">{scoreLabel(r)}</span>
                  </div>
                  <span class="meter meter-m">
                    <span style={{ width: `${r.pct}%`, background: seriesColor(r.index) }} />
                  </span>
                </div>
              ))
            ) : (
              <span class="small-plus muted">Add at least one criterion and one solution to see the ranking.</span>
            )}
          </section>
          <section aria-labelledby="wd-h" class="card pad stack-s">
            <Kicker as="h2" id="wd-h">
              Weight distribution
            </Kicker>
            <div class="stackbar stackbar-s">
              {d.criteria.map((c, i) =>
                c.weight === null || model.totalWeight === 0 ? null : <span key={c.id} title={`${c.name}: weight ${c.weight}`} style={{ width: `${(c.weight / model.totalWeight) * 100}%`, background: rampColor(i) }} />
              )}
            </div>
            {d.criteria.map((c, i) => (
              <div key={c.id} class="row-between small">
                <span class="row-s">
                  <Swatch color={rampColor(i)} />
                  {c.name === '' ? 'Untitled criterion' : c.name}
                </span>
                <span class="mono">{c.weight === null ? 'not set' : `${model.totalWeight > 0 ? Math.round((c.weight / model.totalWeight) * 100) : 0}%`}</span>
              </div>
            ))}
          </section>
          <button type="button" class="btn btn-primary btn-block" onClick={save}>
            Save ADR
          </button>
        </aside>
      </div>
    </main>
  );
};
