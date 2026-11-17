import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forest, sankey } from '../src/core/hierarchy.ts';
import { parseLedger, serializeLedger } from '../src/core/markdown.ts';
import { validateLedger } from '../src/core/validate.ts';
import { createInitialState, reducer } from '../src/ui/state.ts';
import { readSample } from './helpers.ts';

const rec = (id: string, parent?: string) => `---\nid: ${id}\ntitle: ${id}\n${parent === undefined ? '' : `parent: ${parent}\n`}---\n`;
const file = rec('A') + rec('B', 'A') + rec('C', 'A') + rec('D', 'B') + rec('E');

test('parent is read, written only when set, and round-trips', () => {
  const adrs = parseLedger(file);
  assert.equal(adrs[1]?.parent, 'A');
  assert.equal(adrs[0]?.parent, null);
  assert.deepEqual(parseLedger(serializeLedger(adrs)), adrs);
  assert.ok(!serializeLedger([adrs[0]!]).includes('parent:'));
  assert.deepEqual(validateLedger(adrs), []);
});

test('unknown, self and looping parents are invalid', () => {
  assert.match(validateLedger(parseLedger(rec('A', 'Z'))).join(), /Z is not a record/);
  assert.match(validateLedger(parseLedger(rec('A', 'A'))).join(), /its own parent/);
  assert.match(validateLedger(parseLedger(rec('A', 'B') + rec('B', 'A'))).join(), /loop/);
});

test('forest nests children under parents; sankey sizes nodes by leaves', () => {
  const adrs = parseLedger(file);
  const f = forest(adrs);
  assert.deepEqual(f.map((n) => n.adr.id), ['A', 'E']);
  assert.deepEqual(f[0]?.children.map((n) => n.adr.id), ['B', 'C']);
  const s = sankey(adrs, 10, 4);
  const h = Object.fromEntries(s.nodes.map((n) => [n.adr.id, n.h]));
  assert.deepEqual(h, { A: 20, B: 10, D: 10, C: 10 });
  assert.equal(s.links.length, 3);
  assert.equal(s.standalone, 1);
  assert.equal(s.depth, 3);
});

test('renaming a parent carries its children', () => {
  const s0 = createInitialState({ storedMarkdown: file, storedTheme: null, sampleMarkdown: readSample() });
  const editing = reducer(reducer(s0, { type: 'edit/start', id: 'B' }), { type: 'edit/update', update: (d) => ({ ...d, id: 'B2' }) });
  const renamed = reducer(editing, { type: 'edit/save' });
  assert.equal(renamed.adrs.find((a) => a.id === 'D')?.parent, 'B2');
});

test('delete keeps sub-decisions as top-level records, or removes the whole branch', () => {
  const s0 = createInitialState({ storedMarkdown: file, storedTheme: null, sampleMarkdown: readSample() });
  const kept = reducer(s0, { type: 'adr/delete', id: 'A', withChildren: false });
  assert.deepEqual(kept.adrs.map((a) => [a.id, a.parent]), [['B', null], ['C', null], ['D', 'B'], ['E', null]]);
  const all = reducer(s0, { type: 'adr/delete', id: 'A', withChildren: true });
  assert.deepEqual(all.adrs.map((a) => a.id), ['E']);
  assert.match(all.toast?.text ?? '', /and 3 sub-decisions/);
});

test('create child starts a new record under its parent', () => {
  const s0 = createInitialState({ storedMarkdown: file, storedTheme: null, sampleMarkdown: readSample() });
  const s1 = reducer(reducer(s0, { type: 'edit/new', today: '2026-11-17', parent: 'B' }), { type: 'edit/update', update: (d) => ({ ...d, title: 'Child' }) });
  const saved = reducer(s1, { type: 'edit/save' });
  assert.equal(saved.adrs.at(-1)?.parent, 'B');
});

test('a packed ledger unpacks to the same markdown; a damaged one is reported', async () => {
  const { packLedger, unpackLedger } = await import('../src/core/share.ts');
  const md = readSample();
  const packed = await packLedger(md);
  assert.match(packed, /^[A-Za-z0-9_-]+$/);
  assert.ok(packed.length < md.length / 2);
  assert.equal(await unpackLedger(packed), md);
  await assert.rejects(unpackLedger(packed.slice(0, 40)), /damaged/);
});

test('file/new starts an empty ledger', () => {
  const s0 = createInitialState({ storedMarkdown: file, storedTheme: null, sampleMarkdown: readSample() });
  const s1 = reducer(reducer(s0, { type: 'file/confirmNew' }), { type: 'file/new' });
  assert.deepEqual(s1.adrs, []);
  assert.equal(s1.newDialog, false);
  assert.deepEqual(s1.screen, { kind: 'dashboard' });
});
