import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, reducer, type State } from '../src/ui/state.ts';
import { fromQuery, pageKey, toQuery } from '../src/ui/url.ts';
import { parseLedger } from '../src/core/markdown.ts';
import { readSample } from './helpers.ts';

const start = (search: string, over: Partial<{ storedTheme: string | null }> = {}): State =>
  createInitialState({ storedMarkdown: null, storedTheme: null, sampleMarkdown: readSample(), prefs: fromQuery(search), ...over });
const firstId = (): string => {
  const a = parseLedger(readSample())[0];
  if (a === undefined) throw new Error('sample has no records');
  return a.id;
};

test('reads page, record, chart and theme; ignores unknown values', () => {
  assert.deepEqual(fromQuery('?page=markdown&viz=heatmap&theme=night'), { page: { kind: 'markdown' }, viz: 'heatmap', theme: 'night' });
  assert.deepEqual(fromQuery('?adr=ADR-0001&page=markdown'), { page: { kind: 'view', id: 'ADR-0001' } });
  assert.deepEqual(fromQuery('?page=nope&viz=pie&theme=neon&src=x.md'), {});
});

test('?adr= opens that record with the chart and theme asked for', () => {
  const s = start(`?adr=${firstId()}&viz=matrix&theme=blueprint`);
  assert.deepEqual(s.screen, { kind: 'view', id: firstId() });
  assert.equal(s.viz, 'matrix');
  assert.equal(s.theme, 'blueprint');
});

test('the URL theme wins over the stored one', () => {
  assert.equal(start('?theme=warm', { storedTheme: 'night' }).theme, 'warm');
  assert.equal(start('', { storedTheme: 'night' }).theme, 'night');
});

test('an unknown ?adr= falls back to the dashboard with a message', () => {
  const s = start('?adr=ADR-9999');
  assert.equal(s.screen.kind, 'dashboard');
  assert.match(s.toast?.text ?? '', /no record "ADR-9999"/);
});

test('state → query keeps ?src= and leaves out defaults; editing has no address', () => {
  const s = start('?src=https://example.org/d.md');
  assert.equal(toQuery(s, '?src=https://example.org/d.md'), '?src=https://example.org/d.md');
  const v = reducer(reducer(s, { type: 'nav/view', id: firstId() }), { type: 'view/viz', viz: 'heatmap' });
  assert.equal(toQuery(v, '?src=https://example.org/d.md'), `?src=https://example.org/d.md&adr=${firstId()}&viz=heatmap`);
  assert.equal(pageKey(v), `view:${firstId()}`);
  assert.equal(toQuery(reducer(v, { type: 'edit/new', today: '2026-10-24' }), ''), null);
});

test('url/apply (Back/Forward) moves between screens', () => {
  const s = reducer(start(''), { type: 'url/apply', prefs: { page: { kind: 'markdown' } } });
  assert.equal(s.screen.kind, 'markdown');
  assert.equal(reducer(s, { type: 'url/apply', prefs: { page: { kind: 'dashboard' } } }).screen.kind, 'dashboard');
});
