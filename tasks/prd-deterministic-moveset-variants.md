# PRD: Deterministic Simulation-Backed Moveset Variants

## Introduction

Generalize the Pokemon GO team generator's current Golisopod-specific alternate
moveset support into a deterministic, format-aware system backed by PvPoke
ranking evidence, move mechanics, and checked-in matchup simulations.

The current prototype can select an alternate fast move for Golisopod, but it
does not preserve one moveset assignment across every ordered lineup and it
continues to use default matchup matrices for several scoring and analysis
paths. This can make the displayed moveset disagree with the simulations used
to recommend the roster.

This feature will derive a small set of viable movesets during sync, simulate
them with the isolated local PvPoke engine, publish an authoritative manifest
for runtime use, and assign one immutable moveset to each Pokemon in a finalist
roster. The same assignment must drive matchup scoring, diagnostics, API output,
and team export.

### Revision: Default-Only Production Data

Moveset variation proved substantially more expensive in repository size, sync
duration, runtime data preparation, and optimizer complexity than its current
product usage justifies. The generalized implementation remains valuable as an
experimental option, but production sync and UI behavior will return to ranked
default movesets.

Normal sync runs must generate, publish, and retain only ranked-default
simulation data. Alternate moveset derivation and simulation remain available
behind an explicit `--moveset-variants` sync flag for future evaluation. The
user-facing moveset variation control must not render, and frontend generation
requests must use the ranked-default path. Existing reusable UI atoms and the
underlying opt-in sync/runtime implementation may remain in the codebase.

## Goals

- Support deterministic moveset variants for every ranked species and form in
  every supported battle format.
- Use PvPoke category movesets, overrides, per-move usage, and move mechanics to
  avoid speculative full-movepool combinations.
- Simulate no more than eight candidates and expose no more than three active
  variants per species and format.
- Prevent unavailable or intentionally bad moves from entering simulations or
  generated teams.
- Treat Elite moves as fully eligible and intended limited-release signature
  moves as eligible through species-scoped exceptions.
- Represent Return as a purified-only acquisition requirement and always reject
  Frustration.
- Publish deterministic format manifests that define the moveset variants
  available to runtime code.
- Ensure matchup scoring, shield paths, diagnostics, API output, and export all
  use the same fixed roster moveset assignment.
- Preserve optimizer hot-path performance through default-only GA scoring and
  bounded finalist reranking.
- Keep runtime application and optimizer code independent of PvPoke vendor
  JavaScript.
- Make ranked-default simulation generation the normal sync behavior.
- Preserve alternate simulation generation as explicit opt-in tooling through
  `npm run sync -- --moveset-variants`.
- Remove generated alternate simulation evidence from the default checked-in
  dataset after safe default-only publication.
- Hide the moveset variation UI and keep frontend generation on ranked defaults.

## User Stories

### US-001: Define Shared Moveset Contracts

**Description:** As a developer, I want one shared moveset identity and
assignment contract so that sync, runtime loading, scoring, and API output do
not represent the same moveset differently.

**Acceptance Criteria:**

- [ ] Shared types exist for `Moveset`, `MovesetVariant`,
      `MovesetVariantId`, `MoveAvailability`, and
      `RosterMovesetAssignment`.
- [ ] `PokemonData` explicitly types `eliteMoves` and `legacyMoves`.
- [ ] Charged-move pairs have a canonical order-independent identity.
- [ ] Preferred source order is retained separately for simulation and display.
- [ ] Species and move alias normalization is shared by ranking sync,
      simulation sync, and runtime data loading.
- [ ] Exported symbols have explicit parameter and return types and TSDoc.
- [ ] Typecheck passes.
- [ ] Tests pass for identity and normalization behavior.

**Recommended Agents:** @typescript-pro, @refactoring-specialist

### US-002: Enforce Move Availability Rules

**Description:** As a competitive player, I want recommendations to contain
obtainable or intentionally released moves so that generated teams do not
require accidental historical moves or Frustration.

**Acceptance Criteria:**

- [ ] Regular moves are eligible.
- [ ] Elite Fast and Elite Charged moves are eligible without a scoring penalty.
- [ ] Frustration is rejected unconditionally, including when source ranking
      data contains it.
- [ ] Return is eligible only for a non-shadow Pokemon whose canonical base
      species has a checked-in shadow variation.
- [ ] Return variants are marked with a `purified` acquisition requirement.
- [ ] Return is rejected when the purified level-25 CP floor exceeds the
      selected format's CP cap.
- [ ] Return is rejected for every `_shadow` species.
- [ ] Tests cover regular, Elite, purified, Frustration, and CP-floor cases.
- [ ] Typecheck passes.
- [ ] Tests pass.

**Recommended Agents:** @typescript-pro, @test-automator

### US-003: Enforce Species-Scoped Legacy Exceptions

**Description:** As a competitive player, I want intended signature and
approved legacy moves included while accidental historical moves remain
excluded.

**Acceptance Criteria:**

