# Data Inputs

This strategy is project-agnostic, so exact schemas can vary. Keep parsers and adapters at the infrastructure boundary and normalize data before optimization.

## Recommended Inputs

- Pokemon species and forms.
- Pokemon types.
- Base stats or stat product.
- Fast moves and charged moves.
- Move type, power, energy, energy gain, and DPE when available.
- Type effectiveness chart.
- PvPoke ranking exports.
- Shield-scenario matchup matrices.
- Optional usage data or curated top-threat lists.

## Move Availability And Acquisition Policy

Move availability determines whether a moveset candidate can be generated. The
eligible acquisition classifications are informational: they are retained for
API and export output, but they do not add battle-scoring penalties.

- **Regular:** the move belongs to the canonical Pokemon's ordinary fast or
  charged movepool (`regular`).
- **Elite:** the move belongs to `eliteMoves` (`elite`). Elite classification
  takes precedence when a move also appears in an ordinary move list.
- **Event-exclusive:** the exact canonical species and move pair has approved
  legacy access (`eventExclusive`). A `legacyMoves` entry is not eligible by
  itself.
- **Purified:** `RETURN` passes the format-specific purified eligibility checks
  (`purified`).
- **Excluded legacy:** the move belongs to `legacyMoves`, but its exact species
  and move pair is not approved (`excluded`).
- **Frustration:** `FRUSTRATION` is always excluded, including when ranking
  evidence selects it.

Purified Return is available only to a canonical non-shadow form with an exact
checked-in `${speciesId}_shadow` counterpart. Shadow availability must not be
inferred from tags, family, Dex identity, or another form. The non-shadow record
must also have a finite, non-negative `level25CP` at or below the selected
format's CP cap. Return is excluded from shadow species, and the optimizer uses
the non-shadow Pokemon's battle stats rather than synthesizing a shadow or
purified form.

### Approved Legacy Exceptions

Legacy approval is scoped to the exact canonical species/form and move pair:

| Canonical species ID       | Move ID          |
| -------------------------- | ---------------- |
| `mewtwo`                   | `COUNTER`        |
| `mewtwo_mega_x`            | `COUNTER`        |
| `mewtwo_mega_y`            | `COUNTER`        |
| `dialga_origin`            | `ROAR_OF_TIME`   |
| `palkia_origin`            | `SPACIAL_REND`   |
| `kyurem_black`             | `FREEZE_SHOCK`   |
| `kyurem_white`             | `ICE_BURN`       |
| `zacian_crowned_sword`     | `BEHEMOTH_BLADE` |
| `zamazenta_crowned_shield` | `BEHEMOTH_BASH`  |

Approval does not transfer to related species or forms. For example,
`dialga_origin` approval does not approve regular `dialga`.

The current explicitly excluded checked-in legacy pairs are `ACID` for
`grimer`, `muk`, `koffing`, and `weezing`; `QUICK_ATTACK` for `staryu`,
`starmie`, `porygon`, `pichu`, and `delibird`; `PSYBEAM` for `chansey`; and
`DRAINING_KISS` for `kirlia`. Tests require an explicit allow or exclude
decision for every checked-in `legacyMoves` pair.

## PvPoke Ranking Exports

Useful ranking exports:

- Overall.
- Leads.
- Switches.
- Closers.
- Chargers.
- Attackers.
- Consistency.

Use the same league, cup, move settings, and candidate filters across exports whenever possible.

PvPoke rankings are a best-estimate resource, not immutable fact. Exact ranks can change as PvPoke improves its simulator and ranking algorithms. Treat ranking exports as strong signals for candidate quality, role fit, move quality, and threat weighting, but keep optimizer scoring explainable and robust to ranking changes.

PvPoke vendor JavaScript is not a runtime dependency. Application, component,
and optimizer code must not import, require, execute, bundle, or runtime-load
PvPoke vendor JavaScript. If a project uses local PvPoke engine code to refresh
ranking-derived data, keep that execution isolated to sync or tooling workflows
and store normalized repository-owned data for runtime use.

## PvPoke Score Interpretation

PvPoke top-level rankings include a score from `0` to `100`, where `100` is the best Pokemon in that league and category. The score is an overall performance number derived from simulating every possible matchup with each Pokemon's most used moveset, with some movesets manually adjusted.

Use score differences rather than rank differences when possible. The gap between rank `#1` and rank `#50` may not equal the gap between rank `#50` and rank `#100`. A score-based percentile or normalized score usually carries more information than rank alone.

