# Pokemon GO PvP Team Generator

A Next.js app that builds competitive Pokemon GO PvP teams with a format-aware genetic algorithm. It combines PvPoke rankings, simulation matchup data, moveset recommendations, and team composition rules to generate teams for multiple leagues and cups.

## Supported Formats

- Great League
- Ultra League
- Master League
- Kanto Cup
- Spring Cup

Each format uses its own ranking CSVs, simulation data, and eligible Pokemon pool.

## What It Does

- Generates teams for both `PlayPokemon` (6 Pokemon) and `GBL` (3 Pokemon)
- Filters anchor and excluded Pokemon by the selected battle format
- Enforces species uniqueness across forms that share the same base Dex number
- Scores teams with canonical lineup-aware fitness using simulation-backed matchup coverage, role quality, lineup depth, and team stability

## Quick Start

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.

## Scripts

```bash
# Development
bun run dev

# Production build
bun run build
bun run start

# Lint
npm run lint

# Format
npm run format

# Tests
npm test
npm run test:ci

# Sync PvPoke-backed data
npm run sync
```

## Usage

1. Select a battle format.
2. Select a tournament mode:
   - `PlayPokemon`: build a 6-Pokemon roster
   - `GBL`: build a 3-Pokemon roster
3. Optionally add anchor Pokemon you want locked into the generated team.
4. Optionally add excluded Pokemon you do not want considered.
5. Generate a team.

## How Team Generation Works

`lib/genetic/algorithm.ts` drives the main generation loop.

### Candidate Pool

- The generator loads the selected battle format from `lib/data/battleFormats.ts`.
- It reads that format's rankings from `lib/data/rankings.ts`.
- It builds a candidate pool from the top ranked eligible Pokemon for that format.
- It verifies simulation data exists for the format before generation starts.

### Chromosomes

- `PlayPokemon` teams contain 6 species IDs.
- `GBL` teams contain 3 species IDs.
- Anchor slots are preserved during initialization, crossover, and mutation.
- Teams are validated with base-species uniqueness rules, so different forms of the same Pokemon family cannot appear together.

### Lineup-Aware Fitness

Generation uses one canonical lineup-aware fitness path in `lib/genetic/fitness/index.ts`.

- `PlayPokemon` bring-6 rosters are scored by enumerating ordered pick-3 lineups, rewarding viable lineup depth, lead diversity, bench utility, and broad threat coverage.
- `GBL` teams are scored by evaluating ordered lead, safe swap, and closer recommendations for the three selected Pokemon.
- Final results include recommended lineups and, for `PlayPokemon`, roster metrics plus bench utility diagnostics.

Simulation coverage remains a dominant factor, so the generator prefers teams that can repeatedly answer relevant threats in the selected format.

### Optimizer Architecture

The optimizer keeps scoring logic in `lib/` and treats API and UI layers as adapters that validate, pass through, and display already-computed diagnostics. This keeps genetic search, lineup scoring, roster aggregation, ranking access, and type-effectiveness rules testable without coupling them to React components or route handlers.

Key modules:

- `lib/genetic/fitness/lineupEnumeration.ts` builds the deterministic ordered pick-3 lineup set for a bring-6 roster.
- `lib/genetic/fitness/lineupScoring.ts` scores one ordered lineup as a battle plan with role, matchup, coverage, safety, consistency, bulk, and type-ratio signals.
- `lib/genetic/fitness/rosterScoring.ts` aggregates lineup quality into bring-6 roster fitness, including best-lineup quality, top-N lineup depth, viable lineup count, viable lead diversity, bench utility, and one-line-team penalties.
- `lib/genetic/fitness/recommendations.ts` converts bounded finalist diagnostics into API-ready recommended lineups and bench utility warnings.
- `lib/genetic/fitness/scoreBreakdown.ts` defines the normalized weighted component contract used by lineup and roster scoring.
- `lib/genetic/fitness/typeEffectivenessRatios.ts` evaluates offensive move pressure and defensive resistance or weakness ratios using `data/type-effectiveness.json`.
- `lib/data/rankings.ts` provides runtime ranking access and caching by battle format and category.
- `lib/sync/adapter.ts` and `lib/sync/rankings.ts` adapt local PvPoke exports into deterministic project CSVs under `data/rankings/`.

