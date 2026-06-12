# Coverage And Threat Pools

Coverage measures how well a roster or lineup handles expected opponents. It should be measured against both a prioritized top-threat pool and a broader full-meta pool.

## Top-Threat Pool

The top-threat pool is a smaller, high-priority set of Pokemon that most strongly affects practical viability.

Sources may include:

- Top N PvPoke rankings.
- Usage-weighted threats.
- Tournament results.
- Curated meta cores.
- Pokemon above a score or rank threshold.

Top-threat coverage should carry more weight than full-meta coverage. A team that loses hard to a common top threat should be penalized even if it covers many rare Pokemon.

## Full-Meta Pool

The full-meta pool is the broader eligible field.

Use it to detect:

- Broad typing holes.
- Unexpected hard losses.
- Over-specialized rosters.
- Coverage that only works against the top of rankings.

Full-meta coverage matters, but it should not dominate top-threat coverage.

## Weighted Threat Score Pools

Threat Score should evaluate top-meta and full-meta pools separately before
combining them into an aggregate lower-is-better diagnostic. Weight top-meta
threats higher by default because common or strategically central threats should
drive more roster risk than rare coverage holes.

Pool weighting should be data-driven or configurable for season updates. When a
pool cannot be evaluated for a candidate because matchup data is unavailable,
normalize active weights over the pools that were evaluated instead of treating
missing data as zero risk. Full-meta diagnostics should expose broad coverage
gaps, but configured weights should prevent full-meta results from overpowering
top-meta viability.

Threat Score output should include enough structured data for both tests and UI
display, including aggregate score, per-pool score, evaluated counts, active
weights, ranked top-meta threats, and ranked overall team threats.

## Coverage Metrics

Useful metrics include:

- Number of threats with at least one answer.
- Number of threats with at least two answers.
- Number of no-answer threats.
- Number of single-answer threats.
- Weighted matchup score by shield scenario.
- Worst shield path for each threat.
- Core coverage against common two- or three-Pokemon cores.

## Lineup Coverage

Coverage should be scored per lineup, not only per six-Pokemon roster.

For each ordered lineup, ask:

- Can this three-Pokemon lineup cover the top-threat pool?
- Which threats have no answer?
- Which threats have exactly one answer?
- Does a single bad lead force the only answer onto the field?
- Are top threats covered across realistic shield paths?

Coverage should reward redundancy without overstacking. Two answers to a key threat are valuable; four answers to a niche threat may be wasted if other threats are uncovered.
