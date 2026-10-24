/**
 * The data model for an architecture decision record (ADR).
 *
 * The markdown file is the source of truth; these schemas describe what a parsed record looks like.
 * The file may leave almost anything out (see spec.md); the parser fills in explicit empty values
 * (null, empty string or empty array), so every field is always present here.
 */
import { Type, type Static } from '@sinclair/typebox';

export const STATUSES = ['proposed', 'accepted', 'superseded', 'deprecated', 'rejected'] as const;
export const ROLES = ['decider', 'author', 'consulted', 'informed'] as const;

const ISO_DATE = '^\\d{4}-\\d{2}-\\d{2}$';
const SLUG = '^[a-z0-9][a-z0-9-]*$';

export const StatusSchema = Type.Union(STATUSES.map((s) => Type.Literal(s)), {
  description:
    'Lifecycle state. "proposed" while options are being weighed; "accepted" once a solution is chosen and in force; ' +
    '"superseded" when a later ADR replaces it; "deprecated" when no longer relevant; "rejected" when the proposal was turned down.',
  examples: ['accepted']
});
export type Status = Static<typeof StatusSchema>;

export const RoleSchema = Type.Union(ROLES.map((r) => Type.Literal(r)), {
  description:
    'How the person took part. "decider" is accountable for the call (at least one is required); "author" wrote the record; ' +
    '"consulted" gave input before the decision; "informed" is told the outcome.',
  examples: ['decider']
});
export type Role = Static<typeof RoleSchema>;

export const PersonSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, description: 'Display name, used for initials and search.', examples: ['Priya Shah'] }),
    role: RoleSchema
  },
  { additionalProperties: false, description: 'Someone involved in the decision.' }
);
export type Person = Static<typeof PersonSchema>;

export const HypothesisSchema = Type.Object(
  {
    believe: Type.String({
      description: 'The change we are making — completes "We believe…".',
      examples: ['moving order events onto a managed, replayable log']
    }),
    willResultIn: Type.String({
      description: 'The outcome we expect — completes "…will result in…".',
      examples: ['services that can change without coordinated releases']
    }),
    measuredBy: Type.String({
      description: 'The observable signal that proves or disproves it — completes "We will know we are right when…". Check it at the revisit date.',
      examples: ['a new consumer reaches production in under a day']
    })
  },
  { additionalProperties: false, description: 'The goal hypothesis, written so it can be tested when the decision is revisited.' }
);
export type Hypothesis = Static<typeof HypothesisSchema>;

export const WeightSchema = Type.Integer({
  minimum: 1,
  maximum: 5,
  description: 'How much this criterion matters: 1 = nice to have, 5 = critical. Weights are relative; the share of the total is what counts.',
  examples: [5]
});

export const ScoreSchema = Type.Union([Type.Integer({ minimum: 1, maximum: 5 }), Type.Null()], {
  description:
    'How well a solution meets a criterion: 1 = poorly, 5 = fully. null means "not scored yet" — it is never treated as zero; ' +
    'totals for a solution with any null score are reported as incomplete.',
  examples: [4, null]
});
export type Score = Static<typeof ScoreSchema>;

export const CriterionSchema = Type.Object(
  {
    id: Type.String({ pattern: SLUG, description: 'Stable key that score rows refer to. Lower-case letters, digits and dashes.', examples: ['ops'] }),
    name: Type.String({ minLength: 1, description: 'Human label shown in charts.', examples: ['Operational burden'] }),
    weight: WeightSchema,
    description: Type.String({ description: 'What a high score means, so scorers agree on direction.', examples: ['Higher = less on-call load.'] })
  },
  { additionalProperties: false }
);
export type Criterion = Static<typeof CriterionSchema>;

export const SolutionSchema = Type.Object(
  {
    id: Type.String({ pattern: SLUG, description: 'Stable key; the "decision" field refers to it.', examples: ['kafka'] }),
    name: Type.String({ minLength: 1, description: 'Human label.', examples: ['Managed Kafka'] }),
    summary: Type.String({ description: 'One or two sentences describing the option. May be empty.' }),
    scores: Type.Record(Type.String({ pattern: SLUG }), ScoreSchema, {
      description: 'One entry per criterion id — every criterion must be present, with null for unscored.',
      examples: [{ ops: 3, cost: null }]
    }),
    pros: Type.Array(Type.String({ minLength: 1 }), { description: 'Arguments for, one per item.' }),
    cons: Type.Array(Type.String({ minLength: 1 }), { description: 'Arguments against, one per item.' })
  },
  { additionalProperties: false }
);
export type Solution = Static<typeof SolutionSchema>;

export const AdrSchema = Type.Object(
  {
    id: Type.String({ pattern: '^\\S+$', description: 'Unique record id within the file; ADR-NNNN by convention, and assigned when missing.', examples: ['ADR-0012'] }),
    title: Type.String({ minLength: 1, description: 'The decision, phrased as what is being chosen.', examples: ['Choose an event streaming platform'] }),
    status: StatusSchema,
    date: Type.String({ pattern: '^(\\d{4}-\\d{2}-\\d{2})?$', description: 'When the decision was made (or proposed). YYYY-MM-DD, or "" when undated.', examples: ['2026-09-14', ''] }),
    revisit: Type.Union([Type.String({ pattern: ISO_DATE }), Type.Null()], {
      description: 'Optional date to check the hypothesis and re-open the decision. null when no revisit is planned. Must be after "date".',
      examples: ['2027-03-14', null]
    }),
    tags: Type.Array(Type.String({ minLength: 1 }), { description: 'Free-form labels for search and grouping.', examples: [['data', 'infrastructure']] }),
    goal: Type.String({ description: 'What the decision must achieve — the problem, not the solution. May be empty.' }),
    hypothesis: HypothesisSchema,
    people: Type.Array(PersonSchema, { description: 'Everyone involved; at least one decider.' }),
    criteria: Type.Array(CriterionSchema, { description: 'What the options are judged on, with weights.' }),
    solutions: Type.Array(SolutionSchema, { description: 'The proposed options, each scored against every criterion.' }),
    decision: Type.Union([Type.String({ pattern: SLUG }), Type.Null()], {
      description: 'Id of the chosen solution, or null while undecided / when rejected. Required when status is "accepted".',
      examples: ['kafka', null]
    }),
    rationale: Type.String({ description: 'Why this outcome, and its consequences. May be empty while proposed.' }),
    notes: Type.String({ description: 'Any other text from the file that has no field of its own (notes under the criteria, extra sections), kept so saving never loses it. May be empty.' })
  },
  { additionalProperties: false, description: 'One architecture decision record.' }
);
export type Adr = Static<typeof AdrSchema>;

export const LedgerSchema = Type.Array(AdrSchema, { description: 'All records in one markdown file, in file order.' });
export type Ledger = Static<typeof LedgerSchema>;
