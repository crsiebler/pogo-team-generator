# PRD: Human-Readable Threat Diagnostics

## Introduction

The current Threat Score UI exposes raw numerical diagnostics that are meaningful
to developers but unclear to users, such as `Overall: 0.19`,
`Top Meta: 0.21 (24 evaluated)`, and `Full Meta: 0.14 (100 evaluated)`.
Threat list entries also include technical details like rank, answer count, and
risk score.

This feature changes the display contract so Threat Score communicates team
weaknesses in human-readable terms. The Threat Score section should show
readable Pokemon names and one overall team threat profile pill, while
Recommended Lineups should no longer display quality pills.

This is primarily a UI/display contract change. Backend threat fields may remain
available for sorting, scoring, and diagnostics.

## Goals

- Make Threat Score understandable without requiring users to interpret raw
  numeric values.
- Show team weaknesses as readable Pokemon names only.
- Move the lineup quality pill concept into the Threat Score section as a
  team-level threat profile.
- Remove `weak`, `neutral`, `strong`, and `elite` pills from Recommended
  Lineups.
- Preserve existing threat sorting, capped threat lists, and diagnostic
  usefulness.
- Update tests and documentation to reflect the reversed UI contract.

## User Stories

### US-001: Display Readable Threat List Entries

**Description:** As a user, I want threat lists to show only Pokemon names so
that I can quickly understand which Pokemon threaten my team.

**Acceptance Criteria:**

- [ ] Threat list items render only `threat.pokemon`.
- [ ] Threat list items do not show rank, answer count, risk score, or raw
  threat values.
- [ ] Example old text is removed:
  `Samurott (Shadow) (Rank #16, Answers: 0, Risk: 0.49)`.
- [ ] Example new text is shown: `Samurott (Shadow)`.
- [ ] Existing list caps remain unchanged unless otherwise required.
- [ ] Existing `Showing top 5 of N` summaries remain unchanged.
- [ ] Tests in `components/organisms/AnalysisPanel/AnalysisPanel.test.tsx`
  assert the new display contract.
- [ ] Typecheck passes.
- [ ] Tests pass.
- [ ] Verify in browser using dev-browser skill.

### US-002: Replace Raw Threat Score Numbers With A Team Threat Profile Pill

**Description:** As a user, I want the Threat Score card to summarize overall
threat strength in simple human terms so that I know whether my team is weak,
neutral, strong, or elite against threats.

**Acceptance Criteria:**

- [ ] `renderThreatScoreCard` no longer displays raw score boxes for `Overall`,
  `Top Meta`, or `Full Meta`.
- [ ] The Threat Score card displays exactly one team-level quality pill.
- [ ] The pill text is human-readable, such as `Team threat profile: strong`.
- [ ] The pill has an accessible label such as `Team threat profile: strong`.
- [ ] The pill uses the quality labels `elite`, `strong`, `neutral`, or `weak`.
- [ ] Initial display-only lower-is-better thresholds are:
  - `<= 0.15`: `elite`
  - `<= 0.30`: `strong`
  - `<= 0.45`: `neutral`
  - `> 0.45`: `weak`
- [ ] Thresholds are covered by tests and can be adjusted in future calibration
  work.
- [ ] Typecheck passes.
- [ ] Tests pass.
- [ ] Verify in browser using dev-browser skill.

### US-003: Remove Lineup Quality Pills From Recommended Lineups

**Description:** As a user, I want Recommended Lineups to focus on lead, switch,
closer, and weaknesses without duplicate or confusing quality labels.

**Acceptance Criteria:**

- [ ] Recommended Lineup cards no longer render `lineup-quality-pill`.
- [ ] Recommended Lineup cards do not display `weak`, `neutral`, `strong`, or
  `elite` quality pills.
- [ ] Recommended Lineup cards continue to display lead, switch, closer, and
  weakness lists.
- [ ] Recommended Lineup cards continue to omit numeric lineup scores.
- [ ] Recommended Lineup cards retain blue diagnostic styling.
- [ ] Tests assert that Recommended Lineups render zero lineup quality pills.
- [ ] Typecheck passes.
- [ ] Tests pass.
- [ ] Verify in browser using dev-browser skill.

