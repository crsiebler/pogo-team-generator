# Robust tournament roster search

Implemented for `mode: PlayPokemon` across supported formats. Blind-three GBL
keeps its existing weighted selection. The PvPoke tournament guide, updated
March 25, 2022, motivates complementary cores, redundancy, useful bench members,
and preparation for bad leads. The objective formulas and Pareto policy below
are project decisions, not formulas prescribed by PvPoke.

## Evidence and scenario authority

`lib/data/opponentRosters.ts` constructs 24 deterministic, legal synthetic
opposing rosters from the selected format's first 120 ranked species with
synchronized matrix rows. Compositions alternate ranked diversity and
complementary-pair construction. They do not use the search's random stream,
user exclusions, or candidate team. They are **not tournament usage data**.

Six unique base species and format restrictions are required. Rosters with five
or more shared species are deduplicated. Sixteen rosters form the selection
corpus; eight independent families form the held-out corpus. Search uses the
first eight selection rosters in canonical ID order. Every candidate uses the
same sample. Equal roster weight is deliberate; no usage probabilities are
invented. No historical calibration fixture is treated as current-meta evidence.

The fingerprint includes format, construction policy, roster assignments, and
the selected candidate matrix cells. Runtime contexts cache within one prepared
snapshot, not across synchronization. Curated ingestion is supported through
`loadOpponentRosters(formatId, curatedInput)` and
`validateCuratedOpponentRosters`. No verified current tournament corpus is
checked in yet. Curated input requires version, matching format/snapshot
fingerprint, HTTPS provenance, verification date, event/family, context,
partition, species, and a parsed moveset assignment. Illegal/stale/duplicate
records retain exclusion reasons; malformed schemas and family leakage fail.

Opponent matrices represent ranked-default enemy moves. Other submitted moves
require explicit adaptation; the resulting scenario is labeled adapted and is
not an exact replay of the published roster. Synthetic fallback fills available
independent compositions. Do not add a new runtime file without updating and
verifying the exact asset-tracing contract through its approval process.

## Static battle plans

For each six-member friendly roster, enumerate 120 ordered lead/switch/closer
plans and 20 distinct trios. Fix the full roster moveset assignment before any
evaluation. Require finite `0..1000` matrix ratings for all relevant friendly
members, enemy members, and equal-shield `0/0`, `1/1`, `2/2` scenarios.

An incomplete roster receives `status: insufficient`, explicit missing-cell
counts, and no selection credit. It cannot beat a complete candidate. If no
finalist is complete, return an actionable data error, including for legal
anchors whose rows were not synchronized. Missing cells are not measured losses.

Policy `roster-plans-v4` supplements these sampled scenarios with the direct
ranked-field audit below. No type-count cap or type-diversity reward is used.

Search samples six cyclic enemy orders, with every enemy occupying every role.
Finalists evaluate all 120 enemy orders. Each friendly order evaluates a static
stay-in matching with the worse backline alignment. On an unfavorable lead, it
also evaluates a fixed pivot: the enemy chooses the worse of its two
counter-switches, the closer handles the retained original lead, and the lead
handles the remaining enemy. The better stay/recovery proxy is retained.

For each opposing trio and shield state, enumerate the six one-to-one matchup
assignments. Take the weakest matchup in each assignment, then the strongest of
those six bottlenecks. Cap the stay/recovery proxy by this distinct-answer bound.
Two favorable cells cannot average away an opposing Pokemon that beats all
three members, and one generalist cannot count as two simultaneous answers to
a counter pair. The bound does not select the friendly trio or replace its
role-aware stay/recovery evaluation; it can only reduce that evaluation.

This is conservative static protection, not a claim that a Pokemon cannot beat
multiple opponents with retained HP/energy in a real battle. It is applied
before aggregating hidden opposing lineups, so the friendly trio remains fixed.
Cache it by the two unordered trio identities and shield state within each
opponent roster (at most 1,200 entries), not by all 120 × 120 role permutations.

Each proxy averages three **distinct paired cells**, never reuses one Pokemon
as two simultaneous answers, and uses the same equal-shield state for all cells.
This is a static matchup approximation. It does not simulate switching, remaining
HP, accumulated energy, actual shield expenditure, timing, opponent learning,
or a full battle win probability.

Aggregate hidden enemy orders and shield states first using the worst-quarter
mean. Only then choose the best friendly plan for the opposing visible six.
Choosing a new friendly trio after observing the hidden enemy trio is prohibited.

## Objectives and structural evidence

All six objectives are finite, maximized, and normalized to `0..1`:

| Objective    | Definition                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------- |
| Coverage     | Protection against the six worst distinct-Dex first-answer risks across all ranked opponents    |
| Redundancy   | Minimum of backup-answer protection and legal counter-pair protection across the ranked field   |
| Typical      | Mean best-plan quality across opposing rosters                                                  |
| Lower tail   | Mean of the worst 25% of those roster qualities                                                 |
| Flexibility  | Mean fraction of 20 distinct trios with an order scoring at least 0.5 against each enemy roster |
| Independence | Minimum of protected-core option coverage and complementary viable-pivot coverage               |

The 0.5 cutoff refers to neutral static matchup quality, not the previous 0.55
weighted diagnostic cutoff. Counting several weak plans cannot improve
flexibility. Permutations cannot multiply trio depth.

