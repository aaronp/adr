/**
 * The markdown file format — the source of truth for every record.
 *
 * A file holds zero or more records, one after another. Each record is:
 *
 *   ---
 *   id: ADR-0012
 *   title: Choose an event streaming platform
 *   status: accepted
 *   date: 2026-09-14
 *   revisit: 2027-03-14          (empty when none)
 *   tags: data, infrastructure   (empty when none)
 *   decision: kafka              (empty when undecided)
 *   ---
 *
 *   ## Goal
 *   ## Hypothesis       three lines: "- We believe:", "- Will result in:", "- Measured by:"
 *   ## People           "- Name — decider|author|consulted|informed"
 *   ## Criteria         table: | id | criterion | weight | description |
 *   ## Solution: <id> — <Name>      (repeat per option)
 *       summary text, score table | criterion | score | (1–5 or -), then "Pros:" / "Cons:" bullets
 *   ## Decision         rationale text
 *
 * Parsing is strict: anything unexpected throws a MarkdownError carrying the 1-based line number.
 * serializeLedger(parseLedger(x)) is a normal form, and parseLedger(serializeLedger(adrs)) round-trips.
 */
import { STATUSES, ROLES, type Adr, type Criterion, type Hypothesis, type Person, type Solution, type Status, type Role } from './schema.ts';
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
const SECTIONS = ['Goal', 'Hypothesis', 'People', 'Criteria', 'Decision'] as const;
const SLUG = '[a-z0-9][a-z0-9-]*';
const DASH = '\\s+(?:—|--|-)\\s+';
const SOLUTION_RE = new RegExp(`^Solution:\\s+(${SLUG})${DASH}(.+)$`);
const PERSON_RE = new RegExp(`^- (.+?)${DASH}(decider|author|consulted|informed)\\s*$`, 'i');
const SEPARATOR_RE = /^\|[\s:|-]+\|$/;
const HYPOTHESIS_LINES: ReadonlyArray<readonly [string, keyof Hypothesis]> = [
  ['We believe', 'believe'],
  ['Will result in', 'willResultIn'],
  ['Measured by', 'measuredBy']
];

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

