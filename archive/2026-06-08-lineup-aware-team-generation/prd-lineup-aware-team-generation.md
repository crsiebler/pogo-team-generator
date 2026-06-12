# PRD: Lineup-Aware Team Generation

## Introduction

The current Pokemon GO PvP team generator exposes two selectable fitness
algorithms: `individual` and `teamSynergy`. This feature replaces that split
with one canonical lineup-aware fitness path.

For PlayPokemon bring-6, roster fitness must evaluate the actual ordered pick-3
lineups a player can bring from a six-Pokemon roster. Each lineup consists of
one ordered lead selected from the roster and one unordered backline pair
selected from the remaining five Pokemon. This produces exactly
`6 * C(5, 2) = 60` unique lineups.

Lead identity must affect scoring. Backline pair order must be canonicalized so
duplicate lineups are not evaluated.

For GBL team-of-3, generation should continue producing a team of three, but
output a recommended role order: lead, switch/safe-swap, and closer.

The UI should no longer expose a fitness algorithm toggle. Generation should
always use the new canonical lineup-aware fitness behavior.

This feature must not discard the existing optimization work that helps the
genetic algorithm find high-quality teams. The new lineup-aware model should
preserve useful current fitness signals for bulk, safety, role strength, stat
balance, move coverage, type synergy, type diversity, energy pressure, ranking
quality, simulation coverage, single-counter risk, core-breaker risk, and shield
scenario reliability. Those factors should be migrated into the canonical
lineup-aware scorer or explicitly documented as intentionally removed.

## Goals

- Replace the `individual` vs `teamSynergy` branching with one lineup-aware
  fitness path.
- Evaluate PlayPokemon bring-6 rosters by scoring all 60 possible ordered lead
  plus unordered backline pick-3 lineups.
- Reward rosters with multiple viable lineups, strong top-N depth, useful bench
  Pokemon, and viable lead diversity.
- Penalize rosters that depend on one excellent lineup while the rest of the
  bench is weak or unbringable.
- Produce multiple recommended pick-3 lineups for PlayPokemon teams.
- Produce recommended role order for GBL teams.
- Remove the frontend algorithm toggle, algorithm state, API validation, and
  backend algorithm selection.
- Preserve useful existing optimization factors from the current fitness
  implementations and evaluate them at the lineup level where possible.
- Keep generation runtime practical by using staged scoring, bounded threat
  pools, and per-run caches for matchup, role, lineup, and roster calculations.
- Preserve existing data safety and graceful fallback behavior when matchup or
  shield-specific data is missing.
- Refactor lineup-aware scoring into a normalized weighted model using the
  documented priority order: synergy, coverage, safety, consistency, bulk,
  defensive resistance/weakness ratio, offensive effectiveness/resistance ratio,
  and role.
- Sync and consume PvPoke Chargers, Attackers, and Consistency ranking exports in
  addition to Overall, Leads, Switches, and Closers.
- Score top-threat coverage separately from full-meta coverage so common meta
  failures are weighted more heavily than rare matchup holes.
- Use `data/type-effectiveness.json` as the source of truth for Pokemon GO type
  multipliers, including dual-type multiplication and immunity-style `0.39x`
  interactions.
- Add validation fixtures for weighted tradeoffs, ABC/ABB/ABA behavior, shared
  weaknesses, top-threat versus full-meta coverage, type effectiveness, multiple
  viable lineups, one-line teams, poor bulk, and poor synergy.

## User Stories

### US-001: Generate PlayPokemon Pick-3 Recommendations

**Description:** As a competitive PlayPokemon user, I want a generated bring-6
roster to include several recommended pick-3 lineups so that I can choose
flexible plans during team preview.

**Acceptance Criteria:**

- [ ] Given PlayPokemon mode, generation still returns a six-Pokemon roster.
- [ ] The response includes multiple recommended pick-3 lineups.
- [ ] Each recommended lineup includes `lead`, `switch`, `closer`, lineup
      score, coverage metrics, covered threats, weaknesses, and ABC/ABB/ABA
      diagnostic label.
- [ ] Resource/shield path metrics may be computed internally for scoring, but
      should not be included in display-facing recommended lineup output unless
      a current UI/API consumer explicitly needs them.
- [ ] The generator evaluates exactly 60 unique lineups for each six-Pokemon
      roster.
- [ ] Backline pair order is not duplicated.
- [ ] Lead choice changes the lineup identity and can change the lineup score.
- [ ] Typecheck/lint/tests pass.
- [ ] Verify in browser using dev-browser skill.

### US-002: Generate GBL Role Order

**Description:** As a GBL user, I want the generated three-Pokemon team to
include recommended roles so that I know which Pokemon should lead, switch, and
close.

**Acceptance Criteria:**

- [ ] Given GBL mode, generation still returns a three-Pokemon team.
- [ ] The response includes one recommended ordered lineup.
- [ ] The ordered lineup includes `lead`, `switch`, `closer`, score, coverage
      metrics, covered threats, weaknesses, and ABC/ABB/ABA diagnostic label.
- [ ] Existing team generation behavior remains functional.
- [ ] Typecheck/lint/tests pass.
- [ ] Verify in browser using dev-browser skill.

### US-003: Remove Algorithm Selection From UI

**Description:** As a user, I should not need to choose between internal fitness
algorithms so that generation uses one clear competitive model.

**Acceptance Criteria:**

- [ ] The algorithm toggle/switch is removed from `TeamConfigPanel`.
- [ ] `TeamManager` no longer owns `currentAlgorithm` state.
- [ ] Algorithm props are no longer passed through frontend components.
- [ ] The UI still allows users to configure all other existing generation
      options.
