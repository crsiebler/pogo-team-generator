# PRD: PvPoke-Inspired Optimizer and UI Diagnostics Refresh

## Introduction

Refresh the Pokemon GO PvP team generator optimizer and diagnostics UI using
PvPoke Team Builder's "Rate Team" concepts as a reference, while keeping this
repository's lineup-aware generation model intact.

The feature must improve team quality scoring, threat analysis, and UI clarity
without executing, importing, bundling, or depending on PvPoke vendor JavaScript
at runtime. Useful concepts should be ported into pure TypeScript
implementations that fit the existing architecture and performance constraints
of a standalone Next.js/Vercel application.

This work includes optimizer scoring changes, summary diagnostics changes,
recommended lineup styling updates, performance safeguards, calibration
fixtures, and documentation/prompt maintenance so future contributors have
consistent guidance.

## Goals

- Improve optimizer quality using PvPoke-inspired concepts implemented in pure
  TypeScript.
- Preserve existing lineup-aware generator outputs: recommended lineups,
  synergy, defensive ratio, offensive ratio, role, and per-Pokemon
  contributions.
- Add or adjust lower-is-better Threat Score diagnostics.
- Support both weighted top-meta threats and full-meta threat analysis.
- Add soft matchup scoring instead of relying only on hard win/loss thresholds.
- Keep team generation under one minute in standalone Next.js/Vercel
  environments.
- Refresh Summary Statistics UI to use category-appropriate A/B/C/D/F letter
  grades only.
- Add a Threat Score card to Summary Statistics.
- Refresh Recommended Lineups styling to match the blue accordion style used
  elsewhere.
- Use elite/strong/neutral/weak pills on lineup cards only, not in Summary
  Statistics.
- Add season-specific Great League Show-6 Pick-3 tournament teams as
  calibration fixtures, not hardcoded truth.
- Update docs and OpenCode guidance so optimizer, prompt, and UI expectations
  remain consistent.

## User Stories

### US-001: Port PvPoke-Inspired Optimizer Concepts Into Pure TypeScript

**Description:** As a developer, I want PvPoke-inspired team rating concepts
ported into repository-owned TypeScript logic so that the app benefits from
proven ideas without runtime PvPoke vendor dependencies.

**Acceptance Criteria:**

- [ ] No PvPoke vendor JavaScript is executed, imported, bundled, or loaded at
      runtime.
- [ ] PvPoke Team Builder "Rate Team" behavior is used only as a
      conceptual/reference source.
- [ ] New optimizer logic is implemented in pure TypeScript under existing
      project architecture.
- [ ] Existing lineup-aware generator features remain available.
- [ ] Typecheck passes.
- [ ] Tests pass for updated optimizer behavior.

### US-002: Preserve Existing Lineup-Aware Generator Outputs

**Description:** As a user, I want the generator to continue explaining team and
lineup quality so that I can understand why a team was recommended.

**Acceptance Criteria:**

- [ ] Recommended lineups continue to be generated.
- [ ] Synergy remains available as a team diagnostic.
- [ ] Defensive ratio remains available as a team diagnostic.
- [ ] Offensive ratio remains available as a team diagnostic.
- [ ] Role remains available as a team diagnostic.
- [ ] Per-Pokemon contributions remain available.
- [ ] Existing consumers of these outputs are updated only as needed for the
      refreshed contract.
- [ ] Typecheck passes.
- [ ] Tests pass for preserved output shape and behavior.

### US-003: Add Lower-Is-Better Threat Score

**Description:** As a competitive player, I want a lower-is-better Threat Score
so that I can quickly understand how vulnerable my team is to the current meta.

**Acceptance Criteria:**

- [ ] Threat Score is computed where lower values indicate fewer or less severe
      threats.
- [ ] Threat Score accounts for both top-meta weighted threats and broader
      full-meta threats.
- [ ] Threat Score identifies top meta threats for the team.
- [ ] Threat Score identifies overall team threats.
- [ ] Threat Score output is available to Summary Statistics UI.
- [ ] Typecheck passes.
- [ ] Tests pass for lower-is-better behavior and threat ordering.

### US-004: Add Weighted Top-Meta And Full-Meta Threat Analysis

