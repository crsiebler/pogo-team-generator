# AGENTS.md for components/

## Architectural Rules

Atomic design: atoms (basic), molecules (composite), organisms (complex). Keep UI logic thin; delegate to lib/ for business rules. No direct data access—use hooks/props.

## Code Style

Tailwind classes ordered via prettier-plugin-tailwindcss. Explicit prop types; accessibility via ESLint. Absolute imports (`@/components/...`).

Form selects should use the `atoms/Select` + `atoms/Select/Option` pair so floating-label behavior and chevron affordance stay consistent across light/dark themes.

When adding or changing battle-format UI, keep `TeamManager` as the state owner for `selectedFormatId` and populate dropdown options from `lib/data/battleFormats.ts` (`getBattleFormats`) so UI/API/sync layers stay aligned.

Keep transient generation errors in `TeamManager` state and pass them into `TeamConfigPanel` for inline alerts near the setup controls; format-specific rule copy should render conditionally in the config panel rather than being duplicated inside `TeamGenerator`.

For Battle Frontier Master anchor UX, keep the live point meter in `TeamGenerator` where anchor edits already happen, and feed it from `TeamManager` via the `pokemon-list` response's `battleFrontierMasterPointsByPokemonName` map so the client mirrors server-side point resolution without duplicating CSV logic.

## Testing

Snapshot tests for UI; update via vitest. Run on changes; focus on accessibility.
