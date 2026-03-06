# AGENTS.md for components/

## Architectural Rules

Atomic design: atoms (basic), molecules (composite), organisms (complex). Keep UI logic thin; delegate to lib/ for business rules. No direct data access—use hooks/props.

## Code Style

Tailwind classes ordered via prettier-plugin-tailwindcss. Explicit prop types; accessibility via ESLint. Absolute imports (`@/components/...`).

Form selects should use the `atoms/Select` + `atoms/Select/Option` pair so floating-label behavior and chevron affordance stay consistent across light/dark themes.

## Testing

Snapshot tests for UI; update via vitest. Run on changes; focus on accessibility.