**Description:** As a competitive player, I want threats weighted by relevance so
that dominant meta Pokemon affect diagnostics more than fringe picks while still
accounting for broader coverage gaps.

**Acceptance Criteria:**

- [ ] The optimizer evaluates a weighted top-meta threat pool.
- [ ] The optimizer evaluates a full-meta threat pool.
- [ ] Top-meta weighting is configurable or data-driven enough to support season
      updates.
- [ ] Full-meta threats contribute to diagnostics without overpowering top-meta
      threats.
- [ ] Threat outputs include enough data for UI display and tests.
- [ ] Typecheck passes.
- [ ] Tests pass for weighted threat calculations.

### US-005: Add Soft Matchup Scoring

**Description:** As a user, I want matchup quality to reflect close or partial
matchups so that team diagnostics are less brittle than simple win/loss
thresholds.

**Acceptance Criteria:**

- [ ] Matchups can produce soft scores instead of only binary win/loss values.
- [ ] Soft matchup scoring is used by relevant optimizer diagnostics.
- [ ] Close matchups produce intermediate scores.
- [ ] Clearly favorable and clearly unfavorable matchups remain distinguishable.
- [ ] Typecheck passes.
- [ ] Tests pass for favorable, neutral/close, and unfavorable matchup examples.

### US-006: Add Caching And Precomputation For Performance

**Description:** As a user, I want team generation to complete quickly so that
the app remains usable on standalone Next.js/Vercel deployments.

**Acceptance Criteria:**

- [ ] Expensive repeated matchup or threat computations are cached or
      precomputed.
- [ ] Cache keys are deterministic and safe for repeated generation requests.
- [ ] Generation completes in under one minute for representative workloads.
- [ ] Performance validation exists for the expected generation path.
- [ ] No cache behavior introduces stale incorrect season data.
- [ ] Typecheck passes.
- [ ] Tests pass for cache/precomputation behavior where practical.

### US-007: Refresh Summary Statistics Grading Display

**Description:** As a user, I want Summary Statistics to show simple letter
grades so that I can compare categories quickly without visual clutter.

**Acceptance Criteria:**

- [ ] Summary Statistics accordion remains.
- [ ] Summary Statistics displays all eight metrics: Synergy, Coverage, Safety,
      Consistency, Bulk, Role, Offensive Ratio, and Defensive Ratio.
- [ ] Each metric displays a category-appropriate letter grade only: `A`, `B`,
      `C`, `D`, or `F`.
- [ ] No `+` or `-` grade modifiers are shown.
- [ ] Elite/strong/neutral/weak pills are removed from Summary Statistics.
- [ ] Typecheck passes.
- [ ] Verify in browser using dev-browser skill.

### US-008: Add Threat Score Card To Summary Statistics

**Description:** As a user, I want threat diagnostics shown beside summary grades
so that I can understand team vulnerabilities from the same accordion.

**Acceptance Criteria:**

- [ ] Summary Statistics includes a Threat Score card.
- [ ] Threat Score card explains that lower is better.
- [ ] Threat Score card displays top meta threats.
- [ ] Threat Score card displays overall team threats.
- [ ] Threat Score card does not use elite/strong/neutral/weak pills unless
      explicitly used inside threat-specific UI and not as Summary Statistics
      metric grades.
- [ ] Typecheck passes.
- [ ] Verify in browser using dev-browser skill.

### US-009: Refresh Recommended Lineups Styling

**Description:** As a user, I want Recommended Lineups to visually match the rest
of the diagnostics UI so that the page feels consistent.

**Acceptance Criteria:**

- [ ] Recommended Lineups switches from greenish background styling to blueish
      accordion styling consistent with other accordions.
- [ ] Existing lineup content remains visible and readable.
- [ ] Existing lineup ordering behavior is preserved unless intentionally
      changed by optimizer scoring.
- [ ] Typecheck passes.
- [ ] Verify in browser using dev-browser skill.

### US-010: Show Lineup Quality Pills On Lineup Cards

**Description:** As a user, I want lineup cards to show quality pills so that I
can quickly compare recommended lineups.

**Acceptance Criteria:**

- [ ] Lineup cards display one of: elite, strong, neutral, weak.
- [ ] Pills are based on lineup quality, not summary metric grades.
- [ ] Pill labels and colors are consistent across lineup cards.
- [ ] Pills are not shown in Summary Statistics.
- [ ] Typecheck passes.
- [ ] Tests pass for lineup quality classification if computed in logic.
- [ ] Verify in browser using dev-browser skill.

