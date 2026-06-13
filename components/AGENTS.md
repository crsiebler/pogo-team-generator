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

Recommended Lineups should render as an `AnalysisPanel` accordion section immediately after Summary Statistics. Keep it in the shared rendered-section list so accordion keyboard navigation follows the visible section order.

Recommended Lineups accordion cards should use the same blue diagnostic styling family as the surrounding analysis accordions and Summary Statistics cards; do not reintroduce emerald/green card styling unless a current story explicitly changes the visual contract.

Recommended lineup cards should stay concise: show role terms as `Lead`, `Switch`, and `Closer`, avoid duplicating those labels in values, omit covered-threat lists, and render API-provided readable weakness labels without importing canonical Pokemon data into client components.

Recommended lineup cards should render exactly one quality pill derived from the API-provided lineup `score` metadata. Keep the pill textual (`elite`, `strong`, `neutral`, or `weak`) and do not display the numeric score value in the card.

Recommended lineup cards should not render `diagnosticLabel`/`Structure`; keep lineup structure labels as internal optimizer/API diagnostics unless a current story explicitly reintroduces a display consumer.

Recommended lineup cards should not render resource path metrics (`Balanced`, `Shield spend`, or `Shield save`); keep those shield-path diagnostics internal to optimizer scoring unless a current story explicitly reintroduces a display consumer.

Recommended lineup weakness display should use semantic `ul`/`li` lists with one weakness per item and a concise fallback when the weakness list is empty; do not return to comma-separated inline weakness strings.

Optimizer score breakdown display should consume API-provided `scoreBreakdown` through `TeamManager.generatedTeam` and render inside the `AnalysisPanel` Summary Statistics accordion; keep category explanations display-only and do not recompute weighted optimizer categories in client components.

When Summary Statistics optimizer score cards need a side-by-side comparison after an odd number of preceding cards, render the pair in a dedicated `sm:grid-cols-2` group instead of relying on the parent grid's auto-placement.

Optimizer score card order in Summary Statistics should render Role immediately after Bulk as a standard card, followed by Offensive Ratio and Defensive Ratio in their dedicated comparison row.

Summary Statistics optimizer score cards should display only simple letter grades (`A`, `B`, `C`, `D`, or `F`) as metric values. Do not render numeric optimizer scores, plus/minus grade modifiers, or `elite`/`strong`/`neutral`/`weak` quality pills in Summary Statistics, except for the dedicated Threat Score profile pill described below.

Summary Statistics may render the API-provided `scoreBreakdown.threatScore` as a separate lower-is-better diagnostic card. Keep it display-only, render exactly one team-level threat profile pill (`elite`, `strong`, `neutral`, or `weak`) from the lower-is-better display thresholds (`<= 0.15` elite, `<= 0.30` strong, `<= 0.45` neutral, `> 0.45` weak), omit raw Overall/Top Meta/Full Meta score boxes, and cap visible Top Meta/Overall Team Threat lists with a count summary so live meta pools do not overwhelm the accordion. Threat list items should render readable Pokemon names only; do not append rank, answer count, risk, threat value, or other raw threat metadata.

Per-Pokemon Contribution in `AnalysisPanel` should stay concise: render the Pokemon name, replacement risk, Threats Handled, Coverage Added, and High-Pressure Relief only unless a current story explicitly reintroduces explanatory copy. Keep the Replacement Risk pill in its own row below the Pokemon name so it never sits beside the name on wide layouts.

When `AnalysisPanel` accordion sections are conditional, derive keyboard focus order from the rendered section list so Arrow/Home/End navigation never targets a hidden section.

PlayPokemon roster diagnostics are internal optimizer diagnostics unless a current feature explicitly reintroduces a display consumer; do not pass `rosterMetrics` or `benchUtility` through `TeamManager`, `ResultsPanel`, or `TeamDisplay` for generated-team cards.

## Testing

Snapshot tests for UI; update via vitest. Run on changes; focus on accessibility.
