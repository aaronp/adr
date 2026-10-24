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
Pick a durable event backbone so order, inventory and notification services stop calling each other synchronously, and new consumers can be added without changing producers.

## Hypothesis
- We believe: moving order and inventory events onto a managed, replayable log
- Will result in: services that can be added or changed without coordinating releases with the teams that produce events
- Measured by: a new consumer reaches production in under a day, and no event change needs a cross-team release by Q2 2027.

## People
- Priya Shah — decider
- Tom Okafor — author
- Mei Lin — consulted
- Daniel Ruiz — consulted
- Sara Kowalski — informed

## Criteria
| id | criterion | weight | description |
| --- | --- | --- | --- |
| ops | Operational burden | 5 | On-call load, upgrades and tuning for a small platform team. Higher = less burden. |
| throughput | Peak throughput | 4 | Sustains our projected seasonal peak with headroom, without re-partitioning. |
| ecosystem | Ecosystem & connectors | 3 | Ready-made sinks for the warehouse, search index and change-data capture. |
| cost | Cost at projected volume | 4 | Twelve-month run cost at forecast volume, including egress. |
| familiarity | Team familiarity | 2 | What the team already knows; affects time to first production event. |

## Solution: kafka — Managed Kafka
Hosted Kafka with tiered storage; Kafka Connect for sinks and change-data capture.

| criterion | score |
| --- | --- |
| ops | 3 |
| throughput | 5 |
| ecosystem | 5 |
| cost | 3 |
| familiarity | 4 |

Pros:
- Largest connector ecosystem
- Replay from any offset with tiered storage
- Two engineers have run it in production

Cons:
- Partition planning is still on us
- Most expensive option at low volume

## Solution: kinesis — Kinesis Data Streams
Fully managed streams with on-demand capacity.

| criterion | score |
| --- | --- |
| ops | 5 |
| throughput | 4 |
| ecosystem | 3 |
| cost | 3 |
| familiarity | 2 |

Pros:
- Nothing to operate
- Scales shards on demand

Cons:
- Shorter retention than Kafka
- Ties every consumer to one cloud SDK

## Solution: nats — NATS JetStream
Lightweight server with persistence, self-hosted on our cluster.

| criterion | score |
| --- | --- |
| ops | 4 |
| throughput | 4 |
| ecosystem | 2 |
| cost | 5 |
| familiarity | 1 |

Pros:
- Very low resource cost
- Simple subject-based routing

Cons:
- Few off-the-shelf sinks
- No one on the team has run it

## Solution: outbox — Postgres outbox + polling
Write events to an outbox table; workers poll and fan out.

| criterion | score |
| --- | --- |
| ops | 4 |
| throughput | 2 |
| ecosystem | 1 |
| cost | 5 |
| familiarity | 5 |

Pros:
- No new infrastructure
- Transactional with the business write

Cons:
- Polling load grows with every consumer
- No replay beyond table retention

## Decision
Managed Kafka scores highest overall and is the only option with sink connectors we would otherwise have to build. Operational burden is the main risk: we accept it by using the managed tier, and revisit after two quarters of on-call data.

---
id: ADR-0013
title: Adopt one schema format for service contracts
status: proposed
date: 2026-10-10
revisit: 
tags: api, contracts
decision: 
---

## Goal
Agree one way to describe request, response and event payloads, so that types, runtime validation and documentation all come from a single definition.

## Hypothesis
- We believe: defining every service contract once, as a schema that generates both types and validators,
- Will result in: fewer contract mismatches between services reaching production
- Measured by: contract-related incidents drop to zero for two consecutive quarters after rollout.

## People
- Priya Shah — decider
- Mei Lin — author
- Jonas Weber — consulted
- Aisha Khan — consulted
- Sara Kowalski — informed

## Criteria
| id | criterion | weight | description |
| --- | --- | --- | --- |
| types | Generated types & validation | 5 | One definition yields runtime validation and static types in TypeScript services. |
| evolution | Schema evolution rules | 4 | Clear compatibility rules for adding and deprecating fields. |
| readability | Human readability | 3 | Reviewable in a pull request without extra tooling. |
| tooling | Fit with our toolchain | 3 | Works with our TypeScript build, docs generator and API gateway. |

