PORT ?= 8000

.PHONY: dev build test check
node_modules: package-lock.json
	npm ci
	@touch node_modules

build: node_modules
	npm run build

test: node_modules
	npm test

check: node_modules
	npm run check

# Serves the built page at / and everything else from the repo, as on GitHub Pages (so ?src=examples/... works).
dev: build
	@echo "Example: http://localhost:$(PORT)/?src=examples/acme-decisions/decisions.md"
	@bun -e 'const s = Bun.serve({ port: $(PORT), async fetch(req) { const p = new URL(req.url).pathname; const rel = p.endsWith("/") ? p + "index.html" : p; for (const f of [Bun.file("dist" + rel), Bun.file("." + rel)]) if (await f.exists()) return new Response(f); return new Response("Not found", { status: 404 }); } }); console.log("Serving on " + s.url.href + " (Ctrl-C to stop)")'
