> Historical revision 3 draft. The canonical, prepared revision 4 is now
> [the root implementation plan](../PLAN.md). Its previous plan-path conflict
> was resolved by verified archival of the completed optimizer plan.

# Implementation plan: single-request team generation

## Objective and context

- Objective: one accepted Generate action returns a complete, display-ready
  team with exactly one generation request and no follow-up details fetch.
- Sources: [requirements revision 1](../tasks/prd-single-request-team-generation.md),
  FR-1 through FR-6, and the repository paths inspected below.
- Plan revision: 3 — October 21, 2026; requirements scope remains revision 1.
- Status: draft pending explicit plan-path selection; implementation not started.
- Scope / non-goals: consolidate generation and display data; preserve optimizer
  behavior and the compatibility details endpoint. Exclusions are detailed below.
- Working branch: pending execution-time confirmation; no branch change planned
  or performed during preparation.
- Authorization gaps: the skill's default `PLAN.md` contains the unfinished
  optimizer plan. This alternate path was not explicitly selected by the user.
  Preserve the existing root plan until the user resolves the plan location.
- Verification: scoped tests, Strict Mode browser/network verification, and the
  repository commands listed below; none run during planning.
- Assumptions / open questions: no product-scope questions; canonical plan-path
  selection remains unresolved.

Scope baseline: [Requirements: single-request team generation](../tasks/prd-single-request-team-generation.md),
revision 1, FR-1 through FR-6, constraints, and verification requirements.
This revision reconciles the existing plan with that document without expanding
scope. The original request is to combine the generation and details APIs so
only one request is made to generate and display a team.

One accepted Generate action must issue exactly one `POST /api/generate-team`,
which returns everything required for cards, moves, acquisition requirements,
exports, statistics, and analysis. It must issue no `/api/team-details` request,
including in development Strict Mode. The independent `/api/pokemon-list`
request used to configure a format remains outside this generation operation.

The existing optimizer `PLAN.md` and its evidence remain intact. This document
owns only the API/display consolidation. No optimizer, ranking, simulation,
scoring, moveset-selection, or visual redesign is included. Do not change Strict
Mode, introduce dependencies, or add caching, polling, jobs, or streaming.
The consolidation removes round trips; it does not promise to reduce optimizer
execution time.

Compatibility decision: keep `/api/team-details` available with its existing
request validation and response shape, but remove it from the generation UI
path. Both routes reuse the same detail projection. Route deletion and its
associated build/tracing changes are outside this plan.

Authority: planning only. No implementation, branch/worktree changes, commits,
deployment, service restarts, or configuration changes are authorized by this
document. Implementation should preserve the current working tree and unrelated
changes. Branch preparation remains an execution-time decision.

## Approach and dependencies

- `TeamManager.tsx` sends the generation request and stores the scored team and
  assignment, but the response has no display-ready Pokémon records.
- `ResultsPanel.tsx` mounts `TeamDisplay.tsx` after generation.
- `TeamDisplay.tsx:93` fetches `/api/team-details` in an effect. It validates the
  returned order, moves, assignment authority fields, and acquisition metadata.
- `next.config.ts` enables Strict Mode. The mount effect explains the duplicate
  details-fetch path in development; generation itself is event-driven.
- `app/api/team-details/route.ts` parses and validates the submitted assignment
  before looking up Pokémon and calling `getAssignedMovesetDetails`. Preserve
  these protections; do not reselect moves for the generated team.
- `app/api/generate-team/route.ts` already has the exact scored assignment and
  returns diagnostics and analysis. Add details to that response rather than
  making an internal HTTP call to the details route.
- `lib/build/runtimeFunctionAssets.ts` already includes Pokémon and moves data
  in the generation route's asset plan. Verify the actual resulting trace;
  do not assume that existing assets guarantee a passing production build.
- `components/AGENTS.md` currently prescribes passing the assignment to the
  details endpoint. Update that instruction during implementation to describe
  the consolidated response while preserving assignment authority.

Read applicable repository instructions and the installed Next.js guides under
`node_modules/next/dist/docs/` before implementation. Relevant skills are
`develop-code` and, for rendered integration verification, `verify-interface`.
Optimizer behavior is outside this change.

## Contract and failure behavior

Extend the existing generation response with a required `pokemon` array. Retain
all current fields and meanings: `team`, `fitness`, `tournamentSelection`,
`recommendedLineups`, `scoreBreakdown`, `movesetAssignment`, and `analysis`.
Optional fields remain optional according to the existing mode contract.

Define shared TypeScript response/display types in `lib/types.ts` or a narrowly
scoped shared types module. Each display record must include its assigned
recommended moveset and acquisition requirements. The array must contain exactly
one record per team member, in the same order; species IDs and moves must agree
with the scored assignment.

Extract a small server-side projection helper, for example `lib/teamDetails.ts`,
using existing typed Pokémon loaders and `getAssignedMovesetDetails`. Reuse the
existing assignment parser/authority validator at the appropriate server
boundary. Do not introduce alternative authority rules or import server data
loaders into client modules. Missing records must produce an explicit error,
not a successful partial team created by filtering out nulls.