## Solution: typebox — TypeBox (JSON Schema)
Define schemas in TypeScript; emit standard JSON Schema for other consumers.

| criterion | score |
| --- | --- |
| types | 5 |
| evolution | 3 |
| readability | 4 |
| tooling | 5 |

Pros:
- Static types and validators from one source
- Plain JSON Schema for non-TypeScript consumers

Cons:
- Compatibility rules are a convention, not enforced

## Solution: protobuf — Protocol Buffers
IDL files compiled to typed clients; binary on the wire.

| criterion | score |
| --- | --- |
| types | 5 |
| evolution | 5 |
| readability | 2 |
| tooling | 3 |

Pros:
- Strict, well-known evolution rules
- Compact payloads

Cons:
- Code generation step in every repository
- Binary payloads are harder to debug

## Solution: avro — Avro with a registry
Schemas stored in a registry that enforces compatibility.

| criterion | score |
| --- | --- |
| types | 3 |
| evolution | 5 |
| readability | 2 |
| tooling | - |

Pros:
- Registry enforces compatibility

Cons:
- Another service to run
- Weak TypeScript support

## Solution: jsonschema — Hand-written JSON Schema
Author JSON Schema files directly and generate types from them.

| criterion | score |
| --- | --- |
| types | 2 |
| evolution | 3 |
| readability | 3 |
| tooling | 4 |

Pros:
- No new dependencies

Cons:
- Verbose to write by hand
- Types drift from schemas

## Decision

---
id: ADR-0011
title: Run our own feature-flag service
status: accepted
date: 2026-07-02
revisit: 2026-11-01
tags: delivery
decision: oss
---

## Goal
Ship changes dark and roll them out gradually per tenant, without a deploy for each step.

## Hypothesis
- We believe: running our own flag server with gradual, per-tenant rollouts
- Will result in: smaller, safer releases and faster rollback
- Measured by: median time to roll back a bad change falls below five minutes.

## People
- Daniel Ruiz — decider
- Sara Kowalski — author
- Tom Okafor — consulted
- Mei Lin — informed

## Criteria
| id | criterion | weight | description |
| --- | --- | --- | --- |
| targeting | Targeting rules | 4 | Percentage rollouts and per-tenant targeting. |
| selfhost | Self-hosting option | 3 | Can run inside our network for regulated tenants. |
| sdks | SDK coverage | 4 | Server and browser SDKs for the languages we use. |
| cost | Cost | 3 | Annual cost at current seat count and request volume. |

## Solution: saas — Hosted flag service
Commercial SaaS with a dashboard, audit log and experiments.

| criterion | score |
| --- | --- |
| targeting | 5 |
| selfhost | 1 |
| sdks | 5 |
| cost | 2 |

Pros:
- Polished UI and audit trail
- Experiments built in

Cons:
- No self-hosting
- Priced per seat

## Solution: oss — Open-source flag server
Self-hosted open-source server with official SDKs.

| criterion | score |
| --- | --- |
| targeting | 4 |
| selfhost | 5 |
| sdks | 4 |
| cost | 4 |

Pros:
- Runs inside our network
- No per-seat cost

Cons:
- We own upgrades and uptime

## Solution: env — Flags in environment variables
Flags as environment variables, changed by deploy.

| criterion | score |
| --- | --- |
| targeting | 1 |
| selfhost | 5 |
| sdks | 3 |
| cost | 5 |

Pros:
- Zero new tooling

Cons:
- Every change needs a deploy
- No gradual rollout

## Decision
The only option that allows self-hosting for regulated tenants while keeping gradual rollouts. Revisit once we know the real upgrade cost.

---
id: ADR-0009
title: Move services into a monorepo
status: accepted
date: 2026-03-20
revisit: 2026-10-01
tags: tooling, delivery
decision: mono
---

## Goal
Make cross-service changes cheap enough that we stop copying shared code between repositories.

## Hypothesis
- We believe: moving services into one repository with cached, affected-only builds
- Will result in: shared-code changes landing in one review instead of many
- Measured by: copied utility modules are gone, and p90 CI time stays under 15 minutes.

