# AGENTS.md for components/

## Architectural Rules

Atomic design: atoms (basic), molecules (composite), organisms (complex). Keep UI logic thin; delegate to lib/ for business rules. No direct data access—use hooks/props.
When rendering generation analysis in UI, treat `analysis` and `fitness` as optional payloads and degrade gracefully so older/incomplete API responses do not break results rendering.
For explainability metrics, derive user-facing contribution categories from normalized `analysis` fields and label impact as positive/neutral/negative without exposing internal formulas or weights.

## Code Style

Tailwind classes ordered via prettier-plugin-tailwindcss. Explicit prop types; accessibility via ESLint. Absolute imports (`@/components/...`).

## Testing

Snapshot tests for UI; update via vitest. Run on changes; focus on accessibility.
