# Pokemon GO Show-6 Pick-3 Team Optimization

This document is the main entry point for a project-agnostic Pokemon GO Battle League team optimization strategy. It is intended for AI agents or engineers implementing an optimizer for show-6, pick-3 formats.

<!-- Reference: docs/team-optimization/scoring-model.md -->
<!-- Reference: docs/team-optimization/lineup-structures.md -->
<!-- Reference: docs/team-optimization/coverage-threat-pools.md -->
<!-- Reference: docs/team-optimization/safety-consistency-bulk.md -->
<!-- Reference: docs/team-optimization/type-effectiveness.md -->
<!-- Reference: docs/team-optimization/role-scoring.md -->
<!-- Reference: docs/team-optimization/data-inputs.md -->
<!-- Reference: docs/team-optimization/validation.md -->
<!-- OpenCode skill: .opencode/skills/gbl-optimizer/SKILL.md -->

## Core Idea

In show-6, pick-3 formats, the best roster is not simply the six strongest individual Pokemon. The goal is to build a six-Pokemon roster that produces multiple strong ordered three-Pokemon lineups with complementary coverage, safety, consistency, bulk, typing, and roles.

The optimizer should be a weighted model, not a tiered or lexicographic list where one metric always dominates everything below it. Hard constraints should be limited to validity and legality rules such as duplicate species restrictions, league eligibility, or tournament-specific point caps.

## Weighted Priority Order

Use this priority order when choosing weights:

1. Synergy
2. Coverage
3. Safety
4. Consistency
5. Bulk
6. Defensive resistances vs weaknesses ratio
7. Offensive effectiveness vs resistance ratio
8. Role

Higher-priority categories should have larger weights, but lower-priority categories still contribute. A lineup with slightly worse coverage can be better if it has much stronger synergy and safety. A roster with strong matchup coverage can still be rejected if it relies on fragile lineups or repeated shared weaknesses.

## Optimization Flow

1. Derive format-specific candidate quality bands from ranking exports, eligibility data, and matchup matrices.
2. Build a top-threat pool and a broader full-meta pool.
3. Build ranked anchor and companion profiles from those bands, role data, typing, bulk, and matchup coverage.
4. Seed candidate show-6 rosters with elite or preferred anchors, ranked companion pairs, and bounded random diversity.
5. Enumerate ordered pick-3 lineups from each roster.
6. Score each lineup as a playable battle plan.
7. Aggregate lineup scores into a roster score.
8. Return the best roster and multiple recommended lineups with explanation metrics.

PvPoke rankings can seed candidate pools, role assumptions, move choices, and threat weighting. Treat them as a best-estimate resource from simulations, not as fixed truth. Prefer score-based and category-specific signals over raw rank alone. Candidate quality bands must be derived per format from that format's score distribution, rank percentile, score density, meaningful score dropoffs, and bounded candidate counts. Fixed score examples such as 92, 90, 88, and 85 are Great League examples only, not global viability rules.

PvPoke behavior is reference-only. Runtime application, component, and optimizer
code must not import, require, execute, bundle, or runtime-load PvPoke vendor
JavaScript. Keep any local PvPoke engine execution isolated to sync or tooling
workflows that generate repository-owned data.

For ordered lineups, use one of these models depending on project requirements:

- Lead ordered, back pair unordered: `6 * C(5, 2) = 60` lineups.
- Lead, switch, and closer all ordered: `6P3 = 120` lineups.

If a project has enough role data, fully ordered lead/switch/closer scoring is preferred because switch and closer are different tactical jobs.

## Key Documents

- [Scoring Model](team-optimization/scoring-model.md): weighted objective design and normalization.
- [Lineup Structures](team-optimization/lineup-structures.md): ABC, ABB, and ABA concepts.
- [Coverage And Threat Pools](team-optimization/coverage-threat-pools.md): top-threat and full-meta coverage.
- [Safety, Consistency, And Bulk](team-optimization/safety-consistency-bulk.md): hard-loss, bait-dependence, and bulk scoring.
- [Type Effectiveness](team-optimization/type-effectiveness.md): Pokemon GO multipliers, dual-type calculation, and offensive/defensive ratios.
- [Role Scoring](team-optimization/role-scoring.md): lead, switch, closer, charger, attacker, and consistency ranking use.
- [Data Inputs](team-optimization/data-inputs.md): recommended PvPoke exports and normalized inputs.
- [Validation](team-optimization/validation.md): regression fixtures and expected edge cases.
- OpenCode skill `gbl-optimizer`: project skill for agents implementing, refactoring, or reviewing GBL optimizer logic.

## OpenCode Skill

This strategy is also packaged as the project OpenCode skill `gbl-optimizer` at `.opencode/skills/gbl-optimizer/SKILL.md`.

Use the skill when changing optimizer scoring, show-6 pick-3 lineups, PvPoke ranking inputs, type effectiveness, coverage, safety, consistency, bulk, roles, or ABC/ABB/ABA strategy.

## Output Guidance

Recommended output should explain both roster-level and lineup-level tradeoffs:

- Recommended show-6 roster.
- Overall score and category breakdown.
- Lower-is-better Threat Score diagnostics.
- Top-threat coverage.
- Full-meta coverage.
- Defensive type profile.
- Offensive move profile.
- Shared weaknesses and single-answer risks.
- Recommended ordered pick-3 lineups.
- ABC, ABB, or ABA structure notes.
- Lead, switch, and closer role notes.
- Major risks and alternative candidates.

The explanation is important. A high aggregate score should not hide a major weakness such as ABA shared weakness into a common top-threat lead.

## UI Output Contract

Summary Statistics is a display-only diagnostics section. It should show the
optimizer score categories `Synergy`, `Coverage`, `Safety`, `Consistency`,
`Bulk`, `Role`, `Offensive Ratio`, and `Defensive Ratio` using only simple
`A`, `B`, `C`, `D`, or `F` grades. Do not show plus or minus grade modifiers,
numeric score values, or `elite`, `strong`, `neutral`, or `weak` quality pills in
Summary Statistics component cards, except for the dedicated Threat Score
profile pill described below.

Threat Score may appear in Summary Statistics as a separate lower-is-better
diagnostic sourced from optimizer output. It should explain that lower is better
and owns the one team-level threat profile pill (`elite`, `strong`, `neutral`,
or `weak`) in the Threat Score card. Threat lists should display readable
Pokemon names only. Do not expose raw Overall, Top Meta, Full Meta, rank,
answer count, risk, threat value, or other raw threat score metadata in the
user-facing Threat Score UI; backend fields may remain available for sorting,
diagnostics, calibration, and tests.

Recommended Lineups should present ordered lead, switch, and closer assignments
with useful matchup details such as semantic weakness lists. Lineup cards should
retain blue diagnostic styling and must not render lineup quality pills such as
`elite`, `strong`, `neutral`, or `weak`. Keep any API-provided lineup score
metadata internal for sorting and diagnostics, and do not show numeric lineup
scores unless a future UI contract explicitly requires it.
