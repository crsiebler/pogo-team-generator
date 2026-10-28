---
name: gbl-optimizer
description: Implement or review Pokemon GO show-six/pick-three Pareto optimization, opponent scenarios, robust finalist selection, lineup diagnostics, ranking inputs, or blind-three GBL scoring.
---

# GBL Optimizer

## Authority and scope

Use the approved robust tournament roster plan preserved at the repository-relative
path `archive/2026-10-22T060940732592Z-plan-preservation/PLAN.md` (revision 2,
October 21, 2026). It supersedes previous weighted-only tournament instructions.
Read the current implementation and plan acceptance criteria; do not assume a
planned story is implemented. Preserve existing work and report verified status.

The tournament design applies to `mode: PlayPokemon` across supported formats,
including Play! Pokémon. Blind-three GBL retains its existing scoring and
selection behavior. Do not apply a six-member requirement to GBL.

Read `docs/pokemon-go-team-optimization.md` and the relevant subdocuments under
`docs/team-optimization/`: `scoring-model.md`, `lineup-structures.md`,
`coverage-threat-pools.md`, `safety-consistency-bulk.md`, `type-effectiveness.md`,
`role-scoring.md`, `data-inputs.md`, and `validation.md`. During migration,
superseded weighted tournament prescriptions in those documents are not design
authority; reconcile them with the approved plan and actual implementation.

## Tournament objective and selection

Optimize practical battle plans against representative opposing six-Pokemon
rosters. Do not preserve a fixed Threat/Safety/Consistency/Bulk/Synergy weighted
sum or select the strict minimum Threat Score as the tournament objective.

Use finite normalized objective vectors for full-field coverage, backup/counter-pair
redundancy, typical best-plan quality, lower-tail best-plan quality, distinct
viable-trio flexibility, and independent core/pivot options. Audit every eligible
ranked opponent independently of sampled roster scenarios. Follow the versioned
formulas in `docs/team-optimization/tournament-search.md`; do not add a shared-type
cap. Validate objective independence with ablations. Keep
correlated diagnostics explanatory rather than multiplying rewards for the same
evidence. Bulk, Consistency, and Threat Score may inform matchup evidence or
explain results; they are not mandatory independent rewards.

Use nondominated fronts and deterministic objective-space diversity in parent
selection, survival, elitism, and the historical archive. Preserve useful
tradeoffs and objective extremes within the 100-roster archive cap. Handle
constant objectives, equal vectors, duplicate rosters, and unavailable evidence
explicitly. Crowding distance is not a quality score.

Replace scalar convergence with front/archive stability while retaining hard
generation limits. Audit all scalar consumers: population evaluation, parent
tournaments, elitism, cloning, best tracking, convergence, archive retention,
moveset prefilters, finalists, recommendations, multiple-team sorting, and API
serialization. None may silently restore the previous weighted winner.

Fully evaluate finalists on the same broader selection corpus and ranked-field
audit. Current policy compares fixed coverage, redundancy, and lower-tail bands
before flexibility and independence; use exact objectives and canonical ties
as documented. Single-answer exposure and counters to the primary answer must
affect selection, not only diagnostics or mutation. Avoid
non-transitive pairwise epsilon comparators. Calibrate tail fractions, bands,
and sample sizes on tuning data before held-out evaluation; do not derive them
from historical PvPoke Threat Score numbers.

Selection metadata is authoritative for PlayPokemon. If compatibility fields
`fitness` and `scoreBreakdown.score` remain, keep them equal and document their
reporting meaning. Never use them to override Pareto or robust ordering. GBL
retains its existing scalar semantics.

## Opponent scenarios and evidence

Load validated, versioned, format-specific opponent rosters through `lib/data`.
Record species/forms, legal movesets, source, date/context, roster family,
partition, and dataset/policy fingerprint. Prefer verified relevant tournament
rosters; old calibration fixtures are not current-meta usage evidence.

When verified rosters are unavailable, construct deterministic format-legal
synthetic scenarios from synchronized ranked candidates. Freeze the corpus
independently of candidate search and label it synthetic. Cover varied cores and
compositions. Never represent synthetic frequencies as tournament usage.

Deduplicate exact and near-duplicate families. Keep families/events out of both
tuning and held-out partitions. All candidates in a comparison use the same
scenario sample, weights, and evidence policy. Hold-out data must not select the
runtime winner or tune the policy. Do not borrow another format's data.

Only evaluate enemy movesets represented by the matrices. Explicitly label any
projection to ranked defaults as an adaptation, not an exact tournament replay.
Missing evidence is unknown, not a measured loss or zero-risk success. Report
actionable insufficient-data results when fair comparison is not possible.

Require complete 0/1/2-shield evidence for the direct ranked-field audit as well.
Count a stable answer only when the same assigned member wins all three states;
ties are not wins. Never count one member twice against simultaneous counters.
Keep worst-risk aggregation bounded so easy opponents cannot dilute coverage
holes. Do not call the shared direct audit held-out evidence: only opponent
composition families are held out. Report any sampled-plan regression alongside
direct coverage improvement, and do not claim a lower PvPoke Threat Score without
measuring that separate formula.

