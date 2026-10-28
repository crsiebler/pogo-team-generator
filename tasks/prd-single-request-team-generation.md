# Requirements: single-request team generation

Revision: 1 — October 21, 2026.
Status: requirements derived from the existing plan; implementation not started.
Source: [Single-request generation plan](../docs/single-request-generation-plan.md),
revision 1, and the user's request to generate and display a team with one request.

## Problem and desired outcome

The current UI generates a team, then fetches its display details separately.
The details-fetch effect can run twice in development Strict Mode. Users wait
for an additional loading step even though the server already has the selected
team and its exact scored movesets.

For users generating either a Pick 6 or GBL team, one accepted Generate action
must return a complete result ready for cards, exports, statistics, and analysis.
The result must preserve the exact team and movesets selected by the optimizer.

## Functional requirements

### FR-1 — One request per accepted generation action

One accepted Generate action must issue exactly one browser
`POST /api/generate-team`. That request must execute generation once and return
all data required to display and export the result.

Acceptance:

- No generation-triggered request is made to `/api/team-details`, including
  during development Strict Mode, result re-renders, or result remounts.
- The generation endpoint does not make an internal HTTP call to the details
  endpoint to assemble its response.
- Independent `/api/pokemon-list` requests used for format configuration remain
  allowed and are excluded from the generation request count.
- Each subsequent explicit Generate action or retry issues one new generation
  request. The Generate control remains disabled while generation is in flight.

### FR-2 — Complete, compatible generation response

Successful generation responses must include a required `pokemon` array with
display-ready records. Preserve the existing fields, meanings, diagnostic
labels, and mode-specific optionality of `team`, `fitness`,
`tournamentSelection`, `recommendedLineups`, `scoreBreakdown`,
`movesetAssignment`, and `analysis`.

Acceptance:

- Pick 6 responses contain six display records; GBL responses contain three.
- The array contains exactly one record per team member, in team order, with
  matching species IDs and no missing or additional members.
- Every record contains its assigned recommended moveset and structured
  acquisition requirements sufficient for the existing cards and export.
- Missing Pokémon records or invalid/inconsistent assignments cannot produce
  a successful partial response.

### FR-3 — Preserve scored moveset authority

Displayed and exported moves must come from the exact assignment used to score
the selected team. Consolidating the response must not select replacement moves.

Acceptance:

- The response retains the scored `movesetAssignment` unchanged.
- Pokémon details agree with that assignment's move IDs, applicable variant
  properties, authority metadata, and acquisition requirements.
- Existing manifest-backed and supported ranked-default assignment authorities
  remain supported with their current validation rules.
- The server preserves structural and current snapshot/ranking authority
  validation at the applicable boundary.
- Client components neither derive replacement movesets nor load server-owned
  Pokémon, ranking, or simulation datasets.

### FR-4 — Render and export directly from the generation result

The UI must use the validated generation response for all result presentation,
without a separate details-loading stage.

Acceptance:

- Pokémon cards, acquisition labels, statistics, recommended lineups, and
  analysis remain available with their existing presentation and meanings.
- Export contains the selected species, exact assigned moves, and acquisition
  notes from the same result shown by the cards.
- Re-rendering or remounting the result does not trigger a data fetch.
- A second successful generation displays and exports its own result without
  retaining Pokémon details or acquisition notes from the previous result.
- Existing format selection and format-specific Pokémon-list loading continue
  to function independently.

### FR-5 — Validate before displaying a result and preserve retry behavior

The client must validate the combined response before accepting it as a complete
result. Invalid or failed responses must use the existing generation error
experience and permit an explicit retry.

Acceptance:

- Reject incomplete, malformed, out-of-order, or assignment-mismatched Pokémon
  details; do not expose them as a complete or exportable team.
- Do not fall back to a details request when response validation fails.
- Preserve existing actionable format and missing-dataset errors.
- Beginning a new generation clears the previous result, as it does today.
- A failed generation followed by a successful explicit retry displays a
  complete, consistent result without stale cards or additional details calls.

### FR-6 — Retain the standalone details API for compatibility

The generation UI must stop using `/api/team-details`, but that endpoint remains
available for existing callers.

Acceptance:

- Preserve its public request and response shapes, bounded body handling,
  structural parsing, and assignment authority validation.
- For the same valid team and assignment, its Pokémon details are equivalent
  to those included in the combined generation response.
- Reuse the same server-side detail projection so the two responses do not
  acquire different moveset or acquisition behavior.

## Constraints and exclusions

- Optimizer behavior, candidate selection, scores, rankings, simulations, and
  moveset-selection policies are unchanged by this work.
- Keep React Strict Mode enabled. Removing development checks is not a solution
  to duplicate requests.
- Preserve strict TypeScript contracts, typed data loading, explicit errors,
  and the runtime prohibition on executing or bundling PvPoke vendor JavaScript.
- Preserve existing UI behavior and styling except removal of the separate
  details-loading stage. No visual redesign is included.
- No new dependencies, caching layer, background jobs, polling, or streaming.
- No removal of `/api/team-details` or associated route/build configuration.
- No target reduction in optimization time is specified. Measure generation
  and complete-display time without claiming that fewer requests accelerate
  the optimizer itself.
- Existing optimizer plans, evidence, and unrelated working-tree changes must
  be preserved. This document does not authorize implementation, deployment,
  service restarts, dependency installation, or configuration changes.

## Verification requirements

Acceptance requires meaningful automated and rendered evidence:

- API and projection tests demonstrate complete, ordered responses, unchanged
  scored assignments, compatibility, and explicit failure for invalid details.
- A Strict Mode integration test exercises the actual result-display components
  and counts requests at the network boundary. Mocking away the component that
  currently fetches details is insufficient evidence for FR-1.
- Test Play! Pokémon Pick 6 and a supported GBL format, malformed responses,
  failure then retry, repeat generation, and card/export consistency.
- Confirm in the rendered development app that one Generate action produces
  one generation POST, no details requests, complete cards, usable export, and
  populated analysis with Strict Mode still enabled.
- Typecheck, lint, formatting, focused/full tests, coverage, production build,
  and runtime asset-trace checks must satisfy repository requirements. Do not
  weaken assertions or hide failures to report success.

The implementation plan contains the verification commands. Previously observed
build-worker port permission failures and full-coverage instrumentation timeouts
are verification risks to reassess during execution. Report unresolved failures
as verification gaps; prior successful checks do not verify the new change.

## Dependencies and open questions

The work depends on existing typed Pokémon loaders, assignment validation and
detail projection, the generation API, and the current card/export consumers.
Contributor guidance that currently requires a client details fetch must be
updated consistently with the consolidated contract during implementation.

No product question blocks this scope. Retaining the compatibility endpoint and
excluding independent format-configuration requests are carried forward from
the source plan. Endpoint removal or broader generation-performance work would
require separate scope decisions.
