import { useEffect, useState } from 'preact/hooks';
import type { Role, Status } from '../../core/schema.ts';
import { ROLES, STATUSES } from '../../core/schema.ts';
import { plural } from '../../core/dates.ts';
import { scoreLabel, scoreModel, scoreOf } from '../../core/scoring.ts';
import { fromDraft, removeCriterion, removeSolution, setScore, type Draft } from '../../core/form.ts';
import { ancestors, validateAdr } from '../../core/validate.ts';
import type { Adr } from '../../core/schema.ts';
import { rampColor, seriesColor } from '../themes.ts';
import { Avatar, Icon, Kicker, STATUS_ICON, Swatch, statusLabel, type Dispatch } from './common.tsx';
import { DeleteDialog } from './DeleteDialog.tsx';

type TabId = 'basics' | 'criteria' | 'people' | 'solutions' | 'decision';
/** The tab that holds a form field, from its id prefix. */
const tabOf = (fieldId: string | null): TabId =>
  fieldId === null ? 'basics'
  : fieldId.startsWith('cn-') || fieldId.startsWith('cd-') ? 'criteria'
  : fieldId.startsWith('pn-') || fieldId.startsWith('pr-') ? 'people'
  : /^(sn|ss|sp|sc)-/.test(fieldId) ? 'solutions'
  : fieldId === 'f-rationale' || fieldId === 'f-notes' || fieldId === 'f-decision' ? 'decision'
  : 'basics';

const ROLE_LABEL: Record<Role, string> = { decider: 'Decider', author: 'Author', consulted: 'Consulted', informed: 'Informed' };