Move/adapt the existing response-to-assignment consistency check into a
client-safe validator. Validate the combined response before committing result
state. On a failed request, malformed/mismatched details, or an incomplete team,
show the existing generation error and allow an explicit retry. Never fall back
to an extra details fetch or show an exportable partial result. Preserve the
current behavior that clears the prior result when a new generation begins.

## Ordered stories and dependencies

Dependency graph: `API-001 → UI-002 → VERIFY-003`.
All IDs are unique, dependencies exist, and there are no self-dependencies or
cycles. VERIFY-003 owns acceptance of the complete one-request user flow.
Recommended expertise below is advisory; no agents are dispatched by this plan.
API-001 establishes the response contract consumed by UI-002. VERIFY-003 follows
both because it must test the real combined server/client flow. During each
implementation story, write its regression before the production change; the
final verification story does not defer all testing until integration.

### API-001 — Return complete details with the generation response

- [ ] Story complete
- Priority: 1
- Depends on: none
- Phase / requirements: FR-1 (one generation, no internal HTTP details call),
  FR-2 (complete compatible response), FR-3 (scored authority), FR-5 (server
  failure behavior), FR-6 (standalone details compatibility).
- User story: As a user, I receive the complete scored team and display/export
  data together, with no second request needed to retrieve its details.
- Recommended agents: `@backend-developer` for shared projection and API tests.
- Relevant paths: `lib/types.ts`, proposed `lib/teamDetails.ts`,
  `app/api/generate-team/route.ts`, `app/api/team-details/route.ts`, their tests,
  and relevant scoped contributor instructions.

#### Acceptance criteria

- [ ] Add failing route/helper regressions before changing production behavior.
- [ ] Successful Pick 6 and GBL responses include respectively six and three
      ordered display records with moves and acquisition requirements matching the
      returned assignment. Cover manifest and supported ranked-default authorities.
- [ ] Species IDs, count, ordering, variant properties, authority metadata, and
      acquisition requirements agree with the assignment; there are no missing,
      duplicate, or additional display records. The scored assignment is unchanged.
- [ ] Generation executes once and obtains details through the shared helper;
      it does not call the details route over HTTP or run moveset selection again.
- [ ] Missing records or invalid/inconsistent assignments fail explicitly before
      a successful response is returned. Preserve existing format and dataset errors.
- [ ] `/api/team-details` retains its public contract, bounded request handling,
      structural parsing, and current authority validation. Both routes produce
      equivalent display records for the same valid team and assignment.
- [ ] Existing generation response fields, meanings, mode-specific optionality,
      and diagnostic labels remain intact. Shared response types make required
      display details explicit without making previously optional diagnostics mandatory.

### UI-002 — Render the generation payload without a details request

- [ ] Story complete
- Priority: 1
- Depends on: API-001
- Phase / requirements: FR-1 (one browser request), FR-2 (consume the complete
  contract), FR-3 (unchanged moves), FR-4 (render/export), FR-5 (validation/retry).
- User story: As a user, I see and export the complete generated team directly
  from its response, with consistent moves and no follow-up loading step.
- Recommended agents: `@frontend-developer` for state/props and client validation.
- Relevant paths: `TeamManager`, `ResultsPanel`, `TeamDisplay`, their tests, a client-safe
  response validator if extracted, and `components/AGENTS.md`.

#### Acceptance criteria

- [ ] Write failing request-count and response-consistency regressions first.
- [ ] `TeamManager` validates and stores `pokemon` with the scored result and
      passes it through `ResultsPanel` to `TeamDisplay` without changing movesets.
- [ ] `TeamDisplay` renders from props; remove its details-fetch effect, local
      fetched-data state, and separate details-loading stage. Keep Strict Mode enabled.
- [ ] Cards, acquisition labels, exports, statistics, and analysis reflect the
      same response. Export retains the exact assigned moves and acquisition notes.
- [ ] A malformed, incomplete, out-of-order, or mismatched payload produces the
      existing error experience, with no fallback request and no partial export.
- [ ] Starting a new generation clears the previous result. Request failure or
      response validation failure permits an explicit retry without stale details
      or acquisition notes. Existing format and dataset error messages are preserved.
- [ ] Re-rendering and remounting the result do not send network requests.
      Repeated explicit generation actions each send one request and display their
      own complete results. The existing in-flight Generate control remains disabled.
- [ ] Format selection and its Pokémon-list loading continue to work independently.
- [ ] Client validation and display do not import server-owned data loaders or
      derive replacement movesets. Update the scoped component instructions to
      describe the consolidated response without weakening assignment preservation.

### VERIFY-003 — Verify the integrated one-request flow and runtime boundaries

- [ ] Story complete
- Priority: 1
- Depends on: UI-002
- Phase / requirements: integrated acceptance owner for FR-1 through FR-6 and
  all verification requirements; API-001 and UI-002 supply its prerequisites.
- User story: As a user, I can generate, view, export, retry, and regenerate a
  complete team with one request per accepted action in either supported mode.
- Recommended agents: `@test-automator` for the integration regression and
  `@frontend-developer` for the rendered network/export check.
