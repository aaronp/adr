/**
 * The edit-form model. It differs from a saved record only where typing needs it:
 * free-text fields for tags / pros / cons (so a trailing comma or newline survives keystrokes),
 * a row id per person, and weights that may not be chosen yet (null).
 */
import { Type, type Static } from '@sinclair/typebox';
import { HypothesisSchema, RoleSchema, ScoreSchema, StatusSchema, type Adr } from './schema.ts';

export const DraftSchema = Type.Object(
  {
    id: Type.String({ description: 'As typed; validated as ADR-NNNN on save.' }),
    title: Type.String(),
    status: StatusSchema,
    date: Type.String({ description: 'YYYY-MM-DD, as produced by <input type="date">.' }),
    revisit: Type.String({ description: 'YYYY-MM-DD, or "" for no revisit.' }),
    tagsText: Type.String({ description: 'Comma-separated, exactly as typed.', examples: ['data, infrastructure'] }),
    goal: Type.String(),
    hypothesis: HypothesisSchema,
    people: Type.Array(
      Type.Object({
        rowId: Type.String({ description: 'UI-only key so React-style lists keep focus while editing; not saved.' }),
        name: Type.String(),
        role: RoleSchema
      })
    ),
    criteria: Type.Array(
      Type.Object({
        id: Type.String(),
        name: Type.String(),
        weight: Type.Union([Type.Integer({ minimum: 1, maximum: 5 }), Type.Null()], { description: 'null until the user picks one.' }),
        description: Type.String()
      })
    ),
    solutions: Type.Array(
      Type.Object({
        id: Type.String(),
        name: Type.String(),
        summary: Type.String(),
        prosText: Type.String({ description: 'One pro per line, as typed.' }),
        consText: Type.String({ description: 'One con per line, as typed.' }),
        scores: Type.Record(Type.String(), ScoreSchema)
      })
    ),
    decision: Type.String({ description: 'Chosen solution id, or "" for none.' }),
    rationale: Type.String()
  },
  { description: 'In-progress edit of one ADR.' }
);
export type Draft = Static<typeof DraftSchema>;
export type DraftCriterion = Draft['criteria'][number];
export type DraftSolution = Draft['solutions'][number];
export type DraftPerson = Draft['people'][number];

export const toDraft = (adr: Adr): Draft => ({
  id: adr.id,
  title: adr.title,
  status: adr.status,
  date: adr.date,
  revisit: adr.revisit ?? '',
  tagsText: adr.tags.join(', '),
  goal: adr.goal,
  hypothesis: { ...adr.hypothesis },
  people: adr.people.map((p, i) => ({ rowId: `person-${i}`, name: p.name, role: p.role })),
  criteria: adr.criteria.map((c) => ({ ...c })),
  solutions: adr.solutions.map((s) => ({
    id: s.id,
    name: s.name,
    summary: s.summary,
    prosText: s.pros.join('\n'),
    consText: s.cons.join('\n'),
    scores: { ...s.scores }
  })),
  decision: adr.decision ?? '',
  rationale: adr.rationale
});

const lines = (t: string): string[] =>
  t
    .split('\n')
    .map((x) => x.trim())
    .filter((x) => x !== '');

/**
 * Converts a draft to a record. The result may still be invalid (e.g. a null weight is carried
 * through as-is so validation can report it) — always run validateAdr on it before saving.
 */
export const fromDraft = (d: Draft): Adr => ({
  id: d.id.trim(),
  title: d.title.trim(),
  status: d.status,
  date: d.date,
  revisit: d.revisit === '' ? null : d.revisit,
  tags: d.tagsText
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== ''),
  goal: d.goal.trim(),
  hypothesis: { believe: d.hypothesis.believe.trim(), willResultIn: d.hypothesis.willResultIn.trim(), measuredBy: d.hypothesis.measuredBy.trim() },
  people: d.people.map((p) => ({ name: p.name.trim(), role: p.role })),
  // weight may be null here; validateAdr rejects it. The cast documents that hand-off.
  criteria: d.criteria.map((c) => ({ id: c.id, name: c.name.trim(), weight: c.weight as number, description: c.description.trim() })),
  solutions: d.solutions.map((s) => ({
    id: s.id,
    name: s.name.trim(),
    summary: s.summary.trim(),
    pros: lines(s.prosText),
    cons: lines(s.consText),
    scores: { ...s.scores }
  })),
  decision: d.decision === '' ? null : d.decision,
  rationale: d.rationale.trim()
});

export const blankDraft = (id: string, today: string): Draft => ({
  id,
  title: '',
  status: 'proposed',
  date: today,
  revisit: '',
  tagsText: '',
  goal: '',
  hypothesis: { believe: '', willResultIn: '', measuredBy: '' },
  people: [],
  criteria: [],
  solutions: [],
  decision: '',
  rationale: ''
});

/** Next free id after the highest ADR-NNNN in the ledger. */
export const nextAdrId = (adrs: readonly Adr[]): string => {
  const max = adrs.reduce((m, a) => {
    const n = Number(a.id.slice(4));
    return Number.isInteger(n) && n > m ? n : m;
  }, 0);
  return `ADR-${String(max + 1).padStart(4, '0')}`;
};

// ---- pure draft edits (each returns a new draft) ----

export const addCriterion = (d: Draft, id: string): Draft => ({
  ...d,
  criteria: [...d.criteria, { id, name: '', weight: null, description: '' }],
  solutions: d.solutions.map((s) => ({ ...s, scores: { ...s.scores, [id]: null } }))
});

export const removeCriterion = (d: Draft, id: string): Draft => ({
  ...d,
  criteria: d.criteria.filter((c) => c.id !== id),
  solutions: d.solutions.map((s) => {
    const { [id]: _removed, ...rest } = s.scores;
    return { ...s, scores: rest };
  })
});

export const addSolution = (d: Draft, id: string): Draft => ({
  ...d,
  solutions: [
    ...d.solutions,
    { id, name: '', summary: '', prosText: '', consText: '', scores: Object.fromEntries(d.criteria.map((c) => [c.id, null])) }
  ]
});

export const removeSolution = (d: Draft, id: string): Draft => ({
  ...d,
  solutions: d.solutions.filter((s) => s.id !== id),
  decision: d.decision === id ? '' : d.decision
});

export const setScore = (d: Draft, solutionId: string, criterionId: string, value: number | null): Draft => ({
  ...d,
  solutions: d.solutions.map((s) => (s.id === solutionId ? { ...s, scores: { ...s.scores, [criterionId]: value } } : s))
});
