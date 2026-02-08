# AGENTS.md for tests/

## Testing

TDD: Tests before implementation. Run `npm test` or `npx vitest run` on changes; coverage via `--coverage`. Unit for lib/, snapshots for components/, integration for critical paths.

## Architectural Rules

Test lib/ first; ensure coverage doesn't regress. Pure functions testable—focus on lowest unit.

## Code Style

Follow project lint/format; no unused vars. Absolute imports.
