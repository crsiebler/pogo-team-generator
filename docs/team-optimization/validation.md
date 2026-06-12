# Validation Strategy

Validate the optimizer with known battle concepts, known meta teams, and controlled edge cases.

## Required Checks

- Dual-type effectiveness multiplication is correct.
- Pokemon GO immunity-style interactions use `0.39x`.
- Top-threat coverage is scored separately from full-meta coverage.
- Weighted top-meta and full-meta Threat Score pools expose deterministic diagnostics.
- Lower-is-better Threat Score ranking is deterministic for equivalent inputs.
- Soft matchup scoring distinguishes close, neutral, clearly favorable, and clearly unfavorable ratings where scores need intermediate values.
- Weighted scoring allows tradeoffs instead of acting like a tier list.
- Synergy is weighted above coverage.
- Coverage is weighted above safety.
- Role scoring does not dominate the result.
- ABB and ABA structures can score well when strategically coherent.
- ABA shared weakness is penalized when it creates lead-alignment fragility.
- ABA shared strength can be rewarded when it creates redundant answers.
- Teams with severe shared weaknesses are penalized.
- Teams with one Pokemon covering too many key threats are flagged as fragile.
- Multiple viable lineups are preferred over one obvious best line.

## Useful Fixtures

Create small deterministic fixtures for:

- A team with strong full-roster coverage but poor pick-3 lineup synergy.
- A team with one excellent trio and three dead roster slots.
- An ABB lineup where the A Pokemon correctly covers the B pair.
- An ABB lineup where the shared weakness is not covered.
- An ABA shared-weakness lineup into a common lead threat.
- An ABA shared-strength lineup with redundant answers.
- A roster with strong coverage but poor bulk.
- A roster with high type diversity but poor matrix performance.

Great League Show-6 Pick-3 calibration rosters should live as typed fixture
data and remain calibration examples only. They are useful for broad regression
checks such as valid species ids, 120 ordered lead/switch/closer lineups, finite
normalized roster scores, and minimum viable-lineup sanity thresholds. Do not
treat fixture teams as hardcoded optimizer truth labels, exact expected winners,
or exact score snapshots.

## Performance Safeguards

Lineup-aware scoring should protect hot paths with deterministic per-run caches
or equivalent precomputation. Cache keys should include enough context, such as
format and version, to avoid stale season data or collisions between lineups.
Validate cache behavior with counters or deterministic key assertions where
possible; avoid relying only on tight timing comparisons.

Representative generation and roster-scoring tests should enforce broad
performance expectations, such as completing under one minute in supported local
and deployment-compatible environments, without becoming flaky microbenchmarks.

## UI Contract Review

Documentation and UI tests should keep Summary Statistics display-only. Summary
Statistics grades are limited to `A`, `B`, `C`, `D`, or `F` with no plus or
minus modifiers. Summary Statistics must not use `elite`, `strong`, `neutral`,
or `weak` quality pills.

Threat Score belongs in Summary Statistics only as a lower-is-better diagnostic.
Recommended Lineups may show one lineup quality pill per lineup card using
`elite`, `strong`, `neutral`, or `weak`, but those labels describe lineup quality
and are not optimizer category grades.

## Explainability Review

Every recommendation should make sense to a human reviewer. If the optimizer returns a surprising team, diagnostics should show why:

- Which top threats are covered.
- Which top threats are risky.
- Which lineups are most viable.
- Which shared weaknesses exist.
- Which Pokemon are single points of failure.
- Which role assumptions were used.

If diagnostics cannot explain the recommendation, improve the score breakdown before tuning weights.
