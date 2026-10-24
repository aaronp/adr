/**
 * Semantic validation — rules the schema alone cannot express (cross-field and cross-record).
 * Returns human-readable problems; an empty list means valid.
 */
import { Value } from '@sinclair/typebox/value';
import { AdrSchema, ROLES, STATUSES, type Adr } from './schema.ts';
import { daysBetween, isDate, plural } from './dates.ts';
import { scoreOf } from './scoring.ts';

/**
 * @param adr        the record to check
 * @param ledger     every other record it must be unique against
 * @param originalId the id this record had before editing (null for a new record), so it does not clash with itself
 */
export const validateAdr = (adr: Adr, ledger: readonly Adr[], originalId: string | null): string[] => {
  const E: string[] = [];
  if (!/^ADR-\d{4}$/.test(adr.id)) E.push('ID must look like ADR-0001.');
  else if (ledger.some((a) => a.id === adr.id && a.id !== originalId)) E.push(`${adr.id} is already used by another record.`);
  if (adr.title === '') E.push('Title is required.');
  if (!(STATUSES as readonly string[]).includes(adr.status)) E.push(`Status "${adr.status}" must be one of ${STATUSES.join(', ')}.`);

  const dateOk = isDate(adr.date);
  if (!dateOk) E.push('Decision date must be a valid YYYY-MM-DD date.');
  if (adr.revisit !== null) {
    if (!isDate(adr.revisit)) E.push('Revisit date must be a valid YYYY-MM-DD date, or empty.');
    else if (dateOk && daysBetween(adr.date, adr.revisit) <= 0) E.push('Revisit date must be after the decision date.');
  }

  if (adr.goal === '') E.push('Goal is required.');
  const h = adr.hypothesis;
  if (h.believe === '' || h.willResultIn === '' || h.measuredBy === '') {
    E.push('Hypothesis needs all three parts: we believe, will result in, and how we will know.');
  }

  if (adr.people.length === 0) E.push('Add at least one person.');
  adr.people.forEach((p, i) => {
    if (p.name === '') E.push(`Person ${i + 1} needs a name.`);
    if (!(ROLES as readonly string[]).includes(p.role)) E.push(`Person ${i + 1} has unknown role "${p.role}".`);
  });
  if (adr.people.length > 0 && !adr.people.some((p) => p.role === 'decider')) E.push('At least one person must be a decider.');

  if (adr.criteria.length === 0) E.push('Add at least one criterion.');
  const critNames = new Set<string>();
  const critIds = new Set<string>();
  adr.criteria.forEach((c, i) => {
    const label = c.name === '' ? `Criterion ${i + 1}` : `"${c.name}"`;
    if (c.name === '') E.push(`Criterion ${i + 1} needs a name.`);
    else if (critNames.has(c.name.toLowerCase())) E.push(`Criterion "${c.name}" appears twice.`);
    critNames.add(c.name.toLowerCase());
    if (critIds.has(c.id)) E.push(`Criterion id "${c.id}" appears twice.`);
    critIds.add(c.id);
    if (!(Number.isInteger(c.weight) && c.weight >= 1 && c.weight <= 5)) E.push(`${label} needs a weight from 1 to 5.`);
  });

  if (adr.solutions.length === 0) E.push('Add at least one proposed solution.');
  const solNames = new Set<string>();
  const solIds = new Set<string>();
  adr.solutions.forEach((s, i) => {
    if (s.name === '') E.push(`Solution ${i + 1} needs a name.`);
    else if (solNames.has(s.name.toLowerCase())) E.push(`Solution "${s.name}" appears twice.`);
    solNames.add(s.name.toLowerCase());
    if (solIds.has(s.id)) E.push(`Solution id "${s.id}" appears twice.`);
    solIds.add(s.id);
    for (const c of adr.criteria) {
      const v = scoreOf(s, c.id);
      if (v !== null && !(Number.isInteger(v) && v >= 1 && v <= 5)) E.push(`Score for "${s.name}" on "${c.name}" must be 1–5.`);
    }
    for (const key of Object.keys(s.scores)) {
      if (!critIds.has(key)) E.push(`Solution "${s.name}" has a score for unknown criterion "${key}".`);
    }
  });

  if (adr.decision !== null && !solIds.has(adr.decision)) E.push('The chosen solution does not exist.');
  if (adr.status === 'accepted') {
    if (adr.decision === null) E.push('An accepted ADR must name the chosen solution.');
    const unscored = adr.solutions.reduce((n, s) => n + adr.criteria.filter((c) => scoreOf(s, c.id) === null).length, 0);
    if (unscored > 0) E.push(`An accepted ADR must be fully scored (${plural(unscored, 'score')} missing).`);
  }

  if (E.length === 0 && !Value.Check(AdrSchema, adr)) {
    const first = Value.Errors(AdrSchema, adr).First();
    E.push(`Record does not match the schema at ${first?.path ?? '?'}: ${first?.message ?? 'unknown error'}.`);
  }
  return E;
};

/** Validates every record in a file. Problems are prefixed with the record id. */
export const validateLedger = (ledger: readonly Adr[]): string[] =>
  ledger.flatMap((adr, i) => {
    const others = ledger.filter((_, j) => j !== i);
    return validateAdr(adr, others, null).map((e) => `${adr.id}: ${e}`);
  });
