# AGENTS.md for lib/

## Architectural Rules

Core domain logic only; pure functions, no UI. Follow Clean Architecture: lib/ as core, app/components as thin adapters. Genetic algorithms and data loaders here—unit-test everything.

For local PvPoke sync work, keep source-layout knowledge behind `lib/sync/adapter.ts`; sync modules should call adapter methods instead of hardcoding PvPoke internal file paths.

When syncing gamemaster JSON, call adapter `readPokemonJson`/`readMovesJson`, validate with `lib/sync/validation.ts`, then write normalized JSON outputs to `data/`.

When syncing rankings, read local PvPoke ranking JSON via adapter `readRankingJson(category, 1500)` from `src/data/rankings/all/<category>/rankings-1500.json`, then map move IDs and species IDs using `data/moves.json` and `data/pokemon.json` produced by phase 1 before writing `cp1500_all_<category>_rankings.csv`.

When syncing simulations, run PvPoke `TeamRanker` inside a Node `vm` context and stub only minimal jQuery data-loading APIs (`$.ajax`, `$.getJSON`, `$.each`) so simulation CSVs are generated from local engine logic without browser automation.

Keep `lib/scraper` runtime options browser-agnostic (`resume`/`sourcePath`); do not reintroduce Playwright-specific helpers or flags in sync scripts.

## Code Style

Explicit return/param types for exports; JSDoc/TSDoc required. CamelCase for functions/variables, PascalCase for types. Absolute imports (`@/lib/...`).

## Testing

Write tests before implementation; run `npm test` on changes. Coverage cannot regress.
