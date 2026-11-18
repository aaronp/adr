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

## Publishing on GitHub Pages

`.github/workflows/pages.yml` publishes only the `adr/` folder. Its `index.html`
redirects to the hosted viewer with `?src=` pointing at your `decisions.md`, as in
[acme-decisions](../acme-decisions). It also runs `bun run badge`, so
`adr/badge.svg` and `adr/card.json` are published beside it. On GitHub: Settings → Pages → Source: **GitHub Actions**.

Live copy of this example:
[aaronp.github.io/adr/?src=examples/bun-app/adr/decisions.md](https://aaronp.github.io/adr/?src=examples/bun-app/adr/decisions.md)
