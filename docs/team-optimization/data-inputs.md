# Data Inputs

This strategy is project-agnostic, so exact schemas can vary. Keep parsers and adapters at the infrastructure boundary and normalize data before optimization.

## Recommended Inputs

- Pokemon species and forms.
- Pokemon types.
- Base stats or stat product.
- Fast moves and charged moves.
- Move type, power, energy, energy gain, and DPE when available.
- Type effectiveness chart.
- PvPoke ranking exports.
- Shield-scenario matchup matrices.
- Optional usage data or curated top-threat lists.

## PvPoke Ranking Exports

Useful ranking exports:

- Overall.
- Leads.
- Switches.
- Closers.
- Chargers.
- Attackers.
- Consistency.

Use the same league, cup, move settings, and candidate filters across exports whenever possible.

PvPoke rankings are a best-estimate resource, not immutable fact. Exact ranks can change as PvPoke improves its simulator and ranking algorithms. Treat ranking exports as strong signals for candidate quality, role fit, move quality, and threat weighting, but keep optimizer scoring explainable and robust to ranking changes.

## PvPoke Score Interpretation

PvPoke top-level rankings include a score from `0` to `100`, where `100` is the best Pokemon in that league and category. The score is an overall performance number derived from simulating every possible matchup with each Pokemon's most used moveset, with some movesets manually adjusted.

Use score differences rather than rank differences when possible. The gap between rank `#1` and rank `#50` may not equal the gap between rank `#50` and rank `#100`. A score-based percentile or normalized score usually carries more information than rank alone.

Overall rankings are derived from additional category rankings because Trainer Battles involve many shield and role scenarios. Different Pokemon can be valuable in different categories, so role-specific exports should inform lineup construction instead of only using Overall rank.

## PvPoke Detail Sections

Within each Pokemon ranking, PvPoke exposes detail sections that can be useful optimizer inputs:

- Fast Moves: which fast moves the Pokemon uses most in the league and category.
- Charged Moves: which charged moves the Pokemon uses most in the league and category.
- Key Wins: matchups the Pokemon performs best in, weighted by the opponent's overall score.
- Key Counters: significant opponents that perform best against the Pokemon.

Use these details for explanation and scoring support:

- Move usage can identify reliable optimal movesets.
- Key Wins can help explain anti-meta value.
- Key Counters can help build shared weakness and top-threat risk diagnostics.
- Category-specific move details can reveal whether a Pokemon changes role by changing move emphasis.

## PvPoke Move Ranking Interpretation

PvPoke move rankings are primarily calculated from damage and energy cost, with stat changes factored in. Calculations are run for each matchup and totaled across the format. Matchup weighting affects these numbers, so moves used against significant meta targets rank higher.

Use move ranking data to infer:

- Reliable fast move preference.
- Whether one charged move is mandatory.
- Whether a second charged move adds meaningful matchup coverage.
- Whether a Pokemon has broad move flexibility or depends on a narrow moveset.
- Whether a charged move counters the Pokemon's likely counters.

Strong tendency toward one fast move and one charged move means the Pokemon has a stable optimal moveset across many matchups. Balanced charged move usage means a second charged move may be especially valuable. A second charged move used in many meaningful matchups is usually more valuable than one used rarely, but matchup context matters. A move that counters likely switch-ins can be more valuable than head-to-head usage rates imply.

## PvPoke Ranking Algorithm Summary

PvPoke rankings are generated approximately as follows:

1. For each category, simulate every possible matchup and assign a Battle Rating for each Pokemon.
2. Calculate each Pokemon's average Battle Rating across all matchups.
3. For even-shield categories, iterate through matchups again and weight each Battle Rating by the opponent's average.
4. Repeat weighted averaging multiple times so top Pokemon and Pokemon that beat top Pokemon filter upward.
5. Calculate a category score as a percentage of the category leader's weighted average Battle Rating.
6. Calculate Overall score as the geometric mean of category scores.

Battle Rating measures whether a Pokemon wins and by how much. Weighted Battle Rating is important because all opponents are not equally relevant: beating a strong Pokemon should matter more than farming high ratings against weak Pokemon.

PvPoke uses geometric mean for Overall score because category scores are percentages. Geometric mean favors well-rounded Pokemon over Pokemon that are excellent in one category and poor in others.

## Practical Ranking Caveats

PvPoke can assign each Pokemon an optimal moveset per matchup. This helps identify theoretical strength, but broad-moveset Pokemon can rank higher than they are likely to perform in practice if they cannot realistically carry every optimal move at once.

When using rankings:

- Prefer category scores over raw rank when available.
- Do not optimize blindly for Overall rank.
- Treat Key Counters and bad histograms as risk signals.
- Treat move usage concentration as a consistency signal.
- Treat broad but impractical movesets cautiously.
- Validate recommendations against actual available movesets and the selected two charged moves.

## Matchup Matrices

Shield-scenario matrices are valuable because they measure actual matchup performance rather than type theory.

Recommended scenarios:

- 0-shield.
- 1-shield.
- 2-shield.

Optional resource paths:

- Balanced: lead 1-shield, backline 1-shield.
- Shield spend: lead 2-shield, backline 0-shield.
- Shield save: lead 0-shield, backline 2-shield.

## Threat Pools

Build two threat pools from the available data:

- Top-threat pool for high-priority practical viability.
- Full-meta pool for broad robustness.

Top-threat coverage should be weighted higher. Full-meta coverage should catch unexpected holes and over-specialized teams.

## Normalized Internal Models

Recommended normalized concepts:

- Pokemon candidate.
- Move.
- Type profile.
- Ranking profile.
- Matchup profile.
- Threat pool.
- Roster.
- Ordered lineup.
- Score breakdown.

Keep optimization logic independent from raw CSV or JSON schema details.
