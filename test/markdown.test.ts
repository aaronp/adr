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

test('errors carry line numbers', () => {
  const sample = readSample();
  const lines = sample.split('\n');
  const at = (needle: string): number => {
    const i = lines.findIndex((l) => l.startsWith(needle));
    if (i < 0) throw new Error(`test setup: no line starting "${needle}"`);
    return i + 1;
  };
  const closingFrontmatter = 9;

  expectLineError('# Title\n', 1, 'expected "---"');
  expectLineError(sample.replace('status: accepted', 'status: maybe'), closingFrontmatter, 'status "maybe"');
  expectLineError(sample.replace('| ops | Operational burden | 5 |', '| ops | Operational burden | 9 |'), at('| ops | Operational burden | 5 |'), 'weight "9"');
  expectLineError(sample.replace('- Priya Shah — decider', '- Priya Shah — boss'), at('- Priya Shah — decider'), 'people lines');
  expectLineError(sample.replace('## Goal', '## Goals'), at('## Goal'), 'unknown section');
  expectLineError(sample.replace('decision: kafka', 'decision: pulsar'), closingFrontmatter, 'decision "pulsar"');
  expectLineError(sample.replace('revisit: 2027-03-14', 'revisit: 2027-02-30'), closingFrontmatter, 'revisit');
});

test('missing frontmatter key is an error, not a default', () => {
  const broken = readSample().replace('tags: data, infrastructure\n', '');
  assert.throws(() => parseLedger(broken), /missing "tags:"/);
});

test('missing score row is an error', () => {
  const broken = readSample().replace('| ops | 3 |\n', '');
  assert.throws(() => parseLedger(broken), /no score row for criterion "ops"/);
});

test('duplicate record ids are rejected', () => {
  const s = readSample();
  const firstRecord = s.slice(0, s.indexOf('\n---\nid: ADR-0013') + 1);
  assert.throws(() => parseLedger(firstRecord + firstRecord), /duplicate record id ADR-0012/);
});
