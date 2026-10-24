# Decision Ledger

**[▶ Open the ledger](https://aaronp.github.io/adr/)** ·
[Acme example](https://aaronp.github.io/adr/?src=examples/acme-decisions/decisions.md)

Architecture decision records (ADRs) driven by **one markdown file**. Open `dist/decision-ledger.html` in any browser. No server or install is needed.
This repo is the viewer; your decisions can live in their own repo and be loaded with `?src=` (see [Publishing your own ledger](#publishing-your-own-ledger)).

- **Dashboard** with search (title, goal, people, tags, options, criteria), status filters and revisit-due tracking.
- **ADR view** with goal, hypothesis, people, timeline, collapsible solutions, and four comparison views: matrix, radar, weighted bars and heatmap.
- **Form** for adding and editing records: 1–5 weights and scores, unscored stays unscored (never zero), and every problem is listed before saving.
- **Markdown view** with the whole file: edit and apply, copy, download, open or drag in a `.md` file. Errors (only for what cannot be read, such as a bad date or a score outside 1–5) show their line number, and nothing is changed until the whole file reads.
- Four themes: Graph paper, Night shift, Blueprint and Warm ledger.

Applied changes are autosaved in the browser (localStorage). **The downloaded `decisions.md` is the real copy**: keep it in git next to your code.

| Query | Shows |
| --- | --- |
| _(none)_ | The file saved in this browser, or the bundled sample. |
| `?src=<url>` | That markdown file (absolute, or relative to the page). It is not autosaved, so it never overwrites your saved file. |

Add any of these to choose what shows (unknown values are ignored):

| Query | Values |
| --- | --- |
| `adr` | A record id, e.g. `ADR-0012`: opens that record |
| `page` | `dashboard` (default) or `markdown` |
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
| `src/ui/components/` | Preact views |

Fonts load from Google Fonts when online and fall back to system fonts offline.
