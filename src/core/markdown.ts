/**
 * The markdown file format — the source of truth for every record. See spec.md for the full description.
 *
 * A file holds zero or more records, one after another. Each record is front matter between "---" lines, then
 * "## " sections. Only a title is required; everything else has a default:
 *
 *   ---
 *   id: ADR-0012                 (default: the next free ADR-NNNN)
 *   title: Choose an event streaming platform
 *   status: accepted             (default: proposed)
 *   date: 2026-09-14             (default: none)
 *   revisit: 2027-03-14          tags: data, infrastructure     decision: kafka
 *   ---
 *
 *   ## Goal            text (text before the first section is part of the goal too)
 *   ## Hypothesis      "- We believe:", "- Will result in:", "- Measured by:"
 *   ## People          "- Name — decider|author|consulted|informed" (one per line, or several names joined by ";")
 *   ## Criteria        table: | id | criterion | weight | description | (columns by name, in any order)
 *   ## Solution: <id> — <Name>      (or "## Solution: Name", or "## Option: …"; repeat per option)
 *       summary text, score table | criterion | score | (1–5, or - / blank for unscored), then "Pros:" / "Cons:" bullets
 *   ## Decision        rationale text
 *   ## Notes           any other text: notes under the criteria table, unknown sections, and so on
 *
 * Parsing is forgiving: names and keys match in any case, and text with no field of its own is kept in Notes, so
 * saving never loses it. Only what cannot be read throws a MarkdownError with its 1-based line number.
 * serializeLedger(parseLedger(x)) is a normal form, and parseLedger(serializeLedger(adrs)) round-trips.
 */
import { STATUSES, type Adr, type Criterion, type Hypothesis, type Person, type Solution, type Status, type Role } from './schema.ts';
import { isDate } from './dates.ts';

export class MarkdownError extends Error {
  /** 1-based line number in the file the error refers to. */
  readonly line: number;
  constructor(line: number, message: string) {
    super(`Line ${line}: ${message}`);
    this.name = 'MarkdownError';
    this.line = line;
  }
}

export interface ParsedRecord {
  readonly adr: Adr;
  /** 1-based line of the record's opening "---". */
  readonly line: number;
}

const FRONTMATTER_KEYS = ['id', 'title', 'status', 'date', 'revisit', 'tags', 'decision'] as const;
type FrontmatterKey = (typeof FRONTMATTER_KEYS)[number];
const SLUG = '[a-z0-9][a-z0-9-]*';
const SLUG_RE = new RegExp(`^${SLUG}$`);
const DASH = '\\s+(?:—|–|--|-)\\s+';
/** "Solution: kafka — Managed Kafka", "Solution: Managed Kafka" or "Option: …". */
const SOLUTION_RE = /^(?:solution|option)\s*:\s*(.+)$/i;
const SOLUTION_ID_RE = new RegExp(`^(${SLUG})${DASH}(.+)$`);
const SEPARATOR_RE = /^\|?[\s:|-]+\|?$/;
const HYPOTHESIS_LINES: ReadonlyArray<readonly [string, keyof Hypothesis]> = [
  ['We believe', 'believe'],
  ['Will result in', 'willResultIn'],
  ['Measured by', 'measuredBy']
];
/** Words that name a role, singular or plural, as people write them. */
const ROLE_WORDS: ReadonlyArray<readonly [RegExp, Role]> = [
  [/\bdecid(?:er|ers|es|ing)?\b|\bdecision[- ]makers?\b|\bapprovers?\b/i, 'decider'],
  [/\bauthors?\b|\bwriters?\b/i, 'author'],
  [/\bconsult(?:ed|ees?|ant|ants)?\b|\bcontributors?\b/i, 'consulted'],
  [/\binform(?:ed)?\b/i, 'informed']
];

/** Lower-case kebab-case from any text ("Managed Kafka" → "managed-kafka"); "" if nothing is left. */
export const slugify = (t: string): string =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// ------------------------------------------------------------------ serialize

const cell = (t: string | number): string => String(t).replace(/\|/g, '\\|').replace(/\n/g, ' ');

