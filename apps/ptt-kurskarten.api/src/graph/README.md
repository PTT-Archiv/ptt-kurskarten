# Routing

This document describes how route planning currently works in the project.

The API implementation is the canonical source:

- `apps/ptt-kurskarten.api/src/graph/routing.ts`

The viewer contains a mirrored client-side implementation and should stay behaviorally aligned:

- `apps/ptt-kurskarten-ui/src/app/features/viewer/routing-client.ts`

If routing logic changes, update both files and their matching specs.

## Scope

The router works on a `GraphSnapshot`:

- nodes are places
- edges are directed services between places
- each edge has zero or more `trips`

The main exported entry points are:

- `computeEarliestArrival(snapshot, params)`
- `computeConnections(snapshot, params)`

## Data Model

Relevant shared types live in `packages/shared/src/index.ts`.

`ConnectionOption`

- one returned route option
- contains summary fields like `departs`, `arrives`, `durationMinutes`, `kind`
- contains the full path in `legs`

`ConnectionLeg`

- one concrete leg in the returned route
- references the original `edgeId` and `tripId`
- may have missing `departs` or `arrives` for partial-timetable legs
- carries absolute minute values when the router could compute them

`RouteResultKind`

- `COMPLETE_JOURNEY`
- `COMPLETE_PREFIX`
- `FOREIGN_START_FALLBACK`

## Time Handling

Internally the router uses absolute minutes, not only `HH:MM`.

Important helpers:

- `parseTime` converts `HH:MM` to minutes since midnight
- `formatTime` converts absolute minutes back to `HH:MM`
- `resolveTimeAtOrAfter` places a timetable time on the earliest valid day at or after a reference time
- `resolveArrivalMinutes` normalizes overnight arrivals

This means the router can handle:

- overnight trips
- partial day offsets
- routes that cross into the next day

## Normal Earliest-Arrival Search

`computeEarliestArrival` performs a time-dependent earliest-arrival search over the directed graph.

At a high level:

1. Build adjacency from the snapshot edges.
2. Start from the requested origin at the requested departure time.
3. Expand outgoing choices from the current node.
4. Keep the earliest known arrival per node.
5. Stop when the destination is settled or the search horizon is exceeded.
6. Backtrack stored predecessor info to reconstruct the final `legs`.

This is conceptually Dijkstra-style earliest-arrival routing:

- queue key: earliest known arrival time at a node
- state: current node plus time
- relax step: outgoing trip choices

## What Counts As A Direct Choice

`computeTripChoice` handles standard fully-timed travel on a single edge.

A trip is eligible here only if:

- `departs` is known
- `arrives` is known

For one edge with multiple fully-timed trips:

- the router selects the earliest departure at or after the required reference time
- its arrival becomes the candidate arrival for that edge

This is the highest-confidence routing path because no heuristic inference is needed.

## Partial-Time Heuristic

The project also supports a conservative heuristic for partial timetable data.

This is used for cases like:

- `A -> B: 20:00 -> ?`
- `B -> C: ? -> 21:45`

The goal is to expose plausible historical connections instead of forcing absurd long detours only because those detours are fully explicit.

### When The Heuristic Starts

`computePartialChainChoices` can start from any trip that has:

- a known departure

The first leg may be:

- departure only
- fully timed

The first leg may not be:

- arrival only
- both times unknown

That means:

- `20:00 -> ?` can start a heuristic chain
- `20:00 -> 20:40` can also start a heuristic chain
- `? -> 21:45` cannot start a route by itself

### Continuation Rules

After the first leg, `extendPartialChain` tries to continue from the intermediate node.

Each continuation candidate must keep:

- graph contiguity
- the same transport type
- no node loops

Continuation trips may be:

- departure only
- arrival only
- both unknown
- fully timed

### What Makes A Partial Chain Valid

A heuristic chain becomes a valid route only if:

- the chain starts with a known departure
- the chain eventually reaches a leg with a known arrival

So:

