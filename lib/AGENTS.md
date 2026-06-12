# AGENTS.md for lib/

## Architectural Rules

Core domain logic only; pure functions, no UI. Follow Clean Architecture: lib/ as core, app/components as thin adapters. Genetic algorithms and data loaders here—unit-test everything.
When adding new analysis sections, derive them from existing analysis outputs (for example `ThreatAnalysisEntry[]`) before introducing additional simulation passes.
Pokemon contribution analysis entries are numeric diagnostics for UI/API adapters; do not generate per-entry rationale text in `lib/analysis/pokemonContributionAnalysis.ts` without an active consumer.
For shield-scenario analysis, treat missing simulation rows (`null` results) as unevaluated matchups instead of forced losses so partial simulation coverage does not skew metrics.

For local PvPoke sync work, keep source-layout knowledge behind `lib/sync/adapter.ts`; sync modules should call adapter methods instead of hardcoding PvPoke internal file paths.

Runtime app, component, and optimizer code must not import, require, bundle, or load PvPoke vendor JavaScript. Keep local PvPoke engine execution isolated to sync tooling and cover the runtime boundary with `lib/architecture/pvpokeRuntimeBoundary.test.ts` when boundary rules change.

When syncing gamemaster JSON, call adapter `readPokemonJson`/`readMovesJson`, validate with `lib/sync/validation.ts`, then write normalized JSON outputs to `data/`.

When syncing rankings, iterate all supported battle formats from `lib/data/battleFormats.ts` and read local PvPoke ranking JSON via adapter `readRankingJson(category, cp, cup)` from `src/data/rankings/<cup>/<category>/rankings-<cp>.json` before writing deterministic outputs under `data/rankings/cp<cp>/<cup>/<category>_rankings.csv`.

When syncing simulations, run PvPoke `TeamRanker` inside a Node `vm` context and stub only minimal jQuery data-loading APIs (`$.ajax`, `$.getJSON`, `$.each`) so simulation CSVs are generated from local engine logic without browser automation.

Simulation sync must iterate every format from `getBattleFormats()`, loading rankings from `data/rankings/cp<cp>/<cup>/overall_rankings.csv`, and write deterministic outputs as `data/simulations/cp<cp>/<cup>/<speciesId>_<scenario>.csv`; in resume mode only reuse existing files at that exact format-specific path.

Keep `lib/scraper` runtime options browser-agnostic (`resume`/`sourcePath`); do not reintroduce Playwright-specific helpers or flags in sync scripts.

Use `lib/data/battleFormats.ts` as the single source of truth for supported format ids, labels, cup, and CP. UI, API, data loaders, and sync code should import catalog values from there instead of hardcoding format strings.

For runtime ranking lookups in `lib/data/rankings.ts`, build file paths from format metadata (`rankings/cp{cp}/{cup}/{category}_rankings.csv`) and cache parsed CSV data per format id to avoid cross-format contamination.

Store Battle Frontier Master cycle point data in `data/battle-frontier-master-points.csv` with a simple `speciesId,points` header, keep ids canonical to `data/pokemon.json`, and keep the checked-in table aligned with the bundled PvPoke cup tier rules for the active cycle.

For Battle Frontier Master legality, keep exact point values in the CSV and derive shadow inheritance in code only for shadow variants that are both present in `data/pokemon.json` and ranked for `battle-frontier-master`; do not duplicate inherited shadow rows in the CSV.

When format-specific ranking CSVs are missing, throw `MissingRankingDataError` (not a generic `Error`) so API adapters can return deterministic HTTP 400 messages with sync guidance.

For genetic candidate pool construction, always pass `formatId` into `getTopRankedPokemonNames(...)` and filter species via `getRankedPokemonForFormat(...)` so league/cup eligibility stays aligned with the selected battle format.

For Battle Frontier Master random team initialization in `lib/genetic/chromosome.ts`, reject illegal candidates incrementally during both scored selection and fallback selection using `getBattleFrontierMasterTeamLegality(...)`, then assert the completed team is legal before returning it.

