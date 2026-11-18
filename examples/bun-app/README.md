# bun-app — a Bun project with its own decision ledger

A tiny Bun service whose architecture decisions live beside the code in
[`adr/decisions.md`](adr/decisions.md).

```sh
bun install
bun run adr      # opens adr/decisions.md in the viewer, served from localhost
bun start        # the app itself
```

`bun run adr` uses the [`@pritzlaff/adr`](https://www.npmjs.com/package/@pritzlaff/adr)
dev dependency. Edit `adr/decisions.md` and reload the page to see changes. Edits made in
the viewer are not written back, so use its Download button and save over the file.

No install? `bunx @pritzlaff/adr adr/decisions.md` does the same.

## Badge and summary card

```sh
make snapshot    # → adr/badge.svg and adr/card.json
```

- `badge.svg` is a status badge for your README:
  `[![Decisions](https://you.github.io/your-app/badge.svg)](https://you.github.io/your-app/)`
- `card.json` is the same summary as data (title, status pill, big number, a count per status, links)
  for a dashboard to style as it likes.

Both come from `adr/decisions.md`. To change the title, labels, colours or which statuses show, open the
viewer (`bun run adr`), pick **File → Design card…**, download `decisions.card.json` into `adr/`, and run
`make snapshot` again.

The links in the card and badge open the hosted viewer on your published `decisions.md`, filtered to the
status clicked (e.g. `…?src=https://you.github.io/your-app/decisions.md&status=proposed`). `make` works out
that URL from your `origin` remote; override it with `make snapshot ADR_SRC=<url>`, and point the links at
another viewer with `ADR_HOST=<url>` (the same address as `VIEWER` in `adr/index.html`).

## Publishing on GitHub Pages

`.github/workflows/pages.yml` publishes only the `adr/` folder. Its `index.html`
redirects to the hosted viewer with `?src=` pointing at your `decisions.md`, as in
[acme-decisions](../acme-decisions). It also runs `make snapshot`, so
`adr/badge.svg` and `adr/card.json` are published beside it. On GitHub: Settings → Pages → Source: **GitHub Actions**.

Live copy of this example:
[aaronp.github.io/adr/?src=examples/bun-app/adr/decisions.md](https://aaronp.github.io/adr/?src=examples/bun-app/adr/decisions.md)
