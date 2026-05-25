# AGENTS.md for lib/

## Architectural Rules

Core domain logic only; pure functions, no UI. Follow Clean Architecture: lib/ as core, app/components as thin adapters. Genetic algorithms and data loaders here—unit-test everything.
When adding new analysis sections, derive them from existing analysis outputs (for example `ThreatAnalysisEntry[]`) before introducing additional simulation passes.
For shield-scenario analysis, treat missing simulation rows (`null` results) as unevaluated matchups instead of forced losses so partial simulation coverage does not skew metrics.

For local PvPoke sync work, keep source-layout knowledge behind `lib/sync/adapter.ts`; sync modules should call adapter methods instead of hardcoding PvPoke internal file paths.

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

For PlayPokemon lineup-aware fitness, enumerate bring-6 rosters through `lib/genetic/fitness/lineupEnumeration.ts`; preserve roster input order for lead iteration, sort backline pairs canonically so duplicate backline permutations are not scored, and reject species ids containing the lineup key delimiter (`|`).

For lineup scoring in `lib/genetic/fitness/lineupScoring.ts`, prefer `LineupScoringContext` injection in tests and `createDefaultLineupScoringContext(...)` for production wiring so ranking, move, Pokemon, and simulation lookups stay deterministic and cacheable by callers.

For lineup resource path metrics, use shield-specific matchup lookup (`getShieldScenarioMatchupRating` in tests or `getShieldScenarioMatchupResult(...)` in production) rather than aggregate matchup ratings; missing shield rows should fall back neutrally and make a path unavailable only when that path has no shield-specific data at all.

For PlayPokemon roster scoring in `lib/genetic/fitness/rosterScoring.ts`, inject cached lineup scoring through `PlayPokemonRosterScoringContext.scoreLineup` when evaluating many rosters, and use full `LineupAwareFitnessConfig` diagnostics only for finalists or recommendation output.

For PlayPokemon roster diversity scoring, keep bring-6 type redundancy and coverage weighting in `lib/genetic/fitness/rosterScoring.ts`; use context-injected expected-meta Pokemon and move metadata for offensive and frequency-preserving defensive coverage, fall back to each Pokemon's own typing when its move metadata is missing or unresolved, penalize redundant primary typings through top-lineup appearances, and avoid blanket penalties for useful shared secondary typings.

For PlayPokemon recommendation output in `lib/genetic/fitness/recommendations.ts`, pass bounded full-mode `LineupScoreResult[]` into `buildPlayPokemonRosterRecommendations(...)`; do not re-enumerate all 60 lineups in API/UI adapters, and calculate bench warnings from recommended-lineup appearances.

For GBL recommendation output in `lib/genetic/fitness/recommendations.ts`, pass exactly three unique species ids and use `buildGblLineupRecommendation(...)` to evaluate the six ordered lead/switch/closer permutations with canonical lineup scoring and return only the single best recommendation.

For GA evaluation in `lib/genetic/fitness/index.ts`, call `evaluatePopulation(population, mode, formatId)` without an algorithm selector. It creates a per-run `LineupAwareFitnessContext`, caches `scoreFastRosterLineup(...)` for hot PlayPokemon evaluation, and leaves full PlayPokemon diagnostics to the final output pass in `lib/genetic/algorithm.ts`.

For optimizer weighted scoring, import the canonical score contract from `lib/genetic/fitness/scoreBreakdown.ts`; keep components normalized to 0..1 before aggregation and treat only validity or legality as hard constraints.

Shared generation contracts in `lib/types.ts` do not include algorithm selectors or algorithm labels. Keep deprecated request compatibility isolated to API schemas and do not add algorithm fields back to `GenerationOptions` or `GenerationAnalysis`.

## Code Style

Explicit return/param types for exports; JSDoc/TSDoc required. CamelCase for functions/variables, PascalCase for types. Absolute imports (`@/lib/...`).

## Testing

Write tests before implementation; run `npm test` on changes. Coverage cannot regress.
For type-only contract tests, run `npx tsc --noEmit`; Vitest transpiles type-only imports and may not fail on missing exported types.