For Battle Frontier Master evolution in `lib/genetic/operators.ts`, thread `formatId` through `createNextGeneration(...)` into `crossover(...)` and `mutate(...)`, and fall back to the original legal parent/chromosome whenever an operator would create an illegal child.

Keep a final Battle Frontier Master legality assertion in `lib/genetic/algorithm.ts` before returning the best team so initialization or operator regressions cannot leak an illegal final result.

For simulation-backed scoring, call `ensureSimulationDataAvailable(formatId)` before generation and pass `formatId` through simulation helpers so non-Great formats never silently reuse Great League matchups.

For PlayPokemon lineup-aware fitness, enumerate bring-6 rosters through `lib/genetic/fitness/lineupEnumeration.ts`; preserve roster input order for lead iteration, evaluate ordered switch and closer assignments for each remaining Pokemon pair, and reject species ids containing the lineup key delimiter (`|`).

For lineup scoring in `lib/genetic/fitness/lineupScoring.ts`, prefer `LineupScoringContext` injection in tests and `createDefaultLineupScoringContext(...)` for production wiring so ranking, move, Pokemon, and simulation lookups stay deterministic and cacheable by callers.

Lineup scoring contexts may provide separate `topThreats` and `fullMetaThreats`; keep `context.threats` as the union/default threat list for compatibility, canonicalize, dedupe, and bound threat pools before scoring, expose split diagnostics through `LineupCoverageMetrics`, and weight evaluated top-threat coverage more heavily than full-meta coverage.

For lineup resource path metrics, use shield-specific matchup lookup (`getShieldScenarioMatchupRating` in tests or `getShieldScenarioMatchupResult(...)` in production) rather than aggregate matchup ratings; missing shield rows should fall back neutrally and make a path unavailable only when that path has no shield-specific data at all.

For PlayPokemon roster scoring in `lib/genetic/fitness/rosterScoring.ts`, inject cached lineup scoring through `PlayPokemonRosterScoringContext.scoreLineup` when evaluating many rosters, and use full `LineupAwareFitnessConfig` diagnostics only for finalists or recommendation output.

For PlayPokemon roster diversity scoring, keep bring-6 type redundancy and coverage weighting in `lib/genetic/fitness/rosterScoring.ts`; use context-injected expected-meta Pokemon and move metadata for offensive and frequency-preserving defensive coverage, fall back to each Pokemon's own typing when its move metadata is missing or unresolved, penalize redundant primary typings through top-lineup appearances, and avoid blanket penalties for useful shared secondary typings.

For PlayPokemon recommendation output in `lib/genetic/fitness/recommendations.ts`, pass bounded full-mode `LineupScoreResult[]` into `buildPlayPokemonRosterRecommendations(...)`; do not re-enumerate all 120 lineups in API/UI adapters, and keep removed bench-utility warning generation out of recommendation output unless a current display/API consumer is reintroduced.

For GBL recommendation output in `lib/genetic/fitness/recommendations.ts`, pass exactly three unique species ids and use `buildGblLineupRecommendation(...)` to evaluate the six ordered lead/switch/closer permutations with canonical lineup scoring and return only the single best recommendation.

For GA evaluation in `lib/genetic/fitness/index.ts`, call `evaluatePopulation(population, mode, formatId)` without an algorithm selector. It creates a per-run `LineupAwareFitnessContext`, caches `scoreFastRosterLineup(...)` for hot PlayPokemon evaluation, and leaves full PlayPokemon diagnostics to the final output pass in `lib/genetic/algorithm.ts`.

Lineup-aware fitness caches in `lib/genetic/fitness/index.ts` are per-run context caches; keep cache keys versioned and format-scoped, and use `cacheStats` counters in tests when validating cache behavior instead of timing-only assertions.

In `lib/genetic/algorithm.ts`, keep returned `Chromosome.fitness` synchronized with the final diagnostics attached to the chromosome. PlayPokemon finalists should use recomputed full `scorePlayPokemonRoster(...).fitness`; GBL finalists should use the final lineup recommendation score so `fitness` matches `scoreBreakdown.score` before `generateMultipleTeams(...)` sorts results.

