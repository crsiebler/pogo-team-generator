# AGENTS.md for lib/

## Architectural Rules

Core domain logic only; pure functions, no UI. Follow Clean Architecture: lib/ as core, app/components as thin adapters. Genetic algorithms and data loaders here—unit-test everything.
When adding new analysis sections, derive them from existing analysis outputs (for example `ThreatAnalysisEntry[]`) before introducing additional simulation passes.

## Code Style

Explicit return/param types for exports; JSDoc/TSDoc required. CamelCase for functions/variables, PascalCase for types. Absolute imports (`@/lib/...`).

## Testing

Write tests before implementation; run `npm test` on changes. Coverage cannot regress.