export const serializeAdr = (adr: Adr): string => {
  const L: string[] = [
    '---',
    `id: ${adr.id}`,
    `title: ${adr.title}`,
    `status: ${adr.status}`,
    `date: ${adr.date}`,
    `revisit: ${adr.revisit ?? ''}`,
    `tags: ${adr.tags.join(', ')}`,
    `decision: ${adr.decision ?? ''}`,
    '---',
    '',
    '## Goal',
    adr.goal,
    '',
    '## Hypothesis',
    ...HYPOTHESIS_LINES.map(([label, key]) => `- ${label}: ${adr.hypothesis[key]}`),
    '',
    '## People',
    ...adr.people.map((p) => `- ${p.name} — ${p.role}`),
    '',
    '## Criteria',
    '| id | criterion | weight | description |',
    '| --- | --- | --- | --- |',
    ...adr.criteria.map((c) => `| ${c.id} | ${cell(c.name)} | ${c.weight} | ${cell(c.description)} |`),
    ''
  ];
  for (const s of adr.solutions) {
    L.push(`## Solution: ${s.id} — ${s.name}`);
    if (s.summary !== '') L.push(s.summary);
    L.push('', '| criterion | score |', '| --- | --- |');
    for (const c of adr.criteria) {
      const v = s.scores[c.id];
      if (v === undefined) throw new Error(`bug: solution "${s.id}" has no score entry for criterion "${c.id}"`);
      L.push(`| ${c.id} | ${v === null ? '-' : v} |`);
    }
    L.push('', 'Pros:', ...s.pros.map((t) => `- ${t}`), '', 'Cons:', ...s.cons.map((t) => `- ${t}`), '');
  }
  L.push('## Decision');
  if (adr.rationale !== '') L.push(adr.rationale);
  L.push('');
  if (adr.notes !== '') L.push('## Notes', adr.notes, '');
  return L.join('\n');
};

export const serializeLedger = (adrs: readonly Adr[]): string => adrs.map(serializeAdr).join('\n');

// ------------------------------------------------------------------ parse

interface Line {
  readonly text: string;
  /** 1-based. */
  readonly n: number;
}
interface Section {
  readonly title: string;
  readonly n: number;
  readonly body: Line[];
}

const fail = (line: number, msg: string): never => {
  throw new MarkdownError(line, msg);
};

/** Cells of a "| a | b |" row (outer pipes optional; "\|" is a literal pipe). */
const splitRow = (text: string): string[] => {
  const inner = text.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  const cells: string[] = [];
  let buf = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\' && inner[i + 1] === '|') {
      buf += '|';
      i++;
    } else if (ch === '|') {
      cells.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  cells.push(buf.trim());
  return cells;
};
const isRow = (t: string): boolean => t.trim().startsWith('|');

/**
 * A table's rows, with cells looked up by header name (any case). Lines that are not table rows are returned as
 * `other`, so the caller can keep them. A missing column reads as "".
 */
const readTable = (lines: readonly Line[], columns: readonly string[]): { rows: { cells: Record<string, string>; n: number }[]; other: Line[] } => {
  const rows: { cells: Record<string, string>; n: number }[] = [];
  const other: Line[] = [];
  let header: string[] | null = null;
  for (const l of lines) {
    const t = l.text.trim();
    if (t === '') continue;
    if (!isRow(t)) {
      other.push(l);
      continue;
    }
    if (header === null) {
      header = splitRow(t).map((c) => c.toLowerCase());
      continue;
    }
    if (SEPARATOR_RE.test(t) && rows.length === 0) continue;
    const raw = splitRow(t);
    const cells: Record<string, string> = {};
    for (const c of columns) {
      const k = (header ?? []).indexOf(c);
      cells[c] = k === -1 ? '' : (raw[k] ?? '');
    }
    rows.push({ cells, n: l.n });
  }
  return { rows, other };
};