- [ ] The team generation form renders without an algorithm toggle.
- [ ] Generation can still be started from the UI.
- [ ] Generated results still render correctly.
- [ ] Analysis panels render without missing or undefined algorithm labels.
- [ ] Typecheck/lint/tests pass.
- [ ] Verify in browser using dev-browser skill.

### US-004: Remove Algorithm Selection From API

**Description:** As an API consumer, I should not pass an algorithm option
because there is only one canonical generation strategy.

**Acceptance Criteria:**

- [ ] `app/api/generate-team/route.ts` no longer validates an `algorithm` field.
- [ ] The API no longer passes `algorithm` into `generateTeam`.
- [ ] API responses no longer include algorithm-specific branching metadata.
- [ ] Existing valid generation requests without `algorithm` succeed.
- [ ] Requests that include deprecated `algorithm` are ignored safely unless an
      existing strict schema policy requires rejecting unknown fields.
- [ ] The chosen deprecated-field behavior is documented in API tests.
- [ ] Typecheck/lint/tests pass.

### US-005: Surface Bench Utility And Warnings

**Description:** As a competitive player, I want to know which roster members are
actually useful across recommended lineups so that I can identify weak bench
slots before using the team.

**Acceptance Criteria:**

- [ ] PlayPokemon output includes bench utility data for each roster member.
- [ ] Bench utility includes utility score and lineup appearance counts.
- [ ] Bench utility distinguishes lead, switch, and closer appearances when role
      data exists.
- [ ] Low-utility or unbringable members receive warnings.
- [ ] Warnings do not rely on color alone in the UI.
- [ ] Typecheck/lint/tests pass.
- [ ] Verify in browser using dev-browser skill.

### US-006: Preserve Existing Fitness Quality Signals

**Description:** As a competitive player, I want the new lineup-aware scorer to
retain existing optimization for bulk, safety, coverage, and matchup quality so
that generated teams do not become worse while gaining lineup-depth awareness.

**Acceptance Criteria:**

- [ ] Existing useful fitness factors in `individual.ts` and `teamSynergy.ts` are
      audited before old algorithm-specific files or exports are removed.
- [ ] The canonical scorer includes retained factors for ranking quality,
      bulk/stat balance, role strength, type synergy, type diversity, move
      coverage, energy pressure, simulation coverage, single-counter risk,
      core-breaker risk, and shield scenario reliability where data exists.
- [ ] Any current fitness factor that is not migrated is documented with the
      reason it was intentionally removed.
- [ ] Lineup scoring uses preserved quality signals for lead, switch/safe-swap,
      and closer roles where possible.
- [ ] Tests cover that bulk/safety or equivalent retained quality signals can
      affect lineup or roster score.
- [ ] Typecheck/lint/tests pass.

### US-007: Control Runtime For Lineup-Aware Fitness

**Description:** As a user, I want team generation to remain responsive after
lineup-aware scoring is added so that stronger recommendations do not make the
app impractical to use.

**Acceptance Criteria:**

- [ ] GA evaluation uses a fast fitness path for most chromosome comparisons and
      reserves full UI-ready diagnostics for finalist teams or the final selected
      team.
- [ ] Per-run caches are used for repeated matchup, shield matchup, role score,
      lineup score, and roster score calculations.
- [ ] Threat evaluation uses bounded, deterministic threat pools rather than full
      unbounded meta sweeps for every chromosome.
- [ ] Full shield/resource path details are computed only for top-K finalist
      lineups or final recommended lineups.
- [ ] The final selected PlayPokemon team still has exact 60-lineup enumeration
      available for roster metrics and recommendations.
- [ ] Tests cover staged scoring or caching behavior where practical.
- [ ] Typecheck/lint/tests pass.

### US-008: Move Recommended Lineups Into Analysis Column

**Description:** As a user, I want recommended lineup details to appear with the
analysis content so that the generated roster remains focused on Pokemon cards
and the third column contains all interpretation and decision support.

**Acceptance Criteria:**

- [ ] The `Recommended Lineups` heading renders in the third column with `Team
      Analysis Summary`, not inside the generated-team card list.
- [ ] `TeamDisplay` remains focused on generated roster cards and team notes.
- [ ] `AnalysisPanel` or a child component renders recommended lineups from API
      output without recomputing lineup scores in the UI.
- [ ] Existing generated-team card rendering remains unchanged.
- [ ] Typecheck/lint/tests pass.
- [ ] Verify in browser using dev-browser skill.

### US-009: Simplify Lineup Detail Copy And Display Names

**Description:** As a user, I want lineup details to be concise and readable so
that important weaknesses and risks are understandable at a glance.

**Acceptance Criteria:**

- [ ] The UI does not display the verbose `Covered threats` section in
      recommended lineup cards.
- [ ] `Weaknesses` displays human-readable `speciesName` values, not raw
      `speciesId` values.
- [ ] `Single-Answer Risks` displays human-readable `speciesName` values, not raw
      `speciesId` values.
- [ ] Role labels do not repeat themselves; cards use a single label/value pair
      such as `Lead: Bellibolt`.
- [ ] User-facing role copy uses `Switch` instead of `Safe Swap` in recommended
      lineup cards and bench utility role counts.
- [ ] Typecheck/lint/tests pass.
- [ ] Verify in browser using dev-browser skill.

### US-010: Superseded Internal Resource Path Metric Display

**Description:** Resource path metrics were previously considered for display,
but US-003 keeps balanced, shield-spend, and shield-save diagnostics internal
unless a future current UI/API consumer explicitly reintroduces them.

