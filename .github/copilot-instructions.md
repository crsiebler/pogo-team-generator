# Pokémon GO PvP Team Generator - AI Instructions

## Project Overview

A web application that generates optimized Pokémon teams for competitive PvP using genetic algorithms. Supports two tournament formats:

- **Play! Pokémon**: 6 Pokémon teams with open team sheets (opponent sees all Pokémon and moves)
- **GO Battle League (GBL)**: 3 Pokémon teams with blind selection (surprise factor matters)

The application analyzes type coverage, move synergy, energy breakpoints, and strategic lineup patterns (ABA/ABB/ABC). Includes anchor Pokémon mode where users can specify 1-6 Pokémon they want to use, and the algorithm builds an optimal team around them.

## Data Architecture

### Core Data Files

- **`data/pokemon.json`** (43,912 lines): Complete Pokémon database with stats, moves, IVs, and evolution chains
  - Each entry includes: `dex`, `speciesName`, `speciesId`, `baseStats` (atk/def/hp), `types`, `fastMoves`, `chargedMoves`, `defaultIVs` for different CP leagues, `family`, `buddyDistance`, `thirdMoveCost`
  - Shadow variants are separate entries with `_shadow` suffix in `speciesId`
  - Tags indicate availability: `"shadoweligible"`, `"shadow"`, `"starter"`, etc.

- **`data/moves.json`** (3,988 lines): Complete move database for PvP calculations
  - Properties: `moveId`, `name`, `type`, `power`, `energy`, `energyGain`, `cooldown`, `archetype`
  - Some moves include `buffs`, `buffTarget`, `buffApplyChance` for stat modifications
  - Fast moves have `turns` property (typically 1-4 turns)

- **`data/typechart.png`**: Type effectiveness reference chart

### Ranking CSVs

All ranking files share the same structure with these columns:

```
Pokemon, Score, Dex, Type 1, Type 2, Attack, Defense, Stamina, Stat Product,
Level, CP, Fast Move, Charged Move 1, Charged Move 2, Charged Move 1 Count,
Charged Move 2 Count, Buddy Distance, Charged Move Cost
```

- **`cp1500_all_overall_rankings.csv`**: Overall Great League performance rankings (1097 Pokémon)
- **`cp1500_all_leads_rankings.csv`**: Lead position rankings - optimized for opening matchups
- **`cp1500_all_switches_rankings.csv`**: Switch position rankings - optimized for mid-battle pivots
- **`cp1500_all_closers_rankings.csv`**: Closer position rankings - optimized for endgame scenarios

Scores are 0-100 scale (e.g., Galarian Corsola at 94.5 overall, Primeape at 100 for leads).

## Data Relationships & Key Patterns

### Cross-File Relationships

1. **Move IDs**: `pokemon.json` references moves by `moveId` (e.g., `"TACKLE"`, `"VINE_WHIP"`) which must exist in `moves.json` with matching `moveId` field
2. **Species Variants**: Shadow/Alolan/Galarian forms are distinct entries with name suffixes like `"(Shadow)"` or `"(Alolan)"` in both JSON and CSV files
3. **Stat Products**: CSV `Stat Product` is calculated as `Attack * Defense * Stamina` at the specified `Level` to reach target `CP`

### Team Composition Patterns

PvP teams use a **Lead/Switch/Closer** structure:

- **Lead**: Typically high shield pressure and consistent damage (e.g., Primeape with fast-charging Rage Fist)
- **Switch**: Defensive typing and good coverage (e.g., Azumarill with dual typing advantage)
- **Closer**: High attack stat or sweep potential (e.g., Bastiodon with high defense/stamina)

### Move Energy Mechanics

- Fast moves generate energy (check `energyGain` field)
- Charged moves consume energy (check `energy` field)
- Move count columns (e.g., `Charged Move 1 Count: 5`) indicate moves needed to reach that charged move
- Example: Corsola's Night Shade has 5-move count, meaning 5 Astonish fast moves to charge

## Data Processing Patterns