### US-011: Add Great League Show-6 Pick-3 Calibration Fixtures

**Description:** As a developer, I want season-specific tournament team fixtures
so that optimizer changes can be calibrated against realistic teams without
hardcoding them as truth.

**Acceptance Criteria:**

- [ ] Great League Show-6 Pick-3 tournament teams are added as season-specific
      calibration fixtures.
- [ ] Fixtures are documented as calibration examples, not absolute truth or
      hardcoded optimizer rules.
- [ ] Tests or validation can use fixtures to detect major scoring regressions.
- [ ] Fixture naming includes season/context metadata where practical.
- [ ] Typecheck passes.
- [ ] Tests pass for fixture loading/validation.

### US-012: Update Optimizer And UI Documentation

**Description:** As a contributor, I want documentation updated so that future
optimizer and UI changes follow the same assumptions and output contract.

**Acceptance Criteria:**

- [ ] `.opencode/skills/gbl-optimizer/SKILL.md` is updated with new optimizer
      guidance.
- [ ] Root `AGENTS.md` is updated with any relevant contributor guidance.
- [ ] Optimizer docs are updated to describe new scoring concepts.
- [ ] A new or updated UI output contract documents Summary Statistics, Threat
      Score, and Recommended Lineups expectations.
- [ ] Docs explicitly state that PvPoke vendor JS must not be executed,
      imported, or bundled at runtime.
- [ ] Docs describe Great League Show-6 Pick-3 fixtures as calibration data
      only.
- [ ] Typecheck passes if doc-linked examples are typechecked.
- [ ] Relevant docs are reviewed for consistency.

## Functional Requirements

- FR-1: The system must not execute, import, bundle, or runtime-load PvPoke
  vendor JavaScript.
- FR-2: The system must use PvPoke Team Builder "Rate Team" only as a
  conceptual reference.
- FR-3: The optimizer must implement useful referenced concepts in pure
  TypeScript.
- FR-4: The optimizer must preserve lineup-aware generation behavior.
- FR-5: The optimizer must continue producing recommended lineups.
- FR-6: The optimizer must continue producing Synergy diagnostics.
- FR-7: The optimizer must continue producing Defensive Ratio diagnostics.
- FR-8: The optimizer must continue producing Offensive Ratio diagnostics.
- FR-9: The optimizer must continue producing Role diagnostics.
- FR-10: The optimizer must continue producing per-Pokemon contribution details.
- FR-11: The optimizer must compute a lower-is-better Threat Score.
- FR-12: Threat Score must include weighted top-meta threat analysis.
- FR-13: Threat Score must include full-meta threat analysis.
- FR-14: Threat outputs must support displaying top meta threats and overall
  team threats.
- FR-15: Matchup scoring must support soft/intermediate scores.
- FR-16: The generator must use caching and/or precomputation for expensive
  repeated calculations.
- FR-17: Representative generation must complete in under one minute on
  standalone Next.js/Vercel-compatible execution.
- FR-18: Summary Statistics must remain an accordion.
- FR-19: Summary Statistics must display exactly these eight grade-based
  metrics: Synergy, Coverage, Safety, Consistency, Bulk, Role, Offensive Ratio,
  and Defensive Ratio.
- FR-20: Summary Statistics metric grades must use only `A`, `B`, `C`, `D`, or
  `F`.
- FR-21: Summary Statistics must not display `+` or `-` grade modifiers.
- FR-22: Summary Statistics must not display elite/strong/neutral/weak pills.
- FR-23: Summary Statistics must include a Threat Score card.
- FR-24: Threat Score card must display top meta threats.
- FR-25: Threat Score card must display overall team threats.
- FR-26: Recommended Lineups must use blueish styling consistent with other
  accordions.
- FR-27: Recommended Lineups must no longer use the current greenish background
  style.
- FR-28: Lineup cards must display one quality pill: elite, strong, neutral, or
  weak.
- FR-29: Lineup quality pills must not be reused as Summary Statistics grades.
- FR-30: Great League Show-6 Pick-3 tournament teams must be represented as
  season-specific calibration fixtures.
