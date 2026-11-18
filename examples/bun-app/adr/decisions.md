---
id: ADR-0001
title: Choose a runtime for bun-app
status: accepted
date: 2026-11-18
tags: platform
decision: bun
---

## Goal
Pick one runtime for running, testing and packaging the service, with as little tooling as we can get away with.

## People
- Alex Rivera — decider
- Sam Chen — author

## Criteria
| id | criterion | weight | description |
| --- | --- | --- | --- |
| speed | Startup and install speed | 4 | Higher = faster local loop and CI. |
| tooling | Built-in tooling | 5 | Higher = fewer extra tools (test runner, bundler, TS). |
| maturity | Maturity | 3 | Higher = fewer surprises in production. |

## Solution: bun — Bun
| criterion | score |
| --- | --- |
| speed | 5 |
| tooling | 5 |
| maturity | 3 |

## Solution: node — Node.js
| criterion | score |
| --- | --- |
| speed | 3 |
| tooling | 3 |
| maturity | 5 |

---
id: ADR-0002
title: Keep decisions next to the code
status: accepted
date: 2026-11-18
parent: ADR-0001
tags: process
---

## Goal
Record decisions in `adr/decisions.md` in this repo, review them in pull requests, and view them with `bun run adr`.