The weighted score model combines normalized components in priority order: synergy, coverage, safety, consistency, bulk, defensive ratio, offensive ratio, and role. The current default weights are starting defaults for tuning, not guaranteed optimal constants: synergy `0.24`, coverage `0.21`, safety `0.17`, consistency `0.13`, bulk `0.10`, defensive ratio `0.07`, offensive ratio `0.05`, and role `0.03`. Hard constraints stay limited to legality and validity checks such as roster size, eligibility, anchors, exclusions, and base-species uniqueness.

PvPoke rankings are scoring signals rather than immutable truth. Overall rankings seed broad candidate quality, while Leads, Switches, Closers, Chargers, Attackers, and Consistency exports inform role fit, energy pressure, shield-disadvantage pressure, volatility assumptions, move choices, and threat weighting. The optimizer combines those inputs with matchup simulations, type effectiveness, and lineup depth so it does not optimize blindly for raw rank.

Optimizer strategy references:

- [`docs/pokemon-go-team-optimization.md`](docs/pokemon-go-team-optimization.md)
- [`docs/team-optimization/scoring-model.md`](docs/team-optimization/scoring-model.md)
- [`docs/team-optimization/lineup-structures.md`](docs/team-optimization/lineup-structures.md)
- [`docs/team-optimization/coverage-threat-pools.md`](docs/team-optimization/coverage-threat-pools.md)
- [`docs/team-optimization/safety-consistency-bulk.md`](docs/team-optimization/safety-consistency-bulk.md)
- [`docs/team-optimization/type-effectiveness.md`](docs/team-optimization/type-effectiveness.md)
- [`docs/team-optimization/role-scoring.md`](docs/team-optimization/role-scoring.md)
- [`docs/team-optimization/data-inputs.md`](docs/team-optimization/data-inputs.md)
- [`docs/team-optimization/validation.md`](docs/team-optimization/validation.md)

### Moveset Selection

`lib/genetic/moveset.ts` now prefers ranking-recommended movesets through `getRecommendedMovesetForPokemon(...)`.

- Ranked movesets are pulled from the current format's overall rankings.
- When ranking data is incomplete, the generator falls back to legal in-dataset moves.
- This keeps fitness scoring aligned with the same movesets used by synced ranking and simulation data.

## Data Layout

The `data/` directory was restructured to support multiple leagues and cups.

```text
data/
├── moves.json
├── pokemon.json
├── sync-metadata.json
├── type-effectiveness.json
├── rankings/
│   ├── cp1500/
│   │   ├── all/
│   │   ├── kanto/
│   │   └── spring/
│   ├── cp2500/
│   │   └── all/
│   └── cp10000/
│       └── all/
└── simulations/
    ├── cp1500/
    │   ├── all/
    │   ├── kanto/
    │   └── spring/
    ├── cp2500/
    │   └── all/
    └── cp10000/
        └── all/
```

### Rankings

Ranking CSVs are stored at:

```text
data/rankings/cp{cp}/{cup}/{category}_rankings.csv
```

Examples:

- `data/rankings/cp1500/all/overall_rankings.csv`
- `data/rankings/cp1500/kanto/leads_rankings.csv`
- `data/rankings/cp2500/all/switches_rankings.csv`

When source files exist, sync exports seven PvPoke categories for each supported format: Overall, Leads, Switches, Closers, Chargers, Attackers, and Consistency.

`lib/data/rankings.ts` caches parsed rankings per format and throws `MissingRankingDataError` when a selected format has not been synced.

### Simulations

Simulation CSVs are stored at:

```text
data/simulations/cp{cp}/{cup}/{speciesId}_{scenario}.csv
```

Examples:

- `data/simulations/cp1500/all/azumarill_1-1.csv`
- `data/simulations/cp1500/spring/feraligatr_shadow_2-2.csv`
- `data/simulations/cp10000/all/dialga_0-0.csv`

`lib/data/simulations.ts` loads matchup matrices per format and throws `MissingSimulationDataError` when data is unavailable.

### Sync Metadata

`data/sync-metadata.json` records the timestamp of the last successful sync. `lib/data/syncMetadata.ts` exposes helpers for reading and formatting that timestamp.

## Sync Workflow

This project syncs ranking, Pokemon, move, and simulation data from a local PvPoke source.

### One-Time Setup

```bash
git submodule update --init --recursive
```

The repository expects PvPoke data under `vendor/pvpoke/`.

### Run Sync

```bash
npm run sync
```

Resume mode keeps existing simulation CSVs when possible:

```bash
bun run lib/scripts/sync.ts --resume
```

The sync pipeline:

1. reads Pokemon and move data from the PvPoke source
2. writes normalized `data/pokemon.json` and `data/moves.json`
3. exports available Overall, Leads, Switches, Closers, Chargers, Attackers, and Consistency rankings for every supported battle format
4. generates simulation CSVs for every supported battle format
5. updates `data/sync-metadata.json`

## API Overview

### `GET /api/pokemon-list?formatId=...`

- Returns the eligible ranked Pokemon list for the selected format
- Defaults to `great-league` when `formatId` is omitted

### `POST /api/generate-team`

Request body:

```json
{
  "formatId": "kanto-cup",
  "mode": "GBL",
  "anchorPokemon": ["Mew"],
  "excludedPokemon": ["Hypno"]
}
```

Notes:

- `formatId` must be a supported value from `lib/data/battleFormats.ts`
- anchors and exclusions must be eligible in the selected format
- team generation uses the canonical lineup-aware strategy; `algorithm` request fields are deprecated and ignored
- missing rankings or simulations return deterministic `400` responses with sync guidance

## Project Structure

```text
app/
├── api/
└── page.tsx

components/
├── atoms/
├── molecules/
└── organisms/

lib/
├── data/
├── genetic/
│   ├── algorithm.ts
│   ├── chromosome.ts
│   ├── moveset.ts
│   ├── operators.ts
│   └── fitness/
├── scripts/
└── sync/

data/
├── rankings/
├── simulations/
├── pokemon.json
├── moves.json
└── sync-metadata.json
```

## Notable Recent Changes

- Data storage is now format-specific under `data/rankings/` and `data/simulations/`.
- Multiple battle formats are supported through a single catalog in `lib/data/battleFormats.ts`.
- The UI now lets users choose battle format for generation.
- The generator now validates selected Pokemon against the chosen format before running.
- Fitness scoring relies much more on simulation-backed matchup quality and threat redundancy.
- Recommended movesets now come from ranking data instead of purely team-context heuristics.
- Optimizer scoring now exposes a normalized score breakdown for synergy, coverage, safety, consistency, bulk, defensive ratio, offensive ratio, and role.

## Testing

Important coverage areas now include:

- format-aware ranking loading
- format-aware simulation loading
- API validation for invalid or unsynced formats
- genetic algorithm candidate-pool selection by format
- team uniqueness validation across related species forms
- optimizer validation fixtures for documented lineup, roster, coverage, type-effectiveness, bulk, and synergy tradeoffs

Run the full suite with:

```bash
npm test
```

## Limitations

- Output quality depends on synced PvPoke rankings and simulation data being current.
- Generated teams are only as complete as the formats present in `data/rankings/` and `data/simulations/`.
- Team generation is heuristic and simulation-backed, but it is not a full tournament planner.
- Recommended movesets follow synced ranking data and may not reflect personal inventory constraints.

## License

MIT License. See `LICENSE`.
