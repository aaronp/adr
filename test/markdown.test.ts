import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Value } from '@sinclair/typebox/value';
import { MarkdownError, parseLedger, parseLedgerRecords, serializeLedger } from '../src/core/markdown.ts';
import { LedgerSchema } from '../src/core/schema.ts';
import { validateLedger } from '../src/core/validate.ts';
import { readSample } from './helpers.ts';

test('sample file parses, matches the schema and is valid', () => {
  const adrs = parseLedger(readSample());
  assert.equal(adrs.length, 6);
  assert.ok(Value.Check(LedgerSchema, adrs), [...Value.Errors(LedgerSchema, adrs)].map((e) => `${e.path} ${e.message}`).join('\n'));
  assert.deepEqual(validateLedger(adrs), []);
});

test('sample file is already in normal form (serialize ∘ parse = identity)', () => {
  const text = readSample();
  assert.equal(serializeLedger(parseLedger(text)), text);
});

test('parse ∘ serialize round-trips records', () => {
  const adrs = parseLedger(readSample());
  assert.deepEqual(parseLedger(serializeLedger(adrs)), adrs);
});

test('records report their opening line', () => {
  const recs = parseLedgerRecords(readSample());
  assert.equal(recs[0]?.line, 1);
  assert.ok((recs[1]?.line ?? 0) > 1);
});

test('empty file is an empty ledger', () => {
  assert.deepEqual(parseLedger(''), []);
  assert.deepEqual(parseLedger('\n\n  \n'), []);
});

test('unscored is "-" and parses to null', () => {
  const avro = parseLedger(readSample())
    .find((a) => a.id === 'ADR-0013')
    ?.solutions.find((s) => s.id === 'avro');
  assert.equal(avro?.scores['tooling'], null);
});

test('pipes in table cells are escaped and restored', () => {
  const adrs = parseLedger(readSample());
  const first = adrs[0];
  assert.ok(first);
  const changed = [{ ...first, criteria: first.criteria.map((c, i) => (i === 0 ? { ...c, description: 'a | b' } : c)) }];
  assert.equal(parseLedger(serializeLedger(changed))[0]?.criteria[0]?.description, 'a | b');
});

const expectLineError = (text: string, line: number, fragment: string): void => {
  assert.throws(
    () => parseLedger(text),
    (e: unknown) => e instanceof MarkdownError && e.line === line && e.message.includes(fragment),
    `expected error on line ${line} containing "${fragment}"`
  );
};

test('only what cannot be read is an error, with its line number', () => {
  const sample = readSample();
  const lines = sample.split('\n');
  const at = (needle: string): number => {
    const i = lines.findIndex((l) => l.startsWith(needle));
    if (i < 0) throw new Error(`test setup: no line starting "${needle}"`);
    return i + 1;
  };

  expectLineError('# Title\n', 1, 'expected "---"');
  expectLineError(sample.replace('| ops | Operational burden | 5 |', '| ops | Operational burden | 9 |'), at('| ops | Operational burden | 5 |'), 'weight "9"');
  expectLineError(sample.replace('| ops | 3 |', '| ops | high |'), at('| ops | 3 |'), 'score "high"');
  expectLineError(sample.replace('revisit: 2027-03-14', 'revisit: 2027-02-30'), at('revisit: 2027-03-14'), 'revisit');
  expectLineError(sample.replace('title: Choose an event streaming platform\n', ''), 1, 'no "title:"');
});

test('loose input is read with defaults, and nothing is lost', () => {
  const adr = parseLedger(`---
Title: Pick a queue
Status: Draft
tags: [infra, , data]
---
We need one queue for jobs.

## Context
Two teams run their own today.

## People
- Ana; Bo — proposed consultees; unassigned
- Cy - Decider
- Di

## Criteria
| Criterion | Weight |
| Cost | 4 |
| Ops | |

Gates: must run in our region.

## Option: Managed SQS
Cheap.

| criterion | score |
| cost | 4 |

**Pros:**
* no servers

## Decision
Undecided.
`)[0];
  if (adr === undefined) throw new Error('no record');
  assert.equal(adr.id, 'ADR-0001');
  assert.equal(adr.status, 'proposed');
  assert.equal(adr.date, '');
  assert.deepEqual(adr.tags, ['infra', 'data']);
  assert.equal(adr.goal, 'We need one queue for jobs.');
  assert.deepEqual(
    adr.people.map((p) => `${p.name}/${p.role}`),
    ['Ana (proposed, unassigned)/consulted', 'Bo (proposed, unassigned)/consulted', 'Cy/decider', 'Di/consulted']
  );
  assert.deepEqual(
    adr.criteria.map((c) => `${c.id}:${c.weight}`),
    ['cost:4', 'ops:1']
  );
  const [sol] = adr.solutions;
  assert.ok(sol !== undefined && sol.id === 'managed-sqs' && sol.name === 'Managed SQS' && sol.summary === 'Cheap.');
  assert.deepEqual(sol.scores, { cost: 4, ops: null });
  assert.deepEqual(sol.pros, ['no servers']);
  assert.match(adr.notes, /Gates: must run in our region\./);
  assert.match(adr.notes, /\*\*Context\*\*\nTwo teams run their own today\./);
  assert.deepEqual(validateLedger([adr]), []);
  // Saving writes the normal form, which reads back the same.
  assert.deepEqual(parseLedger(serializeLedger([adr])), [adr]);
});

test('the smallest record is just a title', () => {
  const [adr] = parseLedger('---\ntitle: Use Postgres\n---\n');
  assert.ok(adr !== undefined && adr.title === 'Use Postgres' && adr.id === 'ADR-0001' && adr.criteria.length === 0);
  assert.deepEqual(validateLedger([adr]), []);
});

test('a missing score row is unscored, and a repeated record id gets the next free one', () => {
  assert.equal(parseLedger(readSample().replace('| ops | 3 |\n', ''))[0]?.solutions[0]?.scores['ops'], null);
  const s = readSample();
  const firstRecord = s.slice(0, s.indexOf('\n---\nid: ADR-0013') + 1);
  assert.deepEqual(
    parseLedger(firstRecord + firstRecord).map((a) => a.id),
    ['ADR-0012', 'ADR-0013']
  );
});
