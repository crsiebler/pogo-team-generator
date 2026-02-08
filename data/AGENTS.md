# AGENTS.md for data/

## Data Safety & Loading

All data ingest uses safe, typed loaders in `lib/data/`. Validate new entries for uniqueness, reference validity. No direct injections—update via loaders. For simulations, ensure CSV integrity; agents must handle fallbacks if data missing.

## Architectural Rules

Data as static JSON/CSV; agents delegate to lib/ for processing. Follow Clean Architecture: data as boundary, core logic in lib/.

## Code Style

Explicit types for data structures; use absolute imports (`@/data/...`).
