# Role Scoring

Role scoring evaluates how each Pokemon fits into ordered lineups. Role is useful, but it should not dominate synergy, coverage, safety, consistency, or bulk.

## PvPoke Ranking Categories

PvPoke ranking exports can inform role scoring:

- Overall: derived from a Pokemon's score in all other categories. Treat as broad candidate quality, not a direct battle role.
- Leads: ranking battles simulated with 2 shields vs 2 shields. Useful for lead-slot evaluation.
- Closers: ranking battles simulated with no shields vs no shields. Useful for endgame evaluation.
- Switches: ranking battles simulated with 6 turns of energy advantage and scored to favor safe matches. Useful for safe-swap evaluation.
- Chargers: ranking battles simulated with 6 turns of energy advantage. Useful for energy-pressure and shield-pressure evaluation.
- Attackers: ranking battles simulated with no shields vs 2 shields. Useful for shield-disadvantage pressure.
- Consistency: rating of how dependent Pokemon are on baiting shields. Useful for volatility penalties.

Overall score should be treated as broad candidate quality. It is derived from category scores, and PvPoke uses a geometric mean so well-rounded Pokemon are favored over Pokemon that spike in one category and collapse in another. Overall is useful for candidate pool ordering and threat weighting, but role-specific categories should drive lead, switch, closer, charger, attacker, and consistency assumptions.

Moves in PvPoke rankings are calculated across opponents. Key Counters and Top Matchups in the Overall view are taken from the Leads category, so avoid interpreting Overall detail sections as a complete role-independent matchup profile.

## Lead

Good leads often have:

- Strong 2-shield performance.
- Broad neutral play.
- Cheap move pressure or fast move pressure.
- Few catastrophic lead losses.
- Ability to create shield, energy, or switch advantage.
- Strong Key Wins into expected lead threats.
- Manageable Key Counters that the backline can cover.

Lead scoring should consider bad-lead recovery. A strong lead with an unsupported shared weakness can still create fragile lineups.

## Switch

Good switches often have:

- Strong switch ranking.
- Broad neutral matchups.
- Low overwhelming-loss count.
- Enough bulk or typing to absorb counter-switch pressure.
- Move coverage that prevents easy farming.
- Moves that punish likely counter-switches.

The safe switch should stabilize bad leads. If switching to the only answer exposes a lineup to ABA shared weakness, penalize that lineup.

## Closer

Good closers often have:

- Strong 0-shield performance.
- High charged move damage or DPE.
- Enough bulk to survive endgame fast move pressure.
- Strong performance when shields are down.
- Ability to exploit energy or shield advantage created earlier.
- Low bait dependence when shields are down.

## Charger And Attacker Signals

Chargers and Attackers can identify specialized pressure roles:

- Chargers simulate 6 turns of energy advantage and can reveal Pokemon that convert energy leads into shield or matchup pressure.
- Attackers simulate no shields vs 2 shields and can reveal Pokemon that pressure even from shield disadvantage.

Use these roles as supporting evidence for lineup plans. A charger may be valuable as a pivot with stored energy. An attacker may be valuable when the lineup often spends shields elsewhere.

## Move Detail Signals

PvPoke move details can inform role fit:

- A stable fast move and stable charged move indicate a consistent role.
- Balanced charged move usage suggests second-move value.
- A low-usage charged move can still be important if it counters common counter-switches.
- Stat-changing moves should be treated as more than raw DPE because they can change endgame or shield dynamics.

## Role Balance

A strong show-6 roster usually contains:

- Multiple viable leads.
- At least one safe switch.
- At least one closer.
- At least one flexible generalist or anti-meta answer.

Do not force rigid templates. A Pokemon can fill different roles in different lineups.
