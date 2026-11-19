# Decision Ledger

**[▶ Open the ledger](https://aaronp.github.io/adr/)** ·
[Acme example](https://aaronp.github.io/adr/?src=examples/acme-decisions/decisions.md)

Architecture decision records (ADRs) driven by **one markdown file**. Open `dist/decision-ledger.html` in any browser. No server or install is needed.
This repo is the viewer; your decisions can live in their own repo and be loaded with `?src=` (see [Publishing your own ledger](#publishing-your-own-ledger)).

## Adding it to your project

From your project's root (Bun shown; `npm i -D`, `npm pkg set` and `npm run` work the same):

```sh
bun add -d @pritzlaff/adr
bun pm pkg set scripts.adr="adr docs/adr/decisions.md"
mkdir -p docs/adr
cat > docs/adr/decisions.md <<'EOF'
---
title: Keep project docs as markdown next to the code
status: accepted
date: 2026-11-19
tags: process
decision: md
---

## Goal
Keep goals, risks and decisions current without a separate tool.

## People
- Priya Shah — decider
- Tom Okafor — author

## Criteria
| id | criterion | weight | description |
| --- | --- | --- | --- |
| upkeep | Easy to keep current | 5 | Higher = less effort. |
| review | Reviewed with the code | 4 | Higher = shows up in pull requests. |

## Solution: md — Markdown in the repo
| criterion | score |
| --- | --- |
| upkeep | 4 |
| review | 5 |

## Solution: wiki — Team wiki
| criterion | score |
| --- | --- |
| upkeep | 3 |
| review | 1 |

## Decision
Markdown in the repo: it changes in the same pull request as the code it describes.
EOF
bun run adr    # opens it on localhost
```

That is a complete ledger with one accepted record, `ADR-0001`. Add records by appending another
`---` front-matter block, or with **New** in the viewer; **File → Save** writes your edits back to
`docs/adr/decisions.md`, so commit it like any other source. A record needs only a `title:`;
the full format is in **[spec.md](spec.md)**, also published at <https://aaronp.github.io/adr/spec.md> and shipped in the package as `node_modules/@pritzlaff/adr/spec.md`, so people and agents working in your repo can read the version they run.

`adr card docs/adr/decisions.md` and `adr badge docs/adr/decisions.md` write `card.json` and `badge.svg`
beside it, for a dashboard or a README badge ([Card and badge](#card-and-badge)).
To publish the ledger on GitHub Pages as well, copy `adr/index.html` and `.github/workflows/pages.yml` from
[examples/bun-app](examples/bun-app), which is this setup end to end with the file in `adr/`
(change that path in the workflow to match yours).
[aaronp/template](https://github.com/aaronp/template) is a project with this and its sibling tools (goals, architecture, decisions, risks, schedule, delivery) set up together behind one dashboard.

- **Dashboard** with search (title, goal, people, tags, options, criteria), status filters and revisit-due tracking.
- **Hierarchy**: give a record a `parent:` and the dashboard can show it as a list, an indented hierarchy, or a sankey of decisions flowing into sub-decisions. Each record links to its parent and children.
- **ADR view** with goal, hypothesis, people, timeline, collapsible solutions, and four comparison views: matrix, radar, weighted bars and heatmap.
- **Form** for adding and editing records: 1–5 weights and scores, unscored stays unscored (never zero), and every problem is listed before saving.
- **File menu**: start a new, empty ledger (it offers to download the current one first), open, download, or copy a share link that carries the whole ledger.
- **Markdown view** with the whole file: edit and apply, copy, download, open or drag in a `.md` file. Errors (only for what cannot be read, such as a bad date or a score outside 1–5) show their line number, and nothing is changed until the whole file reads.
- Four themes: Graph paper, Night shift, Blueprint and Warm ledger.

Applied changes are autosaved in the browser (localStorage). **The downloaded `decisions.md` is the real copy**: keep it in git next to your code.

| Query | Shows |
| --- | --- |
| _(none)_ | The file saved in this browser, or the bundled sample. |
| `?src=<url>` | That markdown file (absolute, or relative to the page). It is not autosaved, so it never overwrites your saved file. |
| `#data=<packed>` | A ledger carried in the link itself (File → Copy share link): the markdown, deflated and base64url-encoded. Not autosaved either. |

Add any of these to choose what shows (unknown values are ignored):

| Query | Values |
| --- | --- |
| `adr` | A record id, e.g. `ADR-0012`: opens that record |
| `page` | `dashboard` (default) or `markdown` |
| `layout` | Dashboard view: `list` (default), `tree`, `sankey` |
| `viz` | `radar` (default), `matrix`, `weighted`, `heatmap` |
| `theme` | `paper` (default), `night`, `blueprint`, `warm`; wins over the theme saved in the browser |

The address bar follows along as you move around, so it is always a shareable link, and Back/Forward step between screens.

Sources on another host must allow CORS (GitHub Pages and raw.githubusercontent.com do).

## The file format

The full format, with a minimal and a complete example, is in **[spec.md](spec.md)**.

It is forgiving: a record needs only a title, and everything else is optional.

```markdown
---
title: Use Postgres for the orders service
---
We need a database for orders that the team already knows how to run.
```

Add `## Goal`, `## Hypothesis`, `## People`, `## Criteria`, `## Solution: …` and `## Decision` sections as the
decision takes shape. Names and keys match in any case, and text with no field of its own is kept under
`## Notes`, so saving never loses it. `src/sample/decisions.md` is a fuller example.

## Viewing locally

```sh
make dev     # builds, then serves with Bun on http://localhost:8000/ and prints the example's URL
```

The built page is served at `/` and the rest of the repo beside it, as on GitHub Pages, so
`http://localhost:8000/?src=examples/acme-decisions/decisions.md` works.

## The `adr` CLI

```sh
bunx @pritzlaff/adr decisions.md   # or npx; no install needed
```

It serves the viewer and that file on localhost and opens the browser.
The file is re-read on each reload. `PORT=8000` fixes the port; `NO_OPEN=1` skips opening a browser.
The package has no runtime dependencies: it is `bin/adr.mjs` plus the built `dist/decision-ledger.html`
and `dist/badge.mjs`.

### Card and badge

```sh
adr card decisions.md [out-dir]    # → card.json: the ledger as a dashboard card (data only)
adr badge decisions.md [out-dir]   # → badge.svg: drawn from the same card
```

`card.json` is tool-neutral data (title, status pill, big number, legend with counts, source link) for
a dashboard to style as it likes; see [spec.md](spec.md#card-and-badge). What it says (titles, legend
labels, colours, order) comes from an optional `decisions.card.json` beside the markdown. Design one in
the viewer with **File → Design card…** (`?page=card`), which previews the card and badge and downloads
the file. Links in the card open the viewer at `ADR_HOST` (default `https://aaronp.github.io/adr/`) on
`ADR_SRC` (where your published markdown lives), filtered with `?status=proposed|accepted|…|revisit`; set
both as environment variables. The Pages workflows here and in both examples regenerate both files on
every push (in [examples/bun-app](examples/bun-app) it is `make snapshot`), so a README can embed the
live badge:

```md
[![Decisions](https://you.github.io/your-decisions/badge.svg)](https://you.github.io/your-decisions/)
```

### Releasing

`npm version patch` (or minor/major), then `make publish` (check, then `npm publish`).
`make dist` packs the same thing into a local `.tgz` without publishing.

## Hosting

`.github/workflows/pages.yml` typechecks, tests and builds on pushes to `main` or `master`, then
publishes the page with `examples/` beside it (Settings → Pages → Source: **GitHub Actions**; the
`github-pages` environment must allow your branch). `.md` files are served raw, without Jekyll.

## Publishing your own ledger

Your decisions live in their own data-only repo (`decisions.md`, a redirecting `index.html` and a
Pages workflow); this repo stays the viewer. Create an empty repo on GitHub, then either:

**A. Start from `examples/` in this repo**

```sh
git clone https://github.com/aaronp/adr.git
cd adr/examples/acme-decisions
make clone REPO=you/your-decisions    # or ./clone.sh to be prompted
```

This copies the example to `../your-decisions` as a fresh repo on `main`, points its README link at
`https://you.github.io/your-decisions/` and sets the `origin` remote.

**B. Clone the standalone example**

```sh
git clone https://github.com/aaronp/adr-example.git your-decisions
cd your-decisions
git remote set-url origin git@github.com:you/your-decisions.git
```

Then change the **View** link in its README to `https://you.github.io/your-decisions/`.

Either way, edit `decisions.md`, commit and `git push -u origin main`, then on GitHub set
Settings → Pages → Source: **GitHub Actions**. Your site redirects here with `?src=` pointing at
your `decisions.md`.

## Development

```sh
make test         # or: npm ci && npm test — node:test: parser, scoring, validation, reducer
make check        # typecheck + tests + build, as CI runs it
make build        # → dist/decision-ledger.html (single self-contained file) and dist/index.html
```

Needs Node 22.6+ (tests run TypeScript directly via `--experimental-strip-types`).

### Layout

| Path | What |
| --- | --- |
| `src/core/schema.ts` | TypeBox schemas for the record, with field docs and examples |
| `src/core/markdown.ts` | Forgiving parser (see spec.md) and serializer. `serialize(parse(x))` gives the standard layout, and parse/serialize round-trips |
| `src/core/scoring.ts` | Weighted scores and ranking (pure) |
| `src/core/validate.ts` | Cross-field and cross-record rules |
| `src/core/form.ts` | Edit-form model and pure draft edits |
| `src/core/search.ts` · `dates.ts` | Filtering, revisit logic. "Today" is always passed in |
| `src/ui/state.ts` | The whole app as one pure reducer |
| `src/ui/io.ts` · `main.tsx` | The edge: clock, storage, `?src=` fetch, clipboard, file download/upload |
| `examples/acme-decisions/` | A cloneable data-only repo that points back at this viewer |
| `examples/bun-app/` | A Bun project with its own `adr/decisions.md`: `bun run adr` opens it locally, Pages publishes it |
| `src/ui/components/` | Preact views |

Fonts load from Google Fonts when online and fall back to system fonts offline.
