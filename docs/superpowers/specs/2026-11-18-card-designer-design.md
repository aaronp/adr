# Card designer and `card.json` — design

## Intent

Each tool (ADR here; Hoshin Kanri and others later) should contribute one **card** to a cross-tool
dashboard: number tile, title/subtitle, a status pill, one big number with a label, a segmented bar
with a legend, and an "Open" link to the source. The number tile ("04") is the card's position on the
dashboard, assigned by the dashboard, so it is not in `card.json`. The dashboard's look is not decided yet, so tools
emit **data only** (`card.json`); any renderer can style it. The user designs what their card says
(titles, legend labels, colours, order) in a page inside the ADR app, and those choices are saved in a
sidecar file next to the markdown so CI regenerates the same card on every push.

## Goals

- A generic, tool-neutral `card.json` format (below).
- Preferences saved in a sidecar, `<name>.card.json` beside `<name>.md` (e.g. `decisions.card.json`).
- `adr card <decisions.md> [out-dir]` writes `card.json` = sidecar + computed numbers.
- `adr badge` draws its SVG from the same card data (colours/labels follow the design).
- A designer view in the ADR app with a live preview of the card and the badge, and Download/Copy of the sidecar.

## Non-goals

- The dashboard itself, and any production card renderer. The designer's HTML preview is only a preview.
- `summary.svg` (an image of the card). Possible later from `card.json`.
- A designer shared across tools (approach B below). The format is generic so it can be extracted later.
- Theming the card per viewer theme.

## Anti-goals

- Changing the `decisions.md` format or parser. Preferences never go in the markdown.
- Hard-coding ADR concepts into the `card.json` format or the badge renderer.

## Approaches

- **A. Card view inside the ADR app (chosen).** Pure `card()` in `src/core/` shared by browser and CLI;
  designer is a new view in the existing Preact app; badge renders from card data.
- **B. Standalone designer for any tool.** Most reuse, but needs a third package and an inter-tool
  contract while ADR is the only producer. Rejected for now; A keeps the format and badge renderer
  generic so B can be extracted.
- **C. CLI only, sidecar edited by hand.** Cheapest but drops the designer the user asked for.

## The `card.json` format (output)

```json
{
  "version": 1,
  "title": "Decisions",
  "subtitle": "ADR log",
  "status": { "label": "1 proposed", "tone": "neutral" },
  "heading": { "primary": "12", "label": "decision records" },
  "legend": [
    { "id": "accepted", "label": "Accepted", "color": "#16181D", "url": "https://…" },
    { "id": "proposed", "label": "Proposed", "color": "#4F6FE0" },
    { "id": "superseded", "label": "Superseded" }
  ],
  "report": { "accepted": 9, "proposed": 1, "superseded": 2 },
  "source": { "label": "docs/adr/decisions.md", "url": "https://…" },
  "updated": "2026-11-18"
}
```

- `version`: format version, `1`.
- `title`, `subtitle`: strings; `subtitle` may be empty.
- `status`: the pill. `tone` is one of `good | warn | bad | neutral` (semantic, the renderer picks colours).
- `heading.primary` is a **string** (so other tools can show `"2/5"`); `heading.label` is the words after it.
- `legend`: ordered; `id` and `label` required; `color` (CSS hex) and `url` optional. Renderers fall back
  to their own palette when `color` is absent.
- `report`: number per legend id. Legend items are what the bar and legend show, in order.
- `source`: `label` (shown as the path) and optional `url` (the Open link).
- `updated`: ISO date the file was generated (the `today` passed in).

The `version`, `status.tone` values and field names are the generic contract; ADR-specific meaning lives only
in how ADR fills them.

## The sidecar, `<name>.card.json` (input)

Optional; every field optional and defaulted.

```json
{
  "title": "Decisions",
  "subtitle": "ADR log",
  "heading": { "primary": "total", "label": "decision records" },
  "legend": [ { "id": "accepted", "label": "Accepted", "color": "#16181D", "url": "…" } ],
  "source": { "label": "docs/adr/decisions.md", "url": "https://…" }
}
```