const textOf = (lines: readonly Line[]): string => lines.map((l) => l.text).join('\n').trim();
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Front matter "key: value" lines; keys in any case, unknown keys ignored, the first of a repeated key wins. */
const parseFrontmatter = (lines: readonly Line[]): { fm: Partial<Record<FrontmatterKey, string>>; at: Partial<Record<FrontmatterKey, number>> } => {
  const fm: Partial<Record<FrontmatterKey, string>> = {};
  const at: Partial<Record<FrontmatterKey, number>> = {};
  for (const l of lines) {
    const m = /^\s*([A-Za-z_]+)\s*:(.*)$/.exec(l.text);
    if (m === null) continue;
    const key = (m[1] as string).toLowerCase();
    const value = (m[2] as string).replace(/\s+#.*$/, '').trim();
    if ((FRONTMATTER_KEYS as readonly string[]).includes(key) && !has(fm, key)) {
      fm[key as FrontmatterKey] = value;
      at[key as FrontmatterKey] = l.n;
    }
  }
  return { fm, at };
};

const parseHypothesis = (lines: readonly Line[]): { hypothesis: Hypothesis; other: Line[] } => {
  const found: Partial<Record<keyof Hypothesis, string>> = {};
  const other: Line[] = [];
  for (const l of lines) {
    if (l.text.trim() === '') continue;
    const m = /^\s*(?:[-*]\s*)?(we believe|will result in|measured by)\s*[:…-]?\s*(.*)$/i.exec(l.text);
    const entry = m === null ? undefined : HYPOTHESIS_LINES.find(([label]) => label.toLowerCase() === (m[1] as string).toLowerCase());
    if (m === null || entry === undefined || has(found, entry[1])) other.push(l);
    else found[entry[1]] = (m[2] as string).trim();
  }
  return { hypothesis: { believe: found.believe ?? '', willResultIn: found.willResultIn ?? '', measuredBy: found.measuredBy ?? '' }, other };
};

/**
 * "- Name — role" lines. Several names may share a line, joined by ";"; a role phrase such as "proposed consultees;
 * unassigned" gives the role, and its other words are kept with the name. A line with no recognisable role is consulted.
 */
const parsePeople = (lines: readonly Line[]): Person[] =>
  lines.flatMap((l) => {
    const t = l.text.trim().replace(/^[-*]\s*/, '');
    if (t === '') return [];
    const m = new RegExp(`^(.+?)${DASH}(.+)$`).exec(t);
    const namesPart = m === null ? t : (m[1] as string);
    const rolePart = m === null ? '' : (m[2] as string);
    const hit = ROLE_WORDS.find(([re]) => re.test(rolePart));
    const role: Role = hit === undefined ? 'consulted' : hit[1];
    const rest = hit === undefined ? rolePart : rolePart.replace(hit[0], ' ');
    const extra = rest
      .split(/[;,]/)
      .map((x) => x.trim())
      .filter((x) => x !== '');
    return namesPart
      .split(';')
      .map((n) => n.trim())
      .filter((n) => n !== '')
      .map((n) => ({ name: (n[0] ?? '').toUpperCase() + n.slice(1) + (extra.length === 0 ? '' : ` (${extra.join(', ')})`), role }));
  });

const parseWeight = (raw: string, n: number): number => {
  if (raw === '') return 1;
  if (!/^[1-5]$/.test(raw)) return fail(n, `weight "${raw}" must be a whole number 1–5 (or blank for 1)`);
  return Number(raw);
};

const parseCriteria = (lines: readonly Line[]): { criteria: Criterion[]; other: Line[] } => {
  const t = readTable(lines, ['id', 'criterion', 'weight', 'description']);
  const ids = new Set<string>();
  const criteria = t.rows.flatMap((r) => {
    const name = r.cells['criterion'] || r.cells['id'] || '';
    if (name === '') return [];
    const base = SLUG_RE.test(r.cells['id'] ?? '') ? (r.cells['id'] as string) : slugify(r.cells['id'] || name) || 'criterion';
    let id = base;
    for (let k = 2; ids.has(id); k++) id = `${base}-${k}`;
    ids.add(id);
    return [{ id, name, weight: parseWeight(r.cells['weight'] ?? '', r.n), description: r.cells['description'] ?? '' }];
  });
  return { criteria, other: t.other };
};

const parseScore = (raw: string, n: number): number | null => {
  if (raw === '' || /^[-–—?]$/.test(raw) || /^n\/?a$/i.test(raw)) return null;
  if (!/^[1-5]$/.test(raw)) return fail(n, `score "${raw}" must be 1–5, or - for unscored`);
  return Number(raw);
};

const parseSolution = (sec: Section, criteria: readonly Criterion[]): Solution => {
  const hm = SOLUTION_RE.exec(sec.title);
  if (hm === null) throw new Error('bug: parseSolution called on a non-solution section');
  const label = (hm[1] as string).trim();
  const idm = SOLUTION_ID_RE.exec(label);
  const name = idm === null ? label : (idm[2] as string).trim();
  const id = idm === null ? slugify(label) || 'solution' : (idm[1] as string);
  const summary: string[] = [];
  const pros: string[] = [];
  const cons: string[] = [];
  const tableLines: Line[] = [];
  let mode: 'summary' | 'pros' | 'cons' = 'summary';
  for (const l of sec.body) {
    const t = l.text.trim();
    if (t === '') continue;
    const head = /^\**\s*(pros|cons)\s*:?\s*\**\s*:?$/i.exec(t);
    if (head !== null) {
      mode = (head[1] as string).toLowerCase() === 'pros' ? 'pros' : 'cons';
      continue;
    }
    if (isRow(t)) {
      tableLines.push(l);
      continue;
    }
    if (mode === 'summary') summary.push(t);
    else (mode === 'pros' ? pros : cons).push(t.replace(/^[-*]\s*/, ''));
  }
  /* Score rows name a criterion by id or by name; rows for unknown criteria are ignored, missing ones are unscored. */
  const scores: Record<string, number | null> = Object.fromEntries(criteria.map((c) => [c.id, null]));
  for (const r of readTable(tableLines, ['criterion', 'score']).rows) {
    const key = (r.cells['criterion'] ?? '').toLowerCase();
    const c = criteria.find((x) => x.id === key || x.name.toLowerCase() === key);
    if (c !== undefined) scores[c.id] = parseScore(r.cells['score'] ?? '', r.n);
  }
  return { id, name, summary: summary.join('\n'), scores, pros: pros.filter((x) => x !== ''), cons: cons.filter((x) => x !== '') };
};

/** Parses one record whose opening "---" is lines[open] and which ends before lines[end]. */
const parseRecord = (lines: readonly Line[], open: number, close: number, end: number): Omit<Adr, 'id'> & { id: string | null } => {
  const openLine = (lines[open] as Line).n;
  const { fm, at } = parseFrontmatter(lines.slice(open + 1, close));
  const title = fm.title ?? '';
  if (title === '') fail(openLine, 'this record has no "title:" in its front matter (the title is the only required field)');
  const status = (fm.status ?? '').toLowerCase();
  const date = fm.date ?? '';
  if (date !== '' && !isDate(date)) fail(at.date ?? openLine, `date "${date}" must be a YYYY-MM-DD date, or blank`);
  const revisit = fm.revisit ?? '';
  if (revisit !== '' && !isDate(revisit)) fail(at.revisit ?? openLine, `revisit "${revisit}" must be a YYYY-MM-DD date, or blank`);

  /* Sections by "## " heading; text before the first one belongs to the goal. Deeper headings are text. */
  const lead: Line[] = [];
  const sections: Section[] = [];
  for (const l of lines.slice(close + 1, end)) {
    const hm = /^##\s+(.+?)\s*#*\s*$/.exec(l.text);
    if (hm !== null && !l.text.startsWith('###')) sections.push({ title: hm[1] as string, n: l.n, body: [] });
    else (sections[sections.length - 1]?.body ?? lead).push(l);
  }
  const named = (name: string): Line[] => sections.filter((x) => x.title.toLowerCase() === name).flatMap((x) => x.body);
  const known = ['goal', 'hypothesis', 'people', 'criteria', 'decision', 'notes'];
  const crit = parseCriteria(named('criteria'));
  const hyp = parseHypothesis(named('hypothesis'));

  const solIds = new Set<string>();
  const solutions = sections
    .filter((x) => SOLUTION_RE.test(x.title))
    .map((x) => {
      const sol = parseSolution(x, crit.criteria);
      let id = sol.id;
      for (let k = 2; solIds.has(id); k++) id = `${sol.id}-${k}`;
      solIds.add(id);
      return id === sol.id ? sol : { ...sol, id };
    });
  /* The decision names a solution by id or by name; anything else means undecided. */
  const decisionKey = (fm.decision ?? '').toLowerCase();
  const chosen = decisionKey === '' ? undefined : solutions.find((x) => x.id === decisionKey || x.name.toLowerCase() === decisionKey);

  /* Text with no field of its own is kept in Notes: notes under the criteria table, stray hypothesis lines, other sections. */
  const extra = sections.filter((x) => !known.includes(x.title.toLowerCase()) && !SOLUTION_RE.test(x.title));
  const notes = [
    textOf(named('notes')),
    textOf(crit.other),
    textOf(hyp.other),
    ...extra.map((x) => `**${x.title}**\n${textOf(x.body)}`.trim())
  ].filter((x) => x !== '');

  return {
    id: fm.id !== undefined && fm.id !== '' ? fm.id : null,
    title,
    status: (STATUSES as readonly string[]).includes(status) ? (status as Status) : 'proposed',
    date,
    revisit: revisit === '' ? null : revisit,
    tags: (fm.tags ?? '')
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x !== ''),
    goal: [textOf(lead), textOf(named('goal'))].filter((x) => x !== '').join('\n\n'),
    hypothesis: hyp.hypothesis,
    people: parsePeople(named('people')),
    criteria: crit.criteria,
    solutions,
    decision: chosen === undefined ? null : chosen.id,
    rationale: textOf(named('decision')),
    notes: notes.join('\n\n')
  };
};