- `known departure -> ... -> known arrival` is valid
- a chain that never closes on a known arrival is discarded

### Both-Unknown Trips

Trips where both `departs` and `arrives` are missing are allowed only as internal bridge legs.

They are never valid as:

- a standalone route
- the first leg of a route
- the final timing anchor of a route

## How Ambiguity Is Resolved

The main complexity is deciding whether an intermediate hub has one plausible continuation or too many.

The current logic groups continuation candidates by outgoing edge, not by raw trip row. This matters because several timetable rows on the same edge should not automatically count as ambiguity.

Selection order in `selectContinuationCandidates`:

1. Prefer a direct outgoing edge to the requested destination.
2. Otherwise, prefer a unique outgoing edge whose destination can still reach the requested destination somewhere downstream.
3. Otherwise, if there is only one outgoing edge total, use that.
4. Otherwise, abort the heuristic chain as ambiguous.

This is intentionally conservative.

### Why This Matters

At a hub like Dürrmühle, there may be several outgoing services:

- directly to Oensingen
- to Balstall, which may also eventually reach Oensingen later

The direct edge to the requested destination should win over the indirect detour. That is now the explicit rule.

## Reachability Filter

`buildReachableToTarget` computes a reverse reachability set from the requested destination.

This set is used by the heuristic to answer:

- can this continuation edge still lead to the requested destination at all?

It does not guarantee that the eventual route is good. It only narrows down which continuations are even relevant to the current query.

## Result Construction

After search, the router backtracks predecessor data and returns a `ConnectionOption`.

Important details:

- `legs` always preserve the real segment path
- partial legs may have missing `departs` or `arrives`
- the route summary uses the first known departure and the final known arrival
- `durationMinutes` is computed only when both ends are known

## `computeConnections`

`computeConnections` returns several options, not only the single earliest arrival.

Current behavior:

- start with `computeEarliestArrival`
- then seed additional searches from candidate departure times available at the origin
- de-duplicate results by `edgeId:tripId` signature
- clamp result count to `k`, with hard bounds `3 <= k <= 10`

This is a pragmatic multi-option search, not a full k-shortest-path implementation.

## Outside-Dataset Cases

Two special result modes exist when the requested endpoints are not both fully represented in the current snapshot.

### `COMPLETE_PREFIX`

Used when:

- the destination is outside the dataset
- the origin is inside the dataset

Behavior:

- route to the closest in-dataset predecessor node
- append a continuation leg that points outside the snapshot

### `FOREIGN_START_FALLBACK`

Used when:

- the origin is outside the dataset
- the destination is inside the dataset

Behavior:

- build a preface leg from the foreign node into the dataset
- then continue with normal routing from the first in-dataset node

If arrival-only foreign prefaces exist, they are preferred over known-departure prefaces.

## Current Limits

The router is still heuristic. Important current limits:

- no explicit journey object or through-service identity exists
- no note parsing such as `via X, Y`
- no confidence score is exposed in the returned type
- no guarantee that a heuristic chain is the historically intended vehicle, only that it is plausible under the rules above
- `computeConnections` is still dominated by earliest-arrival logic, not by a richer ranking model

## Practical Example

The intended example is:

- `Solothurn -> Dürrmühle: 20:00 -> ?`
- `Dürrmühle -> Oensingen: ? -> 21:45`

This should be accepted because:

- the route starts with a known departure
- the route closes with a known arrival
- transport matches
- the continuation goes directly to the requested destination

This is exactly the kind of case the heuristic is meant to support.

## Maintenance Notes

When changing routing behavior:

1. Update `apps/ptt-kurskarten.api/src/graph/routing.ts`.
2. Mirror the same behavior in `apps/ptt-kurskarten-ui/src/app/features/viewer/routing-client.ts`.
3. Update both spec files:
   - `apps/ptt-kurskarten.api/src/graph/routing.spec.ts`
   - `apps/ptt-kurskarten-ui/src/app/features/viewer/routing-client.spec.ts`
4. Re-run both focused suites.
