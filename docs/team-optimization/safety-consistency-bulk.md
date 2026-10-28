# Safety, Consistency, And Bulk

Safety, consistency, and bulk measure how reliable a team is when battles are
imperfect. The formulas below preserve diagnostic meaning and the GBL path.
Pick 6 uses scenario objectives and robust selection; these are not independent
mandatory weighted rewards. See [Scoring Model](scoring-model.md).

## Safety

Safety is the ability to avoid catastrophic outcomes and recover from poor alignment.

Score safety by minimizing:

- Overwhelming losses.
- No-answer threats.
- Single-answer threats.
- Bad-lead scenarios where the switch cannot stabilize.
- Matchups where one opposing Pokemon can sweep two or three lineup members.

When simulation matrices exist, score safety across shield scenarios:

- 0-shield.
- 1-shield.
- 2-shield.
- Resource paths where lead shield use affects backline shield state.

Overwhelming losses against the top-threat pool should be weighted more heavily than overwhelming losses against rare full-meta Pokemon.

Both lineup scoring paths and roster fitness retain 80% matchup-derived safety
and blend in 20% mean normalized PvPoke Switches score. Missing Switches scores
do not replace evaluated matchup safety. This rewards safe pivots while keeping
shared weaknesses and poor alignment consequential.

## Consistency

Consistency measures how reliably a Pokemon or lineup performs without requiring perfect bait calls, exact shield timing, or rare alignment.

Use PvPoke consistency exports when available. If not available, proxy consistency with:

- Matchup stability across 0-, 1-, and 2-shield scenarios.
- Charged move damage per energy.
- Energy cost distribution.
- Whether the moveset has useful neutral damage.
- Whether both charged moves provide meaningful coverage.
- How dependent the Pokemon is on landing a specific nuke.
- How dependent the Pokemon is on baiting shields.

Pokemon with cheap bait moves are not automatically consistent. Cheap moves can improve pressure, but if a Pokemon only wins by baiting successfully, it should be treated as more volatile.

Full and fast lineup selection use 70% PvPoke Consistency category score and
30% local reliability evidence, matching the roster-level blend. Missing category
scores use the local fallback. Fast lineups use general ranking quality as their
lightweight fallback; full lineups retain energy pressure, shield reliability,
and general quality. Roster consistency retains move-volatility and shield-path
proxies. These are optimizer signals, not exact PvPoke Team Builder grades.

## Bulk

Bulk should be calculated from Pokemon stats when direct PvPoke bulk data is unavailable.

Recommended stat-based approximation:

```text
bulk = defense * hp / attack
```

Bulk helps evaluate:

- Mistake tolerance.
- Neutral matchup stability.
- Ability to absorb resisted or neutral charged moves.
- Ability to preserve shields.
- Ability to function as a switch or closer.

Bulk should be normalized within the candidate pool. A low-bulk Pokemon can still be useful when it provides essential pressure or coverage, but too many low-bulk Pokemon can make a roster brittle.

Production scoring uses the selected format's normalized ranking exports:
`Defense * Stamina`, divided by the ranked pool's 90th-percentile bulk and
bounded to `0..1`. The reference is computed once per scoring context, so the
same species receives the same bulk score across candidate teams. This uses
format-specific battle stats instead of counting stat archetypes or assigning
constant bulk during fast selection. Species without ranked battle stats retain
the base-stat approximation above, normalized as `(bulk - 50) / 250` and bounded
to `0..1`; missing or invalid stats contribute neutral bulk. This fallback is an
approximation, not a reconstruction of a player's IVs or effective battle stats.

## Combined Use

Safety, consistency, and bulk are related but distinct:

- A bulky Pokemon can still be unsafe if it has many hard losses.
- A safe switch can be low-bulk if its typing and moves give broad neutral play.
- A consistent Pokemon can be fragile if it wins quickly or applies reliable shield pressure.

Keep these as separate diagnostic components. GBL retains its weighted combination; Pick 6 selection uses the tournament scenario policy.
