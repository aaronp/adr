# Card designer and `card.json` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a tool-neutral `card.json` (and a badge drawn from it) from `decisions.md` plus an optional `decisions.card.json` sidecar, and add a designer view in the app to edit that sidecar.

**Architecture:** A pure `src/core/card.ts` turns ADRs + sidecar prefs + today into a `Card`. `src/core/badge.ts` renders any `Card` to SVG. Both are bundled into `dist/card.mjs` for the `adr card` / `adr badge` CLI commands, and used directly by a new `?page=card` designer view.

**Tech Stack:** TypeScript (run via `node --experimental-strip-types`), TypeBox, Preact, esbuild, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-18-card-designer-design.md`

## Global Constraints

- The `decisions.md` format and parser do not change.
- `card.json` field names, `version: 1`, and `status.tone ∈ good | warn | bad | neutral` are the cross-tool contract; nothing ADR-specific in `badge.ts`.
- Default legend colours: accepted `#0B6B5F`, proposed `#1F45B0`, superseded `#6B7280`, deprecated `#B26B00`, rejected `#A3283C`; badge fallback colour for a legend item with no `color`: `#6B7280`.
- Default copy: title `Decisions`, subtitle `ADR log`, primary `total`, label `decision records`, legend labels = capitalised status (`Accepted` …).
- Pill: due > 0 → `"<n> due"` / `bad`; else proposed > 0 → `"<n> proposed"` / `neutral`; else `"Up to date"` / `good`.
- `today` is the local date (`new Date().toLocaleDateString('en-CA')` in the CLI; the injected `today` in the app).
- No new dependencies. `npm run check` (typecheck, test, build) must pass after every task.
- Release as `1.1.0`; publish before merging (example workflows install it from npm).

## Review Focus

- Sidecar with a legend id that isn't a status (typo `acepted`): CLI exits 1 naming the id; designer drops it and shows a warning. → tests in Task 1 (`parsePrefs`).
- Sidecar that is not valid JSON or has wrong types (`"legend": "x"`): CLI exits 1 with the file name and reason; designer shows an alert and uses defaults. → Task 1 test (`parsePrefs` throws), Task 3 manual check.
- Empty ledger (0 ADRs): primary `"0"`, all report values 0, pill `Up to date`; badge shows only the title segment. → Tasks 1 and 2 tests.
- Legend item with every count zero, or sidecar with an empty `legend: []`: card still valid; badge is title-only. → Task 2 test.
- Text with `&`, `<`, `"` in title/labels (e.g. `R&D decisions`) must be XML-escaped in the badge SVG. → Task 2 test.

---

### Task 1: Core `card()` and sidecar parsing

**Files:**
- Create: `src/core/card.ts`
- Test: `test/card.test.ts`

**Interfaces:**
- Consumes: `Adr`, `STATUSES`, `Status` from `src/core/schema.ts`; `isRevisitDue(adr, today)` from `src/core/search.ts`.
- Produces:
  - `CardSchema`, `type Card` (the output format in the spec), `CardPrefsSchema`, `type CardPrefs` (sidecar: every field optional; `heading.primary` is `'total' | Status`; legend items `{ id: Status; label?: string; color?: string; url?: string }`).
  - `DEFAULT_COLORS: Readonly<Record<Status, string>>`.
  - `parsePrefs(json: unknown): { prefs: CardPrefs; warnings: string[] }` — throws `Error` with a readable reason if the shape is wrong; unknown legend ids are removed and each gives a warning `Unknown legend id "<id>" (expected one of: proposed, accepted, …)`.
  - `card(adrs: readonly Adr[], prefs: CardPrefs, today: string, sourceLabel: string): Card` — `sourceLabel` is the default for `source.label`.

- [ ] **Step 0: Commit the pending `adr badge` work already in the working tree** (`bin/adr.mjs`, `build.mjs`, `package.json`, workflows, READMEs, `examples/bun-app/package.json`, `dist/badge.mjs`) as its own commit, message `Add adr badge CLI command and Pages badge steps`. Do not add `hoshin-kanri/`.

