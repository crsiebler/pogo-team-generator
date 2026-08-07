# AGENTS.md for app/

## Architectural Rules

Next.js app router: APIs as thin adapters delegating to lib/. Keep routes pure; handle errors explicitly. No direct logic—use server actions.

## Code Style

API routes in TypeScript; error objects well-typed. Import order: external, internal aliases.

For battle-format-aware endpoints, resolve missing `formatId` to `DEFAULT_BATTLE_FORMAT_ID` and validate incoming values with `isBattleFormatId` before invoking `lib/` generation logic.

When `battle-frontier-master` needs UI-side point awareness, enrich the existing `/api/pokemon-list` response with a `battleFrontierMasterPointsByPokemonName` map derived from `getBattleFrontierMasterPointsForSpecies(...)` instead of adding a separate frontend-only rules path.

When generation fails due to missing format datasets, map `MissingRankingDataError` and `MissingSimulationDataError` to HTTP 400 responses so users get actionable sync instructions instead of generic 500 errors.

For `/api/generate-team`, ignore deprecated `algorithm` request fields, do not pass algorithm selectors into `generateTeam(...)`, and expose display-consumed lineup-aware output fields such as `recommendedLineups` from the returned chromosome without adding algorithm labels.

When `/api/generate-team` returns display-facing lineup diagnostics, resolve threat species ids such as lineup weaknesses to readable species names in the route adapter so client components stay display-only.

`/api/generate-team` must return the exact scored `movesetAssignment`. `/api/team-details` must structurally parse the assignment, validate it against current compact-snapshot and ranking authorities, then project its move IDs and structured acquisition metadata without invoking team-aware moveset selection again.

For bounded public JSON endpoints, validate any declared `Content-Length` and count bytes while reading the request stream; never rely on the header alone because it may be absent or inaccurate.

## Testing

Integration tests for APIs; run vitest on changes. Propagate errors/rejections.
When API response contracts evolve, update route mocks and response-shape assertions in the same test to keep adapter behavior locked.
