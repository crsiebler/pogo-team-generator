# PRD: Additional Mega Charged Attacks

## 1. Introduction

Support the species-specific additional Charged Attack mechanic announced for
eligible Mega-Evolved Pokemon.

Eligible forms receive one fixed additional Charged Attack while Mega Evolved.
The move is available regardless of Mega Level, but this application will model
all battles at fixed Mega Level 4. Eligibility and move assignment will come
from synchronized Pokemon and move data rather than a hardcoded species list.

Source:
[Pokemon GO announcement](https://pokemongo.com/news/more-mega-updates-2026)

## 2. Goals

- Simulate eligible Mega Pokemon with their fixed additional Charged Attack.
- Model additional attacks at Mega Level 4.
- Keep ordinary movesets limited to one Fast Attack and two selectable Charged
  Attacks.
- Determine eligibility from synchronized `extraChargedMoves`, `mega` tags, and
  `isMegaMove`.
- Include the additional attack in optimizer diagnostics, display, and
  compatible exports.
- Apply the mechanic in every supported format where Mega Pokemon are legal.
- Version and regenerate affected manifests, snapshots, assignments, and
  simulations.
- Automatically support future eligible Mega Pokemon after synchronized data
  updates.

## 3. User Stories

### US-001: Validate Additional Mega Attack Data

**Description:** As a developer, I want synchronized Pokemon and move data to
represent additional Mega attacks safely so malformed data cannot reach
simulations.

**Acceptance Criteria:**

- [ ] `Pokemon` and sync contracts support optional `extraChargedMoves`.
- [ ] `Move` and sync contracts support optional `isMegaMove`.
- [ ] Pokemon validation rejects malformed `extraChargedMoves`.
- [ ] Move validation rejects malformed `isMegaMove`.
- [ ] Existing valid synchronized data passes validation.
- [ ] Typecheck passes.
- [ ] Focused validation tests pass.

**Recommended Agents:** @typescript-pro, @test-automator

### US-002: Resolve Species-Specific Eligibility

**Description:** As a user, I want only officially eligible Mega forms to
receive an additional attack so ordinary Mega Pokemon remain accurate.

**Acceptance Criteria:**

- [ ] Eligibility requires the `mega` tag.
- [ ] Eligibility requires exactly one valid `extraChargedMoves` reference.
- [ ] The referenced move requires `isMegaMove: true`.
- [ ] Eligible forms resolve their synchronized fixed additional move.
- [ ] Ordinary Mega forms resolve no additional move.
- [ ] Cramorant and other non-Mega extra-move mechanics are excluded.
- [ ] No hardcoded species allowlist is used.
- [ ] Tests cover all currently synchronized eligible Mega forms.
- [ ] Typecheck passes.
- [ ] Tests pass.

**Recommended Agents:** @backend-developer, @test-automator

### US-003: Preserve Additional Attacks Through Sync

**Description:** As a developer, I want ranking and candidate synchronization
to retain additional Mega attacks without treating them as selectable moves.

**Acceptance Criteria:**

- [ ] Four-element PvPoke movesets are interpreted as Fast Attack, two
      selectable Charged Attacks, and one fixed additional attack.
- [ ] Candidate identity continues to use only the Fast Attack and selectable
      charged pair.
- [ ] Candidate derivation does not substitute, reorder, or remove the fixed
      additional attack.
- [ ] Ranking CSVs retain their existing two selectable Charged Attack columns.
- [ ] Missing or incompatible additional-move data fails with an actionable
      error.
- [ ] Typecheck passes.
- [ ] Sync tests pass.

**Recommended Agents:** @data-engineer, @typescript-pro

### US-004: Simulate Explicit Mega Level 4 Battles

**Description:** As a user, I want matchup simulations to include eligible
additional attacks at Mega Level 4 so generated teams reflect the intended
competitive rules.

**Acceptance Criteria:**

- [ ] Simulation explicitly sets Mega Level 4.
- [ ] Eligible simulated Pokemon select their fixed additional attack.
- [ ] Eligible opponents select their fixed additional attack.
- [ ] Noneligible Mega Pokemon retain two Charged Attacks.
- [ ] Non-Mega Pokemon never receive this mechanic.
- [ ] The local PvPoke engine remains isolated to sync tooling.
- [ ] Runtime code does not import or execute PvPoke vendor JavaScript.
- [ ] Tests verify Level 4 damage behavior against the local PvPoke engine.
- [ ] Typecheck passes.
- [ ] Simulation tests pass.

**Recommended Agents:** @backend-developer, @debugger

### US-005: Version Manifests and Runtime Snapshots

**Description:** As a developer, I want generated artifacts to declare the
additional attack and Mega Level so stale or ambiguous simulation data cannot
be loaded.

**Acceptance Criteria:**

- [ ] Manifest schema or policy version is incremented.
- [ ] Runtime snapshot schema version is incremented.
- [ ] Manifest metadata records fixed Mega Level 4.
- [ ] Eligible species metadata records the fixed additional move.
- [ ] Artifact digests include all behavior-affecting additional-move metadata.
- [ ] Runtime compatibility checks reject prior schema versions.
- [ ] Snapshot parsing validates additional move references.
- [ ] Snapshot ratings remain compact and within deployment budgets.
- [ ] Typecheck passes.
- [ ] Manifest and snapshot tests pass.

**Recommended Agents:** @architect-reviewer, @performance-engineer

### US-006: Version Assignment and Scoring Identity

**Description:** As a user, I want displayed results and optimizer caches to
match the exact Mega configuration that was scored.

**Acceptance Criteria:**

- [ ] Moveset variant identity remains based on the selectable three-move
      configuration.
- [ ] Resolved battle configuration includes optional additional attack
      metadata.
- [ ] Resolved battle configuration records Mega Level 4.
- [ ] Assignment fingerprint version is incremented.
- [ ] Fingerprints include the additional attack and Mega Level.
- [ ] Stale assignments are rejected rather than silently upgraded.
- [ ] Assignment validation confirms current synchronized eligibility.
- [ ] Cache keys distinguish the updated battle configuration.
- [ ] Typecheck passes.
- [ ] Assignment and cache tests pass.

**Recommended Agents:** @typescript-pro, @architect-reviewer

### US-007: Include the Additional Attack in Optimizer Diagnostics

**Description:** As a user, I want optimizer recommendations to account for the
additional move's battle value so coverage and consistency diagnostics agree
with matchup simulations.

**Acceptance Criteria:**

- [ ] Matchup scoring consumes regenerated Level 4 simulations.
- [ ] Offensive typing includes the additional move.
- [ ] Coverage calculations include the additional move.
- [ ] Expected opponent attack typing includes eligible opponents' additional
      moves.
- [ ] Energy and consistency calculations support three effective Charged
      Attacks.
- [ ] Damage calculations apply the Level 4 Mega-move multiplier where
      appropriate.
- [ ] Status-effect utility remains distinct from raw damage calculations.
- [ ] Existing scoring priorities and normalization remain unchanged.
- [ ] Typecheck passes.
- [ ] Optimizer regression tests pass.

**Recommended Agents:** @performance-engineer, @test-automator

### US-008: Display Additional Charged Attacks

**Description:** As a user, I want eligible generated Mega Pokemon to show their
additional attack clearly so I know the complete battle configuration.

**Acceptance Criteria:**

- [ ] Team details API returns the additional move for eligible Mega forms.
- [ ] Team details API returns Mega Level 4 metadata.
- [ ] The move appears under the label `Additional Charged Attack`.
- [ ] The additional move is visually distinct from the two selectable Charged
      Attacks.
- [ ] Noneligible Pokemon do not render an empty additional-move section.
- [ ] Existing acquisition labels are not applied to the inherent additional
      move.
- [ ] Runtime response guards validate the new fields.
- [ ] Typecheck passes.
- [ ] Component and API tests pass.
- [ ] Verify desktop and mobile behavior using the `dev-browser` skill.

**Recommended Agents:** @react-specialist, @accessibility-tester

### US-009: Export the Complete Battle Configuration

**Description:** As a user, I want exports to retain the additional move where
supported so external tools receive the configuration that was scored.

**Acceptance Criteria:**

- [ ] Export logic includes the additional move when the destination format
      supports it.
- [ ] Standard two-Charged-Attack export syntax remains unchanged for
      noneligible Pokemon.
- [ ] Mega Level 4 is included as metadata or an annotation where the
      destination format cannot encode it.
- [ ] Export does not represent the additional attack as user-selectable.
- [ ] Export tests cover eligible and noneligible Mega forms.
- [ ] Typecheck passes.
- [ ] Export tests pass.

**Recommended Agents:** @backend-developer, @test-automator

### US-010: Regenerate and Validate Affected Assets

**Description:** As a developer, I want all Mega-legal formats regenerated so
production runtime assets match the new battle rules.

**Acceptance Criteria:**

- [ ] Simulations are regenerated for every catalog format where Mega Pokemon
      are legal.
- [ ] Moveset manifests are regenerated.
- [ ] Compact runtime snapshots are regenerated.
- [ ] Runtime asset index is regenerated.
- [ ] Stale prior-policy artifacts are rejected.
- [ ] Runtime snapshot and CSV parity checks pass.
- [ ] Deployment asset budgets pass.
- [ ] Root-only typecheck passes.
- [ ] Root-only lint passes.
- [ ] Root-only test suite passes.
- [ ] A generated eligible Mega team is verified manually in the browser.

**Recommended Agents:** @build-engineer, @test-automator

## 4. Functional Requirements

1. **FR-1:** The system must derive additional Mega attack eligibility from
   synchronized data.
2. **FR-2:** Eligibility must require a Mega-tagged Pokemon with one valid
   `extraChargedMoves` entry referencing an `isMegaMove` move.
3. **FR-3:** Non-Mega extra-move mechanics must not activate additional Mega
   attack behavior.
4. **FR-4:** Ordinary Mega Pokemon without eligible synchronized data must
   retain two Charged Attacks.
5. **FR-5:** The additional attack must remain fixed and must not participate in
   candidate move substitutions.
6. **FR-6:** Normal moveset identity must remain one Fast Attack plus two
   selectable Charged Attacks.
7. **FR-7:** All affected simulations must explicitly use Mega Level 4.
8. **FR-8:** Eligible targets and opponents must receive their additional
   attacks during simulation.
9. **FR-9:** Runtime artifacts must identify the additional move and Mega Level
   used to produce their ratings.
10. **FR-10:** Runtime loaders must reject stale artifact schemas.
11. **FR-11:** Assignment fingerprints must include all behavior-affecting
    additional-move configuration.
12. **FR-12:** Optimizer coverage, typing, energy, and consistency diagnostics
    must include the additional attack.
13. **FR-13:** The team details API must expose the additional attack and Mega
    Level.
14. **FR-14:** The UI must label the move `Additional Charged Attack`.
15. **FR-15:** Compatible exports must include the additional attack.
16. **FR-16:** The mechanic must apply in every supported format where Mega
    Pokemon are legal.
17. **FR-17:** Future eligible Mega forms must become supported through normal
    data synchronization.
18. **FR-18:** Runtime application code must not execute or bundle PvPoke vendor
    JavaScript.

## 5. Non-Goals

- No Mega Level selector.
- No per-Pokemon Mega Level configuration.
- No support for Mega Levels below Level 4.
- No additional attack for every Mega Pokemon.
- No hardcoded list of the currently eligible species.
- No modeling of Cramorant's Gulp Missile mechanic.
- No Gym battle behavior.
- No raid or Adventure Effect simulation.
- No acquisition or move-unlock workflow.
- No backwards compatibility for stale assignment or artifact schemas.
- No change to the optimizer's category weights.
- No conversion of the fixed additional attack into a selectable moveset slot.

## 6. Design Considerations

- Reuse the current moves display components.
- Render the fixed attack after the two selectable Charged Attacks.
- Use the explicit label `Additional Charged Attack`.
- Show `Mega Level 4` near the additional attack or Mega battle configuration.
- Do not imply that users can replace or reorder the additional attack.
- Preserve existing mobile card readability and accessible move labels.

## 7. Technical Considerations

- The current synchronized data already includes `extraChargedMoves` and
  `isMegaMove`, but runtime TypeScript contracts do not expose them.
- The isolated PvPoke engine already supports an `extra-charged` slot.
- Current simulations rely on PvPoke's implicit Mega Level 3 default; the new
  implementation must set Level 4 explicitly.
- Candidate and ranking schemas should retain two selectable Charged Attacks.
- Fixed additional-move metadata should be stored separately from variant
  identity.
- Manifest, snapshot, and assignment versions must change together.
- Only affected Mega-legal formats require simulation regeneration.
- Existing runtime PvPoke boundary tests must continue to pass.
- Export syntax must be verified against the current target tool before adding
  a fourth move token.

## 8. Success Metrics

- Every currently synchronized eligible Mega form receives its correct
  additional attack.
- Zero noneligible Mega forms receive an additional attack.
- Cramorant remains excluded from this mechanic.
- Mega Level 4 simulation behavior is explicit and deterministic.
- Generated teams display the same additional move used in scoring.
- Compatible exports preserve the same additional move.
- Future eligible Mega forms require only synchronized data refreshes.
- All affected artifact parity, deployment-budget, lint, typecheck, and test
  validations pass.

## 9. Open Questions

- What exact syntax does the current target export format accept for an
  additional Mega Charged Attack?
- Should Mega Level 4 be displayed on every eligible Pokemon card or once at the
  team or format level?
- Should the API field be named `additionalChargedAttack` to match official
  terminology or `additionalChargedMove` to match internal move naming?
