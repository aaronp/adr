import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLedger, serializeLedger } from '../src/core/markdown.ts';
import { validateLedger } from '../src/core/validate.ts';

/** The ```markdown examples in spec.md, by the "## " heading they sit under. */
const examples = (): Record<string, string> => {
  const spec = readFileSync(new URL('../spec.md', import.meta.url), 'utf8');
  const out: Record<string, string> = {};
  for (const m of spec.matchAll(/^## (.+)\n[\s\S]*?```markdown\n([\s\S]*?)```/gm)) out[m[1] as string] = m[2] as string;
  return out;
};

test('the minimal example in spec.md is one valid record', () => {
  const ex = examples()['Minimal example'];
  assert.ok(ex !== undefined);
  const adrs = parseLedger(ex);
  assert.equal(adrs.length, 1);
  assert.equal(adrs[0]?.id, 'ADR-0001');
  assert.match(adrs[0]?.goal ?? '', /We need a database/);
  assert.deepEqual(validateLedger(adrs), []);
});

test('the full example in spec.md is valid, keeps its criteria note, and round-trips', () => {
  const ex = examples()['Full example'];
  assert.ok(ex !== undefined);
  const adrs = parseLedger(ex);
  const a = adrs[0];
  assert.ok(a !== undefined);
  assert.equal(a.decision, 'kafka');
  assert.equal(a.people.length, 5);
  assert.equal(a.solutions[1]?.scores['fit'], null);
  assert.match(a.notes, /Benchmarks are in the platform team's wiki\./);
  assert.match(a.notes, /Mandatory: the platform must run in the EU region\./);
  assert.deepEqual(validateLedger(adrs), []);
  assert.deepEqual(parseLedger(serializeLedger(adrs)), adrs);
});