### US-004: Derive Dynamic Ranking Bands Per Meta

**Description:** As a competitive user, I want the generator to understand each
meta's ranking score distribution so that limited cups and open formats both use
appropriate anchor and companion pools.

**Acceptance Criteria:**

- [ ] Candidate quality bands are derived from the selected format's ranking
  export instead of fixed global score cutoffs.
- [ ] The banding logic considers PvPoke `Score`, rank percentile, score
  density, and meaningful score dropoffs where present.
- [ ] The open Great League export can still produce broad pools similar to the
  observed example where strong candidates extend deeper into the rankings.
- [ ] The `cp1500/naic2026` export produces narrower top-anchor and companion
  pools that reflect its smaller, steeper ranking distribution.
- [ ] Band derivation preserves enough minimum candidates for limited metas and
  caps maximum candidates for wide metas to prevent search explosion.
- [ ] Tests cover both a dense open-meta score curve and a smaller limited-meta
  score curve.
- [ ] Typecheck passes.
- [ ] Tests pass.

### US-005: Seed Generation With Elite Anchors And Ranked Companions

**Description:** As a competitive user, I want generated teams to start from
high-quality ranked anchors and add synergistic companions so that outputs look
more like viable meta teams than collections of niche core-breakers.

**Acceptance Criteria:**

- [ ] The genetic algorithm seeds its initial population from dynamically
  selected elite or preferred anchors before random full-team construction.
- [ ] The generator evaluates anchor plus companion pairs before expanding to a
  complete team.
- [ ] Companion ranking considers PvPoke rank, PvPoke Score, simulation matchup
  coverage, safety rank, consistency rank, bulk, and offensive/defensive typing.
- [ ] Pair ranking rewards companions that cover the anchor's important meta
  losses without creating severe shared weaknesses.
- [ ] Complete team expansion ranks candidate thirds by remaining team
  weaknesses, playable lineup quality, and broad meta coverage.
- [ ] Existing final lineup and roster scoring remains the canonical final score
  so rank quality is a search prior, not a strict tier-list override.
- [ ] Fixed-seed tests demonstrate deterministic anchor-first population output.
- [ ] Regression tests keep examples like `Lickilicky / Altaria / Empoleon` and
  `Feraligatr / Quagsire / Altaria` plausible for the open Great League export
  when supported by current data.
- [ ] Typecheck passes.
- [ ] Tests pass.

### US-006: Gate Low-Ranked Specialists Behind Unique Coverage

**Description:** As a competitive user, I want lower-ranked niche Pokemon to
appear only when they solve a real team problem so that core-breakers do not
crowd out safer top-ranked picks.

**Acceptance Criteria:**

- [ ] Candidates below the dynamically derived flexible companion pool are
  treated as specialists.
- [ ] Specialists are not selected as automatic anchors.
- [ ] Specialists can enter a team only when they provide unique, measurable
  coverage against unresolved top-meta threats or a known core weakness.
- [ ] Specialist admission considers simulation matchup coverage before type-only
  coverage.
- [ ] Specialist admission is penalized or rejected when the specialist creates a
  severe shared weakness, reduces viable lineup count, or merely duplicates a
  stronger generalist's role.
- [ ] Tests show a low-ranked specialist is rejected when it only beats an
  isolated threat.
- [ ] Tests show a low-ranked specialist can be admitted when it uniquely patches
  an otherwise unresolved high-priority weakness.
- [ ] Typecheck passes.
- [ ] Tests pass.

### US-007: Update Documentation And Local Contracts

**Description:** As a developer, I need the documentation to match the new UI
contract so future optimizer and UI changes do not reintroduce raw threat scores
or lineup quality pills.

**Acceptance Criteria:**

- [ ] Update `docs/pokemon-go-team-optimization.md` to state that the Threat
  Score section owns the team-level quality pill.