- [ ] **Step 1: Write failing tests in `test/card.test.ts`** (sample via `parseLedger(readSample())`, `TODAY = '2026-10-24'`):
  - `defaults`: `card(adrs, {}, TODAY, 'decisions.md')` → `version 1`, `title 'Decisions'`, `subtitle 'ADR log'`, `heading { primary: String(adrs.length), label: 'decision records' }`, legend ids equal `STATUSES` in order with labels `Accepted` etc. and `DEFAULT_COLORS`, `report` has every status (zeros included) summing to `adrs.length`, `source { label: 'decisions.md' }` with no `url`, `updated === TODAY`, and `Value.Check(CardSchema, result)` is true.
  - `prefs override`: title/subtitle/label/source as given; `heading.primary: 'accepted'` → primary is the accepted count as a string; legend `[{ id: 'proposed', label: 'Open' }, { id: 'accepted' }]` → exactly those two ids in that order, `Open` label, `Accepted` default label, default colours filled in, `report` has only those two keys.
  - `pill`: ledger with a due revisit → `{ label: '<n> due', tone: 'bad' }`; no due, 2 proposed → `{ label: '2 proposed', tone: 'neutral' }`; neither → `{ label: 'Up to date', tone: 'good' }` (build the ledgers by mapping sample ADRs' `status`/`revisit`).
  - `empty ledger`: `card([], {}, TODAY, 'x.md')` → primary `'0'`, every report value 0, pill `Up to date`.
  - `parsePrefs unknown id`: `{ legend: [{ id: 'acepted' }, { id: 'accepted' }] }` → prefs legend ids `['accepted']`, one warning containing `acepted`.
  - `parsePrefs bad shape`: `parsePrefs({ legend: 'x' })` and `parsePrefs({ heading: { primary: 'nope' } })` throw.

- [ ] **Step 2: Run `npm test` — expect FAIL** (cannot find `../src/core/card.ts`).

- [ ] **Step 3: Implement `src/core/card.ts`** per Interfaces and Global Constraints. Validate with `Value.Check` / `Value.Errors(...).First()` as `validate.ts` does; drop unknown legend ids *before* the schema check so they warn rather than throw. Count due with `isRevisitDue`.

- [ ] **Step 4: Run `npm run check` — expect PASS.**

- [ ] **Step 5: Commit** `src/core/card.ts test/card.test.ts` — `Add card(): card.json from ADRs and sidecar prefs`.

---

### Task 2: Badge renders from a `Card`; menu badge removed

**Files:**
- Modify: `src/core/badge.ts` (whole file)
- Modify: `src/ui/main.tsx:21-27,168` (delete `themedBadge`, stop passing `badge`)
- Modify: `src/ui/components/Header.tsx:8,38,46-50,56` (drop `badge` prop, the `preview` state and the "Status badge (SVG)" section)
- Modify: `src/ui/styles.css:433` (delete `.menu-badge`)
- Test: `test/card.test.ts`

**Interfaces:**
- Consumes: `type Card` from Task 1.
- Produces: `badgeSvg(card: Card): string` (replaces `badgeSvg(adrs, today, colors)`; `BadgeColors` is removed).

- [ ] **Step 1: Write failing tests** in `test/card.test.ts`:
  - `badge segments`: for a card with title `Decisions`, legend accepted/proposed/superseded and report `{accepted: 9, proposed: 1, superseded: 0}` → SVG contains `>Decisions<`, `>Accepted 9<`, `>Proposed 1<`, no `Superseded`; contains `fill="#555"` (title segment) and each item's colour; `aria-label` is `Decisions: 9 accepted, 1 proposed` (labels lower-cased, zero items omitted).
  - `badge fallback colour`: legend item without `color` → its rect has `fill="#6B7280"`.
  - `badge empty`: report all zero, or `legend: []` → exactly one `<rect` before `</g>` besides the clip rect, i.e. title only; `aria-label="Decisions: none"`.
  - `badge escapes`: title `R&D <x>` → SVG contains `R&amp;D &lt;x&gt;` and no raw `R&D`.

- [ ] **Step 2: Run `npm test` — expect FAIL.**

- [ ] **Step 3: Rewrite `badgeSvg(card)`** keeping the existing shields layout (20px high, `rx="7"` clip, 11px Verdana, `width()` estimate). Title segment fill `#555`, text white; then one segment per legend item with `report[id] > 0`, text `"<label> <n>"`, fill `color ?? '#6B7280'`, text white. Escape `& < > "` in all text and attributes.

- [ ] **Step 4: Remove the File-menu badge**: delete `themedBadge` and the `badge` prop chain (`main.tsx` → `Header` → `FileMenu`), the `preview` state/`onToggle`, the three badge lines, and `.menu-badge` CSS.

- [ ] **Step 5: Update the CLI bundle entry in `build.mjs`** so it still compiles: the `stdin` contents export `card` and `parsePrefs` from `./card.ts` and `badgeSvg` from `./badge.ts`; `outfile: 'dist/card.mjs'`. Update `bin/adr.mjs` badge branch to `import('../dist/card.mjs')` and call `badgeSvg(card(parseLedger(md), {}, today, md))` — export `parseLedger` from the bundle too. (Sidecar reading comes in Task 3.) Delete `dist/badge.mjs`; `package.json` `files`: `dist/badge.mjs` → `dist/card.mjs`.

- [ ] **Step 6: Run `npm run check` — expect PASS. Then `node bin/adr.mjs badge examples/acme-decisions/decisions.md "$TMPDIR"`** — expect `Wrote …/badge.svg` and an SVG starting with a `Decisions` segment.

- [ ] **Step 7: Commit** — `Badge renders from card data; drop the File-menu badge`.

---

### Task 3: CLI `adr card`, sidecar reading, workflows and docs

**Files:**
- Modify: `bin/adr.mjs`
- Modify: `.github/workflows/pages.yml`, `examples/acme-decisions/.github/workflows/pages.yml`, `examples/bun-app/.github/workflows/pages.yml`, `examples/bun-app/package.json`
- Modify: `README.md` (Status badge section), `examples/acme-decisions/README.md`, `examples/bun-app/README.md`, `spec.md` (new `## Card and badge` section before `## How the app saves`)
- Modify: `package.json` (`version` → `1.1.0`)

**Interfaces:**
- Consumes: `dist/card.mjs` exports `parseLedger`, `parsePrefs`, `card`, `badgeSvg` (Tasks 1–2).
- Produces: CLI `adr card <decisions.md> [out-dir]` → `<out-dir>/card.json` (2-space JSON + newline); `adr badge <decisions.md> [out-dir]` → `badge.svg`. Sidecar path: the markdown path with a trailing `.md` replaced by `.card.json` (otherwise `.card.json` appended). Local server route `/<encoded sidecar basename>` serving it as `application/json`, 404 when the file does not exist.

- [ ] **Step 1: Implement in `bin/adr.mjs`** one shared loader for both subcommands: read markdown; read sidecar if it exists (`ENOENT` → `{}`); `JSON.parse` + `parsePrefs`; any parse error or any warning → `adr: <sidecar path>: <message>` on stderr, exit 1. `card` writes `card.json`; `badge` writes `badge.svg` from the same card. Update the usage lines and header comment. Add the sidecar route to the server; `ENOENT` → 404 (other read errors stay 500).

- [ ] **Step 2: Verify manually** (after `npm run build`):
  - `node bin/adr.mjs card examples/acme-decisions/decisions.md "$TMPDIR"` → `card.json` with `version: 1` and the acme counts.
  - Write `$TMPDIR/d.md` (copy of acme) and `$TMPDIR/d.card.json` = `{"title":"R&D","legend":[{"id":"accepted","color":"#000000"}]}` → `card` gives title `R&D`, one legend item; `badge` → `R&amp;D` and `fill="#000000"`.
  - Sidecar `{"legend":[{"id":"acepted"}]}` → exit 1 naming `acepted`. Sidecar `{` → exit 1 naming the file.
  - `NO_OPEN=1 PORT=8123 node bin/adr.mjs $TMPDIR/d.md &` then `curl -s localhost:8123/d.card.json` returns the JSON; with the sidecar deleted, `curl -o /dev/null -w '%{http_code}'` prints `404`. Stop the server.

- [ ] **Step 3: Workflows**: root workflow adds `node bin/adr.mjs card examples/acme-decisions/decisions.md` beside the badge step; acme example adds `npx -y @pritzlaff/adr card decisions.md`; bun-app `package.json` `badge` script becomes `adr badge adr/decisions.md && adr card adr/decisions.md` (workflow unchanged).

- [ ] **Step 4: Docs**: `spec.md` gets the `card.json` and sidecar formats, defaults, pill rule and colours from the design doc; READMEs mention `adr card`, `card.json`, the sidecar and the designer (`?page=card`, File → Design card…). Bump `package.json` version to `1.1.0`.

- [ ] **Step 5: Run `npm run check` — expect PASS.**

- [ ] **Step 6: Commit** — `adr card: card.json from decisions.md and its sidecar`.

---

### Task 4: Designer view (`?page=card`)

**Files:**
- Create: `src/ui/components/CardDesigner.tsx`
- Modify: `src/ui/state.ts` (Screen union, `nav/card` action, `applyPrefs`)
- Modify: `src/ui/url.ts` (`UrlPage` gains `{ kind: 'card' }`; `fromQuery`/`toQuery` handle `page=card`; add `sidecarUrl`)
- Modify: `src/ui/io.ts` (`STORAGE_KEYS.card: 'decision-ledger:card:v1'`)
- Modify: `src/ui/components/Header.tsx` (menu item **Design card…**, icon `edit` or nearest existing)
- Modify: `src/ui/main.tsx` (render `CardDesigner` for `screen.kind === 'card'`)
- Modify: `src/ui/styles.css` (designer + preview card styles, using existing CSS variables)
- Test: `test/url.test.ts`, `test/state.test.ts`

**Interfaces:**
- Consumes: `card`, `parsePrefs`, `CardPrefs`, `DEFAULT_COLORS` (Task 1); `badgeSvg` (Task 2); `Store`, `fetchText`, `copyText`/`fx.copy`, `fx.download`.
- Produces:
  - `Screen` member `{ readonly kind: 'card' }`; action `{ type: 'nav/card' }`.
  - `sidecarUrl(src: string): string` in `url.ts` — replaces `.md` at the end of the path (before any `?`/`#`) with `.card.json`, else appends `.card.json`.
  - `CardDesigner` props: `{ adrs: readonly Adr[]; today: string; src: string | null; store: Store | null; save: boolean; fx: Effects }` where `save` is the same flag as `saveMarkdown`.

- [ ] **Step 1: Write failing tests**:
  - `url.test.ts`: `fromQuery('?page=card')` → `{ page: { kind: 'card' } }`; `toQuery` for a state on the card screen yields `?page=card` and keeps `src`; `sidecarUrl('examples/a/decisions.md') === 'examples/a/decisions.card.json'`; `sidecarUrl('https://x/d.md?raw=1') === 'https://x/d.card.json?raw=1'`; `sidecarUrl('notes') === 'notes.card.json'`.
  - `state.test.ts`: `reducer(s, { type: 'nav/card' }).screen` deep-equals `{ kind: 'card' }`; `url/apply` with `{ page: { kind: 'card' } }` lands on the card screen.

- [ ] **Step 2: Run `npm test` — expect FAIL.**

- [ ] **Step 3: Implement routing** (`state.ts`, `url.ts`, `pageKey` → `'card'`), the menu item dispatching `nav/card`, and `STORAGE_KEYS.card`.

- [ ] **Step 4: Run `npm test` — expect PASS.**

- [ ] **Step 5: Implement `CardDesigner.tsx`.** Prefs live in component state. Initial prefs, first that applies: `src !== null` → `fetchText(sidecarUrl(src))` → `parsePrefs(JSON.parse(text))` (a 404 / "not found" → `{}`; any other failure → alert with the message, `{}`); else `store.read(STORAGE_KEYS.card)` parsed the same way; else `{}`. `parsePrefs` warnings show as an alert. When `save && store !== null`, write prefs to `STORAGE_KEYS.card` on every change. Form fields per the spec sketch: title, subtitle, big number (`select`: `total` + statuses), label, legend rows for all five statuses (checkbox include, ↑/↓ reorder buttons, label text, `<input type="color">` defaulting to `DEFAULT_COLORS`, url text), source label + url. Preview: `card(adrs, prefs, today, src ?? 'decisions.md')` drawn as the HTML card laid out as in the spec's "Live preview" paragraph, plus `<img>` of `badgeSvg(card(...))` as a data URL. Actions: **Download `<name>.card.json`** (`name` = basename of `src` without `.md`, default `decisions`; content = prefs, 2-space JSON), **Download badge.svg**, **Copy card.json**. Check `fetchText`'s error text for a 404 and match on it; if it does not expose status, add a status to its thrown error.

- [ ] **Step 6: Run `npm run check` — expect PASS. Then `make dev`** and open `http://localhost:8000/?src=examples/acme-decisions/decisions.md&page=card`: defaults load (no sidecar → no alert); editing the title updates card and badge preview; unticking Proposed removes it from bar, legend and badge; Download writes `decisions.card.json`; File → Design card… opens the same view; reload without `?src` keeps edits (local ledger autosave).

- [ ] **Step 7: Commit** — `Card designer view at ?page=card`.
