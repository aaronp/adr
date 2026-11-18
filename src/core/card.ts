/**
 * A dashboard card for the ledger, as data (card.json): title, a status pill, one big number, and a
 * legend with a count per item. The format is tool-neutral; only `card()` below knows about ADRs.
 * What the card says (titles, legend labels, colours, order) comes from an optional sidecar file,
 * `<name>.card.json`, read with `parsePrefs`.
 */
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { STATUSES, type Adr, type Status } from './schema.ts';
import { isRevisitDue } from './search.ts';

const Link = Type.Object({ label: Type.String(), url: Type.Optional(Type.String()) }, { additionalProperties: false });

/** The tool-neutral card.json format (version 1). */
export const CardSchema = Type.Object(
  {
    version: Type.Literal(1),
    title: Type.String(),
    subtitle: Type.String(),
    status: Type.Object({ label: Type.String(), tone: Type.Union([Type.Literal('good'), Type.Literal('warn'), Type.Literal('bad'), Type.Literal('neutral')]) }),
    heading: Type.Object({ primary: Type.String(), label: Type.String() }),
    legend: Type.Array(
      Type.Object({ id: Type.String(), label: Type.String(), color: Type.Optional(Type.String()), url: Type.Optional(Type.String()) }, { additionalProperties: false })
    ),
    report: Type.Record(Type.String(), Type.Integer({ minimum: 0 })),
    source: Link,
    updated: Type.String()
  },
  { additionalProperties: false }
);
export type Card = Static<typeof CardSchema>;

const StatusId = Type.Union(STATUSES.map((s) => Type.Literal(s)));

/** The sidecar: every field optional, defaults filled in by `card()`. */
export const CardPrefsSchema = Type.Object(
  {
    title: Type.Optional(Type.String()),
    subtitle: Type.Optional(Type.String()),
    heading: Type.Optional(Type.Object({ primary: Type.Optional(Type.Union([Type.Literal('total'), StatusId])), label: Type.Optional(Type.String()) }, { additionalProperties: false })),
    legend: Type.Optional(
      Type.Array(Type.Object({ id: StatusId, label: Type.Optional(Type.String()), color: Type.Optional(Type.String()), url: Type.Optional(Type.String()) }, { additionalProperties: false }))
    ),
    source: Type.Optional(Type.Object({ label: Type.Optional(Type.String()), url: Type.Optional(Type.String()) }, { additionalProperties: false }))
  },
  { additionalProperties: false }
);
export type CardPrefs = Static<typeof CardPrefsSchema>;

/** Solid colours that read under white badge text (paper theme --good / --accent / --bad where it has one). */
export const DEFAULT_COLORS: Readonly<Record<Status, string>> = {
  proposed: '#1F45B0',
  accepted: '#0B6B5F',
  superseded: '#6B7280',
  deprecated: '#B26B00',
  rejected: '#A3283C'
};

const isStatus = (v: unknown): v is Status => typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Checks a parsed sidecar. Unknown legend ids are dropped with a warning; any other mismatch throws. */
export const parsePrefs = (json: unknown): { prefs: CardPrefs; warnings: string[] } => {
  const warnings: string[] = [];
  let input = json;
  if (typeof json === 'object' && json !== null && Array.isArray((json as { legend?: unknown }).legend)) {
    const legend = (json as { legend: unknown[] }).legend.filter((l) => {
      const id = typeof l === 'object' && l !== null ? (l as { id?: unknown }).id : undefined;
      if (isStatus(id)) return true;
      warnings.push(`Unknown legend id "${String(id)}" (expected one of: ${STATUSES.join(', ')})`);
      return false;
    });
    input = { ...json, legend };
  }
  if (!Value.Check(CardPrefsSchema, input)) {
    const e = Value.Errors(CardPrefsSchema, input).First();
    throw new Error(e === undefined ? 'invalid card settings' : `${e.path || '/'}: ${e.message}`);
  }
  return { prefs: input, warnings };
};

export const card = (adrs: readonly Adr[], prefs: CardPrefs, today: string, sourceLabel: string): Card => {
  const count = (s: Status): number => adrs.filter((a) => a.status === s).length;
  const items: NonNullable<CardPrefs['legend']> = prefs.legend ?? STATUSES.map((id) => ({ id }));
  const legend = items.map((l) => ({
    id: l.id,
    label: l.label ?? capitalise(l.id),
    color: l.color ?? DEFAULT_COLORS[l.id],
    ...(l.url !== undefined ? { url: l.url } : {})
  }));
  const primary = prefs.heading?.primary ?? 'total';
  const due = adrs.filter((a) => isRevisitDue(a, today)).length;
  const proposed = count('proposed');
  const url = prefs.source?.url;
  return {
    version: 1,
    title: prefs.title ?? 'Decisions',
    subtitle: prefs.subtitle ?? 'ADR log',
    status: due > 0 ? { label: `${due} due`, tone: 'bad' } : proposed > 0 ? { label: `${proposed} proposed`, tone: 'neutral' } : { label: 'Up to date', tone: 'good' },
    heading: { primary: String(primary === 'total' ? adrs.length : count(primary)), label: prefs.heading?.label ?? 'decision records' },
    legend,
    report: Object.fromEntries(legend.map((l) => [l.id, count(l.id)])),
    source: { label: prefs.source?.label ?? sourceLabel, ...(url !== undefined ? { url } : {}) },
    updated: today
  };
};