- [ ] Update `docs/pokemon-go-team-optimization.md` to state that Recommended
  Lineups do not render quality pills.
- [ ] Update `components/AGENTS.md` to reflect the new AnalysisPanel display
  contract.
- [ ] Update `.opencode/skills/gbl-optimizer/SKILL.md` to reverse the previous
  contract.
- [ ] Documentation explicitly states that raw threat scores are not user-facing
  in the Threat Score UI.
- [ ] Documentation explicitly states that backend threat fields may remain for
  sorting and diagnostics.
- [ ] Documentation describes anchor-first generation, dynamic per-meta score
  bands, companion ranking, and specialist gating.
- [ ] Documentation states that fixed score thresholds such as `92`, `90`, `88`,
  and `85` are Great League examples only, not global rules.
- [ ] Typecheck passes.
- [ ] Tests pass.

## Functional Requirements

- FR-1: The Threat Score card must not display raw numerical values for overall,
  top meta, or full meta threat scores.
- FR-2: The Threat Score card must display exactly one team-level quality pill.
- FR-3: The team-level quality pill must use one of: `elite`, `strong`,
  `neutral`, `weak`.
- FR-4: The team-level quality pill must use lower-is-better threat score
  thresholds:
  - `<= 0.15`: `elite`
  - `<= 0.30`: `strong`
  - `<= 0.45`: `neutral`
  - `> 0.45`: `weak`
- FR-5: These thresholds are display-only and must not change backend scoring
  behavior.
- FR-6: Threat list items must display only the Pokemon name from
  `threat.pokemon`.
- FR-7: Threat list items must not display rank, answer count, risk score,
  threat value, or other technical metadata.
- FR-8: Threat list headings should remain `Top Meta Threats` and
  `Overall Team Threats` unless implementation chooses friendlier labels that
  preserve the same meaning.
- FR-9: Existing capped threat list behavior must remain.
- FR-10: Existing `Showing top 5 of N` summaries must remain unless
  intentionally changed with test coverage.
- FR-11: Recommended Lineup cards must not render quality pills.
- FR-12: Recommended Lineup cards must continue rendering lead, switch, closer,
  and weakness information.
- FR-13: Recommended Lineup cards must continue using blue diagnostic styling.
- FR-14: Tests in `components/organisms/AnalysisPanel/AnalysisPanel.test.tsx`
  must be updated from the old contract to the new contract.
- FR-15: Documentation must be updated anywhere it states that Threat Score
  omits quality pills or that Recommended Lineups render one quality pill.
- FR-16: Candidate ranking bands must be derived per selected format from the
  format-specific ranking export.
- FR-17: Dynamic band derivation must consider score distribution, rank
  percentile, score dropoffs, and bounded minimum/maximum candidate counts.
- FR-18: The genetic algorithm must seed candidate teams from elite or preferred
  anchors before relying on random full-team construction.
- FR-19: The generator must rank anchor plus companion pairs before adding the
  next Pokemon.
- FR-20: Companion ranking must consider PvPoke rank, PvPoke Score, simulation
  coverage, safety rank, consistency rank, bulk, and offensive/defensive typing.
- FR-21: Team expansion must repeatedly evaluate remaining weaknesses and add
  companions that improve coverage and playable lineup quality until the target
  team size is reached.
- FR-22: Low-ranked specialists must require unique, measurable top-meta or
  core-weakness coverage before selection.
- FR-23: Fixed PvPoke score thresholds may be used in documentation only as
  examples from a specific export and must not be hardcoded as global viability
  bands.

## Non-Goals

- Do not change backend threat scoring logic.
- Do not remove backend fields required for sorting, scoring, diagnostics, or
  future calibration.
- Do not change recommended lineup UI content beyond removing quality pills.
- Do not change Pokemon ranking data, PvPoke sync behavior, type effectiveness,
  or optimizer calibration.
- Do not introduce new dependencies.
- Do not expose numeric lineup scores.
- Do not redesign the full AnalysisPanel layout beyond the display contract
  changes described here.

## Design Considerations

