# Tournament search validation — October 21, 2026

The original measurements below describe policy `roster-plans-v1`. The later
shared-counter repair is recorded at the end of this document; do not compare
scores across the two policies as if their objectives and corpora were identical.
The final v4 calibration section supersedes earlier open calibration/build
limitations. Optimizer closeout verification and acceptance status are recorded in the
[archived optimizer plan](../../archive/2026-10-22T060940732592Z-plan-preservation/PLAN.md).

## Scope and reproducibility

The comparison baseline was captured **before** replacing the weighted search,
from the existing uncommitted Play! Pokémon/threat-weighted implementation on
HEAD `5e707ecd3d155f44dcba751289456df48b040327`. It was not reconstructed from
HEAD alone. Local capture: `build/tmp/tournament-baseline.json`.

`lib/scripts/validateTournamentSearch.ts` compares seed 20 at population 8 and
3 generations in Play! Pokémon, Great League Pick 6, Ultra League Pick 6, and
Great/Ultra League GBL controls. Search budgets are the same population and
generation settings; evaluation costs are not identical. All compared rosters
are evaluated on the same format-specific scenarios and fixed movesets.

Sensitivity sweeps use selection data only, with tail fractions 0.15/0.25/0.40
and lower-tail bins 0.01/0.025/0.05. The production policy remains the central
0.25/0.025 setting before held-out evaluation. These are initial engineering
parameters, not empirically established tournament-optimal thresholds.

Raw local results, including per-opponent qualities, are in
`build/tmp/tournament-validation.json`. The corpus is synthetic: 16 selection
rosters and eight held-out families, with no five-member overlaps. Held-out
scores were not used to select runtime teams or change the policy. One seed and
synthetic compositions provide regression evidence, not statistical proof of
competitive improvement.

## Measured comparison

Values below are static normalized plan quality, **not win probability**.

| Format              | Selection tail: weighted → new | Held-out tail: weighted → new | Held-out typical: weighted → new | New generation time |
| ------------------- | ------------------------------ | ----------------------------- | -------------------------------- | ------------------- |
| Play! Pokémon       | 0.3649 → 0.4071                | 0.3887 → 0.4212               | 0.4543 → 0.5004                  | 2.35 s              |
| Great League Pick 6 | 0.3739 → 0.3812                | 0.3422 → 0.3683               | 0.4237 → 0.4307                  | 1.91 s              |
| Ultra League Pick 6 | 0.3411 → 0.3501                | 0.3572 → 0.3533               | 0.4044 → 0.4106                  | 2.10 s              |

Ultra League's held-out lower tail regressed by about 0.0039 despite better
selection performance. No claim of universal improvement is supported. Its
held-out viable-trio fraction and independence also did not improve. More
independent seeds, curated contemporary rosters, and scrimmages are needed to
establish external quality.

Both GBL controls returned exactly the same teams and scores as the weighted
baseline. The new tournament reporting score has a different meaning, so raw
old/new `fitness` values are not compared as if they were the same metric.

## Ablations and sensitivity

At the same small Play! Pokémon search budget:

| Search variant                       | Selection lower tail | Flexibility | Independence |
| ------------------------------------ | -------------------- | ----------- | ------------ |
| All objectives and targeted mutation | 0.4071               | 0.1750      | 0.3646       |
| No targeted mutation                 | 0.3996               | 0.1125      | 0.3958       |
| Omit typical objective               | 0.4219               | 0.0656      | 0.3229       |
| Omit lower-tail objective            | 0.4071               | 0.1750      | 0.3646       |
| Omit flexibility objective           | 0.4071               | 0.1750      | 0.3646       |
| Omit independence objective          | 0.3923               | 0.1500      | 0.3125       |

The omitted-typical variant illustrates a useful tradeoff: greater tail quality
with fewer options. Identical winners in two ablations do not prove those
objectives redundant; this budget/seed is too small for that conclusion.
The retained nondominated archive sizes were 1/13, 1/12, and 3/14 for
Play! Pokémon, Great League, and Ultra League respectively. This run did not
produce an unmanageably broad Pareto front.

