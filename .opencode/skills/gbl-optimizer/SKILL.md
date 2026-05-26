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

## Architecture Boundaries

- Keep optimizer scoring logic in `lib/genetic/fitness`.
- Keep shared generation and lineup-aware contracts in `lib/types.ts`.
- Keep API routes and UI components as thin adapters that pass through optimizer diagnostics instead of recomputing scores.
- Keep data loading and file parsing behind existing `lib/data` loaders and `lib/sync` adapter utilities.
- Inject scoring dependencies through contexts instead of reading files directly from scoring functions.

## Testing Expectations

For scoring changes, add or update tests first when practical.

Cover:

- Controlled lineup scoring edge cases.
- ABC, ABB, and ABA behavior.
- Shared weakness penalties and shared strength rewards.
- Top-threat vs full-meta coverage weighting.
- Type effectiveness dual-type multiplication.
- Deterministic optimizer output for fixed seeds.
- Regression cases where paper coverage differs from playable pick-3 synergy.

Run focused Vitest files first, then `npx tsc --noEmit` and `npm run lint`. Run `npm test` for non-trivial optimizer changes.