/** Parses a whole file. An empty (or whitespace-only) file is a valid ledger with no records. */
export const parseLedgerRecords = (text: string): ParsedRecord[] => {
  const lines: Line[] = text.replace(/\r\n?/g, '\n').split('\n').map((t, i) => ({ text: t, n: i + 1 }));
  const parsed: { adr: ReturnType<typeof parseRecord>; line: number }[] = [];
  let i = 0;
  while (i < lines.length && (lines[i] as Line).text.trim() === '') i++;
  while (i < lines.length) {
    const open = lines[i] as Line;
    if (open.text.trim() !== '---') fail(open.n, 'expected "---" to start a record (each record begins with front matter between "---" lines)');
    let close = i + 1;
    while (close < lines.length && (lines[close] as Line).text.trim() !== '---') close++;
    if (close >= lines.length) fail(open.n, 'front matter is never closed with "---"');
    /* The record runs to the next "---" that opens front matter (one followed by a "key:" line). */
    let end = close + 1;
    while (end < lines.length && !((lines[end] as Line).text.trim() === '---' && /^\s*[A-Za-z_]+\s*:/.test(lines[end + 1]?.text ?? ''))) end++;
    parsed.push({ adr: parseRecord(lines, i, close, end), line: open.n });
    i = end;
  }
  /* Records without an id, or repeating one, get the next free ADR-NNNN. */
  const used = new Set<string>();
  const num = (id: string | null): number => Number(/^ADR-(\d+)$/.exec(id ?? '')?.[1] ?? 0);
  let next = Math.max(0, ...parsed.map((p) => num(p.adr.id)));
  return parsed.map((p) => {
    let id = p.adr.id;
    if (id === null || used.has(id)) {
      next += 1;
      id = `ADR-${String(next).padStart(4, '0')}`;
    }
    used.add(id);
    return { adr: { ...p.adr, id }, line: p.line };
  });
};

export const parseLedger = (text: string): Adr[] => parseLedgerRecords(text).map((r) => r.adr);