All nine tail/bin combinations selected one common candidate for Play! Pokémon
and one for Ultra League from each combined candidate bank. Great League had
two distinct winners. Results also include evaluations on every second selection
roster as a composition-sensitivity check. These checks are evidence to revisit
policy, not a reason to reintroduce fixed metric weights.

## Performance and limitations

Default Play! Pokémon generation (population 150, cap 75 generations, seed 20)
completed in **24.94 seconds**, stopping after archive stability at generation 71. It retained and fully compared 100 finalists. The final diagnostic cache
recorded 12,000 misses and 120 hits. Process RSS at completion was 349,323,264
bytes; this is a process measurement, not isolated algorithm peak memory.

The representative integration test remains below its one-minute gate.
Search caches are capped at 256 roster evaluations; no four-dimensional
battle-state tensor is retained. Experimental many-variant runs have bounded
assignment counts but have not been benchmarked at the worst-case 100 × 729
combination workload.

Legal unsupported anchors can lack synchronized rows. Pick 6 now reports this
as an actionable insufficient-evidence error; it cannot certify the roster
through fabricated losses or zero-risk credit. Battle Frontier Master tests
retain supported multi-Mega generation and separately cover unsupported legal
anchors. GBL behavior is unchanged.

## Test order and final checks

New dominance/robust-ordering tests were run against scalar placeholder behavior
and failed before implementation. New corpus and opponent-plan tests failed on
explicit unimplemented behavior before implementation. Structural/marginal tests
were added during integration, after the first implementation of those helpers;
this is not claimed as fully test-first development.

Additional regressions cover Pareto variant shortlisting despite adverse legacy
scores, immutable assignments, clone metadata, independent pivots, impossible
core protection, permutation duplication, unknown evidence, stage-scoped caches,
distinct recommendations, API reporting, and GBL preservation. Final repository
checks and rendered verification are recorded in the
[archived optimizer plan](../../archive/2026-10-22T060940732592Z-plan-preservation/PLAN.md).

## Shared-counter repair: initial policy v2

The user reported Aegislash (Shield), Corviknight, Doublade, Melmetal, Tinkaton,
and Umbreon: five Steel types. Inspection of the synchronized Play! Pokémon
matrix found that Shadow Annihilape beats all six in the one-shield scenario
(ratings 60, 475, 435, 403, 278, 317 respectively). Turtonator also beats all six
there, but its rank of 99 placed it outside v1's first-60 opponent candidate pool.
These are local matrix observations, not tournament win-rate measurements.

A controlled regression reproduced the aggregation error before repair: a trio
with no answer to one enemy still scored 0.6667 because its wins against the
other two enemies averaged away the loss. Policy v2 bounds each opposing-trio
and shield-state quality by its weakest best available answer. The regression
now rejects this trio as viable and rewards supplying an answer. The opponent
candidate pool expands to 120; corpus and policy fingerprints change together.
Neither change adds a shared-type cap or rewards typing diversity by itself.

Default runs with seeds 7, 20, and 42 selected Galarian Corsola, Corviknight,
Doublade, Melmetal, Tinkaton, and Umbreon. This still has **four Steel types**.
It is evidence of repairing a scoring blind spot, not a claim that type
concentration is resolved or that this is a verified tournament-ready roster.

Under the same v2 evidence for both teams:

| Metric                   | Reported five-Steel roster | New roster |
| ------------------------ | -------------------------: | ---------: |
| Selection lower tail     |                     0.4055 |     0.4542 |
| Held-out lower tail      |                     0.3666 |     0.4249 |
| Held-out typical quality |                     0.4861 |     0.5232 |

Seed 20 default generation completed in 33.92 seconds. The wider corpus remains
synthetic and bounded; it does not include every legal counter. The held-out
results were inspected after fixing the policy, not used to select its winner.
No new broad multi-format calibration or scrimmage result is claimed.

