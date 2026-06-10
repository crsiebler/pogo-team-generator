# PRD: Battle Frontier Master Support

## Introduction

Add full support for the `Battle Frontier (Master)` battle format, including its cycle-specific point system and team legality rules. This format already has rankings and simulation datasets in the repository, but the application does not yet enforce its unique roster-construction constraints.

This work will make `battle-frontier-master` behave as a first-class format across data loading, team validation, team generation, and user-facing error handling. The key format rules for this cycle are:

- Teams may spend at most 11 total points.
- Teams may include at most one 5-point Pokemon.
- Teams may include at most one Mega Pokemon.
- Point values are cycle-specific and must be stored in a checked-in CSV file under `data/`.
- Shadow variants of listed species inherit the same point value as their base form when that shadow variant exists in project data and rankings.

## Goals

- Enforce Battle Frontier Master legality rules consistently in API validation and team generation.
- Store the cycle point table in a checked-in CSV file that is easy to update next cycle.
- Ensure shadow variants inherit base point costs for listed species.
- Reject illegal anchor selections with deterministic, user-facing error messages.
- Show live anchor point usage for Battle Frontier Master as `(# / 11 points)`.
- Prevent the generator from producing illegal Battle Frontier Master teams.
- Preserve existing behavior for all non-Battle Frontier Master formats.

## User Stories

### US-001: Store Battle Frontier Master cycle points in data

**Description:** As a developer, I want the Battle Frontier Master point table stored in a CSV file so that future cycles can be updated without changing validation logic.

**Acceptance Criteria:**

- [ ] Add a checked-in CSV file under `data/` for Battle Frontier Master cycle point values.
- [ ] The CSV uses canonical internal identifiers that match project Pokemon data.
- [ ] The CSV includes all point-listed species for this cycle.
- [ ] The CSV structure is simple enough to update next cycle without changing code.
- [ ] Typecheck/lint passes.

### US-002: Load and resolve Battle Frontier Master point values

**Description:** As a developer, I want a reusable rules module that resolves point values by species so that validation and generation share one source of truth.

**Acceptance Criteria:**

- [ ] Add a core helper that loads and caches the Battle Frontier Master points CSV.
- [ ] Point lookup works for exact listed species IDs.
- [ ] Point lookup falls back from listed base species to matching shadow variant cost when appropriate.
- [ ] Unlisted species resolve to a default legal cost of 0 points unless otherwise specified by the cycle table.
- [ ] Typecheck/lint passes.

### US-003: Detect Mega Pokemon for team legality

**Description:** As a developer, I want Mega detection based on existing Pokemon data so that the one-Mega-per-team rule is enforced reliably.

**Acceptance Criteria:**

- [ ] Add a helper that determines whether a species is Mega using existing Pokemon data.
- [ ] Mega detection does not rely on string matching alone when structured data is available.
- [ ] The helper is reusable by both API validation and generation logic.
- [ ] Typecheck/lint passes.

### US-004: Validate Battle Frontier Master anchor selections in the API

**Description:** As a user, I want illegal Battle Frontier Master anchors rejected before generation starts so that I get immediate, clear feedback.

**Acceptance Criteria:**

- [ ] `POST /api/generate-team` validates Battle Frontier Master anchors against the 11-point cap.
- [ ] `POST /api/generate-team` validates the one-5-point rule for Battle Frontier Master.
- [ ] `POST /api/generate-team` validates the one-Mega rule for Battle Frontier Master.
- [ ] Invalid anchor combinations return HTTP 400 with a deterministic error message.
- [ ] Error messages clearly explain which Battle Frontier Master rule was violated.
- [ ] Typecheck/lint passes.

### US-005: Restrict genetic generation to legal Battle Frontier Master teams

**Description:** As a user, I want generated Battle Frontier Master teams to always satisfy the format rules so that the output is tournament-legal.

**Acceptance Criteria:**

- [ ] Random chromosome creation does not finalize illegal Battle Frontier Master teams.
- [ ] Mutation and crossover do not keep illegal Battle Frontier Master children.
- [ ] Final generated Battle Frontier Master teams always satisfy all format legality rules.
- [ ] Existing generation behavior remains unchanged for other formats.
- [ ] Typecheck/lint passes.

### US-006: Show clear user-facing validation messaging

**Description:** As a user, I want understandable error messages for Battle Frontier Master rule violations so that I know how to fix my selections.

**Acceptance Criteria:**

- [ ] Anchor validation failures surface clear user-visible errors.
- [ ] Error messages mention the relevant constraint, such as point cap, 5-point limit, or Mega limit.
- [ ] Team generation does not proceed after a Battle Frontier Master legality failure.
- [ ] Any UI copy added for this format explains that this cycle allows 11 total points, at most one 5-point Pokemon, and at most one Mega Pokemon.
- [ ] When the selected format is Battle Frontier Master, the anchor UI shows live point usage in the format `(# / 11 points)`.
- [ ] The point usage display updates as anchors are added, changed, or removed.
- [ ] Verify in browser using dev-browser skill.
- [ ] Typecheck/lint passes.

### US-007: Cover Battle Frontier Master rules with tests

**Description:** As a developer, I want automated coverage for Battle Frontier Master legality rules so that future data or generator changes do not break format enforcement.

**Acceptance Criteria:**

