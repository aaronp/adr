import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Value } from '@sinclair/typebox/value';
import { parseLedger } from '../src/core/markdown.ts';
import { STATUSES, type Adr } from '../src/core/schema.ts';
import { CardSchema, DEFAULT_COLORS, card, parsePrefs } from '../src/core/card.ts';
import { readSample } from './helpers.ts';

const TODAY = '2026-10-24';
const sample = () => parseLedger(readSample());
const calm = (): Adr[] => sample().map((a) => ({ ...a, status: 'accepted', revisit: null }));

test('card defaults', () => {
  const adrs = sample();
  const c = card(adrs, {}, TODAY, 'decisions.md');
  assert.equal(c.version, 1);
  assert.equal(c.title, 'Decisions');
  assert.equal(c.subtitle, 'ADR log');
  assert.deepEqual(c.heading, { primary: String(adrs.length), label: 'decision records' });
  assert.deepEqual(c.legend.map((l) => l.id), [...STATUSES]);
  assert.equal(c.legend.find((l) => l.id === 'accepted')?.label, 'Accepted');
  for (const l of c.legend) assert.equal(l.color, DEFAULT_COLORS[l.id as keyof typeof DEFAULT_COLORS]);
  assert.deepEqual(Object.keys(c.report).sort(), [...STATUSES].sort());
  assert.equal(Object.values(c.report).reduce((a, b) => a + b, 0), adrs.length);
  assert.deepEqual(c.source, { label: 'decisions.md' });
  assert.equal(c.updated, TODAY);
  assert.ok(Value.Check(CardSchema, c));
});

test('card prefs override defaults', () => {
  const adrs = sample();
  const accepted = adrs.filter((a) => a.status === 'accepted').length;
  const c = card(
    adrs,
    {
      title: 'Choices',
      subtitle: 'ADRs',
      heading: { primary: 'accepted', label: 'accepted' },
      legend: [{ id: 'proposed', label: 'Open' }, { id: 'accepted' }],
      source: { label: 'docs/adr.md', url: 'https://x/' }
    },
    TODAY,
    'decisions.md'
  );
  assert.equal(c.title, 'Choices');
  assert.equal(c.subtitle, 'ADRs');
  assert.deepEqual(c.heading, { primary: String(accepted), label: 'accepted' });
  assert.deepEqual(c.legend, [
    { id: 'proposed', label: 'Open', color: DEFAULT_COLORS.proposed },
    { id: 'accepted', label: 'Accepted', color: DEFAULT_COLORS.accepted }
  ]);
  assert.deepEqual(Object.keys(c.report), ['proposed', 'accepted']);
  assert.deepEqual(c.source, { label: 'docs/adr.md', url: 'https://x/' });
});

test('card pill: due beats proposed beats up to date', () => {
  const due = calm().map((a, i) => (i === 0 ? { ...a, revisit: TODAY } : a));
  assert.deepEqual(card(due, {}, TODAY, 'd.md').status, { label: '1 due', tone: 'bad' });
  const proposed = calm().map((a, i) => (i < 2 ? { ...a, status: 'proposed' as const } : a));
  assert.deepEqual(card(proposed, {}, TODAY, 'd.md').status, { label: '2 proposed', tone: 'neutral' });
  assert.deepEqual(card(calm(), {}, TODAY, 'd.md').status, { label: 'Up to date', tone: 'good' });
});

test('card of an empty ledger', () => {
  const c = card([], {}, TODAY, 'x.md');
  assert.equal(c.heading.primary, '0');
  assert.ok(Object.values(c.report).every((n) => n === 0));
  assert.deepEqual(c.status, { label: 'Up to date', tone: 'good' });
});

test('parsePrefs drops unknown legend ids with a warning', () => {
  const r = parsePrefs({ legend: [{ id: 'acepted' }, { id: 'accepted' }] });
  assert.deepEqual(r.prefs.legend?.map((l) => l.id), ['accepted']);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0]!, /acepted/);
});

test('parsePrefs rejects a bad shape', () => {
  assert.throws(() => parsePrefs({ legend: 'x' }));
  assert.throws(() => parsePrefs({ heading: { primary: 'nope' } }));
});