- [ ] The following species-move pairs are eligible:
      `mewtwo/COUNTER`, `mewtwo_mega_x/COUNTER`,
      `mewtwo_mega_y/COUNTER`, `dialga_origin/ROAR_OF_TIME`,
      `palkia_origin/SPACIAL_REND`, `kyurem_black/FREEZE_SHOCK`,
      `kyurem_white/ICE_BURN`,
      `zacian_crowned_sword/BEHEMOTH_BLADE`, and
      `zamazenta_crowned_shield/BEHEMOTH_BASH`.
- [ ] Acid is rejected for Grimer, Muk, Koffing, and Weezing.
- [ ] Quick Attack is rejected for Staryu, Starmie, Porygon, Pichu, and
      Delibird.
- [ ] Psybeam is rejected for Chansey.
- [ ] Draining Kiss is rejected for Kirlia.
- [ ] An allowlisted move for one species does not make a legacy occurrence on
      another species eligible.
- [ ] Every checked-in `legacyMoves` species-move pair has an explicit test
      expectation.
- [ ] Typecheck passes.
- [ ] Tests pass.

**Recommended Agents:** @typescript-pro, @test-automator

### US-004: Preserve PvPoke Moveset Evidence During Sync

**Description:** As a developer, I want sync tooling to preserve the ranking
evidence needed for variant derivation so that runtime code does not need to
load PvPoke source files.

**Acceptance Criteria:**

- [ ] Ranking source types retain category movesets and
      `moves.fastMoves[].uses` and `moves.chargedMoves[].uses`.
- [ ] Alias and pseudo-form provenance is preserved before canonical species
      deduplication.
- [ ] Exact-format movesets are read from Overall, Leads, Switches, Closers,
      Chargers, Attackers, and Consistency rankings.
- [ ] Explicit PvPoke moveset overrides are read through `lib/sync/adapter.ts`.
- [ ] Source-layout knowledge remains behind the sync adapter.
- [ ] Runtime modules do not import or load PvPoke vendor assets.
- [ ] Typecheck passes.
- [ ] Sync tests pass.

**Recommended Agents:** @data-engineer, @typescript-pro

### US-005: Derive Bounded Deterministic Candidates

**Description:** As a developer, I want a deterministic candidate derivation
pipeline so that simulations focus on strategically plausible movesets and do
not generate the full legal-move Cartesian product.

**Acceptance Criteria:**

- [ ] The eligible exact-format Overall moveset is the preferred default seed.
- [ ] Distinct eligible category and override movesets are preserved as
      candidates.
- [ ] Move usage is normalized within each ranking entry before aggregation.
- [ ] Category evidence is weighted as follows: Overall `3`, Leads `2`,
      Switches `2`, Closers `2`, Chargers `1`, Attackers `1`, and Consistency
      `1`.
- [ ] Fast-move ranking considers DPT, EPT, turn duration, STAB, typing, and
      meaningful coverage.
- [ ] Charged-move ranking considers DPE, energy cost, fast-move pacing, STAB,
      typing, coverage, and expected status effects.
- [ ] Strictly dominated speculative moves are removed.
- [ ] Observed bait, buff, debuff, or coverage moves are not removed solely for
      having lower raw DPT or DPE.
- [ ] Expansion retains at most two fast moves and four charged moves.
- [ ] Expansion creates only evidence-backed single-fast or single-charged
      substitutions around observed movesets.
- [ ] No more than eight candidates are emitted per species, form, and format.
- [ ] Shuffling source ranking order produces byte-identical candidate output.
- [ ] Typecheck passes.
- [ ] Candidate derivation tests pass.

**Recommended Agents:** @data-engineer, @test-automator

### US-006: Replace Invalid Ranked Defaults

**Description:** As a competitive player, I want an eligible replacement when
PvPoke selects an excluded legacy move so that the species can remain available
without recommending an invalid moveset.

**Acceptance Criteria:**

- [ ] A ranked moveset containing an ineligible move is rejected before
      simulation.
- [ ] The rejection records the source moveset, excluded move, and reason.
- [ ] The strongest eligible candidate by deterministic ranking evidence
      becomes the simulation default.
- [ ] The original PvPoke score remains available only as a candidate-quality
      prior.
- [ ] Runtime moveset selection never returns the rejected source moveset.
- [ ] Muk with Acid and Starmie with Quick Attack are regression fixtures.
- [ ] Typecheck passes.
- [ ] Tests pass.

**Recommended Agents:** @debugger, @test-automator

### US-007: Report Projected Simulation Size

**Description:** As a maintainer, I want a deterministic simulation projection
before bulk generation so that variant growth is visible and bounded.

**Acceptance Criteria:**

- [ ] Sync can report candidate species counts, candidate variant counts, and
      projected shield-scenario CSV counts by format.
- [ ] Only species with more than one evidence-backed candidate project
      alternate simulation files.
- [ ] The report does not write simulation files or manifests.
- [ ] Per-species limits are included in the report.
- [ ] The same inputs produce the same report ordering and totals.
- [ ] Typecheck passes.
- [ ] Tests pass for projection totals.

**Recommended Agents:** @tooling-engineer, @data-engineer