**Acceptance Criteria:**

- [ ] Recommended lineup cards continue not to render `Balanced`, `Shield spend`,
      or `Shield save` resource path metrics.
- [ ] Resource path metrics remain available only as internal optimizer scoring
      diagnostics unless a future story explicitly reintroduces a display
      consumer.
- [ ] If display-facing resource path output is reintroduced, labels explain what
      values mean at a high level, visible quality labels accompany colors, and
      tests cover weak, neutral, and strong score states.
- [ ] Typecheck/lint/tests pass.
- [ ] Verify in browser using dev-browser skill.

### US-011: Fix Bench Warning Pill Alignment

**Description:** As a user, I want warning pills such as `Warning: unbringable`
to look polished and readable so that bench utility warnings feel intentional.

**Acceptance Criteria:**

- [ ] Warning pill text is centered horizontally and vertically.
- [ ] Warning pill layout works for `unbringable` and `low-utility` warnings.
- [ ] The pill uses text labels and does not rely on color alone.
- [ ] Browser verification inspects a generated PlayPokemon result with at least
      one `Warning: unbringable` pill.
- [ ] Typecheck/lint/tests pass.
- [ ] Verify in browser using dev-browser skill.

### US-012: Increase Type Diversity And Coverage Weighting

**Description:** As a competitive player, I want the generator to avoid redundant
typing when those Pokemon are not useful in recommended lineups so that bring-6
rosters cover more offensive and defensive situations.

**Acceptance Criteria:**

- [ ] Roster scoring adds or strengthens weights for offensive move effectiveness
      across the expected meta.
- [ ] Roster scoring adds or strengthens weights for defensive resistance and
      weakness coverage across the expected meta.
- [ ] Roster scoring penalizes redundant primary typing or repeated defensive
      liabilities when duplicated types do not appear in recommended lineups.
- [ ] Secondary typing is evaluated contextually so useful pairs like Azumarill
      and Tinkaton are not automatically penalized only because both include
      Fairy typing.
- [ ] Tests cover a redundant Electric-heavy roster scoring lower than a roster
      with broader defensive and offensive type coverage when other quality
      signals are comparable.
- [ ] Tests cover a complementary shared-secondary-type case that is not
      over-penalized when the Pokemon cover different weaknesses or roles.
- [ ] Typecheck/lint/tests pass.

### US-013: Render Weaknesses As Bullet Lists

**Description:** As a user, I want lineup weaknesses to render as a readable
bulleted list so that each weakness is visually distinct and easy to scan.

**Acceptance Criteria:**

- [ ] Recommended lineup `Weaknesses` render as semantic list items inside a
      `ul` or equivalent accessible list structure.
- [ ] Each weakness appears as its own bullet point instead of a comma-separated
      inline string.
- [ ] Weakness list items use human-readable `speciesName` values, not raw
      `speciesId` values.
- [ ] Empty weakness lists render a concise fallback such as `No major weaknesses
      identified` instead of an empty list.
- [ ] Tests cover rendering multiple weaknesses as separate list items.
- [ ] Typecheck/lint/tests pass.
- [ ] Verify in browser using dev-browser skill.

### US-014: Sync Additional PvPoke Ranking Categories

**Description:** As a maintainer, I want ranking sync to gather Chargers,
Attackers, and Consistency exports so the optimizer can use the full documented
PvPoke role model.

**Acceptance Criteria:**

- [ ] Before implementation, Ralph reads or invokes the `gbl-optimizer` skill and
      records the docs read in `progress.txt`.
- [ ] Ranking category types include `overall`, `leads`, `switches`, `closers`,
      `chargers`, `attackers`, and `consistency`.
- [ ] PvPoke adapter accepts `chargers`, `attackers`, and `consistency` category
      paths.
- [ ] Ranking sync iterates all seven categories for every supported battle
      format.
- [ ] Synced files are written deterministically under
      `data/rankings/cp{cp}/{cup}/{category}_rankings.csv`.
- [ ] Sync tests cover the three new categories.
- [ ] Existing `overall`, `leads`, `switches`, and `closers` sync behavior remains
      unchanged.
- [ ] Typecheck/lint/tests pass.

### US-015: Expose Runtime Ranking Access For All Categories

**Description:** As an optimizer developer, I want normalized runtime ranking
access for all PvPoke role categories so scoring can use category-specific
signals without reading raw files.

**Acceptance Criteria:**

- [ ] Before implementation, Ralph reads or invokes the `gbl-optimizer` skill and
      records the docs read in `progress.txt`.
- [ ] Runtime ranking category types include `overall`, `leads`, `switches`,
      `closers`, `chargers`, `attackers`, and `consistency`.
- [ ] Ranking cache includes all seven categories per format without cross-format
      contamination.
- [ ] `getRankingScore` or its replacement supports all seven categories.
- [ ] `getAllRankingsForPokemon` returns all seven category scores plus an
      aggregate score.
- [ ] Missing ranking files throw `MissingRankingDataError` with the missing
      category in the message.
- [ ] Existing callers for `overall`, `leads`, `switches`, and `closers` continue
      to work.
- [ ] Typecheck/lint/tests pass.

### US-016: Add Normalized Weighted Score Components

**Description:** As an optimizer developer, I want a normalized weighted score
contract so lineup and roster scoring combine documented metrics consistently.

**Acceptance Criteria:**

- [ ] Before implementation, Ralph reads or invokes the `gbl-optimizer` skill and
      records the docs read in `progress.txt`.
