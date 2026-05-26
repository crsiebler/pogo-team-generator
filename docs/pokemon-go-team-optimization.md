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

1. Build a candidate pool from ranking exports, eligibility data, and matchup matrices.
2. Build a top-threat pool and a broader full-meta pool.
3. Generate candidate show-6 rosters.
4. Enumerate ordered pick-3 lineups from each roster.
5. Score each lineup as a playable battle plan.
6. Aggregate lineup scores into a roster score.
7. Return the best roster and multiple recommended lineups with explanation metrics.

PvPoke rankings can seed candidate pools, role assumptions, move choices, and threat weighting. Treat them as a best-estimate resource from simulations, not as fixed truth. Prefer score-based and category-specific signals over raw rank alone.

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