### US-008: Generate Versioned Moveset Variant Manifests

**Description:** As a runtime developer, I want each format to publish an
authoritative moveset manifest so that variant availability is not inferred by
scanning filenames.

**Acceptance Criteria:**

- [ ] Sync writes
      `data/simulations/cp{cp}/{cup}/moveset-variants.json` for every supported
      format.
- [ ] The manifest includes schema version, policy version, format ID, cup, CP,
      source digests, and candidate derivation settings.
- [ ] Each species entry includes its eligible default, all simulated
      candidates, evidence, acquisition requirements, storage keys, scenario
      completeness, evaluation counts, and active status.
- [ ] No candidate is marked complete unless its required 0-, 1-, and 2-shield
      files are valid.
- [ ] The manifest is written atomically after all required files are complete.
- [ ] Repeated generation from identical inputs produces a byte-identical
      manifest.
- [ ] Typecheck passes.
- [ ] Manifest and sync tests pass.

**Recommended Agents:** @data-engineer, @typescript-pro

### US-009: Select Active Simulation-Backed Variants

**Description:** As a competitive player, I want only simulation-supported and
meaningfully distinct alternatives considered so that recommendations remain
focused and explainable.

**Acceptance Criteria:**

- [ ] Candidate comparisons use the same evaluated opponent intersection.
- [ ] Candidates missing required scenario or opponent data cannot displace the
      default.
- [ ] Top-meta matchup improvements receive more weight than full-meta
      improvements.
- [ ] The primary alternative must have positive weighted improvement over the
      default.
- [ ] A second alternative is selected by positive marginal coverage not
      already supplied by the primary alternative.
- [ ] Ties and insufficient evidence preserve the default.
- [ ] At most one default and two alternatives are marked active for a species
      and format.
- [ ] Typecheck passes.
- [ ] Selection tests pass for ties, sparse data, weighting, and complementarity.

**Recommended Agents:** @typescript-pro, @test-automator

### US-010: Load Runtime Variants From Manifests

**Description:** As a runtime developer, I want typed manifest-backed simulation
lookups so that stale or partial CSV files cannot become active accidentally.

**Acceptance Criteria:**

- [ ] Runtime loads only manifest-declared active variants.
- [ ] Default and alternate matrices remain format scoped.
- [ ] Aggregate matchup lookup accepts an explicit moveset variant.
- [ ] Shield-scenario lookup accepts an explicit moveset variant.
- [ ] Alternate lookup never silently substitutes default rows.
- [ ] Missing, incompatible, malformed, or incomplete manifests produce an
      actionable typed error.
- [ ] Variant filenames are storage details rather than the availability source
      of truth.
- [ ] The PvPoke runtime boundary test passes.
- [ ] Typecheck passes.
- [ ] Runtime loader tests pass.

**Recommended Agents:** @backend-developer, @architect-reviewer

### US-011: Assign One Moveset Per Finalist Roster

**Description:** As a competitive player, I want each Pokemon to use one fixed
moveset across every pick-three lineup so that the recommended bring-six roster
is legal and internally consistent.

**Acceptance Criteria:**

- [ ] One immutable `RosterMovesetAssignment` is created before the 120 ordered
      lineups are scored.
- [ ] A species uses the same variant in every lineup for that roster.
- [ ] Lineup scoring consumes the assignment and does not derive movesets.
- [ ] Assignment fingerprints are deterministic and included in relevant cache
      keys.
- [ ] Different assignments cannot collide in lineup or roster caches.
- [ ] Typecheck passes.
- [ ] Tests pass for fixed assignments and cache isolation.

**Recommended Agents:** @architect-reviewer, @typescript-pro

### US-012: Make Optimizer Scoring Variant-Aware

**Description:** As a competitive player, I want every matchup-derived score to
use the assigned moveset so that fitness and diagnostics describe the team that
is actually recommended.

**Acceptance Criteria:**

- [ ] Coverage uses assigned-variant matchup matrices.
- [ ] Safety and overwhelming-loss calculations use assigned variants.
- [ ] Shield and resource-path calculations use assigned variants.
- [ ] Consistency and shield-stability calculations use assigned variants.
- [ ] Matchup quality uses `scoreMatchupRating(...)` with assigned variants.
- [ ] Threat Score uses assigned variants while remaining a display-only,
      lower-is-better diagnostic.
- [ ] Offensive move typing and matchup matrices refer to the same moveset.
- [ ] Categorical labels continue to use explicit rating thresholds.
- [ ] Typecheck passes.
- [ ] Controlled lineup, ABC, ABB, ABA, and threat-pool tests pass.

**Recommended Agents:** @performance-engineer, @test-automator

### US-013: Rerank Bounded Roster Finalists

**Description:** As a user, I want a roster that becomes stronger with an
alternate moveset to be able to win final selection without slowing the GA hot
path excessively.

**Acceptance Criteria:**

- [ ] Default-only scoring remains in the GA hot path.
- [ ] The GA retains a deterministic, canonicalized top-10 finalist set.
- [ ] Each finalist evaluates no more than `3^6 = 729` moveset assignments using
      a lightweight matrix objective.