- [ ] Add a score breakdown type or module with normalized components:
      `synergy`, `coverage`, `safety`, `consistency`, `bulk`, `defensiveRatio`,
      `offensiveRatio`, and `role`.
- [ ] Each component is bounded to `0..1` before weighted aggregation.
- [ ] Starting weights are synergy `0.24`, coverage `0.21`, safety `0.17`,
      consistency `0.13`, bulk `0.10`, defensiveRatio `0.07`, offensiveRatio
      `0.05`, and role `0.03`.
- [ ] Hard constraints remain limited to legality and validity checks.
- [ ] Tests prove lower-priority categories can influence close outcomes without
      dominating higher-priority categories.
- [ ] Tests prove role score alone cannot dominate the final score.
- [ ] Typecheck/lint/tests pass.

### US-017: Separate Top-Threat And Full-Meta Coverage

**Description:** As a competitive player, I want coverage scoring to distinguish
common top threats from broader full-meta robustness so severe meta weaknesses
are not hidden by broad rare-matchup coverage.

**Acceptance Criteria:**

- [ ] Before implementation, Ralph reads or invokes the `gbl-optimizer` skill and
      records the docs read in `progress.txt`.
- [ ] Threat-pool construction produces separate top-threat and full-meta pools.
- [ ] Top-threat coverage is weighted higher than full-meta coverage.
- [ ] Coverage diagnostics expose top-threat and full-meta results separately.
- [ ] No-answer and single-answer threat counts are computed for both pools where
      data exists.
- [ ] A lineup that loses hard to a top threat scores lower than a lineup with
      only rare full-meta holes when other signals are comparable.
- [ ] Threat pools are bounded and deterministic for hot GA scoring paths.
- [ ] Typecheck/lint/tests pass.

### US-018: Implement Type Effectiveness Offensive And Defensive Ratios

**Description:** As an optimizer developer, I want Pokemon GO type-effectiveness
ratios so the scorer can measure offensive move pressure and defensive
resistance versus weakness spread.

**Acceptance Criteria:**

- [ ] Before implementation, Ralph reads or invokes the `gbl-optimizer` skill and
      records the docs read in `progress.txt`.
- [ ] Type-effectiveness calculations use `data/type-effectiveness.json` as the
      source of truth.
- [ ] Dual-type defenders multiply both defender-type effectiveness values.
- [ ] Pokemon GO immunity-style interactions use `0.39x`, not zero damage.
- [ ] Offensive ratio scoring evaluates selected fast and charged move types into
      top-threat and full-meta defenders.
- [ ] Defensive ratio scoring evaluates weaknesses, resistances, double
      weaknesses, double resistances, and shared weaknesses.
- [ ] Ratio scores are normalized to `0..1` before weighted aggregation.
- [ ] Tests cover dual-type multiplication, immunity-style interactions, neutral
      cancellation, double resistance, and double super effectiveness.
- [ ] Typecheck/lint/tests pass.

### US-019: Implement Safety, Consistency, And Bulk Components

**Description:** As a competitive player, I want the scorer to reward reliable
teams that avoid catastrophic losses, volatile bait dependence, and brittle
low-bulk compositions.

**Acceptance Criteria:**

- [ ] Before implementation, Ralph reads or invokes the `gbl-optimizer` skill and
      records the docs read in `progress.txt`.
- [ ] Safety scoring accounts for overwhelming losses, no-answer threats,
      single-answer threats, bad-lead recovery, and sweep risk.
- [ ] Overwhelming losses against the top-threat pool are weighted more heavily
      than rare full-meta losses.
- [ ] Consistency scoring uses PvPoke consistency ranking data when available.
- [ ] Consistency scoring falls back to shield stability, damage per energy,
      energy cost, useful neutral damage, second-move value, and bait-dependence
      proxies when consistency rankings are unavailable.
- [ ] Bulk scoring uses normalized `defense * hp / attack` when direct bulk data
      is unavailable.
- [ ] Safety, consistency, and bulk are separate normalized components before
      aggregation.
- [ ] Tests cover poor bulk, bait-dependent volatility, shield-scenario
      instability, and no-answer or single-answer fragility.
- [ ] Typecheck/lint/tests pass.

### US-020: Expand Role Scoring With Chargers, Attackers, And Consistency

**Description:** As a competitive player, I want role scoring to use PvPoke
role-specific exports so leads, switches, closers, chargers, attackers, and
consistent Pokemon are evaluated according to their actual battle jobs.

**Acceptance Criteria:**

- [ ] Before implementation, Ralph reads or invokes the `gbl-optimizer` skill and
      records the docs read in `progress.txt`.
- [ ] Lead scoring uses Leads data as the primary role signal.
- [ ] Switch scoring uses Switches data as the primary role signal.
- [ ] Closer scoring uses Closers data as the primary role signal.
- [ ] Energy-pressure support uses Chargers data where available.
- [ ] Shield-disadvantage pressure uses Attackers data where available.
- [ ] Volatility or bait-dependence support uses Consistency data where
      available.
- [ ] Overall ranking is treated as broad candidate quality, not a direct role
      substitute.
- [ ] Role score remains the lowest-weight component in the weighted model.
- [ ] Typecheck/lint/tests pass.

### US-021: Integrate Weighted Lineup And Roster Aggregation

**Description:** As a competitive player, I want generated rosters to optimize
multiple playable lineups using the documented normalized weighted model.

**Acceptance Criteria:**

- [ ] Before implementation, Ralph reads or invokes the `gbl-optimizer` skill and
      records the docs read in `progress.txt`.