## People
- Jonas Weber — decider
- Aisha Khan — author
- Priya Shah — consulted
- Tom Okafor — consulted

## Criteria
| id | criterion | weight | description |
| --- | --- | --- | --- |
| refactor | Cross-service refactors | 5 | Change a shared library and all its callers in one reviewable change. |
| ci | CI time | 4 | Time from push to green for a typical change. |
| ownership | Ownership boundaries | 3 | Clear code ownership and access control per team. |

## Solution: mono — Monorepo with build caching
One repository; affected-only builds with a remote cache.

| criterion | score |
| --- | --- |
| refactor | 5 |
| ci | 3 |
| ownership | 3 |

Pros:
- Atomic cross-service changes
- One toolchain to maintain

Cons:
- Needs build caching to keep CI fast
- Coarser access control

## Solution: poly — One repository per service
Keep the current layout; publish shared libraries as packages.

| criterion | score |
| --- | --- |
| refactor | 2 |
| ci | 4 |
| ownership | 5 |

Pros:
- Familiar to everyone
- Fine-grained permissions

Cons:
- Version skew across services
- Shared-library changes need many pull requests

## Decision
Atomic refactors outweigh coarser permissions; the CI-time risk is mitigated with remote caching. Revisit after six months of CI data.

---
id: ADR-0014
title: Standardise client state on a global store
status: rejected
date: 2026-08-21
revisit: 
tags: frontend
decision: 
---

## Goal
Decide whether all client-side state should live in a single global store.

## Hypothesis
- We believe: a single global store for all client state
- Will result in: more predictable UI behaviour across teams
- Measured by: fewer state-related bugs reported per release.

## People
- Aisha Khan — decider
- Mei Lin — author
- Jonas Weber — consulted

## Criteria
| id | criterion | weight | description |
| --- | --- | --- | --- |
| boilerplate | Boilerplate | 3 | Code needed for a typical feature. Higher = less code. |
| devtools | Debugging tools | 2 | State inspection and time-travel debugging. |
| servercache | Server-state caching | 4 | Caching, refetching and invalidation of API data. |

## Solution: store — Global store library
One store with actions and reducers for all client state.

| criterion | score |
| --- | --- |
| boilerplate | 2 |
| devtools | 5 |
| servercache | 2 |

Pros:
- Excellent debugging tools
- One pattern everywhere

Cons:
- Lots of boilerplate
- Server data has to be cached by hand

## Solution: query — Query cache + local state
A query cache for server data; component state for the rest.

| criterion | score |
| --- | --- |
| boilerplate | 4 |
| devtools | 4 |
| servercache | 5 |

Pros:
- Server caching built in
- Little boilerplate

Cons:
- Two patterns to learn

## Decision
The proposal was rejected. Most of our client state is server data, which a query cache already handles with far less code.

---
id: ADR-0006
title: Store web sessions in Redis
status: superseded
date: 2025-11-04
revisit: 
tags: infrastructure, auth
decision: redis
---

## Goal
Choose where web sessions live so that every request can read them quickly.

## Hypothesis
- We believe: keeping sessions in a replicated Redis cluster
- Will result in: faster authenticated page loads
- Measured by: p95 session lookup stays under 2 ms.

## People
- Tom Okafor — decider
- Daniel Ruiz — author

## Criteria
| id | criterion | weight | description |
| --- | --- | --- | --- |
| latency | Read latency | 4 | Session lookup happens on every request. |
| durability | Durability | 3 | Sessions survive a node restart or failover. |
| ops | Operational burden | 3 | Extra infrastructure to run. Higher = less burden. |

## Solution: redis — Redis cluster
Sessions in a replicated Redis cluster.

| criterion | score |
| --- | --- |
| latency | 5 |
| durability | 2 |
| ops | 3 |

Pros:
- Sub-millisecond reads

Cons:
- Sessions can be lost on failover without persistence

## Solution: table — Database sessions table
Sessions in the primary Postgres database.

| criterion | score |
| --- | --- |
| latency | 2 |
| durability | 5 |
| ops | 3 |

Pros:
- Durable, no new service

Cons:
- Adds load to the primary on every request

## Decision
Chosen for read latency. Superseded when we moved to stateless signed sessions.