- [ ] No more than the top 12 assignment candidates per finalist receive full
      120-lineup scoring.
- [ ] Final selection uses variant-aware full fitness.
- [ ] Ties use variant-aware score, default-only score, and canonical roster key
      in that order.
- [ ] A lower default-scored finalist can win after variant-aware reranking.
- [ ] Returned chromosome fitness equals its final score breakdown.
- [ ] Representative generation remains under one minute.
- [ ] Typecheck passes.
- [ ] Finalist and cache-counter tests pass.

**Recommended Agents:** @performance-engineer, @test-automator

### US-014: Keep Analysis, API, and Export Consistent

**Description:** As a user, I want diagnostics and exported movesets to match
the roster that was scored so that I can trust and build the recommendation.

**Acceptance Criteria:**

- [ ] Generation output includes the selected roster moveset assignment.
- [ ] Threat, shield-scenario, and Pokemon-contribution analyses consume that
      assignment.
- [ ] Team details consume the generated assignment instead of independently
      selecting a different moveset.
- [ ] API output exposes structured `regular`, `elite`, `eventExclusive`, and
      `purified` acquisition metadata.
- [ ] Exported team text includes concise Elite, event-exclusive, and purified
      requirements when applicable.
- [ ] Exported move IDs exactly match the assignment used for scoring.
- [ ] No new visual UI component is required.
- [ ] Typecheck passes.
- [ ] API, analysis, and export tests pass.

**Recommended Agents:** @fullstack-developer, @test-automator

### US-015: Clean Stale Generated Variant Files During Sync

**Description:** As a maintainer, I want completed sync runs to remove stale
variant CSVs so that checked-in simulation data stays aligned with the
authoritative manifest.

**Acceptance Criteria:**

- [ ] After a format manifest is successfully published, sync deletes variant
      CSVs in that format directory that are not declared by the manifest.
- [ ] Cleanup is limited to recognized generated variant filename patterns.
- [ ] Default species simulation files are never deleted by variant cleanup.
- [ ] Files outside the active format directory are never deleted.
- [ ] Cleanup does not run after failed or incomplete generation.
- [ ] Dry-run/projection mode reports stale files without deleting them.
- [ ] Cleanup output lists every deleted relative path.
- [ ] Typecheck passes.
- [ ] Cleanup boundary and failure-path tests pass.

**Recommended Agents:** @tooling-engineer, @test-automator

### US-016: Regenerate and Validate All Supported Formats

**Description:** As a maintainer, I want checked-in manifests and simulations
regenerated for every supported format so that generalized variants are
available consistently.

**Acceptance Criteria:**

- [ ] Every format in `lib/data/battleFormats.ts` has a valid manifest.
- [ ] Every manifest default and active variant has all required scenario files.
- [ ] Frustration and excluded legacy pairs appear in no candidate or active
      manifest entry.
- [ ] Approved legacy exceptions and eligible Elite defaults remain available.
- [ ] Golisopod, Quagsire, Forretress, Feraligatr, Empoleon, Furret, Sableye,
      Florges, and Blastoise have expected evidence-backed coverage where their
      ranking data supports alternatives.
- [ ] Furret and Florges shadow forms are not synthesized.
- [ ] Repeated validation produces no manifest or CSV diff.
- [ ] Typecheck passes.
- [ ] Full tests pass.

**Recommended Agents:** @data-engineer, @test-automator

### US-017: Document Variant Generation and Runtime Semantics

**Description:** As a future contributor, I want the moveset policy and data
flow documented so that sync and optimizer behavior remain deterministic.

**Acceptance Criteria:**

- [ ] Optimizer data-input documentation explains availability categories,
      legacy exceptions, Frustration, Return, and Elite moves.
- [ ] Documentation explains candidate evidence, move-stat filtering, and
      candidate caps.
- [ ] Documentation explains manifest authority and stale-file cleanup.
- [ ] Documentation explains fixed roster assignments and finalist reranking.
- [ ] Documentation reiterates that PvPoke JavaScript is sync/tooling-only.
- [ ] Commands for projection, generation, and validation are documented.
- [ ] Documentation formatting passes.

**Recommended Agents:** @documentation-engineer

### US-026: Measure Generated Function Trace Size

**Description:** As a maintainer, I want a deterministic report of the files
traced into the generate-team function so deployment size regressions are
visible before Vercel rejects a build.

**Acceptance Criteria:**

- [ ] Add a non-interactive analyzer for the generated
      `/api/generate-team` Next.js NFT trace.
- [ ] The analyzer reports unique traced file count and uncompressed bytes.
- [ ] The analyzer groups traced bytes by simulations, rankings, application
      code, dependencies, and other data.
- [ ] The analyzer reports the largest traced files in deterministic order.
- [ ] Missing or malformed trace files produce an actionable non-zero failure.
- [ ] Analyzer tests use checked-in fixtures and do not require a Vercel
      deployment.
- [ ] Typecheck passes.
- [ ] Tests pass.