- [ ] Lineup scoring combines normalized synergy, coverage, safety, consistency,
      bulk, defensiveRatio, offensiveRatio, and role components.
- [ ] Roster scoring aggregates best lineup score, top-N lineup average, viable
      lineup count, viable lead diversity, and bench utility.
- [ ] Roster scoring penalizes one-line teams where one excellent trio carries
      otherwise dead bench slots.
- [ ] ABC, ABB, and ABA labels remain diagnostic rather than primary scoring
      inputs.
- [ ] ABB lineups can score well when the A Pokemon covers the B pair's shared
      weakness.
- [ ] ABA shared weakness is penalized when it creates lead-alignment fragility
      against top threats.
- [ ] Multiple viable lineups score higher than one obvious best line when other
      signals are comparable.
- [ ] Typecheck/lint/tests pass.

### US-022: Add Optimizer Validation Fixture Suite

**Description:** As a maintainer, I want deterministic validation fixtures for
documented optimizer tradeoffs so future scoring changes can be evaluated safely.

**Acceptance Criteria:**

- [ ] Before implementation, Ralph reads or invokes the `gbl-optimizer` skill and
      records the docs read in `progress.txt`.
- [ ] Fixtures cover weighted tradeoffs where synergy can beat slightly better
      coverage.
- [ ] Fixtures cover ABC, coherent ABB, unsupported ABB, ABA shared weakness, and
      ABA shared strength behavior.
- [ ] Fixtures cover severe shared weakness penalties.
- [ ] Fixtures cover separate top-threat and full-meta coverage behavior.
- [ ] Fixtures cover dual-type type-effectiveness calculations.
- [ ] Fixtures cover multiple viable lineups beating a one-line roster.
- [ ] Fixtures cover one excellent trio with three dead roster slots.
- [ ] Fixtures cover strong coverage with poor bulk.
- [ ] Fixtures cover strong individual Pokemon with poor pick-3 synergy.
- [ ] Typecheck/lint/tests pass.

### US-023: Add Optimizer Score Breakdown UI

**Description:** As a user, I want the analysis panel to explain optimizer score
categories so I understand why a generated roster is strong, risky, or
matchup-dependent.

**Acceptance Criteria:**

- [ ] `Team Analysis Summary` includes an `Optimizer Score Breakdown` accordion.
- [ ] The accordion displays synergy, coverage, safety, consistency, bulk,
      defensive ratio, offensive ratio, and role in documented priority order.
- [ ] Each category displays a normalized score, a visible range label, and a
      concise explanation.
- [ ] Category score states are not communicated by color alone.
- [ ] Top-threat coverage and full-meta coverage are visually distinct.
- [ ] The UI does not expose scoring weights as controls.
- [ ] Tests cover rendering all eight categories.
- [ ] Typecheck/lint/tests pass.
- [ ] Verify in browser using dev-browser skill.

### US-024: Update AGENTS.md With Optimizer Documentation Guidance

**Description:** As an agent working in this repository, I need AGENTS.md to
point me to the optimizer docs and skill so future scoring and sync work follows
the documented strategy.

**Acceptance Criteria:**

- [ ] Root `AGENTS.md` references the `gbl-optimizer` skill for optimizer scoring,
      role ranking, PvPoke sync, type effectiveness, coverage, safety,
      consistency, bulk, and lineup strategy changes.
- [ ] `lib/AGENTS.md` references the optimizer docs required before changing
      `lib/genetic/fitness`, ranking sync, runtime ranking data, simulations, or
      type-effectiveness scoring.
- [ ] AGENTS guidance lists the key docs under `docs/pokemon-go-team-optimization.md`
      and `docs/team-optimization/`.
- [ ] Guidance tells agents to record which optimizer docs they read in
      `progress.txt` for Ralph iterations.
- [ ] Typecheck/lint/tests pass if touched files require validation.

### US-025: Update README With Optimizer Architecture And Data Inputs

**Description:** As a contributor or maintainer, I want the README to describe
the current optimizer architecture, file structure, data inputs, and scoring
decisions so future work has clear implementation context.

**Acceptance Criteria:**

- [ ] README describes the lineup-aware optimizer architecture at a high level.
- [ ] README documents the fitness module file structure and the responsibilities
      of lineup enumeration, lineup scoring, roster scoring, recommendations,
      ranking data, and sync modules.
- [ ] README documents that sync exports Overall, Leads, Switches, Closers,
      Chargers, Attackers, and Consistency rankings when source files exist.
- [ ] README explains the weighted component model as starting defaults, not
      guaranteed optimal tuning constants.
- [ ] README links to `docs/pokemon-go-team-optimization.md` and relevant
      `docs/team-optimization/` references.
- [ ] README states that PvPoke rankings are signals for candidate quality, role
      fit, consistency, and threat weighting rather than immutable truth.
- [ ] README documents the decision to keep scoring logic in `lib/` and UI/API
      adapters as display/pass-through layers.
- [ ] Typecheck/lint/tests pass if touched files require validation.

## Functional Requirements

1. FR-1: The system must remove `FitnessAlgorithm = 'individual' | 'teamSynergy'`
   as a user-facing option.
2. FR-2: The system must remove backend branching between `individual` and
   `teamSynergy` scoring paths.
3. FR-3: The system must keep a single fitness function that incorporates
   individual Pokemon strength, matchup coverage, team synergy, lineup depth,
   role fit, and shield/resource-path quality where data exists.
4. FR-4: The canonical fitness function must preserve useful existing
   optimization signals from the current fitness implementations, including
   ranking quality, bulk/stat balance, role strength, type synergy, type
   diversity, move coverage, energy pressure, simulation coverage,
   single-counter risk, core-breaker risk, and shield scenario reliability.