### IV Calculations

```javascript
// defaultIVs format: [level, attack IV, defense IV, stamina IV]
"cp500": [17.5, 3, 14, 12]  // For CP 500 league
"cp1500": [50, 15, 15, 15]  // For CP 1500 (Great League)
```

Level 50 with 15/15/15 indicates Pokémon needs Best Buddy boost (level 50 = level 40 + 10 from best buddy)

### Type Effectiveness

- Single vs dual typing affects matchups significantly
- `Type 2` can be `"none"` for single-type Pokémon
- Cross-reference with `typechart.png` for weakness/resistance calculations

### Evolution Chains

```json
"family": {
    "id": "FAMILY_BULBASAUR",
    "evolutions": ["ivysaur"]  // Array of speciesId values for next stages
}
```

## Common Development Patterns

### Filtering by League CP

When working with Great League data, always filter by CP ≈ 1500 (typically 1493-1500 range due to level breakpoints)

### Buddy & Resource Costs

- `buddyDistance`: 1km, 3km, 5km, or 20km (legendary) - affects candy gathering rate
- `thirdMoveCost`: 10,000 (common), 50,000 (uncommon), 75,000 (rare), 100,000 (legendary) Stardust

### Ranking Score Interpretation

- 90+ = Meta-defining (top tier)
- 85-90 = Highly competitive
- 80-85 = Niche but viable
- <80 = Situational or off-meta

## Performance Considerations

- **Large Files**: `pokemon.json` is 43k+ lines; use streaming or indexed access for full scans
- **CSV Parsing**: Rankings CSVs are 1000+ rows; consider caching parsed results
- **Move Lookups**: Create a `moveId → move object` map for O(1) lookups instead of array searches

## External Dependencies & Data Sources