**Recommended Agents:** @build-engineer, @test-automator

### US-027: Publish an Active Runtime Simulation Asset Index

**Description:** As a runtime developer, I want sync to publish an exact list of
runtime-authorized simulation assets so deployment tracing does not include
inactive candidate evidence.

**Acceptance Criteria:**

- [ ] Sync derives a versioned runtime asset index from every supported format's
      validated moveset manifest.
- [ ] The index includes each format manifest and only scenario storage keys for
      manifest-declared active candidates, including active defaults.
- [ ] Inactive candidate CSVs never appear in the runtime asset index.
- [ ] Every indexed path is repository-relative, canonical, unique, and confined
      to its catalog-derived simulation format directory.
- [ ] The runtime asset index is written atomically after successful manifest
      publication.
- [ ] Identical inputs produce a byte-identical index.
- [ ] Existing full manifests and inactive candidate CSVs remain unchanged as
      sync and validation evidence.
- [ ] Typecheck passes.
- [ ] Tests pass.

**Recommended Agents:** @data-engineer, @security-engineer

### US-028: Remove Runtime Simulation Directory Scanning

**Description:** As a runtime developer, I want default matrices loaded through
manifest-declared storage keys so Next.js tracing does not conservatively retain
entire simulation directories.

**Acceptance Criteria:**

- [ ] Runtime default matrix loading uses each species' active default candidate
      and exact manifest storage keys.
- [ ] Runtime simulation loading no longer calls `readdirSync` or discovers
      default matrices by scanning filenames.
- [ ] Default aggregate and shield-scenario lookup behavior remains unchanged.
- [ ] Alternate lookup remains manifest-authoritative and never falls back to a
      default row.
- [ ] Missing, malformed, incompatible, or incomplete default data produces the
      existing actionable typed error contract.
- [ ] Runtime loader tests cover all supported formats and default/alternate
      opponent parity.
- [ ] The PvPoke runtime boundary test passes.
- [ ] Typecheck passes.
- [ ] Tests pass.

**Recommended Agents:** @backend-developer, @architect-reviewer

### US-029: Trace Only Runtime-Authorized Function Assets

**Description:** As a maintainer, I want Next.js output tracing scoped to exact
runtime assets so the standard Vercel function remains within its deployment
limit.

**Acceptance Criteria:**

- [ ] Replace recursive `data/**/*.csv` and `data/**/*.json` tracing for
      `/api/generate-team` with paths from the generated runtime asset index and
      the exact non-simulation data required by the route.
- [ ] Narrow `/api/pokemon-list` tracing to only the files that route consumes.
- [ ] No inactive candidate CSV appears in the generated
      `/api/generate-team` NFT trace.
- [ ] Every runtime-indexed active simulation asset appears in the generated
      trace.
- [ ] A production build followed by the trace analyzer reports no more than
      `200 MiB` uncompressed for `/api/generate-team`.
- [ ] Deployment correctness does not depend on
      `VERCEL_SUPPORT_LARGE_FUNCTIONS` or any equivalent Large Functions setting.
- [ ] All supported formats pass generate-team route tests using traced assets.
- [ ] Typecheck, lint, tests, and production build pass.

**Recommended Agents:** @build-engineer, @deployment-engineer

### US-030: Generate Compact Per-Format Runtime Simulation Snapshots

**Description:** As a maintainer, I want active matchup data compiled into one
compact deterministic snapshot per format so runtime does not ship thousands of
CSV files.

**Acceptance Criteria:**

- [ ] Define a versioned repository-owned snapshot schema containing format,
      manifest policy, and source digest identity.
- [ ] Each snapshot contains canonical species and opponent dictionaries,
      active moveset identities, active default mappings, and all required
      `0-0`, `1-1`, and `2-2` Battle Ratings.
- [ ] Ratings use a documented fixed-width encoding with an explicit missing-row
      sentinel and no silent default substitution.
- [ ] Snapshot generation consumes validated manifests and active scenario CSVs
      only.
- [ ] Every encoded rating has exact parity with its source CSV value.
- [ ] Repeating generation from identical inputs produces byte-identical
      snapshots.
- [ ] Snapshot publication is atomic and occurs after source manifest
      publication succeeds.
- [ ] Typecheck passes.
- [ ] Tests pass.

**Recommended Agents:** @data-engineer, @performance-engineer

### US-031: Load Matchups From Compact Runtime Snapshots

**Description:** As a runtime developer, I want optimizer lookups backed by a
prepared compact snapshot so scoring remains synchronous, deterministic, and
independent of runtime CSV parsing.

**Acceptance Criteria:**

- [ ] Add a format-scoped snapshot repository with an explicit preparation step
      before optimizer scoring begins.
- [ ] Aggregate and shield-scenario lookups preserve the existing synchronous
      scoring interfaces after preparation.
- [ ] Active moveset availability and manifest policy identity come from the
      validated snapshot.
- [ ] Schema, format, policy, source digest, bounds, and missing-value sentinels
      are validated before a snapshot is cached.
