# AGENTS.md for components/

## Architectural Rules

Atomic design: atoms (basic), molecules (composite), organisms (complex). Keep UI logic thin; delegate to lib/ for business rules. No direct data access—use hooks/props.

## Code Style

Tailwind classes ordered via prettier-plugin-tailwindcss. Explicit prop types; accessibility via ESLint. Absolute imports (`@/components/...`).

Form selects should use the `atoms/Select` + `atoms/Select/Option` pair so floating-label behavior and chevron affordance stay consistent across light/dark themes.

When adding or changing battle-format UI, keep `TeamManager` as the state owner for `selectedFormatId` and populate dropdown options from `lib/data/battleFormats.ts` (`getBattleFormats`) so UI/API/sync layers stay aligned.

Keep transient generation errors in `TeamManager` state and pass them into `TeamConfigPanel` for inline alerts near the setup controls; format-specific rule copy should render conditionally in the config panel rather than being duplicated inside `TeamGenerator`.

For Battle Frontier Master anchor UX, keep the live point meter in `TeamGenerator` where anchor edits already happen, and feed it from `TeamManager` via the `pokemon-list` response's `battleFrontierMasterPointsByPokemonName` map so the client mirrors server-side point resolution without duplicating CSV logic.

Lineup-aware generation is the only frontend generation path. Do not add `FitnessAlgorithm` props, state, request fields, or algorithm-selection copy to `TeamManager`, `TeamConfigPanel`, or `TeamGenerator`.

Lineup-aware result UI should pass `recommendedLineups` from the generate-team response through `TeamManager` into `AnalysisPanel`; frontend adapters should display these diagnostics in the analysis column rather than recomputing lineup scoring or rendering them inside generated-team cards.

Recommended lineup cards should stay concise: show role terms as `Lead`, `Switch`, and `Closer`, avoid duplicating those labels in values, omit covered-threat lists, and render API-provided readable weakness labels without importing canonical Pokemon data into client components.

Recommended lineup resource path cards should show the path meaning, rounded numeric score, and visible quality label (`weak`, `neutral`, `strong`, or `elite`) with matching color classes so color is not the only indicator.

Recommended lineup weakness display should use semantic `ul`/`li` lists with one weakness per item and a concise fallback when the weakness list is empty; do not return to comma-separated inline weakness strings.

Optimizer score breakdown display should consume API-provided `scoreBreakdown` through `TeamManager.generatedTeam` and render in `AnalysisPanel`; keep category explanations display-only and do not recompute weighted optimizer categories in client components.

When `AnalysisPanel` accordion sections are conditional, derive keyboard focus order from the rendered section list so Arrow/Home/End navigation never targets a hidden section.

PlayPokemon roster diagnostics should flow from `/api/generate-team` as `rosterMetrics` and `benchUtility` through `TeamManager` and `ResultsPanel` into `TeamDisplay`; keep the UI display-only and show warning text labels instead of relying on color alone.

Bench utility warning pills should use inline flex centering (`inline-flex`, `items-center`, `justify-center`, and `text-center`) so warning labels stay horizontally and vertically centered across pill widths.

## Testing

Snapshot tests for UI; update via vitest. Run on changes; focus on accessibility.