- The Threat Score section should communicate weakness severity at a glance.
- The quality pill should be visually consistent with existing
  `lineupQualityClasses` styling where appropriate.
- The phrase `Team threat profile: strong` is preferred because it explains what
  the pill represents.
- The accessible label should include the same semantic meaning.
- Threat list entries should be scannable and uncluttered.
- Recommended Lineups should remain focused on practical lineup composition and
  weaknesses, not quality scoring.
- Preserve existing blue diagnostic styling for Recommended Lineups.
- Generated teams should usually begin from high-ranked, high-score anchors and
  add companions that cover those anchors' important weaknesses.
- The anchor-first flow should remain flexible enough to produce ABC teams by
  default and ABB/ABA teams when the matchup data justifies them.
- Limited metas should use dynamic score distribution analysis rather than open
  Great League score examples.

## Technical Considerations

- Primary implementation file:
  `components/organisms/AnalysisPanel/AnalysisPanel.tsx`.
- Relevant existing helpers:
  - `LineupQuality = 'elite' | 'strong' | 'neutral' | 'weak'`
  - `lineupQualityClasses`
  - `getLineupQuality(score)`
  - `formatOptionalScore`
  - `formatThreatEntry`
- `formatThreatEntry` should be changed so it returns only `threat.pokemon`.
- Existing `getLineupQuality(score)` may need to be replaced, renamed, or
  supplemented with a threat-specific helper because lineup scores and threat
  scores may have different semantics.
- Threat quality thresholds are lower-is-better, unlike many lineup quality
  interpretations.
- Avoid changing backend data structures unless necessary.
- Existing tests in `components/organisms/AnalysisPanel/AnalysisPanel.test.tsx`
  currently assert the old contract and must be updated.
- Browser verification is required using the `dev-browser` skill.
- Relevant docs to update:
  - `docs/pokemon-go-team-optimization.md`
  - `components/AGENTS.md`
  - `.opencode/skills/gbl-optimizer/SKILL.md`
- Algorithm files likely involved in the companion-adjustment work include:
  - `lib/genetic/algorithm.ts`
  - `lib/genetic/chromosome.ts`
  - `lib/genetic/operators.ts`
  - `lib/genetic/fitness/index.ts`
  - `lib/data/rankings.ts`
- Consider adding pure helper modules for dynamic score bands and anchor-first
  construction so API routes and UI components remain thin adapters.
- The anchor-first implementation should preserve final canonical lineup and
  roster scoring rather than replacing it with rank-only ordering.

## Success Metrics

- Users no longer see raw Threat Score numbers in the Threat Score card.
- Threat lists contain only readable Pokemon names.
- Exactly one team-level threat profile pill appears in the Threat Score
  section.
- Recommended Lineups render zero quality pills.
- Updated tests prevent regression to the old UI contract.
- Documentation consistently describes the new display contract.
- UI verification confirms the AnalysisPanel remains readable and visually
  consistent.
- Generated teams more often include high-ranked anchors with synergistic
  companions instead of multiple low-ranked core-breakers.
- Limited-format generation uses the selected meta's score curve rather than
  open Great League cutoffs.
- Low-ranked specialists appear rarely and only with clear measurable coverage
  value.

## Open Questions

- Should the Threat Score headings remain `Top Meta Threats` and
  `Overall Team Threats`, or should they be changed to friendlier labels?
- Should the team threat profile be calculated from overall threat score,
  minimal threat score, top meta score, or another existing field?
- Should the pill text use `Team threat profile: strong`,
  `Threat profile: strong`, or another exact label?
- Should threshold values be configurable in a shared constant for future
  calibration?
- Should there be tooltip/help text explaining what `elite`, `strong`,
  `neutral`, and `weak` mean for threat profile?
- What exact minimum and maximum pool sizes should dynamic ranking bands use for
  open formats versus limited cups?
- Should anchor-first construction seed the entire initial GA population or only
  a configured percentage while preserving random diversity?
- Should user-selected low-ranked anchors bypass specialist gating and instead
  trigger companion search around the manual anchor?