- [ ] Snapshot lookup results match the CSV-backed loader for every active
      species, variant, opponent, and scenario in regression fixtures.
- [ ] Runtime never falls back to CSV data when a snapshot is missing or
      incompatible.
- [ ] Assignment fingerprints, finalist ordering, diagnostics, API output, and
      export remain unchanged for deterministic fixtures.
- [ ] The PvPoke runtime boundary test passes.
- [ ] Typecheck passes.
- [ ] Tests pass.

**Recommended Agents:** @backend-developer, @performance-engineer

### US-032: Remove Simulation CSVs From Runtime Function Traces

**Description:** As a maintainer, I want deployed functions to include compact
snapshots instead of source simulations so future candidate growth does not
consume the Vercel bundle budget.

**Acceptance Criteria:**

- [ ] `/api/generate-team` traces compact per-format snapshots and no simulation
      CSV files.
- [ ] Full candidate manifests and inactive simulation evidence remain available
      to sync and validation tooling but are not runtime function dependencies.
- [ ] The trace analyzer reports no more than `100 MiB` uncompressed for
      `/api/generate-team`.
- [ ] All compact runtime simulation snapshots total no more than `50 MiB`
      uncompressed.
- [ ] Representative cold and warm generation remain under one minute and do not
      regress by more than 10 percent from the recorded active-only baseline.
- [ ] Peak runtime memory is recorded for each supported format and remains
      within the configured Vercel function memory limit.
- [ ] The standard Vercel function size limit is met without enabling Large
      Functions support.
- [ ] Typecheck, lint, tests, and production build pass.

**Recommended Agents:** @performance-engineer, @build-engineer

### US-033: Document Runtime Artifact and Vercel Size Contracts

**Description:** As a future contributor, I want the simulation artifact and
deployment-size workflow documented so generated data growth cannot silently
break production deployments.

**Acceptance Criteria:**

- [ ] Documentation distinguishes full CSV and manifest sync evidence from
      compact runtime snapshots.
- [ ] Documentation explains active-only asset indexing, snapshot generation,
      atomic publication, and runtime validation.
- [ ] Documentation includes production build and NFT trace analyzer commands.
- [ ] Documentation records the `200 MiB` active-only transition budget, the
      `100 MiB` compact-snapshot target, and the `50 MiB` snapshot-data target.
- [ ] Documentation states that this feature must not enable or depend on Vercel
      Large Functions support.
- [ ] Documentation states that optimizer hot-path lookups must not perform
      per-matchup network, database, KV, or object-storage requests.
- [ ] Documentation formatting passes.
- [ ] Typecheck passes.

**Recommended Agents:** @documentation-engineer

### US-038: Make Moveset Variant Sync Explicitly Opt-In

**Description:** As a maintainer, I want normal sync runs to exclude alternate
moveset simulations so routine data refreshes remain bounded while the
experimental generator remains available for future evaluation.

**Acceptance Criteria:**

- [ ] Add `includeMovesetVariants?: boolean` to the shared sync options contract,
      with omitted values resolving to `false`.
- [ ] `npm run sync` and `npm run sync -- --resume` pass
      `includeMovesetVariants: false` to simulation generation.
- [ ] `npm run sync -- --moveset-variants` passes
      `includeMovesetVariants: true` to simulation generation.
- [ ] `--moveset-variants` can be combined with `--resume`.
- [ ] Projection mode remains read-only and documents whether its estimate
      includes moveset variants.
- [ ] Unknown CLI flags fail with an actionable message instead of being
      silently ignored.
- [ ] Focused CLI and sync option tests pass.
- [ ] Typecheck passes.

**Recommended Agents:** @cli-developer, @test-automator

### US-039: Publish Default-Only Simulation Authorities

**Description:** As a maintainer, I want default sync runs to publish complete
default-only manifests and snapshots so runtime contracts remain valid without
retaining alternate simulation data.

**Acceptance Criteria:**

- [ ] When `includeMovesetVariants` is false, simulation generation evaluates
      exactly the ranked-default candidate for each synchronized species.
- [ ] Default-only manifests contain exactly one active default candidate per
      included species and no alternate candidate storage keys.
- [ ] Default-only compact snapshots contain only ranked-default matrices and
      preserve all required `0-0`, `1-1`, and `2-2` ratings.
- [ ] Default simulation CSVs, manifests, snapshots, and the runtime asset index
      are validated and published atomically before cleanup begins.
- [ ] After successful default-only publication, cleanup deletes only regular
      files accepted by the strict canonical variant filename parser.
- [ ] Cleanup never deletes default simulation files, format directories, or
      files outside catalog-authorized simulation directories.
- [ ] When `includeMovesetVariants` is true, existing candidate derivation,
      simulation, manifest selection, and snapshot behavior remains available.
- [ ] Focused sync, publication, snapshot, and cleanup tests pass.
- [ ] Typecheck passes.

**Recommended Agents:** @data-engineer, @security-engineer

### US-040: Hide Moveset Variation From Team Configuration

**Description:** As a player, I want team generation to present only supported
ranked-default behavior so an experimental data path is not exposed in the
product UI.