const splitRow = (line: Line): string[] => {
  const t = line.text.trim();
  if (!t.startsWith('|') || !t.endsWith('|')) fail(line.n, 'table rows must start and end with "|"');
  const inner = t.slice(1, -1);
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

const nonEmpty = (sec: Section): Line[] => sec.body.filter((l) => l.text.trim() !== '');
const textOf = (sec: Section): string => sec.body.map((l) => l.text).join('\n').trim();
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

const parseFrontmatter = (lines: readonly Line[], closeLine: number): Record<FrontmatterKey, string> => {
  const fm: Partial<Record<FrontmatterKey, string>> = {};
  for (const l of lines) {
    if (l.text.trim() === '') continue;
    const m = /^([a-z]+):(.*)$/.exec(l.text);
    if (m === null) return fail(l.n, `expected "key: value", got "${l.text}"`);
    const key = m[1] as string;
    if (!(FRONTMATTER_KEYS as readonly string[]).includes(key)) {
      fail(l.n, `unknown frontmatter key "${key}" (allowed: ${FRONTMATTER_KEYS.join(', ')})`);
    }
    if (has(fm, key)) fail(l.n, `duplicate key "${key}"`);
    fm[key as FrontmatterKey] = (m[2] as string).trim();
  }
  const out = {} as Record<FrontmatterKey, string>;
  for (const k of FRONTMATTER_KEYS) {
    const v = fm[k];
    if (v === undefined) return fail(closeLine, `frontmatter is missing "${k}:" (leave the value empty if it does not apply)`);
    out[k] = v;
  }
  return out;
};

const parseHypothesis = (sec: Section): Hypothesis => {
  const found: Partial<Hypothesis> = {};
  for (const l of nonEmpty(sec)) {
    const m = /^- (We believe|Will result in|Measured by):(.*)$/.exec(l.text);
    if (m === null) return fail(l.n, 'hypothesis lines start with "- We believe:", "- Will result in:" or "- Measured by:"');
    const entry = HYPOTHESIS_LINES.find(([label]) => label === m[1]);
    if (entry === undefined) throw new Error('bug: hypothesis label matched the regex but not the table');
    if (found[entry[1]] !== undefined) fail(l.n, `duplicate "${entry[0]}" line`);
    found[entry[1]] = (m[2] as string).trim();
  }
  const get = (label: string, key: keyof Hypothesis): string => {
    const v = found[key];
    if (v === undefined) return fail(sec.n, `hypothesis is missing "- ${label}:"`);
    return v;
  };
  return { believe: get('We believe', 'believe'), willResultIn: get('Will result in', 'willResultIn'), measuredBy: get('Measured by', 'measuredBy') };
};

const parsePeople = (sec: Section): Person[] =>
  nonEmpty(sec).map((l) => {
    const m = PERSON_RE.exec(l.text);
    if (m === null) return fail(l.n, 'people lines look like "- Name — decider|author|consulted|informed"');
    const role = (m[2] as string).toLowerCase();
    if (!(ROLES as readonly string[]).includes(role)) throw new Error(`bug: role "${role}" matched the regex but is not a known role`);
    return { name: (m[1] as string).trim(), role: role as Role };
  });

const parseCriteria = (sec: Section): Criterion[] => {
  const rows = nonEmpty(sec);
  const head = rows[0];
  const sep = rows[1];
  if (head === undefined || sep === undefined) return fail(sec.n, 'criteria must be a table with a header row and a separator row');
  if (splitRow(head).map((x) => x.toLowerCase()).join('|') !== 'id|criterion|weight|description') {
    fail(head.n, 'criteria header must be "| id | criterion | weight | description |"');
  }
  if (!SEPARATOR_RE.test(sep.text.trim())) fail(sep.n, 'expected the separator row "| --- | --- | --- | --- |"');
  const ids = new Set<string>();
  return rows.slice(2).map((l) => {
    const cells = splitRow(l);
    if (cells.length !== 4) return fail(l.n, `criteria rows need 4 cells, found ${cells.length}`);
    const [id, name, weight, description] = cells as [string, string, string, string];
    if (!new RegExp(`^${SLUG}$`).test(id)) fail(l.n, `criterion id "${id}" must be lower-case letters, digits and dashes`);
    if (ids.has(id)) fail(l.n, `duplicate criterion id "${id}"`);
    ids.add(id);
    if (name === '') fail(l.n, 'criterion name is empty');
    if (!/^[1-5]$/.test(weight)) fail(l.n, `weight "${weight}" must be a whole number 1–5`);
    return { id, name, weight: Number(weight), description };
  });
};

const parseSolution = (sec: Section, criteria: readonly Criterion[]): Solution => {
  const hm = SOLUTION_RE.exec(sec.title);
  if (hm === null) throw new Error('bug: parseSolution called on a non-solution section');
  const id = hm[1] as string;
  const critIds = new Set(criteria.map((c) => c.id));
  const summary: string[] = [];
  const pros: string[] = [];
  const cons: string[] = [];
  const scores: Record<string, number | null> = {};
  let mode: 'summary' | 'table' | 'pros' | 'cons' = 'summary';
  let tableRow = 0;
  for (const l of sec.body) {
    const t = l.text.trim();
    if (t === '') continue;
    if (t === 'Pros:') {
      mode = 'pros';
      continue;
    }
    if (t === 'Cons:') {
      mode = 'cons';
      continue;
    }
    if (t.startsWith('|')) {
      if (mode === 'pros' || mode === 'cons') fail(l.n, 'the score table must come before "Pros:" and "Cons:"');
      mode = 'table';
      tableRow++;
      if (tableRow === 1) {
        if (splitRow(l).map((x) => x.toLowerCase()).join('|') !== 'criterion|score') fail(l.n, 'score table header must be "| criterion | score |"');
        continue;
      }
      if (tableRow === 2) {
        if (!SEPARATOR_RE.test(t)) fail(l.n, 'expected the separator row "| --- | --- |"');
        continue;
      }
      const cells = splitRow(l);
      if (cells.length !== 2) fail(l.n, `score rows need 2 cells, found ${cells.length}`);
      const [cid, val] = cells as [string, string];
      if (!critIds.has(cid)) fail(l.n, `unknown criterion id "${cid}" (not in ## Criteria)`);
      if (has(scores, cid)) fail(l.n, `duplicate score for "${cid}"`);
      if (val === '-') scores[cid] = null;
      else if (/^[1-5]$/.test(val)) scores[cid] = Number(val);
      else fail(l.n, `score "${val}" must be 1–5, or - for unscored`);
      continue;
    }
    switch (mode) {
      case 'summary':
        summary.push(t);
        break;
      case 'pros':
      case 'cons':
        if (!t.startsWith('- ')) fail(l.n, 'pros and cons are bullet lines starting with "- "');
        (mode === 'pros' ? pros : cons).push(t.slice(2).trim());
        break;
      case 'table':
        fail(l.n, 'unexpected text after the score table; add "Pros:" or "Cons:" first');
        break;
      default: {
        const never: never = mode;
        throw new Error(`bug: unhandled parser mode ${String(never)}`);
      }
    }
  }
  for (const c of criteria) {
    if (!has(scores, c.id)) fail(sec.n, `solution "${id}" has no score row for criterion "${c.id}" (use - for unscored)`);
  }
  return { id, name: (hm[2] as string).trim(), summary: summary.join('\n'), scores, pros, cons };
};

/** Parses one record whose opening "---" is lines[open] and which ends before lines[end]. */
const parseRecord = (lines: readonly Line[], open: number, close: number, end: number): Adr => {
  const closeLine = lines[close]?.n ?? fail(lines[open]?.n ?? 1, 'bug: record bounds out of range');
  const fm = parseFrontmatter(lines.slice(open + 1, close), closeLine);
  if (!(STATUSES as readonly string[]).includes(fm.status)) fail(closeLine, `status "${fm.status}" must be one of ${STATUSES.join(', ')}`);
  if (!isDate(fm.date)) fail(closeLine, `date "${fm.date}" must be a valid YYYY-MM-DD date`);
  if (fm.revisit !== '' && !isDate(fm.revisit)) fail(closeLine, `revisit "${fm.revisit}" must be a valid YYYY-MM-DD date, or empty`);

  const sections: Section[] = [];
  let cur: Section | null = null;
  for (const l of lines.slice(close + 1, end)) {
    const hm = /^##\s+(.+?)\s*$/.exec(l.text);
    if (hm !== null) {
      cur = { title: hm[1] as string, n: l.n, body: [] };
      sections.push(cur);
    } else if (/^#/.test(l.text)) {
      fail(l.n, 'only "## " headings are allowed inside a record');
    } else if (cur === null) {
      if (l.text.trim() !== '') fail(l.n, 'text between the frontmatter and the first "## " section');
    } else {
      cur.body.push(l);
    }
  }
  for (const s of sections) {
    if (!(SECTIONS as readonly string[]).includes(s.title) && !SOLUTION_RE.test(s.title)) {
      fail(s.n, `unknown section "## ${s.title}" (expected ${SECTIONS.join(', ')} or "Solution: id — Name")`);
    }
  }
  const lastLine = lines[end - 1]?.n ?? closeLine;
  const single = (name: (typeof SECTIONS)[number]): Section => {
    const found = sections.filter((s) => s.title === name);
    const second = found[1];
    if (second !== undefined) fail(second.n, `duplicate "## ${name}" section`);
    return found[0] ?? fail(lastLine, `record ${fm.id} is missing its "## ${name}" section`);
  };

  const criteria = parseCriteria(single('Criteria'));
  const solIds = new Set<string>();
  const solutions = sections
    .filter((s) => SOLUTION_RE.test(s.title))
    .map((s) => {
      const sol = parseSolution(s, criteria);
      if (solIds.has(sol.id)) fail(s.n, `duplicate solution id "${sol.id}"`);
      solIds.add(sol.id);
      return sol;
    });
  const decision = fm.decision === '' ? null : fm.decision;
  if (decision !== null && !solIds.has(decision)) fail(closeLine, `decision "${decision}" does not match any "## Solution:" id`);
  const tags = fm.tags === '' ? [] : fm.tags.split(',').map((t) => t.trim());
  if (tags.some((t) => t === '')) fail(closeLine, 'tags contain an empty entry; check for doubled or trailing commas');

  return {
    id: fm.id,
    title: fm.title,
    status: fm.status as Status,
    date: fm.date,
    revisit: fm.revisit === '' ? null : fm.revisit,
    tags,
    goal: textOf(single('Goal')),
    hypothesis: parseHypothesis(single('Hypothesis')),
    people: parsePeople(single('People')),
    criteria,
    solutions,
    decision,
    rationale: textOf(single('Decision'))
  };
};

/** Parses a whole file. An empty (or whitespace-only) file is a valid ledger with no records. */
export const parseLedgerRecords = (text: string): ParsedRecord[] => {
  const lines: Line[] = text.replace(/\r\n?/g, '\n').split('\n').map((t, i) => ({ text: t, n: i + 1 }));
  const records: ParsedRecord[] = [];
  const seen = new Map<string, number>();
  let i = 0;
  while (i < lines.length && (lines[i] as Line).text.trim() === '') i++;
  while (i < lines.length) {
    const open = lines[i] as Line;
    if (open.text !== '---') fail(open.n, 'expected "---" to start a record');
    let close = i + 1;
    while (close < lines.length && (lines[close] as Line).text !== '---') close++;
    if (close >= lines.length) fail(open.n, 'frontmatter is never closed with "---"');
    let end = close + 1;
    while (end < lines.length && (lines[end] as Line).text !== '---') end++;
    const adr = parseRecord(lines, i, close, end);
    const prev = seen.get(adr.id);
    if (prev !== undefined) fail(open.n, `duplicate record id ${adr.id} (first used on line ${prev})`);
    seen.set(adr.id, open.n);
    records.push({ adr, line: open.n });
    i = end;
  }
  return records;
};

export const parseLedger = (text: string): Adr[] => parseLedgerRecords(text).map((r) => r.adr);