Local captures: `build/tmp/steel-diagnosis.json`, `steel-v2-fixed.json`,
and `steel-v2-seeds.json`. The live API returned policy v2, the
same selected roster, consistent reporting fields, and five distinct trios.
Focused tests passed (242); full tests passed (1,199 across 101 files).
Typecheck, lint, formatting, production build, and exact route tracing passed.
Existing Vitest warnings about nested `vi.unmock` calls remain unrelated.

### Distinct shared-counter protection: policy v3

The user explicitly chose matchup-driven selection and stronger shared-counter
protection, with no shared-type limit. A second test reproduced the case in
which one generalist was the only answer to two coexisting enemies. The trio
still scored 0.6667 under v2. The v3 guard computes the best bottleneck over all
six one-to-one matchup assignments, so a member cannot be counted twice as a
simultaneous answer. The test fails before this change and passes afterward;
adding an independent second answer restores useful plans. Single-counter,
missing-evidence, permutation, and other existing checks remain in place.

This is a conservative static guard. It does not simulate HP/energy carryover
or establish that one Pokemon cannot defeat multiple enemies in a real battle.
The actual lead/pivot plan is still evaluated before hidden-opponent uncertainty
is aggregated; the matching guard only caps that score. Its per-opponent cache
is bounded to 20 × 20 unordered trio pairs × three shield states.

Seed 20 default generation completed in 26.44 seconds and again selected the
Galarian Corsola roster above, with four Steel types. Under the same **v3** corpus
and policy, the original roster's selection lower tail was 0.3495 versus 0.4118
for the selected roster; held-out lower tail was 0.2704 versus 0.3615. These
values cannot be compared directly with v1/v2 values as an improvement measure.
Remaining concentration is disclosed, not hidden behind a type-diversity claim.
The candidate corpus remains synthetic and incomplete; external tournament
quality still requires independent current rosters and scrimmages.

Seeds 7 and 42 repeated that v3 default result. Both Great/Ultra League GBL
controls preserved their baseline teams and scores exactly. Final focused tests
passed (243); the full suite passed (1,200 tests across 101 files, 72.97 seconds).
Typecheck, lint, changed-file formatting, production build, route tracing, and
the real local API metadata/reporting/distinct-trio smoke check passed.
Current captures are `build/tmp/steel-fixed.json`, `steel-seeds.json`, and
`steel-api.json`. No production deployment was performed.

### Full ranked-field coverage and backups: policy v4

The reported four-Steel roster had a PvPoke Threat Score of 573. Fifteen of its
twenty screenshot threats were absent from the final sampled opponent rosters.
Policy v4 therefore audits every eligible ranked opponent independently of the
synthetic scenario corpus. Three causal regressions failed before implementation:
an unsampled counter was ignored, missing unsampled evidence still counted as
complete, and sampled flexibility overrode improved first/backup coverage.
All now pass. Additional tests cover stable all-shield answers, ties, distinct
pair answers, dilution by easy opponents, context-cache isolation, and the
reported real roster versus complementary coverage.

The policy and formulas were fixed before inspecting held-out compositions.
Comparisons below evaluate the old and new rosters with the same v4 evidence.
Counts span all 1,138 ranked forms, not tournament usage, and require the same
member to win strictly above 500 in all three equal-shield states.

| Measurement                     |      Reported v3 roster | New seeds 20 / 7 | New seed 42 |
| ------------------------------- | ----------------------: | ---------------: | ----------: |
| Uncovered opponents             |                      35 |                2 |           3 |
| Single-answer opponents         |                     101 |               70 |          75 |
| Coverage objective              |                  0.2519 |           0.6061 |      0.5840 |
| Redundancy objective            |                  0.1328 |           0.1405 |      0.1276 |
| Counter-pair protection         |                  0.1653 |           0.2542 |      0.2873 |
| Selection lower tail            |                  0.4118 |           0.2450 |      0.3036 |
| Held-out composition lower tail |                  0.3615 |           0.1375 |      0.2864 |
| Default generation time         | 26.44 s (historical v3) |  38.23 / 38.09 s |     35.35 s |