## Battle-plan evaluation

Enumerate all 120 friendly ordered lead/switch/closer lineups and group them into
20 unordered trio identities. Aggregate hidden opposing-trio/order uncertainty
before choosing the friendly plan. Do not let the evaluator choose a different
friendly trio after observing hidden opponent choices.

Count distinct trios rather than permutations for depth, role flexibility, and
bench appearances. Recommend distinct useful trios with their best supported
orders before repeating one. Several weak plans must not compensate for no
usable response through count alone.

Evaluate all 15 friendly pairs for complementary coverage, shared counters,
third-member protection, and practical answer redundancy. Discount options that
collapse to the same opposing combination. Two answers is a strategic
preference, not a legality requirement.

Use assigned matchup/shield evidence and Switches context for pivot quality.
Average Switches rank alone cannot establish independent options. Evaluate bad
leads, plausible counter-switches, and remaining-partner coverage within legal
enemy rosters. Cover supported ABB plans, fragile ABA shared weaknesses, and
ABA shared strengths in controlled tests. Do not infer behavioral baiting or
actual shield advantage from equal-shield cells.

Measure marginal bench value by removing a member from the available plan set,
not by returning an illegal five-member team. Capture lost scenario answers,
protected cores, and pivot alternatives. A rarely selected specialist can be
useful; appearances alone cannot prove usefulness. Do not award fictional
opponent deterrence or best-of-three adaptation bonuses.

Static matrix evaluation is an approximation, not battle win probability. Do
not invent energy/HP carryover, switch-lock state, shield decisions, or opponent
decision frequencies. More detailed simulations and behavioral modeling remain
deferred unless separately authorized.

## Construction, legality, and performance

Reuse format-relative ranking bands, complementary core seeding, and existing
simulation-backed specialist admission. Target mutations at exposed scenarios,
correlated counters, or missing independent pivots. Use marginal contribution to
identify replaceable non-anchors and retain bounded random exploration.

Preserve legal species/forms, user anchors and exclusions, format rules,
duplicate-base-species limits, and immutable roster movesets. Open-sheet
assumptions prohibit secret-move bonuses. Keep assignments authoritative for
diagnostics, API output, details, and export.

Cache bounded primitives and evaluations by format, moveset assignment, dataset,
shared sample, and policy identity. Avoid unbounded population-by-roster-by-
120-by-120 tensors. Measure evaluation counts, cache behavior, memory, and
runtime. Preserve the representative under-one-minute gate and measure default
generation separately.

## Runtime and UI boundaries

Core logic stays in `lib/genetic/fitness`; typed data loading stays in
`lib/data`; shared contracts stay in `lib/types.ts`. UI and API adapters must
not reconstruct a scalar winner.

Runtime application, components, and optimizer code must never execute, import,
bundle, or load PvPoke vendor JavaScript. Vendor execution is isolated sync
tooling only. Consume validated local normalized rankings and compact simulation
snapshots, with no per-matchup network access. Preserve exact runtime asset
tracing and deployment size limits.

Use `scoreMatchupRating` for continuous matchup quality. Keep explicit
thresholds for categorical diagnostics. Type calculations use
`data/type-effectiveness.json`, including dual-type multiplication.

Preserve Overview component meanings and display-only A/B/C/D/F grades. Threat
Score remains lower-is-better and owns the single team-level profile pill.
Recommended Lineups retain blue diagnostic styling, ordered roles, and semantic
weakness lists, with no numeric lineup score or quality pills. Internal
selection evidence does not mandate new UI.

## Verification and claims

Write meaningful failing behavioral tests before new logic. Test dominance,
tradeoffs, deterministic ordering, shared samples, missing evidence, hidden-trio
oracle rejection, distinct-trio counting, core/pivot independence, marginal
specialists, cache scope, immutable movesets, legality, and GBL preservation.

Compare paired seeds and comparable budgets against the captured weighted
baseline in Play! Pokémon, Great League Pick 6, another supported format, and a
GBL control. Freeze policy before held-out evaluation. Report per-opponent and
lower-tail results, flexibility, redundancy, unknown evidence, and costs. Run
ablations and policy-sensitivity checks. Do not claim better tournament teams
from training scores alone; scrimmage evidence remains external.

Run focused tests, typecheck, lint, full tests, changed-file formatting, build,
and exact route-trace verification. Verify real local generation, API metadata,
assignment authority, and distinct recommendations in the rendered app. Record
actual results and remaining limitations; never mark incomplete plan criteria
complete or report a proposed skill as activated before its file is updated.

The PvPoke tournament guide (updated March 25, 2022) motivates cores, redundancy,
flexibility, and preparation for unfavorable leads. Pareto selection and the
mathematical policies here are project decisions, not claims made by the guide.