**Acceptance Criteria:**

- [ ] The Moveset Options section and Simulate moveset variants switch do not
      render in Team Configuration.
- [ ] Remove moveset-variation state and feature-specific props from
      `TeamManager`, `TeamConfigPanel`, and `TeamGenerator` rather than guarding
      JSX with a hardcoded false condition.
- [ ] Frontend `/api/generate-team` requests omit `simulateMovesetVariants`.
- [ ] The reusable `Switch` atom remains available for unrelated or future UI
      use.
- [ ] The API and optimizer option may remain defaulted to false for future
      programmatic experiments, but normal UI generation cannot enable it.
- [ ] Component tests assert the moveset variation control is absent and the
      request payload omits the option.
- [ ] Typecheck passes.
- [ ] Tests pass.
- [ ] Verify in browser using dev-browser skill on desktop and mobile viewports.

**Recommended Agents:** @react-specialist, @accessibility-tester

### US-041: Regenerate and Document the Default-Only Dataset

**Description:** As a maintainer, I want checked-in simulation assets and
documentation aligned with the default-only policy so repository size and
runtime costs reflect actual product behavior.

**Acceptance Criteria:**

- [ ] Run the default sync path for every supported battle format and publish
      deterministic default-only manifests and compact snapshots.
- [ ] Remove all generated variant-qualified simulation CSVs through the tested
      post-publication cleanup boundary.
- [ ] No checked-in `data/simulations` filename accepted by the canonical variant
      parser remains after default sync.
- [ ] Record before-and-after simulation file count, repository data bytes,
      compact snapshot bytes, and generate-team trace bytes.
- [ ] Representative default-only team generation remains under one minute and
      records lower or equal snapshot bytes than the variant-enabled baseline.
- [ ] Documentation states that normal sync excludes variants, documents
      `--moveset-variants` as experimental opt-in tooling, and states that the UI
      does not expose the feature.
- [ ] Repeating default sync with unchanged inputs produces no data diff.
- [ ] Typecheck, lint, full tests, production build, and trace analysis pass.

**Recommended Agents:** @data-engineer, @performance-engineer

## Functional Requirements

- **FR-1:** The system must derive moveset variants for all ranked species and
  forms in every supported battle format.
- **FR-2:** Runtime code must use repository-owned manifests and CSV files and
  must not load or execute PvPoke vendor JavaScript.
- **FR-3:** The move availability model must distinguish regular, Elite,
  event-exclusive, purified, and excluded legacy moves.
- **FR-4:** Elite moves must be eligible without a battle-scoring penalty.
- **FR-5:** Frustration must never enter a candidate, simulation, manifest, or
  recommendation.
- **FR-6:** Return must require a non-shadow purified-eligible species with a
  checked-in shadow counterpart and a legal purified CP floor.
- **FR-7:** Legacy move eligibility must be evaluated by species-move pair.
- **FR-8:** Only the approved legacy pairs listed in US-003 may be considered.
- **FR-9:** A source ranking moveset must pass availability validation before it
  can become a simulation default.
- **FR-10:** An invalid source default must be replaced with the strongest
  deterministic eligible candidate without excluding the species.
- **FR-11:** Candidate derivation must consume all seven PvPoke ranking
  categories and explicit overrides when available.
- **FR-12:** Per-move usage must be normalized before aggregation across ranking
  categories.
- **FR-13:** Move mechanics must be used to reject dominated speculative moves
  while preserving observed strategic bait, coverage, and status moves.
- **FR-14:** Candidate derivation must not generate a full legal-move Cartesian
  product.
- **FR-15:** No species and format may have more than eight pre-selection
  candidates.
- **FR-16:** No species and format may expose more than one default and two
  active alternatives.
- **FR-17:** Candidate selection must compare variants over identical evaluated
  opponent intersections.
- **FR-18:** Top-meta matchup improvements must receive greater weight than
  full-meta improvements.
- **FR-19:** A second active alternative must add positive marginal coverage
  beyond the first alternative.
- **FR-20:** Every supported format must publish a versioned
  `moveset-variants.json` manifest.
- **FR-21:** A manifest must be published only after its declared simulation
  files are complete and valid.
- **FR-22:** Runtime variant availability must come exclusively from the
  manifest, not directory scanning.
- **FR-23:** Runtime lookup must not mix alternate and default matrix rows.
- **FR-24:** Every fully scored roster must use one immutable moveset assignment
  across all ordered lineups.
- **FR-25:** Assignment identity must scope lineup and roster caches.
- **FR-26:** Coverage, safety, consistency, resource paths, Threat Score, and
  analysis must use assigned-variant matchup data.
- **FR-27:** Threat Score must remain lower-is-better and outside weighted
  fitness.
- **FR-28:** Default-only scoring must remain in the GA hot path.
- **FR-29:** Variant-aware reranking must evaluate ten roster finalists.
- **FR-30:** Lightweight assignment evaluation must be capped at 729 assignments
  per finalist.
- **FR-31:** Full 120-lineup scoring must be capped at 12 assignments per
  finalist.
