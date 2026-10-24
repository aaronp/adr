# Decision file format

A decisions file is one markdown file holding any number of architecture
decision records (ADRs), one after another.

The format is forgiving: a record needs only a **title**. Everything else is
optional and has a sensible default. Names and keys match in any case, and text
the format has no field for is kept in the record's **Notes**, so the app never
loses it when it saves the file.

## Minimal example

```markdown
---
title: Use Postgres for the orders service
---
We need a database for orders that the team already knows how to run.
```

This is a complete file: one proposed record, `ADR-0001`, whose goal is the
sentence under the front matter.

## Full example

```markdown
---
id: ADR-0012
title: Choose an event streaming platform
status: accepted
date: 2026-09-14
revisit: 2027-03-14
tags: data, infrastructure
decision: kafka
---

## Goal
Give order, payment and inventory services one durable, replayable event log.

## Hypothesis
- We believe: moving order events onto a managed, replayable log
- Will result in: services that can change without coordinated releases
- Measured by: a new consumer reaches production in under a day

## People
- Priya Shah — decider
- Tom Okafor — author
- Data platform team; SRE — consulted
- Finance — informed

## Criteria
| id | criterion | weight | description |
| --- | --- | --- | --- |
| ops | Operational burden | 5 | Higher = less on-call load. |
| cost | Running cost | 3 | Higher = cheaper at our volume. |
| fit | Ecosystem fit | 4 | Higher = more existing connectors. |

Mandatory: the platform must run in the EU region.

## Solution: kafka — Managed Kafka
The provider's managed Kafka tier.

| criterion | score |
| --- | --- |
| ops | 3 |
| cost | 3 |
| fit | 5 |

Pros:
- Sink connectors we would otherwise build
- Replay and retention built in

Cons:
- Partition planning is on us

## Solution: sqs — SQS + SNS
| criterion | score |
| --- | --- |
| ops | 5 |
| cost | 4 |
| fit | - |

Pros:
- No servers to run

Cons:
- No replay

## Decision
Managed Kafka scores highest and is the only option with the connectors we need.
We accept the operational load by using the managed tier, and revisit after two
quarters of on-call data.

## Notes
Benchmarks are in the platform team's wiki.
```

The "Mandatory: …" line under the criteria table has no field of its own, so
the app keeps it by moving it into **Notes** when it saves the file.

## Records

Each record starts with front matter between two `---` lines. The record runs
until the next `---` line that starts another record's front matter.

### Front matter

| Key | Meaning | Default |
| --- | --- | --- |
| `title` | The decision, phrased as what is being chosen. **Required.** | — |
| `id` | Unique id, `ADR-0012` by convention | the next free `ADR-NNNN` |
| `status` | `proposed`, `accepted`, `superseded`, `deprecated` or `rejected` | `proposed` (also for unknown values) |
| `date` | When it was decided or proposed, `YYYY-MM-DD` | none ("Undated") |
| `revisit` | When to check the hypothesis again, `YYYY-MM-DD` | none |
| `tags` | Comma-separated labels (`[a, b]` works too) | none |
| `decision` | The chosen solution, by id or name | none (undecided) |

Keys match in any case, unknown keys are ignored, and a `# comment` after a
value is ignored. If two records share an id, the later one gets the next free
`ADR-NNNN`.

### Sections

Sections are `##` headings, in any order and any case. All are optional.

| Section | Contents |
| --- | --- |
| `## Goal` | What the decision must achieve. Text between the front matter and the first section is part of the goal too. |
| `## Hypothesis` | Up to three lines: `- We believe: …`, `- Will result in: …`, `- Measured by: …` (the `-` is optional). |
| `## People` | One line per person: `- Name — role`. |
| `## Criteria` | A table of what the options are judged on. |
| `## Solution: id — Name` | One per option: a summary, a score table, and pros and cons. |
| `## Decision` | The rationale and consequences. |
| `## Notes` | Anything else worth keeping. |

Any other section (say `## Context`) is kept in Notes under its heading.
Deeper headings (`###`) inside a section are part of its text.

### People

```markdown
- Priya Shah — decider
- Data platform team; SRE — consulted
- Business owner — proposed decider; unassigned
```

- The role is `decider`, `author`, `consulted` or `informed`. Plurals and
  close words work too ("consultees", "deciders", "approver", "contributors").
- `—`, `–`, `--` or ` - ` separates the name from the role.
- Several names can share a line, separated by `;`.
- Other words in the role part are kept with the name, so the last line above
  reads as "Business owner (proposed, unassigned)", a decider.
- A line with no role is "consulted".

### Criteria

```markdown
| id | criterion | weight | description |
| --- | --- | --- | --- |
| ops | Operational burden | 5 | Higher = less on-call load. |
```

- Columns are found by name, in any order; any of them may be left out. The
  `| --- |` separator row is optional.
- `id` is lower-case kebab-case. Without one it is made from the name
  (`Running cost` → `running-cost`).
- `weight` is 1 (nice to have) to 5 (critical). Blank means 1.
- Text under the table goes into Notes.

### Solutions

```markdown
## Solution: kafka — Managed Kafka
## Solution: Managed Kafka
## Option: Managed Kafka
```

- Without an id, the id is made from the name (`managed-kafka`).
- Text before the score table, or between it and the pros and cons, is the summary.
- The score table has `criterion` and `score` columns. The criterion can be
  its id or its name. Scores are 1–5; `-`, `?`, `n/a` or blank mean "not scored
  yet", which is never treated as zero. A criterion with no row is unscored.
- `Pros:` and `Cons:` (any case, bold or not) start bullet lists. Bullets may
  use `-` or `*`.

## Errors

A file is rejected only when part of it cannot be read. The error names the
line:

- a record with no `title:`;
- a `date` or `revisit` that is not a real `YYYY-MM-DD` date;
- a weight or score that is not a whole number 1–5;
- front matter that never closes with `---`;
- text before the first record's `---`.

## How the app saves

When the app saves (or "tidies") a file, it writes every record in the
standard layout of the full example above: every front-matter key, the sections
in order, and any kept text under `## Notes`. Reading that file back gives the
same records.

The app also checks what you fill in when you save from the form: the title is
present, ids and names are unique, the revisit date falls after the decision
date, and the decision names one of the solutions. Nothing else is required.
A record can be saved with no people, criteria or solutions yet.