5. FR-5: Existing fitness factors must be audited before old algorithm-specific
   files or exports are removed, and each factor must be migrated or explicitly
   documented as intentionally removed.
6. FR-6: For a six-Pokemon PlayPokemon roster, the system must enumerate exactly
   60 lineups.
7. FR-7: Each PlayPokemon lineup must contain one lead and two backline Pokemon.
8. FR-8: Lead identity must be ordered and meaningful for lineup identity and
   scoring.
9. FR-9: Backline pair identity must be unordered and canonicalized.
10. FR-10: The system must not evaluate duplicate backline permutations.
11. FR-11: A lineup score must account for lead performance, backline coverage,
   shared weaknesses, safe-swap quality, closer/no-shield strength, threat
   coverage, single-answer risks, dominating matchups, overwhelming losses, and
   resource/shield paths where data exists.
12. FR-12: A lineup score must include retained quality signals for bulk,
    safety, role strength, ranking quality, move/type coverage, and simulation
    quality where those signals are available.
13. FR-13: A dominating matchup is a battle rating greater than `600`.
14. FR-14: An overwhelming loss is a battle rating less than `400`.
15. FR-15: Dominating and overwhelming metrics must be calculated at lineup
    level before roster aggregation.
16. FR-16: Missing shield/resource data must be treated as unavailable or
    fallback-neutral, not as a forced loss.
17. FR-17: When shield-specific matchup data is available, the system must score
    the balanced path using lead 1-shield data and backline 1-shield data.
18. FR-18: When shield-specific matchup data is available, the system must score
    the shield-spend path using lead 2-shield data and backline 0-shield data.
19. FR-19: When shield-specific matchup data is available, the system must score
    the shield-save path using lead 0-shield data and backline 2-shield data.
20. FR-20: PlayPokemon roster fitness must reward multiple viable lineups,
    strong top lineup quality, top-N lineup depth, bench utility, viable lead
    diversity, broad threat coverage, reduced shared weaknesses, and reduced
    single-answer risks.
21. FR-21: PlayPokemon roster fitness must penalize one excellent lineup with
    dead bench, unbringable Pokemon, poor lead diversity, single-answer
    dependency, high overwhelming-loss rate, and repeated shared weaknesses.
22. FR-22: PlayPokemon output must include bench utility data per Pokemon.
23. FR-23: Bench utility data must include utility score, recommended lineup
    appearances, lead appearances, switch/safe-swap appearances, closer
    appearances, and low-utility or unbringable warnings where applicable.
24. FR-24: PlayPokemon output must include roster-level metrics for viable
    lineup count, top lineup quality, top-N lineup depth, dominating matchup
    rate, overwhelming loss rate, single-answer risks, viable lead diversity, and
    bench utility summary.
25. FR-25: ABC/ABB/ABA labels must be diagnostic only and must not be primary
    scoring inputs.
26. FR-26: GA evaluation must use staged scoring so most chromosome comparisons
    avoid building full UI-ready lineup diagnostics.
27. FR-27: Full shield/resource path details must be computed only for top-K
    finalist lineups or final recommended lineups.
28. FR-28: Per-run caches must be used for repeated matchup, shield matchup,
    role score, lineup score, and roster score calculations.
29. FR-29: Threat evaluation must use bounded, deterministic threat pools for hot
    GA scoring paths.
30. FR-30: Existing analysis modules must continue to work or be intentionally
    updated with tests for the new lineup-aware output.
31. FR-31: Recommended lineups must render in the analysis column with `Team
    Analysis Summary`, not inside the generated roster card list.
32. FR-32: The lineup UI must not display verbose covered-threat lists by
    default.
33. FR-33: Weakness and single-answer risk displays must use human-readable
    species names instead of raw species ids.
34. FR-34: Recommended lineup cards must use concise non-repeating labels and
    user-facing role copy must use `Switch` instead of `Safe Swap`.
35. FR-35: Resource path metrics must remain internal scoring diagnostics unless
    a current UI/API consumer explicitly reintroduces display-facing resource
    path output with accessible labels and documented quality ranges.
36. FR-36: Bench utility warning pills must center their text and remain readable
    for all warning labels.
37. FR-37: Roster scoring must weight offensive move effectiveness and defensive
    resistance/weakness spread enough to discourage redundant type selections
    that do not contribute to recommended lineups.
38. FR-38: Type-diversity scoring must evaluate primary and secondary typing in
    context so complementary shared secondary typings are not automatically
    over-penalized.
39. FR-39: Recommended lineup weaknesses must render as semantic bullet-list
    items, one weakness per `li`, using human-readable species names.
40. FR-40: The canonical scorer must combine normalized component scores using a
    weighted model with starting weights: synergy `0.24`, coverage `0.21`,
    safety `0.17`, consistency `0.13`, bulk `0.10`, defensive ratio `0.07`,
    offensive ratio `0.05`, and role `0.03`.
41. FR-41: Hard constraints must remain limited to legality and validity rules;
    strategic scoring signals must remain weighted tradeoffs.
42. FR-42: Ranking sync must export Overall, Leads, Switches, Closers, Chargers,
    Attackers, and Consistency rankings for each supported battle format when
    source files exist.
43. FR-43: Runtime ranking access must support normalized score lookup for
    Overall, Leads, Switches, Closers, Chargers, Attackers, and Consistency
    without cross-format cache contamination.
44. FR-44: Coverage scoring must maintain separate top-threat and full-meta pools
    and expose separate diagnostics for both.
