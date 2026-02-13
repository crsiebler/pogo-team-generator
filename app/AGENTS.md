# AGENTS.md for app/

## Architectural Rules

Next.js app router: APIs as thin adapters delegating to lib/. Keep routes pure; handle errors explicitly. No direct logic—use server actions.

## Code Style

API routes in TypeScript; error objects well-typed. Import order: external, internal aliases.

## Testing

Integration tests for APIs; run vitest on changes. Propagate errors/rejections.
When API response contracts evolve, update route mocks and response-shape assertions in the same test to keep adapter behavior locked.