Seeds 20 and 7 selected Araquanid, Carbink, Clodsire, Corviknight, Medicham,
Umbreon. Seed 42 selected Corviknight, Shadow Dragonair, Mantine, Medicham,
Melmetal, Umbreon. No type limit was applied. GBL Great/Ultra control teams and
fitness values remained exactly equal to the captured baseline.

This improves broad coverage while sacrificing sampled plan quality. The
redundancy objective itself regressed slightly for seed 42 despite fewer
single-answer opponents and stronger pair protection; the comparator prioritizes
coverage bands first. Do not describe these results as a universal tournament
improvement or a measured reduction in PvPoke's separate Threat Score. The
direct audit is shared by every stage, so its results are not held-out evidence.
No new broad multi-format ablation/sensitivity or scrimmage result is claimed.

Verification: 1,209 tests across 102 files passed (68.99 seconds), as did
typecheck after route type generation, lint, changed-file formatting, and the
real local API smoke check. The API returned v4, complete 1,138-opponent evidence,
consistent fitness/score reporting, a fixed assignment, and five recommendations.
Focused audit coverage: 98.90% lines, 92.06% branches, 100% functions.

Full-suite V8 coverage instrumentation timed out three existing architecture/
snapshot tests; its run did not pass. The normal full-suite rerun passed with
unchanged assertions and timeouts. Production build failed on the Next.js worker
port permission (`Operation not permitted`), including the escalated retry;
current production trace verification therefore remains unverified. Earlier
successful v3 build/trace records above are historical, not v4 results.

Captures: `build/tmp/coverage-validation.json`, `coverage-gbl.json`,
`coverage-api.json`, `coverage-tests-clean.log`, `coverage-tests-final.log`,
`coverage-focused.log`, and `coverage-build-final.log`. No deployment was made.

## Current v4 calibration completion

The durable [v4 calibration report](calibration-v4.json) records three paired
seeds (20, 7, 42), population 8, and three generations in Play! Pokémon,
Great League Pick 6, Ultra League Pick 6, and both Great/Ultra GBL controls.
This is a bounded regression/calibration experiment, not a default-budget or
tournament win-rate study. Default-budget v4 results above remain separate.

The weighted baseline was recovered in an isolated local module tree. Its
three scoring-file SHA-256 values match the original plan; pre-Pareto search
modules come from the recorded commit, with the earlier lineup tie-breakers
retained. All five original seed-20 teams and exact fitness values replayed
successfully before expanding the baseline to the other seeds. No working
optimizer source was rolled back. Source manifests and reconstruction/replay
helpers are preserved under `build/tmp/`; the durable report includes the
baseline identity and scoring hashes.

Both implementations use the same synchronized format data and random seeds.
Their selected teams are assessed against the same v4 scenarios and assignments.
All measured selection/held-out results have zero missing cells. GBL teams and
scores match exactly in all six paired control runs, as do their matchup-call
counts.

### Observed tradeoffs

These are three-seed means. Coverage and redundancy are shared full-field
diagnostics, **not held-out evidence**. Only composition families are held out.

| Format              | Coverage: weighted → v4 | Redundancy: weighted → v4 | Held-out lower tail: weighted → v4 | Held-out typical: weighted → v4 |
| ------------------- | ----------------------- | ------------------------- | ---------------------------------- | ------------------------------- |
| Play! Pokémon       | 0.3432 → 0.4390         | 0.1446 → 0.1356           | 0.3490 → 0.3051                    | 0.4472 → 0.4214                 |
| Great League Pick 6 | 0.4793 → 0.5116         | 0.1724 → 0.1959           | 0.2696 → 0.2252                    | 0.3570 → 0.3439                 |
| Ultra League Pick 6 | 0.4374 → 0.4886         | 0.1493 → 0.1564           | 0.2482 → 0.2289                    | 0.3569 → 0.3272                 |

Coverage improves in eight of nine tournament runs. Held-out lower-tail quality
decreases in seven, ties in one, and improves in one. Redundancy improves in
five and decreases in four. Great League's selected teams have zero viable-trio
fraction and independence at the fixed 0.5 static-plan cutoff in this experiment.
These findings establish a material limitation: prioritizing roster-wide answers
does not guarantee strong pick-three plans. They do not establish that the
static conservative evaluator accurately predicts real tournament performance.

