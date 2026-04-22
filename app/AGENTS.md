# AGENTS.md for app/

## Architectural Rules

Next.js app router: APIs as thin adapters delegating to lib/. Keep routes pure; handle errors explicitly. No direct logic—use server actions.

## Code Style

API routes in TypeScript; error objects well-typed. Import order: external, internal aliases.

For battle-format-aware endpoints, resolve missing `formatId` to `DEFAULT_BATTLE_FORMAT_ID` and validate incoming values with `isBattleFormatId` before invoking `lib/` generation logic.

When `battle-frontier-master` needs UI-side point awareness, enrich the existing `/api/pokemon-list` response with a `battleFrontierMasterPointsByPokemonName` map derived from `getBattleFrontierMasterPointsForSpecies(...)` instead of adding a separate frontend-only rules path.

When generation fails due to missing format datasets, map `MissingRankingDataError` and `MissingSimulationDataError` to HTTP 400 responses so users get actionable sync instructions instead of generic 500 errors.

## Testing

Integration tests for APIs; run vitest on changes. Propagate errors/rejections.
When API response contracts evolve, update route mocks and response-shape assertions in the same test to keep adapter behavior locked.