For optimizer weighted scoring, import the canonical score contract from `lib/genetic/fitness/scoreBreakdown.ts`; keep components normalized to 0..1 before aggregation and treat only validity or legality as hard constraints.

For ordered lineup scoring in `lib/genetic/fitness/lineupScoring.ts`, `scoreOrderedLineup(...)` returns `scoreBreakdown` and sets `score` from the normalized weighted optimizer contract; use those components for aggregation and explanations rather than adding ad hoc lineup score weights, compute lineup offensive/defensive ratio components through `typeEffectivenessRatios.ts`, weight both offensive defender pools and defensive expected attack-type pools with top-threat priority over full-meta, and keep top-threat ratio pools bounded to the top-threat limit.

For soft matchup quality in optimizer scoring, use `scoreMatchupRating(...)` from `lib/genetic/fitness/matchupScoring.ts` so close battle ratings produce intermediate scores. Keep explicit 500/600/400 threshold checks when the output is a categorical count or label such as covered threats, weaknesses, dominating matchups, or overwhelming losses.

Optimizer Threat Score diagnostics are exposed through `OptimizerScoreBreakdown.threatScore` and calculated in `lib/genetic/fitness/threatScore.ts`. Treat `threatScore.score` as lower-is-better diagnostic output and per-threat `threatValue` as higher-is-worse display ranking; do not add Threat Score to `OptimizerScoreComponent` or weighted fitness unless a current story explicitly changes selection behavior. Keep display-only Threat Score disabled in fast/GA scoring paths and enabled only for final/full diagnostics.

Threat Score aggregate weighting is split between `pools.topMeta` and `pools.fullMeta`; keep top-meta weighted higher by default, pass season-specific overrides through `LineupScoringContext.threatScorePoolWeights`, fall back to defaults for full-meta-dominant overrides, normalize configured weights across evaluated pools only, and use the pool diagnostics for UI/test consumers that need top-meta versus full-meta detail.

For PlayPokemon roster scoring, `scorePlayPokemonRoster(...)` returns a normalized `scoreBreakdown` alongside `fitness`; keep safety, consistency, bulk, defensive ratio, offensive ratio, role, coverage, and synergy components normalized before aggregation, and keep `scoreFastRosterLineup(...)` component semantics aligned with full lineup scoring even when using lightweight hot-path diagnostics, including sanitized and bounded split threat pools.

For role scoring in `lib/genetic/fitness`, treat Leads, Switches, and Closers rankings as primary role-fit signals; use Chargers, Attackers, and Consistency only as supporting inputs, and keep role fit subordinate to the canonical weighted score contract.

Optimizer validation fixtures live in `lib/genetic/fitness/optimizerValidationFixtures.test.ts`; add deterministic injected-context regressions there for documented tradeoffs before changing scoring weights, type-effectiveness behavior, lineup structures, threat-pool weighting, or roster aggregation.

Shared generation contracts in `lib/types.ts` do not include algorithm selectors or algorithm labels. Keep deprecated request compatibility isolated to API schemas and do not add algorithm fields back to `GenerationOptions` or `GenerationAnalysis`.

## Optimizer Guidance

Before changing `lib/genetic/fitness`, ranking sync, runtime ranking data, simulations, or type-effectiveness scoring, invoke the `gbl-optimizer` skill and read the optimizer references in `docs/pokemon-go-team-optimization.md` and `docs/team-optimization/`.

Required optimizer subdocs are `scoring-model.md`, `lineup-structures.md`, `coverage-threat-pools.md`, `safety-consistency-bulk.md`, `type-effectiveness.md`, `role-scoring.md`, `data-inputs.md`, and `validation.md`.

For Ralph iterations, record which optimizer docs and skills were read in `progress.txt` before marking the story complete.

## Code Style

Explicit return/param types for exports; JSDoc/TSDoc required. CamelCase for functions/variables, PascalCase for types. Absolute imports (`@/lib/...`).

## Testing

Write tests before implementation; run `npm test` on changes. Coverage cannot regress.
For type-only contract tests, run `npx tsc --noEmit`; Vitest transpiles type-only imports and may not fail on missing exported types.
