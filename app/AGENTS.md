# AGENTS.md for app/

## Architectural Rules

Next.js app router: APIs as thin adapters delegating to lib/. Keep routes pure; handle errors explicitly. No direct logic—use server actions.

## Code Style

API routes in TypeScript; error objects well-typed. Import order: external, internal aliases.

For battle-format-aware endpoints, resolve missing `formatId` to `DEFAULT_BATTLE_FORMAT_ID` and validate incoming values with `isBattleFormatId` before invoking `lib/` generation logic.

When generation fails due to missing format datasets, map `MissingRankingDataError` and `MissingSimulationDataError` to HTTP 400 responses so users get actionable sync instructions instead of generic 500 errors.

## Testing

Integration tests for APIs; run vitest on changes. Propagate errors/rejections.
