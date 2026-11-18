# Where the published decisions.md lives. Pages serves adr/ at the site root, so for the GitHub repo
# you/your-app that is https://you.github.io/your-app/decisions.md (worked out from the origin remote).
# The card's links open the viewer with ?src= pointing here. Override: make snapshot ADR_SRC=<url>
ADR_SRC ?= $(shell git remote get-url origin 2>/dev/null | sed -nE 's|^.*github\.com[:/]([^/]+)/([^/]+)$$|https://\1.github.io/\2/decisions.md|p' | sed 's|\.git/decisions|/decisions|')

.PHONY: snapshot
# Regenerates adr/badge.svg and adr/card.json from adr/decisions.md (and adr/decisions.card.json, if present).
snapshot:
	ADR_SRC=$(ADR_SRC) bunx adr badge adr/decisions.md
	ADR_SRC=$(ADR_SRC) bunx adr card adr/decisions.md