- **FR-32:** Generation output, team details, analyses, and export must use the
  same selected assignment.
- **FR-33:** API and export output must identify Elite, event-exclusive, and
  purified requirements.
- **FR-34:** Successful sync runs must delete stale generated variant CSVs not
  declared in the newly published manifest.
- **FR-35:** Stale cleanup must never remove default simulation files or files
  outside the active format directory.
- **FR-36:** Projection mode must report expected output and stale files without
  writing or deleting files.
- **FR-37:** Identical inputs must produce byte-identical candidate ordering,
  manifests, and projection reports.
- **FR-38:** Sync must exclude alternate moveset simulations unless
  `--moveset-variants` is explicitly provided.
- **FR-39:** Default-only sync must publish structurally valid manifests and
  compact snapshots containing ranked-default variants only.
- **FR-40:** Successful default-only publication must remove recognized
  variant-qualified simulation CSVs without deleting default matrices.
- **FR-41:** Variant-enabled sync must remain available as experimental tooling
  and preserve the existing bounded candidate and active-variant limits.
- **FR-42:** The frontend must not render a moveset variation control or send a
  request that enables variant simulation.
- **FR-43:** The reusable Switch component and backend variant contracts may
  remain available for future reintroduction.
- **FR-44:** Unknown sync CLI flags must fail instead of silently changing or
  skipping data-generation behavior.

## Non-Goals

- Do not simulate every legal fast-move and charged-move combination.
- Do not make PvPoke vendor JavaScript a runtime dependency.
- Do not add Frustration as an option under any condition.
- Do not recommend excluded accidental historical moves, even when a PvPoke
  ranking selects one.
- Do not synthesize shadow forms absent from checked-in Pokemon data.
- Do not add a user-facing moveset editor or moveset preference control.
- Do not add new acquisition badges or other visual UI components.
- Do not change the canonical optimizer component weights.
- Do not add Threat Score to weighted fitness.
- Do not perform variant-aware scoring throughout every GA generation.
- Do not retain stale variant CSVs after a successful non-dry-run sync.
- Do not delete the underlying candidate derivation, variant simulation, or
  assignment implementation solely because production defaults no longer use
  it.
- Do not expose the experimental sync flag as a product UI control.
- Do not retain generated alternate CSV evidence in the default checked-in
  dataset.

## Design Considerations

- Existing team detail and export flows should remain concise. Acquisition
  requirements should appear as structured API metadata and short export text,
  not as a new UI section.
- The ranked default should remain the default when it is eligible. Alternatives
  are strategic options selected for a specific finalist roster.
- A purified Return variant uses the normal species' battle stats but must be
  clearly identified as requiring a purified Pokemon.
- Manifest rejection and selection evidence should be machine-readable for
  tests and debugging without exposing raw internals in the current UI.

## Technical Considerations

- Keep shared generation contracts in `lib/types.ts` and data parsing in
  `lib/data` or `lib/sync` according to the existing architecture.
- Candidate derivation should be a pure sync function with injected ranking,
  Pokemon, move, override, and format inputs.
- Extend `lib/sync/adapter.ts` instead of hardcoding PvPoke source paths in new
  modules.
- Keep local PvPoke VM execution isolated to simulation sync tooling.
- Use `scoreMatchupRating(...)` for continuous matchup comparisons and preserve
  hard thresholds for categorical labels.
- Write the manifest last and atomically so interrupted sync cannot advertise
  partial data.
- Restrict stale cleanup to parsed, recognized variant filenames after manifest
  publication. Never delete based on unconstrained glob input.
- Include manifest schema, policy, and source versions in cache keys or
  compatibility checks.
- Preserve per-run format-scoped caches and validate them with deterministic
  counters.
- Implement behavioral changes with failing tests first.
- Run focused Vitest files during development, followed by `npx tsc --noEmit`,
  `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.

## Success Metrics

- Zero active manifest entries contain Frustration or an excluded legacy pair.
- Every approved legacy exception and eligible Elite default can be represented
  in a manifest.
- Every supported format has a valid, deterministic manifest.
- No species has more than eight simulated candidates or three active variants
  in one format.
- Repeating sync with unchanged inputs produces no data diff.
- Selected movesets match the matrices used by all final scoring and analysis
  paths.
- Generated API and export movesets match the optimizer's fixed assignment.
- Representative team generation completes in under one minute.
- Normal sync produces no variant-qualified simulation CSVs.
- Variant generation occurs only when `--moveset-variants` is explicitly set.
- Team Configuration renders no moveset variation control and frontend requests
  cannot enable variant simulation.
- Default-only snapshots and function traces are no larger than the recorded
  variant-enabled baseline.
- Runtime boundary, focused tests, full tests, typecheck, lint, and build pass.

## Open Questions

- Should acquisition metadata use one requirement per moveset or support
  per-move requirements for future combinations containing both Elite and
  purified/event-exclusive moves?
- Which exact lightweight matrix objective should rank the 729 assignment
  combinations before the top 12 receive full lineup scoring?
