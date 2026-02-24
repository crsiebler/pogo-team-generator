# Pokémon GO Tournament Team Generator

A web application that generates optimized 6-Pokémon teams for Play! Pokémon Great League (CP 1500) tournaments using genetic algorithms. Analyzes type coverage, move synergy, and strategic lineup patterns (ABA/ABB/ABC) to create competitive teams.

## Quick Start

```bash
# Install dependencies with Bun
bun install

# Run development server
bun run dev

# Build for production
bun run build

# Start production server
bun run start
```

Open [http://localhost:3000](http://localhost:3000) in your browser to use the team generator.

### Usage

1. **Select Tournament Format**: Choose between Play! Pokémon (6 Pokémon) or GO Battle League (3 Pokémon)
2. **Add Anchor Pokémon** (Optional): Enter Pokémon you want to include in your team
3. **Generate Team**: Click the button to run the genetic algorithm (10-30 seconds)
4. **View Results**: See your optimized team with types, stats, and moves

## Features

- **Genetic Algorithm Optimization**: Evolves teams over 50-100 generations with multi-factor fitness scoring
- **Type Coverage Analysis**: Custom 18×18 type effectiveness matrix with offensive/defensive gap detection
- **Energy Breakpoint Calculations**: Analyzes fast move turn counts and charge move timing for optimal pressure
- **Strategic Lineup Patterns**: Validates and recommends ABA, ABB, and ABC team structures
- **Role-Based Selection**: Assigns Pokémon to Lead, Switch, and Closer positions based on ranking data
- **Meta Threat Coverage**: Weights team composition against top 50 ranked Pokémon
- **Anchor Pokémon Builder**: Provide 1-6 Pokémon you want to use, algorithm builds optimal team around them
- **Tournament Mode Support**:
  - **Play! Pokémon (Open Sheets)**: 6 Pokémon, 3 selected per match, opponent sees full team and moves
  - **GO Battle League (Blind)**: 3 Pokémon only, opponent doesn't see team or moves until battle

## Tournament Rules Implemented

### Team Composition

- **6 Unique Pokémon**: No duplicate `speciesId` values allowed (Play! Pokémon tournaments)
- **3 Pokémon**: For GO Battle League mode (GBL)
- **Species Variants**: Only ONE form of each base species allowed per team
  - Shadow, Alolan, Galarian, and Hisuian forms are distinct `speciesId` values but share the same base species (Dex number)
  - ✅ Legal: `["marowak_alolan", "pikachu", "azumarill"]` - different base species
  - ❌ Illegal: `["marowak", "marowak_alolan"]` - both are Marowak variants (Dex #105)
  - Validation: Extract base species by splitting on `_` (e.g., `marowak_alolan_shadow` → base is `marowak`)
- **CP 1500 Limit**: All Pokémon must meet Great League requirements
- **Open Team Sheets** (Play! Pokémon): Opponent sees your 6 Pokémon and all moves before match
  - No surprise factor - must win through strategy and execution
  - Off-meta moves (e.g., Hyper Beam Diggersby) are visible
- **Blind Selection** (GBL): Opponent doesn't see your team until battle starts
  - Surprise moves can catch opponents off-guard
  - Meta-breaking sets have higher value

### Battle Mechanics

- **2 Shields per battle**: Teams must balance shield pressure and tank potential
- **45-second switch timer**: Requires safe switch options with defensive typing
- **Alignment advantage**: Lead winner gains counter-pick control
- **Turn-based moves**: 1-turn (0.5s) to 5-turn (2.5s) fast moves affect swap flexibility

### Strategic Patterns

#### ABA Lineup

- Lead (A) and Closer (A) share similar strengths and weaknesses
- Switch (B) covers their shared vulnerabilities
- Example: Jellicent (water/ghost) + Bastiodon (rock/steel) + Azumarill (water/fairy)

#### ABB Lineup

- Lead (A) has distinct role
- Switch (B) and Closer (B) counter the lead's primary weakness
- Example: Bastiodon (lead) + Trevenant (grass/ghost) + Ferrothorn (grass/steel)

#### ABC Lineup

- All three Pokémon have different roles and broad coverage
- Requires high-ranking generalists (score 85+)
- Example: Galarian Corsola + Azumarill + Talonflame

## Data Architecture

### Core Data Files

#### `data/pokemon.json` (43,912 lines)

Complete Pokémon database with:

- Base stats (attack/defense/hp)
- Type combinations
- Available fast and charged moves
- Default IV spreads for CP leagues
- Buddy distance and third move costs
- Evolution chains

```json
{
  "speciesId": "marowak_alolan",
  "types": ["fire", "ghost"],
  "fastMoves": ["FIRE_SPIN", "HEX"],
  "chargedMoves": ["SHADOW_BALL", "BONE_CLUB", "FLAME_WHEEL"],
  "defaultIVs": { "cp1500": [40, 1, 15, 14] }
}
```

#### `data/moves.json` (3,988 lines)

Move database with PvP stats:

- Energy generation (fast moves) and cost (charged moves)
- Turn duration for timing calculations
- Buff/debuff effects and application chances
- Move archetypes (Spam/Bait, Nuke, Debuff, etc.)

```json
{
  "moveId": "SHADOW_BALL",
  "type": "ghost",
  "power": 55,
  "energy": 45,
  "archetype": "General"
}
```

#### Ranking CSVs

Four ranking files with identical structure:

- `cp1500_all_overall_rankings.csv` - Generalist performance (1097 Pokémon)
- `cp1500_all_leads_rankings.csv` - Opening position optimization
- `cp1500_all_switches_rankings.csv` - Safe switch performance
- `cp1500_all_closers_rankings.csv` - Endgame sweep potential

Columns: Pokemon, Score (0-100), Types, Stats, Moves, Move Counts, Costs

## Algorithm Design

### Genetic Algorithm Configuration

**Chromosome Structure**:

```javascript
// Play! Pokémon mode (6 Pokémon)
{
  team: [speciesId1, speciesId2, speciesId3, speciesId4, speciesId5, speciesId6],
  anchors: [speciesId1], // Optional: user-provided Pokémon (1-6)
  fitness: 0.0
}

// GO Battle League mode (3 Pokémon)
{
  team: [speciesId1, speciesId2, speciesId3],
  fitness: 0.0
}
```

**Anchor Pokémon Handling**:

```javascript
// Mutation respects anchors - only mutates non-anchor slots
function mutate(chromosome, anchorIndices) {
  const mutableIndices = chromosome.team
    .map((_, i) => i)
    .filter((i) => !anchorIndices.includes(i));

  const indexToMutate = randomChoice(mutableIndices);
  chromosome.team[indexToMutate] = findSimilarReplacement(
    chromosome.team[indexToMutate],
  );
}

// Crossover preserves anchors from both parents
function crossover(parent1, parent2, anchorIndices) {
  const child = [...parent1.team];
  // Only swap non-anchor genes
  // Validate species uniqueness after swap
}
```

**Fitness Function** (weighted components):

```javascript
// Base fitness (all modes)
fitness =
  typeCoverage * 0.3 + // Offensive/defensive type coverage
  avgRankingScore * 0.25 + // Average across all 4 ranking files
  strategyViability * 0.2 + // ABA/ABB/ABC pattern validity
  metaThreatCoverage * 0.15 + // Coverage of top 50 meta Pokémon
  moveSynergy * 0.1; // Energy breakpoints and move diversity

// Tournament mode adjustments
if (mode === 'GBL') {
  // Boost surprise factor in blind mode
  fitness += surpriseFactor * 0.15; // Off-meta moves, unexpected counters
  fitness -= predictability * 0.1; // Penalty for common cores
}

if (mode === 'PlayPokemon') {
  // Boost consistency in open sheets mode
  fitness += consistency * 0.1; // Generalist performance
  fitness -= volatility * 0.05; // Penalty for high variance
}

// Anchor Pokémon bonus
if (hasAnchors) {
  fitness += anchorSynergy * 0.15; // How well team supports anchors
}
```

**Genetic Operators**:

- **Selection**: Tournament selection (top 30% of population)
- **Crossover**: Single-point with species uniqueness validation
- **Mutation**: Role-based swap (replace with similar-ranked Pokémon)
- **Population**: 100-200 individuals
- **Generations**: 50-100 iterations
- **Convergence**: Stop when top 10 teams within 2% fitness

### Type Coverage Scoring

**Offensive Coverage**:

```javascript
// Count unique types team can hit super-effectively (1.6× damage)
offensiveTypes = team.flatMap((pokemon) =>
  pokemon.chargedMoves.map((move) => typeChart[move.type].superEffective),
);
coverage = uniqueTypes(offensiveTypes).length / 18; // Max 18 types
```

**Defensive Coverage**:

```javascript
// Count types team resists (0.625× or 0.39× damage taken)
resistances = team.flatMap((pokemon) =>
  pokemon.types.flatMap((type) => typeChart[type].resistances),
);
```

**Gap Penalty**:

```javascript
// Subtract score for not covering common meta types
metaTypes = ['water', 'steel', 'fairy', 'dragon', 'dark', 'ghost'];
gaps = metaTypes.filter((type) => !offensiveTypes.includes(type));
penalty = gaps.length * 0.05;
```

### Energy Breakpoint System

**Fast Move Energy Generation**:

```javascript
// From moves.json energyGain and turns fields
const energyPerSecond = move.energyGain / (move.turns * 0.5);
const flexibility = move.turns; // Lower = more flexible (1 best, 5 worst)
```

**Charged Move Timing**:

```javascript
// From ranking CSV "Charged Move 1 Count" column
const movesToCharge = chargeMoveCount;
const secondsToCharge = movesToCharge * (fastMove.turns * 0.5);
const pressureScore = 1 / secondsToCharge; // Faster = better shield pressure
```

**Move Synergy Scoring**:

```javascript
// Evaluate spam/bait + nuke combinations
const hasSpam = chargedMoves.some((m) => m.energy <= 40);
const hasNuke = chargedMoves.some((m) => m.energy >= 55);
const synergy = hasSpam && hasNuke ? 1.2 : 1.0;
```

### Lineup Generation (3 from 6)

**Role Assignment**:

```javascript
// Score each Pokémon for each role
const leadScore =
  rankings.leads[pokemon.speciesId].Score * 0.5 +
  fastMoveQuality * 0.25 +
  chargeSpeed * 0.25;

const switchScore =
  rankings.switches[pokemon.speciesId].Score * 0.4 +
  bulkScore * 0.3 +
  safeMatchups * 0.3;

const closerScore =
  rankings.closers[pokemon.speciesId].Score * 0.5 +
  sweepPotential * 0.3 +
  energyEfficiency * 0.2;
```

**Pattern Validation**:

```javascript
// ABA: Lead and Closer share weaknesses, Switch covers
function validateABA(lead, switch, closer) {
  const sharedWeaknesses = getSharedWeaknesses(lead, closer);
  const switchStrengths = getStrengths(switch);
  const coverage = sharedWeaknesses.filter(w =>
    switchStrengths.includes(w)
  ).length;
  return coverage / sharedWeaknesses.length >= 0.5;
}

// ABB: Both back-line counter lead's weakness
function validateABB(lead, switch, closer) {
  const leadWeakness = getPrimaryWeakness(lead);
  return checkAdvantage(switch, leadWeakness) &&
         checkAdvantage(closer, leadWeakness);
}

// ABC: Minimal overlap, broad coverage
function validateABC(lead, switch, closer) {
  const coverage = getCombinedCoverage([lead, switch, closer]);
  const overlap = calculateTypeOverlap([lead, switch, closer]);
  return coverage.size >= 12 && overlap < 0.3;
}
```

## Tech Stack

### Core Technologies

- **Framework**: Next.js 14+ with App Router
- **Language**: TypeScript 5+
- **Styling**: Tailwind CSS 3+
- **State Management**: Zustand
- **Build Tool**: Turbopack (Next.js default)

### Data Processing

- **Type Chart**: Custom 18×18 matrix implementation
- **CSV Parsing**: Papa Parse or csv-parse
- **JSON Processing**: Native TypeScript
- **Caching**: In-memory Map structures for O(1) lookups

### Deployment

- **Hosting**: Vercel
- **Rendering**: ISR (Incremental Static Regeneration) for ranking data
- **Compute**: Client-side Web Workers for genetic algorithm
- **Environment**: Node.js 18+

## Project Structure

```
pokemon-team-generator/
├── data/
│   ├── pokemon.json              # 43,912 lines - Pokémon database
│   ├── moves.json                # 3,988 lines - Move database
│   ├── cp1500_all_overall_rankings.csv
│   ├── cp1500_all_leads_rankings.csv
│   ├── cp1500_all_switches_rankings.csv
│   ├── cp1500_all_closers_rankings.csv
│   └── typechart.png             # Reference chart
├── src/
│   ├── app/                      # Next.js app directory
│   ├── components/               # React components
│   ├── lib/
│   │   ├── genetic/              # Genetic algorithm engine
│   │   │   ├── chromosome.ts     # Team representation
│   │   │   ├── fitness.ts        # Fitness function
│   │   │   ├── operators.ts      # Selection, crossover, mutation
│   │   │   └── algorithm.ts      # Main GA loop
│   │   ├── coverage/             # Type coverage analysis
│   │   │   ├── typeChart.ts      # 18×18 effectiveness matrix
│   │   │   ├── analyzer.ts       # Coverage scoring
│   │   │   └── metaThreats.ts    # Top 50 threat analysis
│   │   ├── lineup/               # Lineup generation
│   │   │   ├── patterns.ts       # ABA/ABB/ABC validators
│   │   │   ├── roles.ts          # Lead/Switch/Closer assignment
│   │   │   └── generator.ts      # 3-from-6 permutations
│   │   ├── moves/                # Move analysis
│   │   │   ├── energy.ts         # Breakpoint calculations
│   │   │   ├── synergy.ts        # Move combo scoring
│   │   │   └── timing.ts         # Turn-based analysis
│   │   └── data/                 # Data loaders and indexers
│   │       ├── pokemon.ts        # Load and index pokemon.json
│   │       ├── moves.ts          # Load and index moves.json
│   │       └── rankings.ts       # Parse and index ranking CSVs
│   └── types/                    # TypeScript type definitions
└── public/                       # Static assets
```

## Development Workflow

### Data Updates (Manual Process)

When Niantic releases a game balance patch or PvPoke updates rankings:

1. **Sync Rankings from PvPoke** (recommended):

   ```bash
   # Ensure PvPoke submodule is initialized:
   git submodule update --init --recursive

   # Run the sync script to pull latest rankings:
   bun run sync
   ```

   Alternatively, download rankings manually:

   ```bash
   # Source rankings from https://pvpoke.com/rankings/ (recommended),
   # or from your local checkout at vendor/pvpoke/src/rankings/
   # Export CSV for each ranking category and replace files in data/
   ```

2. **Update Pokémon/Moves Data**:

   ```bash
   # If new Pokémon or moves added
   # Update data/pokemon.json and data/moves.json
   # Ensure all moveId references are valid
   ```

3. **Validate Data Integrity**:

   ```bash
   npm run validate-data
   # Checks for:
   # - Orphaned move references
   # - Duplicate speciesId values
   # - Invalid type values
   # - Missing ranking entries
   ```

4. **Rebuild Application**:
   ```bash
   npm run build
   # Regenerates indexed data structures
   # Clears ISR cache for fresh rankings
   ```

### Common Development Patterns

**Loading Pokémon by Species ID**:

```typescript
import { pokemonBySpeciesId } from '@/lib/data/pokemon';

const marowak = pokemonBySpeciesId.get('marowak_alolan');
```

**Calculating Type Effectiveness**:

```typescript
import { typeChart, calculateEffectiveness } from '@/lib/coverage/typeChart';

const multiplier = calculateEffectiveness(
  attacker.types, // ["fire", "ghost"]
  defender.types, // ["grass", "poison"]
  move.type, // "ghost"
);
// Returns: 1.6 (super effective)
```

**Validating Team Uniqueness**:

```typescript
import { isValidTeam } from '@/lib/data/pokemon';

const team = ['azumarill', 'bastiodon', 'talonflame', 'medicham', 'skarmory', 'swampert'];
const valid = isValidTeam(team); // true - all unique speciesId values

const invalidTeam = ['marowak', 'marowak_shadow', 'azumarill', 'azumarill', ...];
const valid2 = isValidTeam(invalidTeam); // false - duplicate base species
```

**Energy Breakpoint Analysis**:

```typescript
import { calculateBreakpoints } from '@/lib/moves/energy';

const breakpoints = calculateBreakpoints(
  'COUNTER', // Fast move
  'RAGE_FIST', // Charged move
  movesData,
);
// Returns: { movesNeeded: 4, timeToCharge: 2.0, pressureScore: 0.5 }
```

## Performance Considerations

### Large File Handling

- `pokemon.json` is 43,912 lines - use streaming for initial load, cache in memory
- Ranking CSVs total ~4MB - parse once on app initialization
- Type chart calculations are O(1) after preprocessing

### Genetic Algorithm Optimization

- Run in Web Workers to prevent UI blocking
- Typical runtime: 10-30 seconds for 100 generations
- Parallelization: Consider multiple workers for population evaluation
- Early stopping: Converge when fitness improvement < 1% for 10 generations

### Caching Strategy

```typescript
// In-memory caches for expensive calculations
const coverageCache = new Map<string, CoverageScore>();
const fitnessCache = new Map<string, number>();

// ISR for ranking data (revalidate: 604800 = 1 week)
export const revalidate = 604800;
```

## Known Limitations

- **No Battle Simulation**: Algorithm estimates performance from stats and rankings, not real battle outcomes
- **IV Spreads**: Uses default optimal IVs from `pokemon.json`, not user-specific collections
- **Move Availability**: Assumes all moves are available (doesn't flag legacy/elite TM moves in generation)
- **Meta Dependency**: Rankings reflect current meta and change with game patches
- **League Restriction**: MVP targets Great League (CP 1500) only

## External Dependencies & Data Sources

- **Rankings**: [PvPoke.com rankings](https://pvpoke.com/rankings/) - Community-maintained simulator
  (optional local sync source: `vendor/pvpoke/src/rankings/`)
- **Game Data**: Niantic Game Master file via PvPoke's processed data
- **Type Chart**: Standard Pokémon type effectiveness (official game mechanics)
- **Shadow Multipliers**: 1.2× attack, 0.833× defense (applied to base stats)

## Ranking Score Interpretation

Understanding the 0-100 score scale:

| Score Range | Tier   | Description               | Usage                               |
| ----------- | ------ | ------------------------- | ----------------------------------- |
| 90-100      | S-Tier | Meta-defining, top picks  | Always include in generation pool   |
| 85-90       | A-Tier | Highly competitive        | Strong candidates for all roles     |
| 80-85       | B-Tier | Viable with right support | Good for coverage gaps              |
| 75-80       | C-Tier | Niche/situational         | Use only if specific counter needed |
| <75         | D-Tier | Off-meta                  | Exclude from generation             |

## Future Enhancements

### Planned Features (Phase 2)

- [ ] **Anchor Pokémon Mode**: User selects 1-6 Pokémon, algorithm fills remaining slots
  - Validate anchor Pokémon don't conflict (species uniqueness)
  - Adjust fitness function to build around anchor strengths
  - Identify coverage gaps from anchors, prioritize filling them
- [ ] **GO Battle League Mode**: 3-Pokémon team generation with blind meta considerations
  - Optimize for surprise factor (off-meta moves, unexpected counters)
  - No lineup permutation needed (all 3 battle every time)
  - Adjust strategy patterns for 3-Pokémon teams
- [ ] **Tournament Mode Toggle**: Switch between open sheets (Play! Pokémon) and blind (GBL)
  - Open: Prioritize consistency and generalist performance
  - Blind: Prioritize surprise moves and meta-breaking sets

### Future Enhancements (Phase 3+)

- [ ] Ultra League (CP 2500) support
- [ ] Master League (no CP limit) support
- [ ] IV calculator for user-specific teams
- [ ] Battle simulator for team testing
- [ ] Meta cup restrictions (themed tournaments)
- [ ] Export to PvPoke team links
- [ ] Cost analysis (stardust/candy requirements)
- [ ] Move TM recommendation system

### Advanced Algorithm Features

- [ ] Multi-objective optimization (Pareto front for coverage vs ranking trade-offs)
- [ ] Tournament-specific training (learn from opponent team trends)
- [ ] Shield advantage prediction (simulate 2-2, 2-1, 1-0 scenarios)
- [ ] Switch timer optimization (when to swap for maximum gain)

## Contributing

### Adding New Pokémon

1. Add entry to `data/pokemon.json` with complete stats and movesets
2. Ensure all `moveId` references exist in `data/moves.json`
3. Update ranking CSVs if meta-relevant (score > 80)
4. Verify `family` evolution chains are bidirectional
5. Test species uniqueness validation

### Updating Move Data

1. Check Niantic Game Master for move stat changes
2. Update `power`, `energy`, `energyGain` in `data/moves.json`
3. Update `buffs` and `buffApplyChance` if effects changed
4. Re-run energy breakpoint calculations for affected Pokémon

## License

MIT License - see LICENSE file for details

## Acknowledgments

- **PvPoke** - Rankings and processed game data
- **Niantic** - Pokémon GO game mechanics and data
- **The Silph Arena** - Tournament format and ruleset documentation
- **GO Stadium** - Competitive battle mechanics research

# Test change for pre-commit hook