Overall rankings are derived from additional category rankings because Trainer Battles involve many shield and role scenarios. Different Pokemon can be valuable in different categories, so role-specific exports should inform lineup construction instead of only using Overall rank.

## PvPoke Detail Sections

Within each Pokemon ranking, PvPoke exposes detail sections that can be useful optimizer inputs:

- Fast Moves: which fast moves the Pokemon uses most in the league and category.
- Charged Moves: which charged moves the Pokemon uses most in the league and category.
- Key Wins: matchups the Pokemon performs best in, weighted by the opponent's overall score.
- Key Counters: significant opponents that perform best against the Pokemon.

Use these details for explanation and scoring support:

- Move usage can identify reliable optimal movesets.
- Key Wins can help explain anti-meta value.
- Key Counters can help build shared weakness and top-threat risk diagnostics.
- Category-specific move details can reveal whether a Pokemon changes role by changing move emphasis.

## PvPoke Move Ranking Interpretation

PvPoke move rankings are primarily calculated from damage and energy cost, with stat changes factored in. Calculations are run for each matchup and totaled across the format. Matchup weighting affects these numbers, so moves used against significant meta targets rank higher.

Use move ranking data to infer:

- Reliable fast move preference.
- Whether one charged move is mandatory.
- Whether a second charged move adds meaningful matchup coverage.
- Whether a Pokemon has broad move flexibility or depends on a narrow moveset.
- Whether a charged move counters the Pokemon's likely counters.

Strong tendency toward one fast move and one charged move means the Pokemon has a stable optimal moveset across many matchups. Balanced charged move usage means a second charged move may be especially valuable. A second charged move used in many meaningful matchups is usually more valuable than one used rarely, but matchup context matters. A move that counters likely switch-ins can be more valuable than head-to-head usage rates imply.

## PvPoke Ranking Algorithm Summary

PvPoke rankings are generated approximately as follows:

1. For each category, simulate every possible matchup and assign a Battle Rating for each Pokemon.
2. Calculate each Pokemon's average Battle Rating across all matchups.
3. For even-shield categories, iterate through matchups again and weight each Battle Rating by the opponent's average.
4. Repeat weighted averaging multiple times so top Pokemon and Pokemon that beat top Pokemon filter upward.
5. Calculate a category score as a percentage of the category leader's weighted average Battle Rating.
6. Calculate Overall score as the geometric mean of category scores.

Battle Rating measures whether a Pokemon wins and by how much. Weighted Battle Rating is important because all opponents are not equally relevant: beating a strong Pokemon should matter more than farming high ratings against weak Pokemon.

PvPoke uses geometric mean for Overall score because category scores are percentages. Geometric mean favors well-rounded Pokemon over Pokemon that are excellent in one category and poor in others.

## Practical Ranking Caveats

PvPoke can assign each Pokemon an optimal moveset per matchup. This helps identify theoretical strength, but broad-moveset Pokemon can rank higher than they are likely to perform in practice if they cannot realistically carry every optimal move at once.

When using rankings:

- Prefer category scores over raw rank when available.
- Do not optimize blindly for Overall rank.
- Treat Key Counters and bad histograms as risk signals.
- Treat move usage concentration as a consistency signal.
- Treat broad but impractical movesets cautiously.
- Validate recommendations against actual available movesets and the selected two charged moves.

## Deterministic Moveset Candidate Derivation

Candidate derivation combines format-scoped Overall, Leads, Switches, Closers,
Chargers, Attackers, and Consistency evidence with any explicit PvPoke moveset
overrides. Move usage is normalized within each species ranking entry and move
slot before these category weights are applied:

| Category    | Weight |
| ----------- | -----: |
| Overall     |      3 |
| Leads       |      2 |
| Switches    |      2 |
| Closers     |      2 |
| Chargers    |      1 |
| Attackers   |      1 |
| Consistency |      1 |

Raw use totals are not comparable across categories or formats. Aggregation
retains weighted normalized use, category occurrence count, exact Overall use,
and source provenance. Usage evidence is ordered deterministically by those
three measures and then move ID. Exact observed movesets and explicit overrides
remain stronger evidence than usage-only speculation.

Move-stat filtering can reject only usage-only speculative moves that are
strictly dominated. Eligible observed and override moves survive this filter.
Fast-move comparison considers damage per turn, energy per turn, turns, STAB,
and type coverage. Charged-move comparison considers power, damage per energy,
energy, first-charge pacing, STAB, type coverage, and expected effects. A lower
raw damage value is not enough to reject distinct coverage, bait, buff, or debuff
utility. These mechanics bound speculation; matchup simulation remains
authoritative.