45. FR-45: Safety scoring must account for overwhelming losses, no-answer
    threats, single-answer threats, bad-lead recovery, and sweep risk.
46. FR-46: Consistency scoring must prefer PvPoke Consistency exports when
    available and otherwise fall back to shield stability, damage per energy,
    energy cost, neutral damage, second-move value, and bait-dependence proxies.
47. FR-47: Bulk scoring must use normalized `defense * hp / attack` when direct
    stat-product or bulk data is unavailable.
48. FR-48: Offensive and defensive type scoring must use
    `data/type-effectiveness.json`, dual-type multiplication, selected move
    types, and bounded normalized ratios.
49. FR-49: Role scoring must use role-specific rankings for lead, switch, closer,
    charger, attacker, and consistency signals while ensuring role remains the
    lowest-weight component.
50. FR-50: Roster aggregation must include top lineup quality, top-N lineup depth,
    viable lineup count, viable lead diversity, bench utility, and a one-line
    team penalty.

## Non-Goals

- Do not add a new user-selectable algorithm.
- Do not preserve the old algorithm toggle.
- Do not expose lineup scoring weights in the UI.
- Do not discard existing bulk, safety, role, ranking, coverage, or simulation
  quality signals without documenting why a specific factor was removed.
- Do not compute full UI-ready diagnostics for every chromosome in every GA
  generation.
- Do not require shield-specific data to exist for every matchup.
- Do not treat missing simulation data as a loss.
- Do not make ABC/ABB/ABA the core scoring mechanism.
- Do not rewrite unrelated UI or analysis components.
- Do not add new dependencies unless strictly necessary.
- Do not change data ingestion workflows except where required by typed access
  to existing matchup/ranking data.

## Design Considerations

- Remove algorithm selection from `TeamConfigPanel`.
- Keep the generation configuration UI otherwise unchanged.
- Results should show the generated roster/team, recommended lineups, role
  order, roster metrics, and bench utility warnings where applicable.
- Avoid exposing implementation terminology like "fitness algorithm" to users.
- Prefer user-facing copy such as "Recommended Lineups", "Lead", "Safe Swap",
  "Closer", "Bench Utility", "Lineup Depth", "Single-Answer Risks", and
  "Resource Paths".
- Avoid user-facing copy such as "individual algorithm", "team synergy
  algorithm", or "fitness mode".
- Lineup warnings must include text labels and must not rely on color alone.
- If lineup details use accordions, use native buttons with `aria-expanded` and
  `aria-controls`.

## Technical Considerations

### Likely Files To Modify

- `lib/types.ts`
- `lib/genetic/algorithm.ts`
- `lib/genetic/fitness/index.ts`
- `lib/genetic/fitness/individual.ts`
- `lib/genetic/fitness/teamSynergy.ts`
- `app/api/generate-team/route.ts`
- `components/organisms/TeamManager/TeamManager.tsx`
- `components/organisms/TeamConfigPanel/TeamConfigPanel.tsx`
- `components/organisms/ResultsPanel/ResultsPanel.tsx`
- `components/organisms/TeamDisplay/TeamDisplay.tsx`
- `components/organisms/AnalysisPanel/AnalysisPanel.tsx`

### Likely New Core Modules

- `lib/genetic/fitness/lineupEnumeration.ts`
- `lib/genetic/fitness/lineupScoring.ts`
- `lib/genetic/fitness/rosterScoring.ts`
- `lib/genetic/fitness/recommendations.ts`

### Existing Data Helpers To Reuse

- `getMatchupResult` from `lib/data/simulations.ts`
- `getShieldScenarioMatchupResult` from `lib/data/simulations.ts`
- `calculateTeamCoverage` from `lib/data/simulations.ts`
- `getTeamWeaknesses` from `lib/data/simulations.ts`
- `getSingleCounterThreats` from `lib/data/simulations.ts`
- `getTopThreatsByRole` from `lib/data/simulations.ts`
- `winsMatchup` from `lib/data/simulations.ts`
- `getAllRankingsForPokemon` from `lib/data/rankings.ts`

### Existing Fitness Signals To Preserve Or Audit

- Ranking quality from overall, leads, switches, closers, and average role
  rankings.
- Bulk/stat balance and safety-oriented scoring.
- Type synergy, type diversity, and shared weakness penalties.
- Move coverage, move synergy, and energy pressure where existing helpers make
  those signals available.
- Simulation-backed coverage, matchup quality, single-counter risks, weighted
  weaknesses, and shield scenario reliability.
- Shadow preference or other current form-specific scoring where it remains
  competitively useful.

### Optimizer Refactor Guidance

- Ralph stories that touch optimizer scoring, PvPoke ranking sync, runtime
  ranking data, type effectiveness, coverage, safety, consistency, bulk, roles,
  or lineup strategy must read or invoke the `gbl-optimizer` skill before
  implementation.
- Ralph should use appropriate context or implementation specialists for these
  stories, especially `refactoring-specialist`, `javascript-pro`,
  `test-driven-development`, `test-runner`, `nextjs-developer`,
  `ux-researcher`, `ui-designer`, and `documentation-engineer` depending on the
  story scope.
- Ralph iteration notes in `progress.txt` must list the optimizer docs read and
  briefly explain how the implementation aligns with the documented strategy.
- The weighted scorer should expose normalized score breakdowns for `synergy`,
  `coverage`, `safety`, `consistency`, `bulk`, `defensiveRatio`,
  `offensiveRatio`, and `role`.
