PORT ?= 8000

.PHONY: dev build test check dist publish bump-patch bump-minor bump-major
node_modules: package-lock.json
	npm ci
	@touch node_modules

build: node_modules
	npm run build

test: node_modules
	npm test

check: node_modules
	npm run check

# Packs the `adr` CLI into pritzlaff-adr-<version>.tgz (install with: npm i -D ./pritzlaff-adr-*.tgz)
dist: check
	npm pack

# Bumps package.json, commits and tags v<version> (needs a clean tree)
bump-patch bump-minor bump-major:
	npm version $(@:bump-%=%)

# Publishes @pritzlaff/adr to npm. Bump first: make bump-patch|bump-minor|bump-major
publish: check
	npm publish

# Serves the built page at / and the repo beside it (see dev-server.ts); File → Save writes .md files back.
dev: build
	@echo "Example: http://localhost:$(PORT)/?src=examples/acme-decisions/decisions.md"
	@PORT=$(PORT) bun dev-server.ts
