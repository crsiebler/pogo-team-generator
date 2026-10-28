# Mode-aware Scoring Model

PlayPokemon uses Pareto search and robust finalist selection described in
[tournament-search.md](tournament-search.md). All fixed-weight formulas below
apply to blind-three GBL and legacy diagnostic/calibration helpers, not to
production Pick 6 selection.

For PlayPokemon, `tournamentSelection` is authoritative.
`fitness === scoreBreakdown.score` reports typical scenario plan quality, with
`scoreBasis: tournament-typical`. Diagnostic component weights do not reconstruct
this reporting score. Threat Score cannot override scenario robustness.
The previous weighted 0.55 cutoff is not the new plan viability rule.

## Priority Order

Use this order to set relative weights:

1. Lower Threat Score
2. Safety
3. Consistency
4. Bulk
5. Synergy

## Legacy Diagnostic Roster Score

Normalize each component before combining. A recommended normalized range is `0.0` for poor and `1.0` for excellent.

```text
roster_score =
  synergy_weight * synergy_score +
  coverage_weight * coverage_score +
  safety_weight * safety_score +
  consistency_weight * consistency_score +
  bulk_weight * bulk_score +
  defensive_ratio_weight * defensive_ratio_score +
  offensive_ratio_weight * offensive_ratio_score +
  role_weight * role_score
```

The component score is the quality average. Combine it with threat resilience:

```text
quality = 0.40 * safety + 0.30 * consistency + 0.20 * bulk + 0.10 * synergy
fitness = clamp01(0.50 * (1 - threatRisk) + 0.50 * quality)
```

`threatRisk` uses the same normalized calculation and top-meta/full-meta weights
as the displayed Threat Score. With no evaluated threats, or a non-finite risk,
selection awards zero threat contribution. Missing matchups within a pool are
still excluded rather than invented; this policy does not establish full
matchup coverage. `scoreBreakdown.threatContribution` records the weighted contribution,
and `scoreBreakdown.score` remains the authoritative final fitness.

Fast scoring computes scalar risk without labels or sorted threat lists. Full
diagnostics reuse the same risk definition. Disabling diagnostics must never
change the objective. GBL and legacy weighted diagnostic helpers use this contract. The per-run lineup cache version changes when the objective changes.

The viable-lineup cutoff of `0.55` applies to the quality average before the
threat blend, so changing the threat weight does not redefine battle-plan
viability. Lineup ranking still uses final fitness. Equal-fitness lineup
recommendations prefer role fit, then lead-aware coverage, preserving useful
lead/switch/closer ordering without overriding the weighted objective.

Current quality weights (normalized within the quality half of fitness):

```text
coverage: 0
safety: 0.40
consistency: 0.30
bulk: 0.20
synergy: 0.10
defensive_ratio: 0
offensive_ratio: 0
role: 0
```

Effective total weights are lower Threat Score 50%, Safety 20%, Consistency 15%,
Bulk 10%, and Synergy 5%. This is a weighted tradeoff, not a hard minimum-threat
filter. Coverage, type ratios, and role retain their diagnostics and upstream
candidate/battle-plan uses without a separate final weight. Component-only
helpers with no threat input return the normalized quality average; weighted
lineup and diagnostic roster scoring supply threat evidence, even when unavailable.

## Lineup Score

Each ordered pick-3 lineup should have its own weighted score. Score the lineup as a battle plan, not as three independent Pokemon.

```text
lineup_quality =
  synergy_weight * three_member_synergy +
  coverage_weight * lineup_coverage +
  safety_weight * lineup_safety +
  consistency_weight * lineup_consistency +
  bulk_weight * lineup_bulk +
  defensive_ratio_weight * lineup_defensive_ratio +
  offensive_ratio_weight * lineup_offensive_ratio +
  role_weight * lead_switch_closer_fit

lineup_score = 0.50 * (1 - lineup_threatRisk) + 0.50 * lineup_quality
```

Roster score should aggregate lineup quality:

- Best lineup score.
- Average of top N lineup scores.
- Number or percentage of viable lineups.
- Diversity of viable leads.
- Bench usefulness across viable lineups.
- Penalty for one-line teams where all success depends on a single obvious trio.

## Normalization

Do not combine raw values on incompatible scales. Normalize first:

- Convert ranks to percentiles or inverse rank quality.
- Convert matchup counts to rates.
- Convert type scores to bounded ratios.
- Cap outliers so one category cannot dominate by scale accident.
- Weight top-threat metrics separately from full-meta metrics.

PvPoke ranking scores are already on a `0` to `100` scale where `100` is the best Pokemon in the league and category. Prefer normalized score values over raw rank positions when available because rank gaps are not uniform.

When combining PvPoke categories, geometric mean is often more appropriate than arithmetic mean because category scores are percentages and well-roundedness matters. Geometric mean penalizes a Pokemon that is excellent in one category but poor in another more than an arithmetic mean would.

When weighting matchups, use opponent importance where possible. PvPoke weights Battle Ratings by opponent average so good performance against powerful Pokemon matters more than good performance against weak Pokemon. Optimizers should follow the same principle for top-threat pools and meta-weighted coverage.

## Soft Matchup Scoring

Prefer soft matchup scores when a calculation should distinguish close,
neutral, clearly favorable, and clearly unfavorable battle ratings. A close loss
or close win should contribute an intermediate value instead of being treated as
the same as a decisive loss or decisive win.

Keep binary thresholds for categorical outputs such as covered-threat labels,
weakness lists, overwhelming-loss counts, and no-answer counts. Use soft scores
for optimizer weighting, diagnostics, and Threat Score severity where matchup
quality should vary continuously.

## Move Score Inputs

Move scores should account for more than raw type effectiveness:

- Damage and energy cost.
- Damage per energy.
- Energy generation for fast moves.
- Stat changes.
- Usage across matchups.
- Value into significant meta targets.
- Whether a second charged move improves meaningful matchups.

Do not assume a broad theoretical movepool is fully available in one battle. Pokemon can carry one fast move and two charged moves, so score the selected moveset rather than every possible optimal move across all matchups.

## Hard Constraints

Use hard constraints only for validity and legality:

- Duplicate base species rules.
- League eligibility.
- Tournament point caps.
- Required or banned Pokemon.
- Required roster size.

Do not use hard constraints for strategic concepts like role balance or type diversity unless the format explicitly requires them.