- Relevant paths: integration tests alongside `TeamManager`, existing API/component tests,
  and existing architecture/asset-trace checks.

#### Acceptance criteria

- [ ] Use a Strict Mode integration test that mounts the real `ResultsPanel`
      and `TeamDisplay`; existing manager tests mock these children and cannot alone
      detect their follow-up fetches. Intercept the network boundary, not the behavior
      being tested. Fail if any generation-triggered request targets `/api/team-details`.
- [ ] After configuration has loaded, one Generate interaction produces exactly
      one generation POST, complete cards, working export, and populated analysis.
      Exercise both Play! Pokémon Pick 6 and a supported GBL format.
- [ ] Verify failure followed by an explicit successful retry, and a second
      successful generation, without stale cards, wrong acquisition notes, or extra
      details requests. Preserve ordinary setup requests in the request assertions.
- [ ] Cover both HTTP failure and malformed successful responses. Verify that
      the previous result clears when generation starts and the Generate control
      stays disabled in flight. Result re-renders and remounts issue no requests.
- [ ] Confirm the retained details endpoint still enforces its request and
      authority protections and returns the same display records as generation for
      the same valid team/assignment, including supported ranked-default fallback.
- [ ] In the rendered development app with Strict Mode enabled, inspect the
      network log for the same one-request behavior and verify card/export parity
      with the returned assignment. Record generation and total display time without
      promising an optimizer speedup.
- [ ] Focused and full tests, typecheck, lint, changed-file formatting, coverage,
      build, and production trace checks satisfy repository requirements. Keep
      existing assertions and runtime/vendor rules. An unresolved required failure
      leaves this acceptance item incomplete and is reported as a handoff gap;
      reporting the failure alone does not satisfy the gate.

## Verification commands for execution

Run focused tests against the actual helper/validator paths chosen at execution:

```sh
npx vitest run app/api/generate-team/route.test.ts app/api/team-details/route.test.ts
npx vitest run components/organisms/TeamManager/TeamManager.test.tsx components/organisms/TeamDisplay/TeamDisplay.test.tsx
npx vitest run lib/architecture/pvpokeRuntimeBoundary.test.ts lib/build/runtimeFunctionAssets.test.ts
npx next typegen
npx tsc --noEmit
npm run lint
npm test
npm test -- --coverage
npm run build
npm run analyze:generate-team-trace
```

Include newly added helper, ResultsPanel, and real-child integration tests in
the focused run. Use the installed Prettier executable to check/format only
changed files. These commands are planned verification, not results of this plan.

Prior v4 verification encountered a build-worker port permission failure and
three full-coverage instrumentation timeouts. Reassess those conditions during
execution; do not weaken assertions, disable Strict Mode, or alter configuration
to manufacture a passing result. Trace verification depends on a successful
current build. Starting/restarting services, changing build configuration, or
installing dependencies remains subject to the repository's permission rules.

## Handoff and acceptance coverage

| Requirement                                                               | Contributing stories | Integrated acceptance owner |
| ------------------------------------------------------------------------- | -------------------- | --------------------------- |
| FR-1: one accepted action, one request; Strict Mode and setup distinction | API-001, UI-002      | VERIFY-003                  |
| FR-2: complete ordered details; compatible response and optional fields   | API-001, UI-002      | VERIFY-003                  |
| FR-3: exact scored assignment, current authority, no client selection     | API-001, UI-002      | VERIFY-003                  |
| FR-4: cards, export, analysis, remounts and repeat-generation consistency | UI-002               | VERIFY-003                  |
| FR-5: invalid response rejection, clear previous result, explicit retry   | API-001, UI-002      | VERIFY-003                  |
| FR-6: retained details endpoint, validation, equivalent shared projection | API-001              | VERIFY-003                  |
| Constraints and exclusions; meaningful automated/rendered evidence        | API-001, UI-002      | VERIFY-003                  |

The requirements-to-stories review covers every functional requirement and its
conditions, including manifest/fallback authorities, malformed payloads, disabled
in-flight generation, setup requests, and real display-component integration.
The reverse review adds no optimizer work, visual redesign, route deletion,
dependencies, background mechanisms, or timing target. Implementation details
serve the documented outcomes rather than creating additional product scope.

No product clarification or acceptance-coverage gap blocks this plan. The
dependency order is API-001, UI-002, VERIFY-003. Recommended expertise remains
backend-developer, frontend-developer, and test-automator; execution can be
sequential without delegation. All completion markers remain unchecked.

Execution handoff gaps include explicit plan-path selection, implementation
authorization, and any runtime permissions needed for verification. The skill
requires the default root `PLAN.md` unless the user specifies another path;
that root file contains unfinished optimizer work and must not be replaced as
a planning side effect. A current build and coverage run
must establish whether the previously observed environment issues still apply.
Do not classify those historical issues as current failures without attempting
the relevant checks during authorized execution. The compatibility endpoint is
intentionally retained; its eventual removal is separate work.

This is a draft implementation checklist pending plan-path selection, not
implementation approval or a claim of verification. No application code,
tests, dependencies, or configuration were changed while preparing it.
