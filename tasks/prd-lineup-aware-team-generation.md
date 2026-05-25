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
- [ ] Each recommended lineup includes resource/shield metrics when enough data
      exists to compute them safely.
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

### US-010: Improve Resource Path Metric Meaning

**Description:** As a user, I want balanced, shield-spend, and shield-save scores
to have visual meaning so that values like `0.54` are easier to interpret.

**Acceptance Criteria:**

- [ ] Resource path labels explain what the values mean at a high level.
- [ ] Resource path scores use a visible range legend or helper copy, for example
      weak, neutral, strong, and elite bands.
- [ ] Resource path scores are color coordinated to the documented range.
- [ ] Color is not the only indicator of score quality; text labels or accessible
      descriptions are included.
- [ ] Tests cover rendering of at least weak, neutral, and strong resource-path
      score states.
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
35. FR-35: Resource path metrics must include meaningful visual bands, accessible
    labels, and color coordination tied to a documented range.
36. FR-36: Bench utility warning pills must center their text and remain readable
    for all warning labels.
37. FR-37: Roster scoring must weight offensive move effectiveness and defensive
    resistance/weakness spread enough to discourage redundant type selections
    that do not contribute to recommended lineups.
38. FR-38: Type-diversity scoring must evaluate primary and secondary typing in
    context so complementary shared secondary typings are not automatically
    over-penalized.

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
- Resource path scores such as `Balanced: 0.54`, `Shield spend: 0.51`, and
  `Shield save: 0.55` need range labels and color bands so users understand
  whether the number is weak, neutral, strong, or elite.
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