Candidate expansion is deliberately bounded:

- Retain at most two fast moves and four charged moves for substitutions.
- Prioritize exact eligible observed and override movesets before bounded
  substitution candidates; the final eight-candidate cap still applies.
- Generate only one-fast-move or one-charged-move substitutions around observed
  anchors, never the full legal movepool Cartesian product.
- Emit at most eight canonical candidates per species, form, and format.
- Treat charged-move order as irrelevant to canonical identity while retaining
  preferred source/display order.
- Simulate alternates only for sanitized top-150 Overall targets with multiple
  evidence-backed candidates.

Candidate derivation occurs before normalized Overall rankings are written. If a
complete preferred Overall set contains an excluded move, sync retains the
source moveset, excluded move, and reason as rejection evidence. An incomplete
preferred set also triggers replacement, but does not synthesize excluded-move
rejection fields. In either case, sync selects the strongest complete eligible
candidate and replaces only the emitted Overall move columns. The original
PvPoke score remains only a `pvpokeScorePrior`; it is not a simulated score for
the replacement. If no complete eligible replacement exists, the species is
omitted from Overall output so runtime and simulation paths cannot consume the
rejected set.

## Matchup Matrices

Shield-scenario matrices are valuable because they measure actual matchup performance rather than type theory.

Recommended scenarios:

- 0-shield.
- 1-shield.
- 2-shield.

Optional resource paths:

- Balanced: lead 1-shield, backline 1-shield.
- Shield spend: lead 2-shield, backline 0-shield.
- Shield save: lead 0-shield, backline 2-shield.

## Moveset Variant Manifests

Each supported format owns a versioned manifest at:

```text
data/simulations/cp{cp}/{cup}/moveset-variants.json
```

The manifest records format and policy identity, source digests, derivation
settings, species defaults, bounded candidates, evidence, acquisition
requirements, scenario storage keys, completeness, evaluation counts, and
active status. It is the sync authority from which runtime availability is
compiled: snapshot generation includes only declared active candidates and reads
their exact `0-0`, `1-1`, and `2-2` storage keys. Neither sync nor runtime may
discover alternates by scanning CSV filenames or substitute default rows for an
unavailable alternate.

A manifest can retain up to eight candidates while exposing at most three active
variants: one default and two simulation-backed alternatives. Active selection
compares complete finite evidence over the same evaluated opponent intersection.
Top-meta improvement receives `0.7` weight and full-meta improvement receives
`0.3`. A primary alternate must improve on the default, and a secondary must add
positive marginal coverage beyond the default and primary. Ties, incomplete
evidence, or insufficient improvement preserve the default.

Each supported format also has an active-only compact snapshot at:

```text
data/simulations/cp{cp}/{cup}/runtime-snapshot.json
```

The versioned snapshot retains the manifest policy, canonical manifest digest,
source digests, active-rating digest, canonical species/opponent/move/variant
dictionaries, active default mapping, and only manifest-declared active
matchups. Battle Ratings are unsigned 16-bit little-endian integers encoded as
padded Base64. Valid ratings are `0..1000`; `65535` (`0xffff`) is the explicit
missing-row sentinel, and values `1001..65534` are reserved. Values use
variant/opponent/scenario order, where scenario order is `0-0`, `1-1`, `2-2`:

```text
byte_offset = ((variant_index * opponent_count + opponent_index) * 3 + scenario_index) * 2
```

A missing alternate value remains missing and must never substitute the default
variant's value. Source CSVs and full manifests remain sync and validation
evidence; compact snapshots contain only runtime-consumed active Battle Ratings.

## Runtime Artifact And Deployment Contract

The simulation pipeline intentionally maintains separate source-evidence and
runtime artifacts:

- Full scenario CSVs contain default, active, and inactive candidate evidence
  used by sync, parity checks, active selection, and validation.
- Full moveset manifests declare bounded candidates, active variants, storage
  keys, policy identity, and completeness. They remain the authority used to
  generate deployment artifacts.
- `data/simulations/runtime-asset-index.json` is a versioned active-only tooling
  index derived from validated manifests. It lists every format manifest and the
  exact active scenario CSV storage keys, including active defaults; inactive
  candidate CSVs cannot appear in it.
- Each format's `runtime-snapshot.json` compiles only the manifest-declared active
  scenario values required by optimizer lookups. Production runtime consumes
  these snapshots instead of simulation CSVs, manifests, or the tooling index.