- [ ] Add unit tests for point lookup and shadow inheritance.
- [ ] Add unit tests for one-Mega and one-5-point validation.
- [ ] Add API tests for Battle Frontier Master invalid anchor combinations.
- [ ] Add generator tests that verify produced Battle Frontier Master teams are legal.
- [ ] Existing unrelated tests continue to pass.
- [ ] Typecheck/lint passes.

## Functional Requirements

- FR-1: The system must support `battle-frontier-master` as a selectable battle format using the existing format catalog.
- FR-2: The system must load Battle Frontier Master rankings from `data/rankings/cp10000/battlefrontiermaster/` and simulations from `data/simulations/cp10000/battlefrontiermaster/` using existing format metadata.
- FR-3: The system must store the cycle-specific Battle Frontier Master point table in a checked-in CSV file under `data/`.
- FR-4: The point table must use canonical internal Pokemon identifiers compatible with project data in `data/pokemon.json`.
- FR-5: The system must expose reusable Battle Frontier Master rule helpers rather than duplicating rule logic in multiple files.
- FR-6: For Battle Frontier Master teams, the system must enforce a maximum total point spend of 11.
- FR-7: For Battle Frontier Master teams, the system must enforce a maximum of one 5-point Pokemon.
- FR-8: For Battle Frontier Master teams, the system must enforce a maximum of one Mega Pokemon.
- FR-9: Mega detection must use structured Pokemon data from `data/pokemon.json`, including the existing `mega` tag, instead of brittle display-name parsing when possible.
- FR-10: If a listed Pokemon has a shadow variant present in project data and Battle Frontier Master rankings, that shadow variant must inherit the same point cost as the base listed species.
- FR-11: API validation must reject illegal Battle Frontier Master anchor combinations before team generation starts.
- FR-12: API validation failures for Battle Frontier Master must return HTTP 400 with deterministic, human-readable error messages.
- FR-13: Team generation logic must avoid constructing or returning illegal Battle Frontier Master teams.
- FR-14: Battle Frontier Master legality validation must be applied during random team construction and after mutation or crossover when relevant.
- FR-15: Non-Battle Frontier Master formats must retain their current behavior and must not be affected by the new point-rule enforcement.
- FR-16: User-facing messaging for this format must explain the current cycle rules: 11 total points, at most one 5-point Pokemon, and at most one Mega Pokemon.
- FR-17: When `battle-frontier-master` is selected, the anchor-selection UI must display the current total point usage in the format `(# / 11 points)`.
- FR-18: The Battle Frontier Master point-usage display must update immediately when anchors are added, changed, or removed.
- FR-19: The point-usage display must use the same point-resolution rules as server-side validation, including shadow inheritance.

## Non-Goals

- No support for editing the point table through the UI.
- No admin workflow for managing cycle rules remotely.
- No automatic syncing of point values from an external source.
- No changes to ranking or simulation sync formats beyond what is already required by the existing `battle-frontier-master` format.
- No expansion of Battle Frontier point rules to other formats unless explicitly requested.
- No optimization work to rebalance scoring or improve generator quality beyond legality enforcement for this format.

## Design Considerations

- Reuse the existing format-selection UI and avoid introducing a separate format-specific workflow.
- If additional UI copy is added near team configuration, keep it concise and specific to Battle Frontier Master.
- Display the Battle Frontier Master point indicator near the anchor section label or helper text so users can see current spend while building anchors.
- Validation messages should help the user correct their input quickly.
- Example user-facing messages may include:
  - `Battle Frontier (Master) teams may use at most 11 points.`
  - `Battle Frontier (Master) teams may include only one 5-point Pokemon.`
  - `Battle Frontier (Master) teams may include only one Mega Pokemon.`
  - `(7 / 11 points)`

## Technical Considerations

- Use `lib/data/battleFormats.ts` as the source of truth for format metadata.
- Keep business rules in `lib/` and keep API routes as thin adapters.
- Prefer a single validation entry point for format-specific team legality.
- The rules module should work with canonical species IDs so it can be used consistently by API, data helpers, and genetic generation.
- Shadow inheritance should be implemented in code, not by duplicating every shadow entry in the CSV, unless future cycles explicitly require separate shadow costs.
- Existing tests indicate Battle Frontier Master already participates in ranking and simulation loading; new work should focus on legality enforcement and user messaging.
- The implementation should account for canonical project naming differences already confirmed for this format, including:
  - `Zamazenta (Crowned Shield)`
  - `Meloetta (Aria)`
  - `Zygarde (Complete Forme)`
  - base `Dialga` and base `Palkia`
- The implementation should use repo data to determine which listed species have ranked shadow variants in Battle Frontier Master.

## Success Metrics

- Users cannot generate a Battle Frontier Master team that violates the 11-point cap.
- Users cannot generate a Battle Frontier Master team with more than one 5-point Pokemon.
- Users cannot generate a Battle Frontier Master team with more than one Mega Pokemon.
- Invalid Battle Frontier Master anchor selections fail fast with clear messages instead of producing unclear generator failures.
- Users can see current Battle Frontier Master anchor point usage while selecting anchors.
- Future cycle updates can be handled by updating the checked-in CSV file without changing rule logic.
- Existing non-Battle Frontier formats show no behavioral regressions.

## Open Questions

- Should unlisted Battle Frontier Master species always count as 0 points for the current cycle, or should there be an explicit fallback rule documented alongside the CSV?
- Should exclusions in Battle Frontier Master receive any special messaging when they indirectly affect legal team construction, or is anchor validation the only required UX for now?
- Should the generated team result or analysis response include Battle Frontier Master point totals for transparency, or is legality-only enforcement sufficient?
