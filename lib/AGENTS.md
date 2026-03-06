# AGENTS.md for lib/

## Architectural Rules

Core domain logic only; pure functions, no UI. Follow Clean Architecture: lib/ as core, app/components as thin adapters. Genetic algorithms and data loaders here—unit-test everything.

For local PvPoke sync work, keep source-layout knowledge behind `lib/sync/adapter.ts`; sync modules should call adapter methods instead of hardcoding PvPoke internal file paths.

When syncing gamemaster JSON, call adapter `readPokemonJson`/`readMovesJson`, validate with `lib/sync/validation.ts`, then write normalized JSON outputs to `data/`.

When syncing rankings, iterate all supported battle formats from `lib/data/battleFormats.ts` and read local PvPoke ranking JSON via adapter `readRankingJson(category, cp, cup)` from `src/data/rankings/<cup>/<category>/rankings-<cp>.json` before writing deterministic `cp<cp>_<cup>_<category>_rankings.csv` outputs.

When syncing simulations, run PvPoke `TeamRanker` inside a Node `vm` context and stub only minimal jQuery data-loading APIs (`$.ajax`, `$.getJSON`, `$.each`) so simulation CSVs are generated from local engine logic without browser automation.

Keep `lib/scraper` runtime options browser-agnostic (`resume`/`sourcePath`); do not reintroduce Playwright-specific helpers or flags in sync scripts.

Use `lib/data/battleFormats.ts` as the single source of truth for supported format ids, labels, cup, and CP. UI, API, data loaders, and sync code should import catalog values from there instead of hardcoding format strings.

For runtime ranking lookups in `lib/data/rankings.ts`, build filenames from format metadata (`cp{cp}_{cup}_{category}_rankings.csv`) and cache parsed CSV data per format id to avoid cross-format contamination.

For genetic candidate pool construction, always pass `formatId` into `getTopRankedPokemonNames(...)` and filter species via `getRankedPokemonForFormat(...)` so league/cup eligibility stays aligned with the selected battle format.

For simulation-backed scoring, call `ensureSimulationDataAvailable(formatId)` before generation and pass `formatId` through simulation helpers so non-Great formats never silently reuse Great League matchups.

## Code Style

Explicit return/param types for exports; JSDoc/TSDoc required. CamelCase for functions/variables, PascalCase for types. Absolute imports (`@/lib/...`).

## Testing

Write tests before implementation; run `npm test` on changes. Coverage cannot regress.