The policy was frozen before held-out evaluation; these results did not trigger
threshold tuning or a new hidden weight. The implementation fulfills the
requested coverage-first correction, but a future quality-policy revision should
test a minimum acceptable plan-quality constraint on tuning compositions and
then use new independent validation compositions. Reusing these observed
held-out scores to select a new threshold would invalidate their hold-out role.

The user's separate PvPoke screenshot reports 541 for the default Araquanid /
Carbink / Clodsire / Corviknight / Medicham / Umbreon team, versus the earlier
reported 573. That is user-provided external evidence, not a reproduced score
from this calibration or a threshold calibrated by this project.

### Ablations and policy decision

The nine tail/band combinations (tails 0.15/0.25/0.40; bands 0.01/0.025/0.05)
use only selection compositions and a fixed combined old/new candidate bank.
Seven comparisons have one winner across the sweep; Play! Pokémon seed 42 and
Ultra League seed 7 have two. Re-evaluation on every second selection roster
also records composition sensitivity. This latter check changes the evaluation
sample, not the evolutionary search corpus.

Final-selection objective ablations use that same candidate bank. Removing
coverage changes the winner in seven comparisons; removing lower tail changes
one. Removing redundancy, typical, flexibility, or independence changes none at
this small budget. This does not prove those objectives redundant: several
are zero or only consulted after the coverage bands distinguish candidates.
Controlled structural tests remain the evidence for their intended behavior.
No objective is pruned on this insufficient sample.

The three Play! Pokémon runs additionally omit each objective from evolutionary
population/archive selection and disable targeted mutation in separate runs.
These evolutionary objective ablations retain full-policy mutation and final
ranking; they must not be described as whole-algorithm objective removal.
Disabling targeted mutation preserves the winner for seeds 20 and 7, but changes
seed 42, reducing coverage from 0.4299 to 0.3828 while increasing typical plan
quality. That is a tradeoff, not proof that targeted mutation always helps.

Retained fronts span 2–8 nondominated candidates in archives of 10–13 finalists.
The front does not consume the entire candidate bank in these runs. Keep the
versioned engineering policy (tail 0.25, band 0.025, viability 0.5, scenario
counts 8/16/8); sensitivity does not justify finer precision or a claimed optimal
value. Verified current tournament rosters and scrimmages remain external work.

### Work and memory accounting

Tournament generation takes 1.46–1.85 seconds versus 1.13–1.57 seconds for the
weighted baseline at the small budget. Timing excludes later validation work.
Both use 32 population evaluations (8 initial plus 3 × 8); v4 caches 11–14 unique
search evaluations with 18–21 hits. Finalist and assignment/lineup counts are
recorded separately. Default-budget timing remains the earlier 35–38 seconds.

Counters instrument isolated copies of the two data accessors,
`getMatchupResult` and `getShieldScenarioMatchupResult`. They count calls,
including repeated cached requests, not engine simulations or unique cells.
Total calls average 9.1%, 10.7%, and 6.6% higher for v4 in Play! Pokémon, Great
League, and Ultra League respectively. Budgets are comparable but not identical;
the extra shield evidence and differing operations are explicit costs.

Baseline process RSS at capture spans 188–368 MB; the current long-lived
validation process spans 437–606 MB after candidate-bank sweeps and ablations.
These are cumulative residency measurements, not isolated generation peaks,
and must not be presented as a per-team memory regression. Cache caps remain
covered by tests. Worst-case alternate-moveset workloads remain unbenchmarked.

Re-run the comparison with an available captured baseline using:

```sh
bun run lib/scripts/validateTournamentSearch.ts build/tmp/weighted-baseline-counted.json build/tmp/tournament-validation-v4.json
```

The script now defaults to a separate v4 output path, preserving the historical
v1 report. Accessor counts in the durable report came from the isolated
instrumented copies; the normal runner reports native search/finalist counters.