- The starting weights encode current strategy preferences and are not guaranteed
  optimal tuning constants. Future tuning should be validated against regression
  fixtures, known good teams, known bad teams, and current meta review.
- Ranking sync should extend ranking categories from `overall`, `leads`,
  `switches`, and `closers` to include `chargers`, `attackers`, and
  `consistency`.

### Runtime Mitigation Requirements

- Precompute role and matchup features once per generation run where practical.
- Cheap-score all 60 PlayPokemon lineups for roster-depth metrics, but build
  expensive explanations only for top-K or final recommended lineups.
- Cache matchup lookups by `formatId`, species id, opponent id, and shield
  scenario.
- Cache lineup scores by canonical lead/backline key.
- Cache roster scores by canonical roster key when roster order is not relevant.
- Use bounded, deterministic threat pools for hot GA paths.
- Keep API output limited to recommended lineups and aggregate metrics rather
  than returning all 60 lineups by default.

### Follow-Up UI Findings From Browser Verification

- `Recommended Lineups` currently renders in the generated team column; move it
  into the third analysis column with `Team Analysis Summary`.
- `Covered threats` currently renders as a very long species-id list; remove this
  section from the displayed lineup cards.
- `Weaknesses` and `Single-Answer Risks` should use display names, not species
  ids.
- The `Warning: unbringable` pill currently renders as a block-level span with
  start-aligned text; use centered inline-flex styling or equivalent.
- Resource path scores such as `Balanced`, `Shield spend`, and `Shield save`
  should remain internal scoring diagnostics unless a current UI/API consumer
  explicitly reintroduces display-facing resource path output.
- Recommended lineup cards currently repeat labels like `Lead` and `Lead:
  Bellibolt`; render one concise label/value row instead.
- Use `Switch` as the user-facing role label instead of `Safe Swap`.

### Follow-Up Scoring Findings From Generated Teams

- Roster scoring can still select duplicate Electric or Fairy typings even when
  duplicate members do not appear in recommended lineups.
- Redundant Electric selections are especially risky because shared Ground
  weakness can make both Pokemon unbringable into opposing Ground coverage.
- Shared secondary typings should not be blindly penalized when roles are
  complementary; for example, Azumarill and Tinkaton can make sense because one
  primarily contributes Water coverage while the other primarily contributes
  Steel/Fairy resistance and pressure.
- Add stronger offensive move effectiveness and defensive resistance/weakness
  spread weights, with tests that distinguish harmful redundancy from useful
  complementary typing.

### TDD Expectations

Implement test-first.

1. Add unit tests for PlayPokemon lineup enumeration.
2. Add unit tests for lineup scoring.
3. Add unit tests for roster metrics.
4. Update API tests.
5. Update UI tests.
6. Run browser verification with `dev-browser` for UI changes.

Required tests include:

- exactly 60 lineups from a six-Pokemon roster
- six possible leads
- unordered backline pairs
- no duplicate lineups
- lead order is distinct
- backline order is canonicalized
- lead-specific matchups affect score
- shared backline weaknesses penalize score
- retained bulk/safety or equivalent existing quality signals can affect score
- multiple viable lineups improve roster score
- one strong lineup plus dead bench scores lower than several viable lineups
- staged scoring avoids computing full diagnostics for every chromosome
- output includes multiple recommended lineups
- bench utility and warnings are surfaced
- algorithm toggle is absent
- frontend no longer sends `algorithm`
- API no longer validates or branches on `algorithm`

### Verification Commands

Use these before final handoff:

```bash
npx vitest run lib/genetic/algorithm.test.ts
npx vitest run app/api/generate-team/route.test.ts
npx vitest run components/organisms/TeamManager/TeamManager.test.tsx
npx vitest run components/organisms/TeamConfigPanel/TeamConfigPanel.test.tsx
npx vitest run components/organisms/TeamDisplay/TeamDisplay.test.tsx
npx vitest run components/organisms/AnalysisPanel/AnalysisPanel.test.tsx
npm test
npm run lint
npx tsc --noEmit
npm run build
```

## Success Metrics

- PlayPokemon roster generation evaluates exactly 60 unique pick-3 lineups per
  six-Pokemon roster.
- Generated PlayPokemon output includes multiple recommended lineups.
- GBL output includes recommended lead, switch/safe-swap, and closer roles.
- Algorithm toggle is fully removed from frontend UI.
- API no longer requires or validates algorithm selection.
- Backend has one canonical lineup-aware fitness path.
- Existing bulk, safety, coverage, role, ranking, and simulation quality signals
  remain represented in the canonical scorer unless intentionally documented as
  removed.
- Runtime-sensitive paths use staged scoring, bounded threat pools, and caches so
  lineup-aware evaluation remains practical for GA generation.
- Missing shield data does not create artificial losses.
- Existing generation, result rendering, and analysis workflows continue to pass
  tests.
- `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` pass.

## Open Questions

1. What exact number of recommended PlayPokemon lineups should be displayed by
   default?
   Suggested default: top 5.
2. Should lineup recommendations include all viable lineups in the API response
   and only display the top few in the UI?
   Suggested approach: return top-N plus aggregate metrics to avoid large
   responses.
3. What threshold defines a viable lineup?
   Suggested approach: start with a normalized lineup score threshold, then tune
   with tests and generated examples.
4. What threshold defines low utility or unbringable bench Pokemon?
   Suggested approach: flag Pokemon with zero or near-zero appearances in viable
   or recommended lineups.
5. Should `generationStrategy: 'lineup-aware'` be included in API analysis
   metadata?
   Suggested approach: include only if useful for debugging; do not expose it as
   a user option.
