import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Value } from '@sinclair/typebox/value';
import { parseLedger } from '../src/core/markdown.ts';
import { STATUSES, type Adr } from '../src/core/schema.ts';
import { ADR_HOST, CardSchema, DEFAULT_COLORS, card, parsePrefs } from '../src/core/card.ts';
import { badgeSvg } from '../src/core/badge.ts';
import { readSample } from './helpers.ts';

const TODAY = '2026-10-24';
const sample = () => parseLedger(readSample());
const at = (p: string) => ({ label: p, src: p });
const calm = (): Adr[] => sample().map((a) => ({ ...a, status: 'accepted', revisit: null }));

test('card defaults', () => {
  const adrs = sample();
  const c = card(adrs, {}, TODAY, at('decisions.md'));
  assert.equal(c.version, 1);
  assert.equal(c.title, 'Decisions');
  assert.equal(c.subtitle, 'ADR log');
  assert.deepEqual(c.heading, { primary: String(adrs.length), label: 'decision records' });
  assert.deepEqual(c.legend.map((l) => l.id), [...STATUSES]);
  assert.equal(c.legend.find((l) => l.id === 'accepted')?.label, 'Accepted');
  for (const l of c.legend) assert.equal(l.color, DEFAULT_COLORS[l.id as keyof typeof DEFAULT_COLORS]);
  assert.deepEqual(Object.keys(c.report).sort(), [...STATUSES].sort());
  assert.equal(Object.values(c.report).reduce((a, b) => a + b, 0), adrs.length);
  assert.deepEqual(c.source, { label: 'decisions.md', url: `${ADR_HOST}?src=decisions.md` });
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
      source: { label: 'docs/adr.md' }
    },
    TODAY,
    at('decisions.md')
  );
  assert.equal(c.title, 'Choices');
  assert.equal(c.subtitle, 'ADRs');
  assert.deepEqual(c.heading, { primary: String(accepted), label: 'accepted' });
  assert.deepEqual(c.legend.map(({ url, ...l }) => l), [
    { id: 'proposed', label: 'Open', color: DEFAULT_COLORS.proposed },
    { id: 'accepted', label: 'Accepted', color: DEFAULT_COLORS.accepted }
  ]);
  assert.deepEqual(Object.keys(c.report), ['proposed', 'accepted']);
  assert.equal(c.source.label, 'docs/adr.md');
});

test('card pill: due beats proposed beats up to date', () => {
  const due = calm().map((a, i) => (i === 0 ? { ...a, revisit: TODAY } : a));
  assert.deepEqual(card(due, {}, TODAY, at('d.md')).status, { label: '1 due', tone: 'bad', url: `${ADR_HOST}?src=d.md&status=revisit` });
  const proposed = calm().map((a, i) => (i < 2 ? { ...a, status: 'proposed' as const } : a));
  assert.deepEqual(card(proposed, {}, TODAY, at('d.md')).status, { label: '2 proposed', tone: 'neutral', url: `${ADR_HOST}?src=d.md&status=proposed` });
  assert.deepEqual(card(calm(), {}, TODAY, at('d.md')).status, { label: 'Up to date', tone: 'good' });
});

test('card of an empty ledger', () => {
  const c = card([], {}, TODAY, at('x.md'));
  assert.equal(c.heading.primary, '0');
  assert.ok(Object.values(c.report).every((n) => n === 0));
  assert.deepEqual(c.status, { label: 'Up to date', tone: 'good' });
});

test('card links open the hosted viewer on that file, filtered', () => {
  const c = card(sample(), {}, TODAY, { label: 'decisions.md', src: 'https://you.github.io/d/decisions.md' }, 'https://host.example/adr/');
  const src = 'src=https://you.github.io/d/decisions.md';
  assert.equal(c.source.url, `https://host.example/adr/?${src}`);
  assert.equal(c.legend.find((l) => l.id === 'accepted')?.url, `https://host.example/adr/?${src}&status=accepted`);
  assert.equal(card([], {}, TODAY, { label: 'a b.md', src: 'a b.md?x=1&y' }).source.url, `${ADR_HOST}?src=a%20b.md%3Fx%3D1%26y`);
});

test('links in older card settings are ignored, not an error', () => {
  const r = parsePrefs({ title: 'My Decisions', source: { label: 'd.md', url: 'foo' }, legend: [{ id: 'accepted', url: 'https://x/' }] });
  assert.deepEqual(r.prefs, { title: 'My Decisions', source: { label: 'd.md' }, legend: [{ id: 'accepted' }] });
  assert.deepEqual(r.warnings, []);
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

const base = card([], { legend: [{ id: 'accepted' }, { id: 'proposed' }, { id: 'superseded' }] }, TODAY, at('d.md'));
const withReport = (report: Record<string, number>) => ({ ...base, report });

test('badge: title then one segment per non-zero legend item', () => {
  const svg = badgeSvg(withReport({ accepted: 9, proposed: 1, superseded: 0 }));
  assert.match(svg, />Decisions</);
  assert.match(svg, />Accepted 9</);
  assert.match(svg, />Proposed 1</);
  assert.doesNotMatch(svg, /Superseded/);
  assert.match(svg, /fill="#555"/);
  assert.match(svg, new RegExp(`fill="${DEFAULT_COLORS.accepted}"`));
  assert.match(svg, new RegExp(`fill="${DEFAULT_COLORS.proposed}"`));
  assert.match(svg, /aria-label="Decisions: 9 accepted, 1 proposed"/);
});

test('badge: legend item without a colour is grey', () => {
  const svg = badgeSvg({ ...withReport({ accepted: 2 }), legend: [{ id: 'accepted', label: 'Accepted' }] });
  assert.match(svg, /fill="#6B7280"/);
});

test('badge: nothing to count shows the title only', () => {
  for (const c of [withReport({ accepted: 0, proposed: 0, superseded: 0 }), { ...base, legend: [], report: {} }]) {
    const svg = badgeSvg(c);
    assert.equal((svg.match(/<rect /g) ?? []).length, 2); // the clip rect and the title
    assert.match(svg, /aria-label="Decisions: none"/);
  }
});

test('badge escapes text', () => {
  const svg = badgeSvg({ ...withReport({ accepted: 1 }), title: 'R&D <x>' });
  assert.match(svg, /R&amp;D &lt;x&gt;/);
  assert.doesNotMatch(svg, /R&D/);
});

test('hideZero leaves out legend items with no records', () => {
  const adrs = calm(); // all accepted
  const c = card(adrs, { hideZero: true }, TODAY, at('d.md'));
  assert.deepEqual(c.legend.map((l) => l.id), ['accepted']);
  assert.deepEqual(c.report, { accepted: adrs.length });
  assert.equal(card(adrs, {}, TODAY, at('d.md')).legend.length, 5);
  assert.deepEqual(parsePrefs({ hideZero: true }).prefs, { hideZero: true });
});
