# Implementation plan: Robust tournament roster search

## Objective and approved revision

Select PlayPokemon show-six/pick-three rosters by the battle plans they provide
against representative opposing rosters. Use Pareto-based evolutionary search
followed by robust finalist selection, rather than a fixed weighted sum or
strict minimization of Threat Score.

- Plan revision: 2, October 21, 2026.
- Implementation policy: `roster-plans-v4`. Subsequent user corrections require
  full-field coverage, backup answers, and shared-counter protection without a
  shared-type cap. The as-built selection order below incorporates that change;
  earlier policy measurements remain historical evidence.
- Approval source: the user's request to revise this plan with the proposed
  multiobjective approach and explicit release of the previous fixed weights.
- Implementation was authorized by “Begin implementation of the plan.” The
  user subsequently required replacing the optimizer skill from this plan and
  not using its previous weighted-only instructions. The replacement is installed.
- All existing story IDs are retained. All planned stories are complete; the
  final evidence record below distinguishes implemented behavior from external
  tournament-quality validation and future policy improvements.
- Primary reference: [PvPoke tournament guide](https://pvpoke.com/articles/strategy/tournament-guide/),
  updated March 25, 2022. Cores, redundancy, flexibility, and unfavorable-lead
  preparation motivate this design. Pareto search and the mathematical policies
  below are project design decisions, not prescriptions from the guide.
- Repository guidance: `AGENTS.md`, `lib/AGENTS.md`,
  `.agents/skills/gbl-optimizer/SKILL.md`, and optimizer documentation.
- Baseline: HEAD `5e707ecd3d155f44dcba751289456df48b040327` plus the current
  uncommitted Play! Pokémon format and threat-weighted scoring work. Preserve
  that work as the comparison baseline; HEAD alone is insufficient.
- Current branch: `main`. Changes remain local and uncommitted. Existing
  unrelated work, including separately changed package versions, is preserved.
- Recommended specialists are advisory only; no delegation is authorized.

### Changes from revision 1

- Remove the 50/20/15/10/5 constraint and the requirement to express improvements
  through weighted Safety/Synergy components.
- Add opposing-roster scenarios, objective vectors, nondominated selection,
  diversity preservation, and robust finalist comparison.
- Retain distinct-trio depth, cores, independent pivots, recovery, evidence-based
  specialists, immutable movesets, deterministic behavior, and bounded execution.
- Do not preserve the old fixed 0.55 weighted-quality viability cutoff or scalar
  convergence rule automatically. Replace them with documented scenario-quality
  and practical-equivalence policies validated in TG-01/TG-07.
- Bulk, Consistency, Threat Score, and existing Overview components become
  explanatory diagnostics and/or underlying matchup evidence, not mandatory
  independent rewards. Preserve their current display meaning unless explicitly
  migrated and documented; do not relabel a new metric as an old one.

## Scope and boundaries

- Apply the new search to `mode: PlayPokemon` across eligible formats, including
  Play! Pokémon. Preserve blind-three GBL selection in this revision; shared
  utilities must not add six-member requirements or change its objective.
- Keep legal species, user anchors, exclusions, format rules, fixed roster
  movesets, existing specialist eligibility gates, and open-sheet assumptions.
  Do not award secret-move or unsupported opponent-surprise bonuses.
- Retain all 120 ordered friendly lineups and 20 unordered trios. Keep the
  100-roster finalist limit; change archive retention within that limit so it
  preserves useful nondominated tradeoffs rather than only scalar winners.
- Use validated local normalized data and injected simulation contexts. No
  runtime vendor PvPoke execution, per-matchup network access, package additions,
  production deployment, or configuration changes are part of this plan.
- New opponent-roster fixtures and typed loaders are in scope. Existing matchup
  data is the initial evidence source; generating energy/HP/switch simulations
  is deferred. Never substitute another format's data to cover missing inputs.
- Treat matchup results as static approximations, not battle win probabilities.
  Do not invent shield outcomes, energy carryover, switch-lock state, or opponent
  decision probabilities. Do not label synthetic rosters as tournament usage.
- Bench evaluation measures changes in available plans. Actual behavioral
  deterrence and best-of-three opponent learning are deferred.
- Preserve the visual contract: A–F Overview diagnostics, one threat profile,
  role-ordered recommendations, no numeric lineup scores or new mandatory UI.
  Internal/API selection metadata may change with explicit compatibility tests.

### Baseline identity

These SHA-256 values identify the inspected working files. At execution start,
reconcile any subsequent changes rather than restoring these versions.

| File                                    | SHA-256                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| `lib/genetic/fitness/scoreBreakdown.ts` | `eb5a04fc0988784008ed2db10b52ee34bd363d1a6e79de222b81941a5a53e91e` |
| `lib/genetic/fitness/rosterScoring.ts`  | `642ec4d03d7a06713287285a072f126652774a39d70d9366c53027672629e6e5` |
| `lib/genetic/fitness/lineupScoring.ts`  | `e9375f1509e1a3297d0846009220f680722694d4ed92512dc58ea8053fee0c4c` |
| `.agents/skills/gbl-optimizer/SKILL.md` | `4b44c7592c1f649598b9f270fca4d1bf0a2eecd03056e96233bbc16db4d79c3a` |

## Algorithm design

1. Load a versioned, format-specific opponent scenario set with provenance,
   immutable moveset identity, missing-data metadata, and separate tuning and
   held-out evaluation partitions.
2. Evaluate each friendly ordered trio against a bounded set of opposing trios
   and lead arrangements from each opposing roster. Summarize its matchup
   strength and bad-lead recovery before selecting friendly plans.
3. Group by friendly trio. Measure the best robust plan and independent viable
   alternatives for each opposing roster; do not count reorderings as new trios.
4. Produce a compact objective vector:
   - Full ranked-field first-answer coverage.
   - Backup-answer and distinct counter-pair protection.
   - Typical best-plan quality across opponent rosters.
   - Lower-tail best-plan quality across difficult opponent rosters.
   - Distinct viable-trio flexibility across opponent rosters.
   - Independent core/pivot redundancy that keeps plans available.
5. Use nondominated sorting with diversity preservation for parent selection,
   survival, and a bounded cross-generation archive. Explicit normalized objective
   ranges prevent scale accidents; no hidden weighted sum decides the winners.
6. Fully reevaluate retained finalists on the same broader local scenario set.
   Compare fixed coverage, redundancy, and lower-tail bands in that order,
   followed by flexibility, independence, exact coverage/redundancy/lower tail,
   typical quality, and stable identity. This coverage-first correction can
   sacrifice sampled lineup quality; calibration must disclose that tradeoff.
7. Return a selected roster plus distinct role-ordered recommendations and
   evidence explaining tradeoffs. Keep comfort anchors mandatory and preserve
   meaningful alternatives when multiple teams are requested.

### Important evaluation rules

- Both players know the six-member rosters, not the other's chosen trio. Aggregate
  opposing-lineup uncertainty for a friendly plan before choosing that plan.
  Never select a different perfect friendly response after observing each hidden
  opposing trio and present that oracle result as playable strength.
- Opposing Pokemon in a recovery scenario must coexist on its legal roster.
  Maintain evidence for the pivot and remaining partner; independent matrix
  cells cannot prove a full sequential recovery.
- Use the same scenario identities and evidence coverage policy for every
  candidate in a comparison. A candidate cannot improve by omitting hard or
  missing matchups. Unknown evidence is distinct from a measured loss.
- Initial typical performance uses equal weight per deduplicated scenario roster,
  not undocumented usage estimates. Actual frequency weighting is optional only
  when sourced. Report sensitivity to scenario composition.
- Tail fraction, quality bands, equivalence widths, and workload caps must be
  versioned and justified by controlled fixtures and tuning-set sensitivity.
  Do not infer reliability bands from arbitrary rounding or tune on held-out
  results. These are implementation parameters, not new user weight choices.
- Avoid pairwise fuzzy equality as a sort comparator: it can be non-transitive.
  Use fixed policy bands or a comparison-set-relative shortlist followed by a
  deterministic ordering. Test insertion and permutation invariance.
- Build bounded work from a common deterministic scenario sample for evolution
  and a larger common set for finalists. Cache primitive matchup/pair/trio
  evidence; do not allocate an unbounded population × roster × 120 × 120 tensor.

## Dependencies and integration ownership

Stable IDs are intentionally not renumbered. Execution order:

`TG-01 → TG-09 → TG-02 → {TG-03, TG-04} → TG-05 → TG-10 → TG-07 → TG-08`

TG-06 depends on TG-03 and TG-04 and also feeds TG-10. The story-level
prerequisites below are authoritative. TG-10 owns final selection/API coherence,
TG-07 owns end-to-end acceptance and calibration, and TG-08 owns documentation
and final repository verification.

## Ordered stories

### TG-01 — Define multiobjective contracts and baseline evidence

- [x] Story complete — baseline replay and counts recorded in final v4 calibration
- Priority: 1
- Depends on: none
- Requirements: replace fixed weighted selection; preserve legality, anchors,
  GBL behavior, diagnostic meaning, and truthful evidence.
- Paths: `lib/types.ts`, `lib/genetic/fitness/scoreBreakdown.ts`,
  `lib/genetic/fitness/optimizerValidationFixtures.test.ts`, optimizer docs.
- Recommended expertise: primary implementer; bounded `architect-reviewer`
  and `test-automator` review if later authorized.

Acceptance:

- [x] Define typed objective vectors, scenario policy/version, evidence
      availability, selection metadata, and deterministic canonical identities.
      Specify each objective's direction, range, and treatment of missing evidence.
- [x] Define scenario-quality, tail, and equivalence policy contracts without
      importing the old weighted 0.55 cutoff as a requirement.
- [x] Inventory every scalar consumer: population evaluation, parent tournaments,
      elitism, convergence, archive retention, moveset reranking, final selection,
      recommendations, multiple-team sorting, cloning, API serialization, and UI.
- [x] Establish a mode-aware compatibility contract. For PlayPokemon, selection
      metadata is authoritative. If numeric `fitness`/`scoreBreakdown.score`
      remains, both represent the same documented reporting metric and never
      silently replace Pareto/robust ordering. GBL keeps its existing semantics.
- [x] Capture seeded baseline outputs and runtime/evidence counts. Add tests
      for dominance, meaningful tradeoffs, missing evidence, and no scalar
      override before implementing those behaviors.

### TG-09 — Build validated representative opponent scenarios

- [x] Story complete
- Priority: 1
- Depends on: TG-01
- Requirements: realistic opposing combinations, reproducible comparisons,
  and independent validation rather than individual-threat-only scoring.
- Paths: proposed `lib/data/opponentRosters.ts`,
  `data/opponent-rosters/`, existing calibration/ranking/simulation loaders.
- Recommended expertise: primary implementer; `data-researcher` for bounded
  provenance work if later authorized.

Acceptance:

- [x] Schema validates six-member legality, format, species/forms, movesets,
      provenance, date/context, roster identity, and dataset/policy fingerprint.
      Reuse existing loaders; existing 2024 calibration rosters are not assumed
      representative of the current meta.
- [x] Prefer verified tournament rosters appropriate to the selected rules.
      Exclude illegal/stale entries with recorded reasons; never silently edit
      their composition or claim old results describe current performance.
- [x] Provide a deterministic format-legal synthetic fallback from supported
      ranked candidates when curated evidence is absent. Include diverse cores
      and archetypes; freeze it independently of the candidate search, label it
      synthetic, and expose that limitation in internal result metadata.
- [x] Use compatible opponent movesets actually represented by synchronized
      matrices. If arbitrary opponent variants cannot be evaluated, project to
      ranked defaults explicitly and label the scenario as adapted, not an exact
      replay of the published roster.
- [x] Deduplicate exact/near-duplicate roster families and split tuning/held-out
      data by roster family/event where available. A duplicated roster or its
      permutations cannot appear in both partitions or gain accidental weight.
- [x] Unsupported formats or insufficient matchup evidence produce actionable
      availability results, never borrowed-format evaluations or zero-risk credit.

### TG-02 — Evaluate distinct battle plans against opposing rosters

- [x] Story complete
- Priority: 1
- Depends on: TG-01, TG-09
- Requirements: strong playable choices across opposing compositions.
- Paths: `fitness/lineupEnumeration.ts`, proposed
  `fitness/opponentRosterEvaluation.ts`, `rosterScoring.ts`,
  `recommendations.ts`, and tests.
- Recommended expertise: primary implementer; `typescript-pro` if needed.

Acceptance:

- [x] Enumerate 120 friendly ordered lineups and 20 stable trio identities.
      Opponent ordering/scenario generation is deterministic and bounded.
- [x] Aggregate opposing-lineup uncertainty before selecting a friendly plan.
      A controlled fixture rejects optimistic hidden-trio oracle selection.
- [x] Preserve separate typical and difficult-matchup evidence. Several weak
      plans cannot compensate for having no usable response through count alone.
- [x] Distinct depth uses trio identity and scenario-quality evidence. Permutation
      duplication cannot inflate depth, role diversity, or bench appearances.
- [x] Recommend distinct useful trios with their best supported order before
      repeating a trio. Preserve requested recommendation limits and role fields.
- [x] Missing data, scenario reordering, and identical evidence produce documented,
      stable outcomes; local evidence does not masquerade as a battle win rate.

### TG-03 — Evaluate protected cores and practical answer redundancy

- [x] Story complete
- Priority: 1
- Depends on: TG-02
- Requirements: complementary pairs, covered core breakers, and multiple useful
  answers that can actually participate in playable trios.
- Paths: proposed `fitness/rosterFlexibility.ts`, `rosterScoring.ts`,
  `lib/data/companionPairRanking.ts`, and tests.
- Recommended expertise: primary implementer; `data-scientist` for metric review.

Acceptance:

- [x] Evaluate 15 unordered roster pairs against shared opponent scenarios using
      assigned matchup evidence. Identify shared counters and third-member support.
- [x] Additional useful cores improve independent-option evidence; two cores
      vulnerable to the same opposing combination receive reduced diversity credit.
- [x] Distinguish practical two-answer coverage from isolated answers that cannot
      form useful trios. Two answers is a strategic preference, not a legality rule.
- [x] Do not double-count Threat Score, core coverage, and redundancy as three
      versions of the same objective. Keep correlated evidence as explanatory
      submetrics unless ablation demonstrates a distinct selection role.

### TG-04 — Evaluate independent pivots and unfavorable-lead recovery

- [x] Story complete
- Priority: 1
- Depends on: TG-02
- Requirements: backup safe switches and executable responses to poor leads.
- Paths: `fitness/rosterFlexibility.ts`, `lineupScoring.ts`,
  `qualitySignals.ts`, `opponentRosterEvaluation.ts`, and tests.
- Recommended expertise: primary implementer; `test-automator` for scenarios.

Acceptance:

- [x] Use Switches evidence and assigned matchup/shield results to evaluate
      pivots; average Switches ranking alone cannot prove independent options.
- [x] Two pivots with different counter profiles outperform equivalent pivots
      shut down by the same important opposing combinations.
- [x] Recovery approximations account for unfavorable lead, pivot exposure,
      plausible counter-switch, and remaining-partner coverage within each legal
      opponent roster. Include supported ABB and fragile ABA cases.
- [x] Do not infer energy/HP carryover or actual shields gained/spent from equal-
      shield cells. Preserve unavailable-scenario metadata and identify proxies.
- [x] Feed matchup robustness and independent-plan objectives, not a mandatory
      new Safety weight. Keep existing Overview diagnostics separately defined.

### TG-05 — Introduce Pareto search and targeted roster edits

- [x] Story complete
- Priority: 1
- Depends on: TG-03, TG-04
- Requirements: retain useful tradeoffs; construct and repair practical teams.
- Paths: `lib/genetic/operators.ts`, `chromosome.ts`, `algorithm.ts`,
  `fitness/index.ts`, proposed `lib/genetic/paretoSelection.ts`,
  candidate-pair and specialist helpers.
- Recommended expertise: primary implementer; `performance-engineer` for hot paths.

Acceptance:

- [x] Implement nondominated sorting and objective-space diversity preservation
      using existing dependencies. Dominated candidates cannot displace dominating
      candidates solely because of the legacy scalar score.
- [x] Parent tournaments, survival/elitism, cloning, and the bounded historical
      archive preserve objective vectors and diverse tradeoffs. When a front
      exceeds capacity, deterministic diversity selection preserves useful extremes.
- [x] Handle equal/constant objectives, duplicates, finite boundaries, and invalid
      evidence explicitly; stable seeds and input permutations yield stable policy
      results. Diversity distance is not the reported measure of team quality.
- [x] Replace scalar convergence/stagnation with policy-defined archive/front
      stability while preserving hard generation limits. An improved tradeoff
      prevents premature stopping even when the old scalar score is unchanged.
- [x] Seed complementary cores and target edits at exposed opposing scenarios,
      shared counters, or missing independent pivots. Use marginal plan contribution
      to identify replaceable non-anchors; preserve random exploration and legality.
- [x] Cache evidence by format, moveset assignment, scenario dataset/sample, and
      policy version. Compare candidates on a shared sample; verify bounded work
      and cache counters. GBL continues through its existing scalar path.

### TG-06 — Measure marginal bench value

- [x] Story complete
- Priority: 2
- Depends on: TG-03, TG-04
- Requirements: retain strategically useful specialists without fictional deterrence.
- Paths: `fitness/rosterFlexibility.ts`, `rosterScoring.ts`, `lib/types.ts`,
  specialist admission tests.
- Recommended expertise: primary implementer; `data-scientist` for interpretation.

Acceptance:

- [x] Compare available plans with and without each member without generating an
      illegal five-member result. Measure lost scenario coverage, core protection,
      and switch alternatives rather than appearances alone.
- [x] A seldom-selected specialist can show useful marginal contribution; a
      redundant unused member cannot earn equivalent credit just for being present.
- [x] Replace appearance-only bench judgments in the new selection logic with
      measured plan contribution where relevant. Do not assume the opponent avoids
      a Pokemon, award an extra deterrence bonus, or use the old dead-bench penalty
      as an independent mandatory objective.
- [x] Keep evidence diagnostic unless it changes the defined plan objectives.
      No new UI or behavioral opponent model is required.

### TG-10 — Select robust finalists and migrate result ordering

- [x] Story complete
- Priority: 1
- Depends on: TG-05, TG-06
- Requirements: choose one useful result from Pareto tradeoffs without returning
  to fixed weights or strict minimum-threat sorting.
- Paths: `fitness/finalistReranking.ts`, `algorithm.ts`,
  `recommendations.ts`, `lib/types.ts`, `app/api/generate-team/route.ts`
  and affected tests.
- Recommended expertise: primary implementer; bounded `architect-reviewer` review.

Acceptance:

- [x] Fully reevaluate archived finalists on the same broader selection scenario
      set, distinct from held-out validation. Preserve fixed assignments and
      bounded variant evaluation; scalar moveset prefilters cannot silently
      eliminate the useful Pareto tradeoffs the search is intended to retain.
- [x] Apply the user's subsequent coverage correction through fixed coverage,
      redundancy, and lower-tail bands, then viable-plan flexibility and
      independent options. Exact objectives and canonical identities break
      remaining ties. This supersedes revision 2's lower-tail-first order;
      TG-07 must report the resulting tradeoffs. Tail/band values are not
      inferred from PvPoke's old numeric thresholds.
- [x] Deterministic ordering is transitive and stable under input permutation.
      Lower Threat Score alone cannot overrule better robustness/flexibility.
- [x] Multiple-team generation retains meaningful alternatives and uses the same
      final selection policy; it is not re-sorted by legacy `fitness`.
- [x] Result metadata, reported scalar compatibility fields, selected movesets,
      and lineup recommendations all refer to the selected finalist. API/UI
      consumers preserve diagnostics without reconstructing a scalar winner.
- [x] Single-candidate, all-tied, unknown-evidence, and insufficient-scenario
      cases have explicit outcomes and truthful limitations.

### TG-07 — Validate integrated behavior and calibrate robustness policy

- [x] Story complete — paired multi-seed v4 calibration and limitations recorded
- Priority: 1
- Depends on: TG-10
- Requirements: demonstrate useful tradeoffs, avoid overfitting, and bound cost.
- Paths: optimizer fixture/tests, `algorithm.test.ts`,
  `algorithm.performance.test.ts`, opponent-roster loaders and evaluation fixtures.
- Recommended expertise: primary implementer; `qa-expert`/`code-reviewer`
  for bounded independent review if later authorized.

Acceptance:

- [x] Compare baseline weighted search with the new search using paired seeds,
      common scenarios, and comparable evaluation budgets. Cover Play! Pokémon,
      Great League Pick 6, another supported ruleset, and a GBL control.
- [x] Freeze policies on tuning data before held-out evaluation. Report per-
      opponent outcomes, lower-tail quality, distinct plans, redundancy, missing
      evidence, diagnostic metrics, runtime, memory, and evaluation counts.
- [x] Ablate objectives, targeted mutation, and scenario diversity. Test whether
      the objectives are redundant or the front becomes too broad to distinguish
      candidates; prune/redefine metrics based on evidence rather than reinstating
      arbitrary weights. Do not claim improvement from training scores alone.
- [x] Sweep tail fractions and practical-equivalence bands on tuning data.
      Check rank stability and alternative scenario compositions, including
      synthetic-only formats. Document selected parameters and limitations.
- [x] Preserve legal anchored output and GBL behavior. Update outdated scalar
      assertions with tests of the new behavioral contract, not weaker assertions.
      Known historical rosters remain calibration data, not forced winners.
- [x] Keep the existing under-one-minute representative performance gate; measure
      default generation separately. Bound pair/trio/scenario work and cache size
      before enabling the new path broadly. Report any unresolved budget failure.
- [x] Verify real local generation, API metadata, moveset authority, and distinct
      ordered recommendations in the rendered app. Do not present static
      evaluation as measured tournament win rate; scrimmages remain external evidence.

### TG-08 — Update guidance and complete repository verification

- [x] Story complete
- Priority: 1
- Depends on: TG-07
- Requirements: implementation, gbl-optimizer skill, and documentation agree.
- Paths: `.agents/skills/gbl-optimizer/SKILL.md`, optimizer docs,
  relevant `lib/AGENTS.md` guidance and affected consumer tests.
- Recommended expertise: primary implementer; `technical-writer` for scoped review.

Acceptance:

- [x] Replace fixed-weight tournament prescriptions with Pareto search, scenario
      provenance, robust final selection, distinct trios, pivots/cores, approximation
      limits, and diagnostic versus selection semantics. Keep GBL guidance separate.
- [x] Explicitly reconcile old instructions requiring weighted-only selection,
      scalar finalist comparison, and scalar fitness-based result sorting. The
      user's approved revision authorizes this algorithm design change.
- [x] Preserve runtime/vendor separation, typed data validation, fixed movesets,
      cache scoping, legality, and existing visual contracts.
- [x] Document the guide's date and distinguish its principles from project
      math. Keep open-sheet assumptions and deferred opponent-behavior modeling clear.
- [x] Complete focused/new tests, full tests, typecheck, lint, changed-file
      formatting, build, route-trace verification, and final diff inspection.
      Report actual outcomes without asserting unexecuted checks passed.

## Verification commands for implementation

Use installed project tools and project-local temporary storage. Executed checks
and their results are recorded below.

```sh
npx vitest run lib/genetic/fitness lib/genetic/operators.test.ts lib/genetic/chromosome.test.ts lib/genetic/anchorFirstPopulation.test.ts
npx vitest run lib/data/companionPairRanking.test.ts lib/data/specialistCandidateGate.test.ts lib/genetic/algorithm.test.ts lib/genetic/algorithm.performance.test.ts
npx tsc --noEmit
npm run lint
npm test
npx prettier --check <explicit changed source and documentation paths>
npm run build
npm run analyze:generate-team-trace
git diff --check
```

Add new Pareto, scenario-loader, and opponent-evaluation tests to focused commands.
Replace the formatter placeholder with actual changed paths. Any new runtime data
asset must be included in the existing exact trace plan with size validation;
build-configuration edits, if needed, require the repository's separate approval.

## Acceptance coverage and handoff

| Requirement                                               | Implementation owners             | Integrated owner |
| --------------------------------------------------------- | --------------------------------- | ---------------- |
| Representative opposing rosters and held-out evaluation   | TG-09, TG-02                      | TG-07            |
| Distinct trios, protected cores, independent pivots       | TG-02, TG-03, TG-04               | TG-07            |
| Pareto selection, archive diversity, targeted mutation    | TG-05                             | TG-07            |
| Robust finalist selection and API/multiple-team ordering  | TG-01, TG-10                      | TG-10, TG-07     |
| Marginal bench value without speculative deterrence       | TG-06                             | TG-07            |
| Preserve legality, anchors, GBL, movesets, and boundaries | TG-01 through TG-10 as applicable | TG-07, TG-08     |
| Updated gbl-optimizer and repository guidance             | TG-08                             | TG-08            |

## Implementation and verification record — October 21, 2026

The tournament path now uses scenario objective vectors throughout evolution,
archive retention, bounded moveset reranking, final selection, recommendations,
and multiple-team ordering. GBL retains its scalar selection. The installed
optimizer skill and repository guidance describe this implementation.

Implementation details: [tournament-search.md](docs/team-optimization/tournament-search.md).
Measured comparison: [tournament-validation.md](docs/team-optimization/tournament-validation.md).
The detailed report records the before/after baseline, policy sensitivity,
objective/mutation ablations, and limitations.

### Earlier evidence gaps — resolved in the final v4 record below

TG-01 captured seed 20 teams, scores, elapsed time, and process RSS before the
change. It did not capture the old search's primitive evaluation counts. Those
counts cannot be reconstructed honestly from the new implementation.
The final run instead recovered the weighted implementation in isolation,
verified its original outputs, and measured that implementation directly.

TG-07 has one paired seed at population 8 / three generations in Play! Pokémon,
Great League Pick 6, Ultra League Pick 6, and two GBL controls. Population and
generation budgets match; computational evaluation costs differ. Broader
paired-seed calibration and equivalent-cost comparisons remain open. Per-roster
outcomes, objectives, diagnostics, missing evidence, memory, and finalist counts
are recorded; a complete old/new primitive evaluation-count comparison is not.

No current verified tournament roster corpus was supplied or represented as
available. Runtime scenarios use the explicitly labeled synthetic fallback.
The curated loader validates provenance and adaptation but is not evidence
that a current tournament corpus has been collected. Scrimmage validation and
worst-case many-moveset performance remain unmeasured.

Both GBL controls reproduced baseline teams and scores. Play! Pokémon and
Great League improved on the synthetic held-out lower-tail measure; Ultra
League regressed by approximately 0.0039. No universal improvement is claimed.

### Executed checks

- Full tests: 1,198 tests passed across 101 files, including the corpus-cap
  regression (70.49 seconds).
- Typecheck: `tsc --noEmit` passed.
- Lint: `npm run lint` passed.
- Formatting: changed source and documentation checked with installed Prettier.
- Production build: passed. Exact route trace: passed, 322 files and
  33,542,266 uncompressed bytes. No runtime vendor engine inclusion.
- Runtime/vendor architecture tests passed with the full suite.
- Default Play! Pokémon generation: 24.94 seconds, 71 generations, 100 finalists,
  completion RSS 349,323,264 bytes. This is not an isolated peak-memory measure.
- Local rendered check in the in-app browser at port 3002: Play! Pokémon selected,
  Pick 6 only, successful six-member generation with assigned moves, A–F Overview
  diagnostics, one threat profile, and five distinct trios with ordered roles.
  Captured browser warning/error logs were empty.
- Local API smoke: complete selection metadata for 16 opponents, equal
  reporting fields, six assigned movesets, and five distinct recommended trios
  verified from the real response in `build/tmp/tournament-api.json`.
- Screenshot: `build/tmp/tournament-browser.png`.
- Final scope review preserves preexisting format/data/UI work and separately
  changed dependencies. No commit, push, deployment, install, or build-config
  modification was performed for this implementation.

The skill was replaced through the runtime's authorized writable route and
verified identical to `docs/team-optimization/gbl-optimizer-skill.md`. It is
active, not pending installation. The old weighted-only skill was not used as
the implementation design authority after the user's instruction.

### Follow-up: five-Steel roster report

Policy `roster-plans-v2` repairs a reproduced no-answer aggregation defect and
widens opponent candidates from 60 to 120. See the v2 section of
`docs/team-optimization/tournament-validation.md` for matrix evidence, red/green
regressions, three default seeds, the remaining four-Steel result, and limits.
Full tests passed (1,199); typecheck, lint, formatting, build, and exact tracing
passed. The live local API returned v2 with consistent reporting and five
distinct trios. The earlier v1 timing and validation records remain historical.

The user then explicitly retained matchup-driven selection and requested
stronger shared-counter protection. Final policy `roster-plans-v3` adds a
distinct-answer bottleneck guard for coexisting enemy trios, preventing one
member from being counted as two simultaneous answers. Both causal regressions
were red before repair and green afterward. Three default seeds returned the
four-Steel Galarian Corsola roster; both GBL controls retained their previous
teams and scores. Full tests passed (1,200), along with typecheck, lint, format,
build, exact tracing, and live local API checks. No shared-type limit was added.
Default seed 20 timing was 26.44 seconds; synthetic-data limitations remain.

Policy `roster-plans-v4` addresses the subsequent screenshot's missing-counter
and single-answer exposure. It adds a direct complete-ranked-field audit,
coverage and redundancy objectives, bounded legal counter-pair stress, and
full-field mutation shortlisting. No type cap was added. The project skill and
optimizer documentation now describe the policy. Across three default seeds,
uncovered opponents fell from 35 to 2–3 and single-answer opponents from 101 to
70–75; sampled and held-out composition scores regressed, documented explicitly
in `docs/team-optimization/tournament-validation.md`. These are conservative
all-shield audit counts, not PvPoke Threat Score measurements. Both GBL controls
were unchanged. Full tests passed (1,209), along with focused coverage, lint,
typecheck, formatting and local API checks. Full-suite coverage encountered
three instrumentation timeouts. Build/production trace verification remains
blocked by local worker-port permission; no new deployment or broad calibration
completion is claimed.

### Final v4 completion record

All TG stories are complete for the bounded implementation and verification
scope. The calibration demonstrates tradeoffs, not universally better tournament
teams. The separately prepared single-request API plan remains outside this plan.

- Baseline recovery: the three scoring-file hashes match the baseline identity;
  all five original seed-20 teams and exact fitness values replayed successfully.
  Expanded to seeds 7 and 42 in isolated source copies, preserving current work.
- Calibration: 15 paired runs across three Pick 6 formats and two GBL controls,
  with fixed population/generation budgets, measured data-access counts, native
  evaluation/cache/finalist counts, memory residency, diagnostics, and per-opponent
  outcomes. Data-access costs are comparable, not identical (mean v4 increases
  of 6.6–10.7% by format). All six GBL results and accessor counts match exactly.
- Current-policy checks: selection-only tail/band sweeps, subset-composition
  sensitivity, evolutionary objective/targeted-mutation ablations, and separate
  fixed-bank final-order objective ablations. Their different scopes are explicit.
  Policy remained fixed before held-out evaluation; no hold-out-based tuning.
- Material limitation: broad coverage improves in eight of nine Pick 6 runs,
  but held-out lower-tail quality regresses in seven. This closes the requested
  measurement work; it does not certify competitive improvement. Synthetic data,
  conservative static plans, limited seeds/budget, unmeasured worst-case variant
  cost, and absent scrimmages remain disclosed limits. Any future minimum-plan
  requirement needs its own tuning and fresh validation compositions.
- Durable evidence: [calibration-v4.json](docs/team-optimization/calibration-v4.json)
  and the interpretation in
  [tournament-validation.md](docs/team-optimization/tournament-validation.md).
  Local historical captures are preserved; the runner defaults to a separate v4
  output and accepts an explicit output path.
- Full suite with V8 coverage: **1,209 tests / 102 files passed**, 106.83 seconds;
  85.58% statements, 79.74% branches, 89.13% functions, 85.67% lines.
  The all-format snapshot parity check measured about 26 seconds under coverage;
  its bounded deadline is now 60 seconds. Every byte-parity assertion remains.
  An attempted per-format split failed the production preparer's all-format
  contract and was reverted. The optimizer's under-one-minute performance gate
  remains unchanged and passes. Failure logs remain available.
- Production build: passed after preserving the stale Turbopack build cache
  that replayed a previous port-permission failure. No build configuration changed.
  Exact route trace: **322 files / 33,546,128 bytes**, including 18 compact
  simulation snapshots; runtime/vendor separation tests pass.
- Typecheck, repository lint, changed-file formatting, and diff whitespace checks
  passed. Existing v4 live API/rendered evidence remains applicable: this closeout
  changed validation tooling, the parity-test deadline, and documentation only.
  There were no production optimizer or UI changes in this closeout.

Final logs: `build/tmp/goal-coverage-verified.log`,
`goal-snapshot-coverage.log`, `goal-build-fresh-cache.log`, `goal-trace.log`,
`goal-typecheck.log`, and `goal-lint-final.log`. Completed experimental source
copies/helpers are preserved with `.source` suffixes under `build/tmp/`; they are
source snapshots rather than additional application modules. No files were
deleted, dependencies changed, commit/push performed, or deployment made.