- `heading.primary`: `"total"` (number of ADRs) or one status id (that status's count).
- `legend`: which statuses to show, in order, with label/colour/url. Ids must be statuses; unknown ids are
  an error in the CLI and ignored with a warning in the designer.
- Defaults (no sidecar, or field missing): title `Decisions`, subtitle `ADR log`, primary `total`, label
  `decision records`; legend = all five statuses in `STATUSES` order with capitalised labels and these
  colours (solid, readable under white badge text; *my call*): accepted `#0B6B5F` (paper `--good`), proposed
  `#1F45B0` (paper `--accent`), superseded `#6B7280`, deprecated `#B26B00`, rejected `#A3283C` (paper `--bad`).
  Defaults always emit colours, so published badges and cards look the same everywhere; `color` stays optional
  in the format for other tools and hand-written sidecars, and the badge falls back to grey `#6B7280`; `source.label` = the markdown path as given to the CLI (designer: the `?src` value or
  `decisions.md`), `source.url` absent.

## How ADR fills the card

- Legend ids are the five statuses (`proposed, accepted, superseded, deprecated, rejected`). Each ADR has
  exactly one, so the bar sums to the total. Report includes every legend item, zeros included.
- "Revisits due" (existing `isRevisitDue`) is **not** a legend item (it overlaps statuses); it drives the pill.
- Pill rule (fixed, not designable): any due → `"N due"` / `bad`; else any proposed → `"N proposed"` /
  `neutral`; else `"Up to date"` / `good`.

## Core

`src/core/card.ts`, pure:

- `card(adrs, prefs, today) → Card` and the `Card` / `CardPrefs` types (TypeBox schemas, like `schema.ts`, so
  the sidecar is validated with the same tools).
- `badgeSvg(card) → string` replaces today's signature in `src/core/badge.ts`: shields style, a grey title
  segment (`card.title`) then one segment per legend item with a non-zero count, `"<label> <n>"`, on the item's
  colour (renderer default when absent), white text. Generic: it only reads `card.json` fields. This replaces
  the A/P/D badge; "due" leaves the badge (user agreed).
- Tests in `test/` alongside the existing ones: defaults, sidecar overrides, pill rule, unknown id handling,
  badge segments.

## CLI (`bin/adr.mjs`, bundled via `dist/badge.mjs` → rename to `dist/card.mjs`)

- `adr card <decisions.md> [out-dir]`: reads `<name>.card.json` beside the markdown if present, writes
  `<out-dir>/card.json`. Out-dir defaults to the markdown's folder.
- `adr badge <decisions.md> [out-dir]`: same inputs, writes `badge.svg`.
- `today` is the local date (as today's `adr badge`).
- `adr <file.md>` (the local server) also serves the sidecar route so the designer can load and preview it.
- Pages workflows (root and both examples) run `adr card` next to `adr badge`; READMEs updated.
- `package.json` `files`: `dist/badge.mjs` → `dist/card.mjs`.
- Release (*my call*): ship as `1.1.0` (new command; the badge's look changes but no CLI usage breaks). The example
  workflows change in the same branch but only pass once 1.1.0 is published, so publish before merging. The
  examples do not ship a sidecar; they show the defaults.

## Designer view

- Route: `?page=card` (fits the existing `?page=` scheme in `src/ui/url.ts`); opened from **Design card…** in
  the File menu (`Header.tsx`). That item **replaces** the menu's "Status badge" section (preview, Copy badge,
  Download badge.svg) and `themedBadge` in `main.tsx` (user's choice): the designer is the only place the badge
  is previewed or downloaded, always from the saved design, so it cannot drift from what CI publishes. The
  designer therefore gains **Download badge.svg** next to its other actions.
- Loads the sidecar from the `?src` URL with `.md` replaced by `.card.json`; a 404 means defaults, other
  failures show an alert and use defaults.
- Edits: title, subtitle, big number (`total` or a status) and its label, legend (include/exclude each
  status, reorder, label, colour via `<input type="color">`, optional url), source label and url.
- Live preview: an HTML card, plus the badge SVG. Card layout, top to bottom: title (bold) with subtitle under
  it and the status pill top-right; the big `primary` number with `label` beside it; a segmented bar (one rounded
  segment per legend item, width ∝ count, legend colours); the legend as `■ Label n` inline items; a divider;
  `source.label` in monospace on the left and an "Open →" link (to `source.url`) on the right. White rounded
  card, light border.
- Actions: **Download `<name>.card.json`** (the sidecar), **Copy card.json** (computed output).
- Persistence: same rule as the markdown — autosaved in browser storage when the ledger is local, not when it
  came from `?src=` or a share link. (Builder's call on storage key, following `STORAGE_KEYS`.)

```
┌ Card designer ───────────────────────────────────────┐
│ Title [Decisions    ]  Subtitle [ADR log        ]    │
│ Big number [total ▾]   Label [decision records ]     │
│ Legend   ☰ ☑ Accepted   [Accepted  ] ■ #16181D       │
│          ☰ ☑ Proposed   [Proposed  ] ■ #4F6FE0       │
│          ☰ ☐ Rejected   …                            │
│ Source   [docs/adr/decisions.md] [https://…]         │
│ ── Preview ─────────────────────────────────────────  │
│  (HTML card like the mock-up)   [badge.svg]          │
│ [Download decisions.card.json] [Copy card.json]      │
└──────────────────────────────────────────────────────┘
```

## Left to the builder

- Reorder control (buttons vs drag), exact preview styling, default palette values beyond the paper theme.
- Whether the sidecar shape is a strict subset of `card.json` types or its own schema.
- `spec.md` section wording for the sidecar and `card.json`.

## Revision (2026-11-18): links are generated, not designed

Per the user, card links are not user-specified. `ADR_HOST` (constant in `src/core/card.ts`, default
`https://aaronp.github.io/adr/`, CLI env override) plus `?src=<ADR_SRC>` opens the viewer on the published
markdown; legend items add `&status=<id>`, the pill adds `&status=revisit|proposed`. The sidecar no longer
has `url` fields (they are rejected), and the designer has no link inputs. The viewer gains
`?status=<status>|revisit`, which sets (and is kept in sync with) the dashboard filter. The bun-app example
gets `make snapshot` (badge.svg + card.json), deriving `ADR_SRC` from the `origin` remote.