- FR-31: Calibration fixtures must not be hardcoded as optimizer truth.
- FR-32: Documentation must be updated for optimizer behavior, UI output
  contract, and prompt/agent guidance.
- FR-33: Browser verification must be performed for UI stories.
- FR-34: Typecheck must pass before the feature is considered complete.
- FR-35: Relevant unit/integration tests must pass before the feature is
  considered complete.
- FR-36: Performance validation must confirm representative generation under one
  minute.

## Non-Goals

- Do not vendor, bundle, import, execute, or runtime-load PvPoke JavaScript.
- Do not create a full PvPoke clone.
- Do not require network calls to PvPoke or other external rating services at
  generation time.
- Do not remove lineup-aware generation.
- Do not remove recommended lineups.
- Do not remove per-Pokemon contribution explanations.
- Do not hardcode tournament fixture teams as always-correct optimizer outcomes.
- Do not introduce `A+`, `A-`, `B+`, or any other plus/minus grade variants in
  Summary Statistics.
- Do not keep elite/strong/neutral/weak pills in Summary Statistics.
- Do not make performance dependent on long-running server processes unavailable
  on Vercel.
- Do not introduce new package dependencies unless separately approved.
- Do not redesign unrelated pages or navigation.
- Do not change authentication, deployment, database, or CI/CD behavior as part
  of this feature.

## Design Considerations

- Summary Statistics should remain an accordion and continue to feel visually
  consistent with existing diagnostics UI.
- Summary Statistics should use simple letter grades only for the eight named
  metrics.
- Threat Score should be visually distinct enough to communicate that it is
  lower-is-better.
- Threat Score card should show both top meta threats and overall team threats.
- Recommended Lineups should use blueish styling consistent with other
  accordions.
- Lineup cards should use elite/strong/neutral/weak pills as quick visual
  quality indicators.
- UI copy should avoid implying that calibration fixtures are absolute truth.
- UI should remain understandable to users who are not familiar with PvPoke
  internals.
- Grade labels should be category-appropriate because higher/lower raw values
  may have different meanings depending on the metric.

## Technical Considerations

- Keep optimizer logic in pure, testable TypeScript modules.
- Avoid runtime dependency on PvPoke code or browser-only globals.
- Use typed data loaders and validation patterns already present in the
  repository.
- Use deterministic cache keys for matchup, threat, and scoring computations.
- Ensure cache/precompute strategy works in standalone Next.js/Vercel
  environments.
- Consider separating raw score calculations, grade mapping, threat ranking, and
  UI output contract mapping.
- Add tests for Threat Score lower-is-better behavior, top-meta weighted threat
  behavior, full-meta threat behavior, soft matchup scoring, grade mapping
  without plus/minus modifiers, lineup quality classification, and calibration
  fixture validation.
- Add or update performance validation for representative generation workloads.
- Browser verification is required for Summary Statistics and Recommended
  Lineups UI changes.
- Documentation updates must include `.opencode/skills/gbl-optimizer/SKILL.md`,
  root `AGENTS.md`, optimizer docs under `docs/`, and new or updated UI output
  contract documentation.

## Success Metrics

- Representative team generation completes in under one minute.
- Typecheck passes.
- Relevant tests pass.
- UI stories are verified in browser.
- No PvPoke vendor JavaScript appears in runtime imports, bundles, or execution
  paths.
- Summary Statistics shows all eight required metrics as `A/B/C/D/F` only.
- Summary Statistics no longer shows elite/strong/neutral/weak pills.
- Threat Score card displays top meta and overall threats.
- Recommended Lineups uses blueish accordion styling.
- Lineup cards show elite/strong/neutral/weak quality pills.
- Calibration fixtures can detect major optimizer regressions without acting as
  hardcoded truth.
- Documentation and prompt guidance are consistent with implemented behavior.

## Open Questions

- Which specific season should be used for the first Great League Show-6 Pick-3
  calibration fixture set?
- What exact weighting split should be used between top-meta threats and
  full-meta threats?
- What thresholds should map raw metric values to `A/B/C/D/F` for each Summary
  Statistics category?
- Should Threat Score display raw numeric values, letter grades, ranked lists
  only, or a combination?
- What representative workload should be used as the official under-one-minute
  performance benchmark?