export interface EditFormProps {
  readonly draft: Draft;
  readonly originalId: string | null;
  readonly triedSave: boolean;
  readonly open: Readonly<Record<string, boolean>>;
  /** Field id to open on (its tab) and focus when the form first shows, or null. */
  readonly focus: string | null;
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

/**
 * A list of one-line items kept as newline-separated text (pros, cons): a box that adds a line on Enter, and the
 * lines below it, each deletable and editable in place (click it; Enter or leaving saves, Esc cancels, empty deletes).
 */
const LineList = ({ id, label, tone, placeholder, value, onChange }: { id: string; label: string; tone: 'good' | 'bad'; placeholder: string; value: string; onChange: (v: string) => void }) => {
  const items = value
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => t !== '');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const save = (next: readonly string[]) => onChange(next.join('\n'));
  const add = () => {
    const t = draft.trim();
    if (t !== '') save([...items, t]);
    setDraft('');
  };
  const commit = () => {
    if (editing === null) return;
    const t = editing.text.trim();
    save(t === '' ? items.filter((_, i) => i !== editing.index) : items.map((x, i) => (i === editing.index ? t : x)));
    setEditing(null);
  };
  return (
    <div class="field">
      <label for={id} class={tone}>
        {label} <span class="normal muted">(Enter to add)</span>
      </label>
      <input
        id={id}
        class="input"
        value={draft}
        placeholder={placeholder}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
      />
      {items.length === 0 ? null : (
        <ul class={`line-list line-list-${tone}`} aria-label={label}>
          {items.map((t, i) =>
            editing !== null && editing.index === i ? (
              <li key={`edit-${i}`} class="line-item editing">
                <input
                  class="input line-edit"
                  aria-label={`Edit ${label.toLowerCase()} ${i + 1}`}
                  value={editing.text}
                  ref={(el) => el?.focus()}
                  onInput={(e) => setEditing({ index: i, text: e.currentTarget.value })}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commit();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditing(null);
                    }
                  }}
                />
              </li>
            ) : (
              <li key={`${i}-${t}`} class="line-item">
                <button type="button" class="line-text" title="Click to edit" onClick={() => setEditing({ index: i, text: t })}>
                  {t}
                </button>
                <button type="button" class="tag-x" aria-label={`Remove “${t}”`} onClick={() => save(items.filter((_, j) => j !== i))}>
                  <Icon name="x" size={14} />
                </button>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
};

export const EditForm = ({ draft: d, originalId, triedSave, open, focus, adrs, dispatch }: EditFormProps) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saved = adrs.find((a) => a.id === originalId);
  const update = (fn: (d: Draft) => Draft) => dispatch({ type: 'edit/update', update: fn });
  const errors = triedSave ? validateAdr(fromDraft(d), adrs, originalId) : [];
  const model = scoreModel(d);
  const isNew = originalId === null;
  const save = () => dispatch({ type: 'edit/save' });
  /* Tags: the draft keeps them as comma-separated text; here they are pills, added from the box with Enter or ",". */
  const tags = d.tagsText
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '');
  const [tagDraft, setTagDraft] = useState('');
  const setTags = (next: readonly string[]) => update((x) => ({ ...x, tagsText: next.join(', ') }));
  const addTag = () => {
    const fresh = tagDraft
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter((t) => t !== '' && !tags.some((x) => x.toLowerCase() === t.toLowerCase()));
    if (fresh.length > 0) setTags([...tags, ...new Set(fresh)]);
    setTagDraft('');
  };
  /* Sections as vertical tabs; which one is open is view-only, so it lives here rather than in the reducer. */
  const [tab, setTab] = useState<TabId>(tabOf(focus));
  const decided = model.rows.find((r) => r.solution.id === d.decision);
  const tabs: readonly { id: TabId; label: string; note: string }[] = [
    { id: 'basics', label: 'Basics', note: '' },
    { id: 'criteria', label: 'Criteria', note: String(d.criteria.length) },
    { id: 'people', label: 'People', note: String(d.people.length) },
    { id: 'solutions', label: 'Solutions', note: String(d.solutions.length) },
    { id: 'decision', label: 'Decision', note: d.decision === '' ? 'open' : decided === undefined ? '' : '✓' }
  ];
  /* The side panels jump to a solution or criterion: open its tab (and the solution's card), then focus its name field once drawn. */
  const [focusId, setFocusId] = useState<string | null>(focus);
  useEffect(() => {
    if (focusId === null) return;
    const el = document.getElementById(focusId);
    if (el === null) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
    setFocusId(null);
  }, [focusId, tab, open]);
  /* After an Add button, focus the new row's name field (ids are made by the reducer, so take the last one drawn). */
  const [focusNew, setFocusNew] = useState<'pn' | 'cn' | 'sn' | null>(null);
  useEffect(() => {
    if (focusNew === null) return;
    const all = document.querySelectorAll<HTMLElement>(`[id^="${focusNew}-"]`);
    all[all.length - 1]?.focus();
    setFocusNew(null);
  }, [focusNew, d.people.length, d.criteria.length, d.solutions.length]);
  /* Leaving a section drops people rows left without a name (saving drops them too; see fromDraft). */
  useEffect(() => {
    if (d.people.some((p) => p.name.trim() === '')) update((x) => ({ ...x, people: x.people.filter((p) => p.name.trim() !== '') }));
  }, [tab]);
  const goToSolution = (id: string) => {
    if (open[id] !== true) dispatch({ type: 'edit/toggleOpen', solutionId: id });
    setTab('solutions');
    setFocusId(`sn-${id}`);
  };
  const goToCriterion = (id: string) => {
    setTab('criteria');
    setFocusId(`cn-${id}`);
  };
  const at = tabs.findIndex((t) => t.id === tab);
  const prevTab = tabs[at - 1];
  const nextTab = tabs[at + 1];
  const goTab = (t: (typeof tabs)[number] | undefined) => {
    if (t === undefined) return;
    setTab(t.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  /*
   * Cmd/Ctrl + ← / → steps between sections. In a text field it only acts once the caret is already at that
   * edge, so Cmd+arrow still jumps to the start or end of the line first (press again to change section).
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      const el = document.activeElement;
      if ((el instanceof HTMLInputElement && el.selectionStart !== null) || el instanceof HTMLTextAreaElement) {
        const edge = e.key === 'ArrowLeft' ? 0 : el.value.length;
        if (el.selectionStart !== edge || el.selectionEnd !== edge) return;
      }
      const t = e.key === 'ArrowLeft' ? prevTab : nextTab;
      if (t === undefined) return;
      e.preventDefault();
      goTab(t);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  const onTabKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === tab);
    const next = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = tabs[(next + tabs.length) % tabs.length];
    if (t === undefined) throw new Error('bug: tab index out of range');
    setTab(t.id);
    document.getElementById(`tab-${t.id}`)?.focus();
  };

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

          <div class="vtabs-layout">
            <div role="tablist" aria-orientation="vertical" aria-label="Sections" class="vtabs" onKeyDown={onTabKey}>
              {tabs.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls="edit-panel"
                  tabIndex={tab === t.id ? 0 : -1}
                  class={`vtab${tab === t.id ? ' on' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  <span class="mono legend-n">{String(i + 1).padStart(2, '0')}</span>
                  <span class="grow-main">{t.label}</span>
                  {t.note === '' ? null : <span class="mono small muted">{t.note}</span>}
                </button>
              ))}
            </div>
            <div role="tabpanel" id="edit-panel" aria-labelledby={`tab-${tab}`} class="vtab-panel stack-m">
              {tab === 'basics' ? (
                <fieldset class="card pad stack-m">
                  <legend class="legend">Basics</legend>
                  <div class="grid-auto">
                    <div class="field">
                      <label for="f-id">ID</label>
                      <input id="f-id" class="input mono" value={d.id} onInput={(e) => update((x) => ({ ...x, id: e.currentTarget.value }))} />
                    </div>
                    <div class="field">
                      <label for="f-parent">
                        Parent <span class="normal muted">(optional)</span>
                      </label>
                      <select id="f-parent" class="input" value={d.parent} onChange={(e) => update((x) => ({ ...x, parent: e.currentTarget.value }))}>
                        <option value="">None (top level)</option>
                        {/* Not itself, nor anything under it: that would make a loop. */}
                        {adrs
                          .filter((a) => a.id !== originalId && !ancestors(a.id, adrs).some((p) => p === originalId))
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.id} · {a.title}
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
                  <fieldset class="field">
                    <legend class="field-label">Status</legend>
                    <div class="status-picker">
                      {STATUSES.map((s) => (
                        <label key={s} class={`pill pill-lg status-${s} status-opt`}>
                          <input
                            type="radio"
                            name="f-status"
                            id={d.status === s ? 'f-status' : undefined}
                            class="visually-hidden"
                            checked={d.status === s}
                            onChange={() => update((x) => ({ ...x, status: s as Status }))}
                          />
                          <Icon name={STATUS_ICON[s]} size={14} />
                          {statusLabel(s)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div class="field">
                    <label for="f-title">Title</label>
                    <input id="f-title" class="input input-title" value={d.title} placeholder="Choose a … for …" onInput={(e) => update((x) => ({ ...x, title: e.currentTarget.value }))} />
                  </div>
                  <div class="field">
                    <label for="f-tags">
                      Tags <span class="normal muted">(Enter to add)</span>
                    </label>
                    <input
                      id="f-tags"
                      class="input mono"
                      value={tagDraft}
                      placeholder={tags.length === 0 ? 'data, infrastructure' : 'Add a tag'}
                      onInput={(e) => setTagDraft(e.currentTarget.value)}
                      onBlur={addTag}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          addTag();
                        } else if (e.key === 'Backspace' && tagDraft === '' && tags.length > 0) {
                          setTags(tags.slice(0, -1));
                        }
                      }}
                    />
                    {tags.length === 0 ? null : (
                      <div class="tags tags-edit" aria-label="Tags">
                        {tags.map((t) => (
                          <span key={t} class="tag tag-outline tag-pill">
                            #{t}
                            <button type="button" class="tag-x" aria-label={`Remove tag ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>
                              <Icon name="x" size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </fieldset>
              ) : null}

              {tab === 'basics' ? (
                <fieldset class="card pad stack-m">
                  <legend class="legend">Goal &amp; hypothesis</legend>
                  <div class="field">
                    <label for="f-goal">Goal — what must this decision achieve?</label>
                    <textarea id="f-goal" class="input input-lg" rows={3} value={d.goal} onInput={(e) => update((x) => ({ ...x, goal: e.currentTarget.value }))} />
                  </div>
                  <details class="disclosure" open={focus !== null && focus.startsWith('f-h-')}>
                    <summary>
                      <span class="strong">Hypothesis</span>
                      <span class="small muted">We believe… will result in… we’ll know when…</span>
                      <span class="mono small muted push-right">
                        {Object.values(d.hypothesis).filter((v) => v.trim() !== '').length} of 3 filled
                      </span>
                    </summary>
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
                  </details>
                </fieldset>
              ) : null}

              {tab === 'people' ? (
                <fieldset class="card pad stack-s">
                  <legend class="legend">People</legend>
                  {d.people.map((p, i) => (
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
                          onKeyDown={(e) => {
                            /* Enter goes to the next person (adding a row after the last one) instead of submitting the form. */
                            if (e.key !== 'Enter' || e.isComposing) return;
                            e.preventDefault();
                            const next = d.people[i + 1];
                            if (next !== undefined) document.getElementById(`pn-${next.rowId}`)?.focus();
                            else if (p.name.trim() !== '') {
                              dispatch({ type: 'edit/addPerson' });
                              setFocusNew('pn');
                            }
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
                  <button type="button" class="btn btn-dashed" onClick={() => {
                    dispatch({ type: 'edit/addPerson' });
                    setFocusNew('pn');
                  }}>
                    <Icon name="plus" /> Add person
                  </button>
                </fieldset>
              ) : null}

              {tab === 'criteria' ? (
                <fieldset class="card pad stack-s">
                  <legend class="legend">Criteria &amp; weights</legend>
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
                  <button type="button" class="btn btn-dashed" onClick={() => {
                    dispatch({ type: 'edit/addCriterion' });
                    setFocusNew('cn');
                  }}>
                    <Icon name="plus" /> Add criterion
                  </button>
                </fieldset>
              ) : null}

              {tab === 'solutions' ? (
                <fieldset class="card pad stack-s">
                  <legend class="legend">Proposed solutions &amp; scores</legend>
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
                              <LineList id={`sp-${s.id}`} label="Pros" tone="good" placeholder="Add a pro" value={s.prosText} onChange={(v) => setField('prosText', v)} />
                              <LineList id={`sc-${s.id}`} label="Cons" tone="bad" placeholder="Add a con" value={s.consText} onChange={(v) => setField('consText', v)} />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  <button type="button" class="btn btn-dashed" onClick={() => {
                    dispatch({ type: 'edit/addSolution' });
                    setFocusNew('sn');
                  }}>
                    <Icon name="plus" /> Add solution
                  </button>
                </fieldset>
              ) : null}

              {tab === 'decision' ? (
                <fieldset class="card pad stack-m">
                  <legend class="legend">Decision</legend>
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
                  <div class="field">
                    <label for="f-notes">
                      Notes <span class="normal muted">(anything else worth keeping)</span>
                    </label>
                    <textarea id="f-notes" class="input" rows={3} value={d.notes} onInput={(e) => update((x) => ({ ...x, notes: e.currentTarget.value }))} />
                  </div>
                </fieldset>
              ) : null}

              <div class="row-between wrap-row">
                {prevTab === undefined ? (
                  <span />
                ) : (
                  <button type="button" class="btn" title="⌘/Ctrl + ←" onClick={() => goTab(prevTab)}>
                    <Icon name="back" /> Back: {prevTab.label}
                  </button>
                )}
                {nextTab === undefined ? (
                  <button type="button" class="btn btn-primary" onClick={save}>
                    <Icon name="check" /> Save ADR
                  </button>
                ) : (
                  <button type="button" class="btn btn-primary" title="⌘/Ctrl + →" onClick={() => goTab(nextTab)}>
                    Next: {nextTab.label} <Icon name="forward" />
                  </button>
                )}
              </div>
              <span class="small faint">Tip: ⌘/Ctrl + ← / → moves between sections. Everything you type is kept until you save.</span>
            </div>
          </div>

          {isNew ? null : (
            <div class="danger-zone">
              <button type="button" class="link-btn bad" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" /> Delete this ADR…
              </button>
              {confirmDelete && saved !== undefined ? <DeleteDialog adr={saved} adrs={adrs} onClose={() => setConfirmDelete(false)} dispatch={dispatch} /> : null}
            </div>
          )}
        </form>

        <aside class="split-side stack-m">
          <section aria-labelledby="prev-h" class="card pad stack-s">
            <Kicker as="h2" id="prev-h">
              Rankings
            </Kicker>
            {d.criteria.length > 0 && d.solutions.length > 0 ? (
              model.ranked.map((r) => (
                <div key={r.solution.id} class="stack-xxs">
                  <div class="row-between small-plus">
                    <button type="button" class="side-link row-s strong" title="Edit this solution" onClick={() => goToSolution(r.solution.id)}>
                      <Swatch color={seriesColor(r.index)} />
                      <span class="side-link-text">{r.solution.name === '' ? 'Untitled solution' : r.solution.name}</span>
                    </button>
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
                <button type="button" class="side-link row-s" title="Edit this criterion" onClick={() => goToCriterion(c.id)}>
                  <Swatch color={rampColor(i)} />
                  <span class="side-link-text">{c.name === '' ? 'Untitled criterion' : c.name}</span>
                </button>
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