All 15 pairs are checked. A shared counter must be covered by **one coexisting
third member** in a useful plan against that particular opposing roster.
Different unavailable third members cannot jointly protect a core. Pivot options
must participate in useful plans; their matrix counter profiles determine
complementarity. Identical vulnerable pivots do not get independent coverage
credit. Pivot complementarity is the largest fraction of opposing matchups
covered by exactly one of two viable pivots; overlap does not add independent
protection. This correction is policy `roster-plans-v5`; the recorded v4
calibration predates it. Switches/role rankings remain supporting ordering
evidence, not a substitute for matchup-backed pivot coverage.

Marginal member value compares best available plans with plans excluding that
member, plus loss of unique core protection among members of useful plans.
It guides replacement of non-anchors and remains diagnostic. There is no
appearance-count penalty, opponent deterrence bonus, or behavioral bait model.

### Direct coverage and backup audit

Audit every eligible Overall-ranked opponent, independent of the sampled roster
construction pool (1,138 for the checked-in Play! Pokémon snapshot). Missing or
invalid 0/1/2-shield cells make a roster insufficient, including cells outside
the sampled scenarios. The shared evidence identity includes the audit universe
and ranking priorities; per-member profiles are cached by species and fixed
variant within one scoring context, bounded to 512 profiles.

For each member/opponent pair, take the minimum soft matchup quality across
0/0, 1/1 and 2/2 shields. An answer requires a battle rating strictly above 500
in **every** state. Ties and wins that disappear in another shield state do not
count as stable answers. The strongest and second-strongest distinct members
provide first-answer and backup quality. Risk is `(1 - quality) × ranking/100`,
using the existing average ranking score as strength, not observed usage.

Coverage is one minus the mean of the six largest first-answer risks, with at
most one form per Dex. Backup coverage uses the same rule for second answers.
This bounded worst-risk mean prevents numerous easy opponents from diluting
serious gaps. Counts of uncovered and single-answer opponents describe the full
field, so they include weak species and multiple forms; they are not usage rates.

Stress the six largest backup gaps against each other and against up to twelve
strongest counters to each gap's primary answer. Exclude same-Dex and otherwise
illegal pairs. For each pair, maximize the weakest quality over distinct friendly
answers; never reuse one member twice. Pair risk uses the smaller of the two
ranking priorities. Pair protection is one minus the mean of the six largest
pair risks; redundancy is the minimum of this protection and backup coverage.
These are conservative static checks, not a sequential switch/energy simulation
or a requirement that every opponent have two winning answers.

The audit and bounded gap list are returned in `tournamentSelection.coverageAudit`.
Held-out **compositions** remain separate; the direct ranked-field audit is shared
across search, selection, and held-out stages and is not held-out validation.

## Evolution, archive, and finalists

Use nondominated sorting and normalized crowding distance for parent tournaments,
elites, parent/offspring survival, and the 100-roster historical archive.
Canonical identities break ties. Invalid/missing evidence follows complete
evidence. Clone selection metadata without sharing mutable objective objects.
Offspring are reevaluated before selection.

Existing format-relative bands, anchor-first complementary seeding, specialist
eligibility, legality, and a random exploration path remain. Guided mutation
targets a low-marginal-value non-anchor, audits legal replacements against the
full ranked field, shortlists up to three by coverage then redundancy, and
compares their scenario plans.
Do not admit an otherwise ineligible specialist through this repair path.

Stop on eleven generations of unchanged bounded archive identity/objectives,
subject to the hard generation limit. Scalar fitness stagnation does not stop a
changing Pareto archive. Search caches retain at most 256 roster evaluations;
keys include format, assignment, dataset, stage, and policy. Full lineup caches
retain assignment authority for final diagnostics. No population × enemy roster
× friendly order × enemy order tensor is retained.

Experimental alternate movesets retain the 729-assignment upper bound and
12-full-assignment shortlist per finalist. The shortlist uses scenario vectors
and Pareto diversity; the legacy scalar assignment prefilter cannot eliminate
tournament tradeoffs. Normal generation has one ranked-default assignment.

Final ordering uses fixed 0.025-wide coverage bins, redundancy bins, then
lower-tail bins, flexibility, independence, exact coverage, exact redundancy,
exact lower tail, typical quality, and canonical identity. Fixed
bins are transitive; a pairwise epsilon comparison is not. These bins have edge
effects, recorded in sensitivity testing. Multiple-team output uses the same
ordering. A lower diagnostic Threat Score cannot override these objectives.
This is not PvPoke's Threat Score formula and does not guarantee a score below 550.

## Reporting and recommendations

`tournamentSelection` is the authoritative selection metadata. Compatibility
fields `fitness` and `scoreBreakdown.score` both report typical plan quality.
`scoreBreakdown.scoreBasis` is `tournament-typical`; diagnostic component weights
do **not** reconstruct this score. The old weighted roster helper remains a
diagnostic/calibration utility and does not select production Pick 6 teams.

Overview components and lower-is-better Threat Score retain their diagnostic
meanings and existing A–F UI. Recommendations use scenario plan quality and
supporting role fit, emit distinct useful trios before repeating a trio, and
retain lead/switch/closer fields. No numeric plan score or new quality pill is
shown. Assignment, diagnostics, API output, details, and exports all refer to
the selected finalist.

See [validation results](tournament-validation.md) for measured evidence and
limitations. Static synthetic evidence cannot establish tournament win rates.
