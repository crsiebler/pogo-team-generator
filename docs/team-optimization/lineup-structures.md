# ABC, ABB, And ABA Lineup Structures

Show-6 pick-3 strategy depends heavily on ordered lineups. The same three Pokemon can behave differently depending on lead, switch, and closer order.

## ABC Lineups

An ABC lineup has three Pokemon with mostly unique weaknesses, strengths, roles, or matchup profiles.

ABC lineups usually provide:

- Broad coverage.
- Fewer shared hard counters.
- More flexible response to unknown leads.
- Less dependence on perfect alignment.

ABC teams spread risk. Because each Pokemon covers a different matchup space, the lineup is less likely to collapse to a single opposing type, Pokemon, or core.

## ABB Lineups

An ABB lineup intentionally uses two Pokemon with shared traits and one Pokemon that supports or protects them.

Common ABB patterns:

- A covers the shared weakness of B and B.
- B and B cover the weakness of A.
- One B lures the counter so the second B can sweep later.
- The backline shares typing, move pressure, role, or counter profile.

ABB is not automatically bad. It can be strategically strong when the shared weakness is predictable, manageable, and intentionally baited. It is risky when the opponent has multiple answers to the back pair or when the A Pokemon cannot handle the shared weakness reliably.

## ABA Lineups

An ABA lineup means the two A Pokemon share a common weakness or a common strength, while the B Pokemon is the different member.

### ABA Shared Weakness

ABA shared weakness is dangerous when the shared weakness appears in the lead.

Worst-case sequence:

1. Your lead A loses to the opposing lead.
2. You switch to B because B is your only solid answer.
3. The opponent counters your B.
4. Your remaining A still loses to the original threat.

This is alignment fragility. The lineup may look balanced on paper, but a bad lead can force the only answer onto the field too early.

The optimizer should heavily penalize ABA shared weakness when:

- The shared weakness is common in the top-threat pool.
- B is the only reliable answer.
- The A Pokemon both lose in the relevant shield path.
- The opposing lead can force switch and preserve alignment.

### ABA Shared Strength

ABA shared strength can be useful. If both A Pokemon beat the same important threat, the player has two answers.

When that target appears in the lead:

- The player can stay in with lead A.
- The player can pivot to B and preserve the second A.
- The lineup has redundancy rather than fragility.

The optimizer should reward ABA shared strength when it provides redundant coverage against important threats without creating a more dangerous shared weakness elsewhere.

## Synergy Scoring Signals

Good lineup synergy includes:

- The lead has a playable plan into common leads.
- The switch can stabilize bad leads.
- The closer benefits from shield or energy states the first two Pokemon create.
- Shared weaknesses are covered by at least one strong answer.
- Important threats have more than one answer when possible.
- No single opposing Pokemon can sweep two or three lineup members without a clear counterplay path.

Bad lineup synergy includes:

- ABA shared weakness to a common top threat.
- Only one answer to a threat that can appear in the lead.
- A frail switch that cannot stabilize bad alignment.
- A closer that needs shields when the lead and switch are likely to spend them.
- Three Pokemon that win isolated matchups but fail as an ordered battle plan.