- Data sourced from **PvPoke** (https://pvpoke.com) - community-maintained PvP simulator
- Pokémon stats from Niantic's Game Master file
- Rankings reflect the "All" meta (no specific cup restrictions)
- Shadow multipliers: 1.2x attack, 0.833x defense (applied to base stats before calculation)

## Workflow Patterns

### Adding New Pokémon

1. Add entry to `pokemon.json` with complete stats and move sets
2. Ensure all `moveId` references exist in `moves.json`
3. Update ranking CSVs if competitive (score >80)
4. Verify `family` evolution chains are bidirectional

### Updating Rankings

Rankings change with game balance patches. When updating:

1. Replace entire CSV files (don't merge)
2. Check for new moves in `moves.json` first
3. Verify Shadow form availability hasn't changed
4. Update all four ranking files simultaneously (overall/leads/switches/closers)

## Known Limitations

- No battle simulation logic included (estimates from stats/rankings only)
- Rankings are meta-dependent and change with game updates
- IV spreads in `defaultIVs` are theoretical optimal, not account-specific
- Move availability may change with events (legacy moves, special moves)

## Tournament Rules & Battle Mechanics

### Team Composition Rules

- **6 Unique Pokémon**: Play! Pokémon tournament teams must have exactly 6 Pokémon with unique `speciesId` values
- **3 Pokémon**: GO Battle League (GBL) uses 3-Pokémon teams instead of 6
- **Species Variants**: Forms (Shadow, Alolan, Galarian, Hisuian) count as SEPARATE species
  - Example: `marowak`, `marowak_alolan`, `marowak_shadow`, `marowak_alolan_shadow` are 4 distinct species
  - **CRITICAL**: Only ONE form of each base species allowed per team
  - Validation: Extract base species by splitting on `_` - `marowak_alolan_shadow` → base is `marowak`
- **Battle Lineup**:
  - Play! Pokémon: Players select 3 of their 6 each round in Lead/Switch/Closer positions
  - GBL: All 3 Pokémon battle every match
- **Tournament Format Differences**:
  - **Open Team Sheets** (Play! Pokémon): Opponent sees your 6 Pokémon and all moves before each match
    - No surprise factor - must win through strategy, coverage, and execution
    - Off-meta moves (e.g., Hyper Beam on Diggersby) are visible to opponent
    - Algorithm should prioritize consistency and generalist performance
  - **Blind Selection** (GBL): Opponent doesn't see your team or moves until battle starts
    - Surprise moves can catch opponents off-guard
    - Meta-breaking movesets have higher value
    - Algorithm should include surprise factor in fitness calculation

### Battle Resources

1. **Shields (2 per battle)**: Block charged move damage
   - Strategy: Use on high-damage moves or to secure winning matchups
   - Shield pressure: Fast-charging moves force early shield usage
2. **Switch Timer (45 seconds)**: Cooldown after switching
   - Locked matchups: Cannot switch until timer expires or Pokémon faints
   - **Swap & Counter-Swap**: Opponent swapping after you gains alignment advantage
   - Need safe switch options with defensive typing

3. **Alignment**: Winning lead matchup gives choice vs opponent's switch
   - Most valuable resource in PvP
   - Need lead Pokémon that win common matchups or pressure shields quickly

### Move Mechanics

#### Fast Moves (Turn-Based)

- **Turn Duration**: 1-5 turns (0.5 to 2.5 seconds per move)
- **Flexibility**: Lower turns = more flexible (can swap/throw charged moves sooner)
  - 1-turn: Best flexibility, every 0.5 seconds
  - 5-turn: Locked 2.5 seconds, opponent can act during animation
- **Energy Generation**: `energyGain` field determines charge move speed
- **Damage Patterns**:
  - High damage, low energy: Consistent damage regardless of shields
  - Low damage, high energy: Fast charge move access

#### Charged Moves (Energy-Based)

- **Energy Cost Categories**:
  - Spam/Bait (35-40): Low cost, moderate damage - forces shields or baits
  - General (45-50): Balanced damage-per-energy
  - Nuke (55-75+): High damage, high cost, often with self-debuff
- **Move Count**: CSV "Charged Move 1 Count" = fast moves needed to reach it
- **Buff/Debuff**: Check `buffs`, `buffTarget`, `buffApplyChance` fields
  - Stage changes persist until Pokémon switches out
  - Debuffing (Rock Tomb: -1 atk) can flip bad matchups
  - Buffing self (Rage Fist: +1 atk) requires staying in to maintain

### STAB (Same Type Attack Bonus)

- **1.2× damage** when move type matches Pokémon type
- Example: Skeledirge (fire/ghost) using Shadow Ball (ghost) gets STAB
- Coverage moves without STAB still valuable for hitting type weaknesses

### Strategic Lineup Patterns

#### ABA Structure

- Lead (A) and Closer (A) share similar strengths/weaknesses
- Switch (B) covers their shared vulnerabilities
- **Use when**: Opponent likely lacks counter to your A typing
- Example: Jellicent + Bastiodon + Azumarill (both water protected by rock/steel)

#### ABB Structure

- Lead (A) has distinct role
- Switch (B) and Closer (B) counter lead's primary weakness
- **Use when**: Can predict opponent's counter to your lead
- Strategy: Swap to B, eliminate counter, sweep with other B
- Example: Bastiodon (lead) + Trevenant + Cradily (grass counters ground)

#### ABC Structure

- All three have different roles and broad coverage
- **Use when**: Meta is diverse, need flexibility
- Requires generalists (85+ score) that handle many matchups
- Risk: Lose your one counter, no backup

## Algorithm Requirements

### Genetic Algorithm Configuration

**Chromosome**:

- Play! Pokémon: Array of 6 `speciesId` strings
- GBL: Array of 3 `speciesId` strings
- Anchor Mode: Some slots locked to user-specified Pokémon

**Fitness Function** (weighted):

```
// Base fitness (all modes)
fitness = (
  typeCoverage * 0.30 +         // Offensive/defensive coverage
  avgRankingScore * 0.25 +      // Average across 4 CSVs
  strategyViability * 0.20 +    // Valid ABA/ABB/ABC lineups
  metaThreatCoverage * 0.15 +   // Covers top 50 ranked
  energyBreakpoints * 0.10      // Move synergy and timing
)

// Tournament mode adjustments
if (mode === 'GBL') {
  fitness += surpriseFactor * 0.15;   // Off-meta moves boost
  fitness -= predictability * 0.10;   // Common core penalty
}

if (mode === 'PlayPokemon') {
  fitness += consistency * 0.10;      // Generalist boost
  fitness -= volatility * 0.05;       // High variance penalty
}

// Anchor Pokémon bonus
if (hasAnchors) {
  fitness += anchorSynergy * 0.15;    // Team supports anchors
}
```

**Operators**:

- Selection: Tournament selection, keep top 30%
- Crossover: Single-point, preserve species uniqueness AND anchors
- Mutation: Swap non-anchor slots with similar-role replacements
- Population: 100-200 teams
- Generations: 50-100 iterations

**Anchor Pokémon Handling**:

- User provides 1-6 Pokémon they want to use
- Validate anchors don't violate species uniqueness
- Lock anchor slots during mutation/crossover
- Adjust fitness to build around anchor strengths
- Identify coverage gaps from anchors, fill in generation

### Type Coverage Scoring

**Type Effectiveness** (18×18 matrix):

- Super effective: 1.6× damage
- Neutral: 1.0×
- Not very effective: 0.625×
- Double resist: 0.39× (0.625 × 0.625)
- Immune: 0.39× (treated as double resist)

**Calculation**:

1. **Offensive**: Unique types hit super-effectively via charged moves
2. **Defensive**: Types team resists based on Pokémon typing
3. **Gaps**: Common meta types (water, steel, fairy, dragon, dark, ghost) not covered
4. **Meta Weight**: Score based on top 50 `Score` values in overall rankings

### Energy Breakpoint Calculations

**Fast Move Analysis**:

```javascript
turnsNeeded = ceil(chargedMove.energy / fastMove.energyGain);
secondsToCharge = turnsNeeded * (fastMove.turns * 0.5);
pressureScore = 1 / secondsToCharge; // Lower time = higher pressure
```

**Move Synergy**:

- **Spam + Nuke**: Low-cost bait (35-40) + high-damage (55+)
- **Fast Charging**: Reachable in 3-5 fast moves enable early pressure
- **Self-Debuff**: Nuke with debuffs need safe switch options
- **Buff Stacking**: Self-buffs want bulk to stay alive

### Lineup Generation (3 from 6)

**Role Scoring**:

```javascript
// Lead: Fast charge, high fast damage, shield pressure
leadScore =
  leadsRanking.Score * 0.5 +
  fastMoveQuality * 0.25 +
  (1 / chargeMoveCount) * 0.25;

// Switch: Bulk, safe typing, coverage
switchScore =
  switchesRanking.Score * 0.4 +
  (statProduct / 2500000) * 0.3 +
  safeMatchups * 0.3;

// Closer: Sweep potential, energy efficiency
closerScore =
  closersRanking.Score * 0.5 + hasBoostMove * 0.3 + lowEnergyCost * 0.2;
```

**Pattern Validation**:

- ABA: Lead and Closer share 50%+ weaknesses Switch covers
- ABB: Both Switch/Closer counter Lead's primary weakness
- ABC: Combined coverage hits 12+ types with <30% overlap

Generate all 20 permutations, score by pattern + coverage.

## Data Update Workflow

**Manual Replacement** (after patches/meta shifts):

1. Download updated CSVs from PvPoke rankings
2. Replace all 4 files in `data/` simultaneously
3. Check for new Pokémon/moves:
   - Add to `pokemon.json` with complete stats
   - Add to `moves.json` with energy/power values
   - Ensure all `moveId` references valid
4. Run validation:
   - No orphaned move references
   - No duplicate `speciesId`
   - All types valid (18 standard)
   - CSV and JSON in sync
5. Rebuild to regenerate indexed structures

**NEVER** merge old and new data - always replace entire files.
