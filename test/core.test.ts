import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLedger } from '../src/core/markdown.ts';
import { scoreModel, scoreLabel } from '../src/core/scoring.ts';
import { validateAdr } from '../src/core/validate.ts';
import { addCriterion, blankDraft, fromDraft, nextAdrId, removeCriterion, setScore, toDraft } from '../src/core/form.ts';
import { daysBetween, formatDate, parseDate, revisitInfo } from '../src/core/dates.ts';
import { searchAdrs } from '../src/core/search.ts';
import { readSample } from './helpers.ts';

const TODAY = '2026-10-24';
const sample = () => parseLedger(readSample());
const byId = (id: string) => {
  const a = sample().find((x) => x.id === id);
  if (a === undefined) throw new Error(`test setup: no ${id}`);
  return a;
};

test('weighted scores and ranking', () => {
  const m = scoreModel(byId('ADR-0012'));
  assert.equal(m.totalWeight, 18);
  assert.deepEqual(m.ranked.map((r) => [r.solution.id, r.raw]), [['kafka', 70], ['kinesis', 66], ['nats', 64], ['outbox', 61]]);
  assert.equal(m.leader?.solution.id, 'kafka');
  assert.equal(scoreLabel(m.ranked[0]!), (70 / 18).toFixed(1));
});

test('unscored never counts as zero in a reported total', () => {
  const m = scoreModel(byId('ADR-0013'));
  const avro = m.rows.find((r) => r.solution.id === 'avro')!;
  assert.equal(avro.complete, false);
  assert.equal(avro.avg, null);
  assert.equal(scoreLabel(avro), '1 unscored');
  assert.notEqual(m.leader?.solution.id, 'avro');
});

test('sample records are valid against each other', () => {
  const all = sample();
  for (const a of all) assert.deepEqual(validateAdr(a, all, a.id), [], a.id);
});

test('validation catches cross-field problems', () => {
  const a = byId('ADR-0012');
  assert.match(validateAdr({ ...a, decision: null }, [], a.id).join(), /accepted ADR must name/);
  assert.match(validateAdr({ ...a, revisit: '2026-01-01' }, [], a.id).join(), /after the decision date/);
  assert.match(validateAdr({ ...a, people: a.people.filter((p) => p.role !== 'decider') }, [], a.id).join(), /decider/);
  assert.match(validateAdr(a, [byId('ADR-0012')], null).join(), /already used/);
});

test('draft round-trip is lossless', () => {
  const a = byId('ADR-0012');
  assert.deepEqual(fromDraft(toDraft(a)), a);
});

test('new criterion starts unweighted and unscored, and blocks save', () => {
  const d = addCriterion(toDraft(byId('ADR-0013')), 'crit-1');
  assert.equal(d.criteria.at(-1)?.weight, null);
  assert.ok(d.solutions.every((s) => s.scores['crit-1'] === null));
  const errs = validateAdr(fromDraft(d), [], 'ADR-0013');
  assert.match(errs.join(), /needs a name/);
  assert.match(errs.join(), /weight from 1 to 5/);
  const removed = removeCriterion(d, 'crit-1');
  assert.ok(removed.solutions.every((s) => !('crit-1' in s.scores)));
});

test('setScore is immutable', () => {
  const d = toDraft(byId('ADR-0013'));
  const d2 = setScore(d, 'avro', 'tooling', 2);
  assert.equal(d.solutions.find((s) => s.id === 'avro')?.scores['tooling'], null);
  assert.equal(d2.solutions.find((s) => s.id === 'avro')?.scores['tooling'], 2);
});

test('blank draft is invalid until filled in', () => {
  const errs = validateAdr(fromDraft(blankDraft('ADR-0099', TODAY)), [], null);
  assert.ok(errs.length >= 5);
});

test('nextAdrId', () => {
  assert.equal(nextAdrId(sample()), 'ADR-0015');
  assert.equal(nextAdrId([]), 'ADR-0001');
});

test('dates', () => {
  assert.throws(() => parseDate('2026-02-30'));
  assert.equal(formatDate('2026-09-14'), '14 Sep 2026');
  assert.equal(daysBetween('2026-10-24', '2026-11-01'), 8);
  assert.equal(revisitInfo('2026-10-01', TODAY).kind, 'overdue');
  assert.equal(revisitInfo('2026-11-01', TODAY).kind, 'soon');
  assert.equal(revisitInfo('2027-03-14', TODAY).kind, 'scheduled');
  assert.equal(revisitInfo(null, TODAY).kind, 'none');
});

test('search: tokens, filters and order', () => {
  const all = sample();
  assert.deepEqual(searchAdrs(all, 'kafka priya', 'all', TODAY).map((a) => a.id), ['ADR-0012']);
  assert.deepEqual(searchAdrs(all, '', 'revisit', TODAY).map((a) => a.id), ['ADR-0011', 'ADR-0009']);
  assert.deepEqual(searchAdrs(all, '', 'all', TODAY).map((a) => a.id), ['ADR-0013', 'ADR-0012', 'ADR-0014', 'ADR-0011', 'ADR-0009', 'ADR-0006']);
});
