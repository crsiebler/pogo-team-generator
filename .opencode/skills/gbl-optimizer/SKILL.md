---
name: gbl-optimizer
description: Use when changing Pokemon GO Battle League optimizer scoring, show-6 pick-3 lineups, PvPoke ranking inputs, type effectiveness, coverage, safety, consistency, bulk, roles, or ABC/ABB/ABA strategy.
---

# GBL Optimizer

Use this skill when implementing, refactoring, reviewing, or planning Pokemon GO Battle League team optimization logic.

## Required Reading

Before changing roster or lineup scoring, read:

- `docs/pokemon-go-team-optimization.md`
- `docs/team-optimization/scoring-model.md`
- `docs/team-optimization/lineup-structures.md`
- `docs/team-optimization/coverage-threat-pools.md`
- `docs/team-optimization/safety-consistency-bulk.md`
- `docs/team-optimization/type-effectiveness.md`
- `docs/team-optimization/role-scoring.md`
- `docs/team-optimization/data-inputs.md`
- `docs/team-optimization/validation.md`

Use `data/type-effectiveness.json` as the source of truth for Pokemon GO type chart values.

## Optimization Principles

The optimizer should be weighted, not a strict tier list or lexicographic comparator except for validity and legality constraints.

PvPoke behavior is reference-only. Runtime application, component, and optimizer
code must not import, require, execute, bundle, or runtime-load PvPoke vendor
JavaScript. Local PvPoke engine execution is allowed only in isolated sync or
tooling workflows. Preserve the runtime boundary guarded by
`lib/architecture/pvpokeRuntimeBoundary.test.ts`.

Weight strategy in this order:

1. Synergy
2. Coverage
3. Safety
4. Consistency
5. Bulk
6. Defensive resistances vs weaknesses ratio
7. Offensive effectiveness vs resistance ratio
8. Role

Score ordered pick-3 lineups as playable battle plans. Then aggregate lineup quality into show-6 roster quality.

Keep Threat Score diagnostic and lower-is-better on
`OptimizerScoreBreakdown.threatScore`; do not add it to weighted fitness
components unless a current story explicitly changes optimizer selection
behavior. Aggregate active `pools.topMeta` and `pools.fullMeta` diagnostics with
top-meta weighted higher by default through
`LineupScoringContext.threatScorePoolWeights`.

Use `scoreMatchupRating(...)` from
`lib/genetic/fitness/matchupScoring.ts` when a score should distinguish close,
neutral, clearly favorable, and clearly unfavorable matchups. Preserve binary
threshold checks for categorical labels, counts, and display classifications.

Protect optimizer hot paths. Keep diagnostic-only work out of fast/GA scoring
paths unless final output requires it. Use per-run lineup-aware fitness caches in
`lib/genetic/fitness/index.ts`, keep cache keys versioned and format-scoped, and
validate cache behavior with `cacheStats` counters rather than timing-only
assertions.

## Domain Checks

When changing scoring, check for:

- Multiple viable lineups, not one obvious trio.
- Top-threat coverage separately from full-meta coverage.
- ABA shared weakness risk, especially when the shared weakness can appear in the lead.
- ABB lineups that are intentionally baiting or covering a shared weakness.
- Defensive type exposure weighted by meta relevance.
- Offensive move coverage using actual selected move types.
- Safety via overwhelming losses, no-answer threats, and single-answer threats.
- Consistency via bait dependence, move DPE, shield stability, and PvPoke consistency data when available.
- Bulk using stat product or `defense * hp / attack` when direct stat product is unavailable.
- Role fit using PvPoke Leads, Switches, Closers, Chargers, Attackers, and Consistency exports when available.
- Lower-is-better Threat Score diagnostics from weighted top-meta and full-meta threat pools.
- Soft matchup quality for scoring, while preserving categorical coverage and weakness labels.
- Performance effects of any diagnostic added to lineup-aware hot paths.

## Architecture Boundaries

- Keep optimizer scoring logic in `lib/genetic/fitness`.
- Keep shared generation and lineup-aware contracts in `lib/types.ts`.
- Keep API routes and UI components as thin adapters that pass through optimizer diagnostics instead of recomputing scores.
- Keep data loading and file parsing behind existing `lib/data` loaders and `lib/sync` adapter utilities.
- Inject scoring dependencies through contexts instead of reading files directly from scoring functions.
- Keep Great League Show-6 Pick-3 calibration fixtures in
  `data/calibration/great-league-show6-pick3.json` and load them through
  `lib/data/calibrationFixtures.ts`.
- Treat calibration fixtures as broad regression inputs only; do not hardcode
  exact optimizer winners, exact scores, or runtime scoring shortcuts from them.
- Keep Summary Statistics display-only: A-F grades only, no plus/minus modifiers,
  no `elite`/`strong`/`neutral`/`weak` quality pills, and lower-is-better Threat
  Score when present.
- Keep Recommended Lineup cards display-only with blue diagnostic styling and
  exactly one textual quality pill derived from API-provided lineup score
  metadata; do not show numeric lineup scores there.

## Testing Expectations

For scoring changes, add or update tests first when practical.

Cover:

- Controlled lineup scoring edge cases.
- ABC, ABB, and ABA behavior.
- Shared weakness penalties and shared strength rewards.
- Top-threat vs full-meta coverage weighting.
- Lower-is-better Threat Score ordering and pool diagnostics.
- Soft matchup scoring with close-matchup fixtures.
- Cache key determinism, format scoping, and cache-stat behavior for performance safeguards.
- Calibration fixture validation and broad scoring invariants.
- Type effectiveness dual-type multiplication.
- Deterministic optimizer output for fixed seeds.
- Regression cases where paper coverage differs from playable pick-3 synergy.

Run focused Vitest files first, then `npx tsc --noEmit` and `npm run lint`. Run `npm test` for non-trivial optimizer changes.
