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
- Scores teams with simulation-backed matchup coverage instead of ranking-only heuristics
- Supports two fitness strategies:
  - `individual`: balances individual strength, matchup quality, team coverage, type diversity, move coverage, and anchor support
  - `teamSynergy`: emphasizes threat redundancy, shield-scenario balance, and team-level coverage

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
5. Choose an algorithm:
   - `individual` for faster, broad scoring
   - `teamSynergy` for more coverage-focused analysis
6. Generate a team.

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

### Fitness Algorithms

#### `individual`

Implemented in `lib/genetic/fitness/individual.ts`.

This scorer combines:

- simulation-backed threat coverage
- weighted team weaknesses
- single-counter fragility penalties
- average matchup quality
- type coverage and type synergy
- move coverage and energy pressure
- stat balance and shadow preference
- mode-specific bonuses for consistency or surprise
- anchor synergy bonuses when anchors are present

Simulation coverage is the dominant factor, so the generator prefers teams that can repeatedly answer relevant threats in the selected format.

#### `teamSynergy`

Implemented in `lib/genetic/fitness/teamSynergy.ts`.

This scorer focuses more on:

- having multiple counters to meta threats
- shield-scenario consistency
- avoiding cores that are broken by the same threats
- preserving move diversity
- keeping a baseline level of individual quality

Use this mode when you care more about roster redundancy and team-wide structure than maximizing the ceiling of each individual slot.

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
3. exports rankings for every supported battle format
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
  "excludedPokemon": ["Hypno"],
  "algorithm": "teamSynergy"
}
```

Notes:

- `formatId` must be a supported value from `lib/data/battleFormats.ts`
- anchors and exclusions must be eligible in the selected format
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
- The UI now lets users choose battle format and fitness algorithm.
- The generator now validates selected Pokemon against the chosen format before running.
- Fitness scoring relies much more on simulation-backed matchup quality and threat redundancy.
- Recommended movesets now come from ranking data instead of purely team-context heuristics.

## Testing

Important coverage areas now include:

- format-aware ranking loading
- format-aware simulation loading
- API validation for invalid or unsynced formats
- genetic algorithm candidate-pool selection by format
- team uniqueness validation across related species forms

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
