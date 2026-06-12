# Safety, Consistency, And Bulk

Safety, consistency, and bulk measure how reliable a team is when battles are imperfect. They should support synergy and coverage, not replace them.

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

## Combined Use

Safety, consistency, and bulk are related but distinct:

- A bulky Pokemon can still be unsafe if it has many hard losses.
- A safe switch can be low-bulk if its typing and moves give broad neutral play.
- A consistent Pokemon can be fragile if it wins quickly or applies reliable shield pressure.

The optimizer should score these as separate components and combine them with weights.