Snapshot generation validates every active manifest storage key and source CSV
before encoding the compact format. Publication is rollback-capable: after all
formats validate in memory, sync atomically installs simulation CSVs, manifests,
snapshots, and finally the runtime asset index. A failed replacement restores the
prior published artifacts. The runtime repository then validates snapshot schema,
format, manifest policy, source digests, active digest, dictionary bounds,
defaults, variants, rating bounds, and missing-value sentinels before caching any
format. It fails closed and never falls back to manifests or simulation CSVs.

Next.js output tracing uses exact battle-format catalog assets for both
`/api/generate-team` and `/api/team-details`. Broad includes such as `data/**`,
`data/**/*.json`, and `data/**/*.csv` are prohibited. Generate-team includes one
compact snapshot and all seven ranking categories per supported format plus
Pokemon, move, and type-effectiveness data. Team-details includes one compact
snapshot and only the Overall ranking per format plus Pokemon and move data.
Source simulation CSVs, full manifests, the runtime asset index, inactive
evidence, and PvPoke vendor JavaScript remain excluded from both generated NFT
traces. Each function is limited to `100 MiB` uncompressed, and the unique traced
compact snapshot set is limited to `50 MiB` uncompressed.

The trace analyzer enforces both route plans and budgets. This design must not
enable, require, or depend on `VERCEL_SUPPORT_LARGE_FUNCTIONS` or any equivalent
Vercel Large Functions setting. Optimizer matchup lookups remain synchronous
after one format preparation and do not issue per-matchup network, database, KV,
or object-storage requests.

When moveset variant simulation is disabled, resolution returns ranked defaults
for the complete roster. When enabled, assignment authority is per species: a
snapshot-supported species remains manifest-backed, while only a species that
raises an unqualified `variant-unavailable` result for the same format and
species receives a `ranked-default-fallback`. One roster can therefore contain
both authorities. Manifest variants, including manifest defaults, use qualified
snapshot lookups; ranked-default fallbacks use unqualified default lookups.

Returned assignments pass structural and fingerprint validation before
`/api/team-details` authenticates each authority against repository-owned data.
A manifest claim must match the prepared snapshot policy and one complete active
variant. A fallback claim must match the current Overall ranking moveset,
canonical variant identity, default status, and fallback policy. Snapshot data is
prepared only when at least one species claims manifest authority. Missing,
malformed, incompatible, incomplete, or unprepared snapshots, mismatched
species, and unavailable specific variants fail closed; they never trigger
fallback or runtime loading from manifests or CSVs.

## Atomic Publication And Stale Cleanup

The simulation and manifest phase completes cross-validation, simulation
generation, active selection, snapshot generation, and in-memory validation for
every supported format before publishing those outputs. It stages simulation
CSVs, manifests, compact snapshots, and the runtime asset index in exclusive
same-directory temporary files, moves existing targets to backup paths, then
installs CSVs, manifests, snapshots, and the index in that order. If this batch
replacement fails, its prior targets are restored and staged files are removed.
This is a rollback-capable batch of atomic file replacements, not one
filesystem-wide or full-sync transaction. Earlier gamemaster and ranking writes
are outside this rollback boundary.

Stale cleanup runs only after successful publication and is not part of the
rollback transaction. It considers only regular files accepted by the strict
canonical variant filename parser and deletes files omitted by every candidate
storage key in the new manifest. Default unqualified matrices and declared
inactive candidates remain untouched. Cleanup is restricted to catalog-derived
active format directories and reports deleted repository-relative paths in
deterministic order. Projection can report recognized stale files but never
deletes them.

The checked-in repository policy is default-only. A normal sync projects every
synchronized species to exactly one ranked-default candidate before simulation
and manifest preparation. Each resulting manifest species record therefore has
one complete active default with unqualified `{speciesId}_{scenario}.csv`
storage keys. After the complete default authority publishes, cleanup removes
every regular canonical variant-qualified CSV omitted by those manifests.
Passing `--moveset-variants` preserves the bounded alternate derivation and
simulation path as explicit experimental tooling; the product UI does not expose
that mode.

### Default-Only Dataset Measurements

The default-only regeneration used the pinned `vendor/pvpoke` revision
`3ca651c7c83f3d39704f33b28ac4ca01ae10bf16`. Byte counts are logical file sizes,
not filesystem allocation:

| Metric                    | Variant-enabled baseline | Default-only dataset |
| ------------------------- | -----------------------: | -------------------: |
| Repository `data/` files  |                   20,246 |                3,647 |
| Repository `data/` bytes  |              367,627,804 |           74,519,250 |
| Simulation files          |                   20,183 |                3,584 |
| Simulation CSVs           |                   20,166 |                3,567 |
| Canonical variant CSVs    |                   16,599 |                    0 |
| Compact snapshot bytes    |               12,019,584 |            7,663,712 |
| Generate-team trace bytes |               19,058,698 |           14,702,826 |

The representative default-only PlayPokemon generation fixture completed in
`589 ms`, below the one-minute limit. Two consecutive non-resume default syncs
produced the same complete `data/` diff SHA-256
`03e188d816273d779de2e4f1ca9280b65f9fe004575b35a4d802548c8d2d7b13`.
Successful-sync metadata preserves its prior timestamp when the generated
Pokemon, moves, rankings, and simulations fingerprint is unchanged.

## Projection, Generation, And Validation Commands

Initialize the default local PvPoke source before running sync or data tests:

```bash
git submodule update --init vendor/pvpoke
```

Use the read-only projection to inspect candidate growth, caps, CSV totals, and
recognized stale files without writing or deleting data:

```bash
npm run sync -- --project-simulations
```

Run generation and optional identity-matching resume mode with:

```bash
npm run sync
npm run sync -- --resume
```

Normal sync is ranked-default-only. Use the experimental variant path only when
explicitly evaluating alternate candidate evidence:

```bash
npm run sync -- --moveset-variants
npm run sync -- --moveset-variants --resume
```

`PVPOKE_PATH` can override the default `vendor/pvpoke` source.
`--project-simulations` cannot be combined with `--resume`. Generation replaces
checked-in Pokemon, move, and ranking data before the rollback-capable simulation
and manifest publication phase, and can perform guarded post-publication stale
cleanup. A later sync failure does not restore those earlier gamemaster or
ranking writes. Successful sync updates `data/sync-metadata.json` when generated
output changes and preserves it when a repeated run is byte-identical. The
package script invokes Bun.

Validate generated data, the full repository, documentation formatting, and
types with:

```bash
npx vitest run lib/data/simulations.test.ts
npm test
npx prettier --check docs/pokemon-go-team-optimization.md \
  docs/team-optimization/data-inputs.md
npx tsc --noEmit
```

Build the production application, then inspect and validate the canonical
`/api/generate-team` and `/api/team-details` Next.js NFT traces with:

```bash
npm run build
npm run analyze:generate-team-trace
```

The command retains its original name but validates the canonical generate-team,
team-details, and pokemon-list route traces. Its JSON report remains focused on
generate-team and contains deterministic unique file counts, uncompressed byte
totals by asset category, and the largest files. It exits non-zero if a required
trace is missing or malformed, contains unauthorized runtime data, omits required
snapshots, includes simulation CSVs, full manifests, the tooling index, or PvPoke
vendor assets, exceeds the per-function `100 MiB` limit, or pushes the unique
snapshot set above `50 MiB`.

Local PvPoke engine JavaScript executes only inside isolated sync/tooling
workflows. Runtime application, component, and optimizer code consume only
repository-owned normalized application data and compact simulation snapshots;
source simulation CSVs and PvPoke vendor JavaScript remain tooling-only.

## Threat Pools

Build two threat pools from the available data:

- Top-threat pool for high-priority practical viability.
- Full-meta pool for broad robustness.

Top-threat coverage should be weighted higher. Full-meta coverage should catch unexpected holes and over-specialized teams.

Threat pool weights should be configurable enough for season updates. Structured
Threat Score diagnostics should preserve separate top-meta and full-meta pool
results so tests and UI can explain whether risk comes from high-priority meta
threats or broader full-meta coverage gaps.

## Calibration Fixtures

Great League Show-6 Pick-3 calibration fixtures should be checked-in typed data,
not runtime shortcuts. Treat fixture rosters as calibration and regression
inputs only. They can validate species ids, fixture metadata, ordered lineup
enumerability, finite scores, and broad minimum viability, but they must not be
used as hardcoded optimizer truth labels, exact winner expectations, or exact
score snapshots.

## Normalized Internal Models

Recommended normalized concepts:

- Pokemon candidate.
- Move.
- Type profile.
- Ranking profile.
- Matchup profile.
- Threat pool.
- Roster.
- Ordered lineup.
- Score breakdown.

Keep optimization logic independent from raw CSV or JSON schema details.
