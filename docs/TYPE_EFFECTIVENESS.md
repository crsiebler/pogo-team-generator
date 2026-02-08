# Type Effectiveness Calculator

## Multiplier Values

Pokémon GO uses the following damage multipliers:
- **Super Effective**: 1.6×
- **Neutral**: 1.0×
- **Not Very Effective**: 0.625×
- **Immune** (treated as double resist): 0.39×

## Calculation Formula

For dual-type defenders, **multiply the effectiveness values**:

### Single Type Examples
- Water → Fire = 1.6× (super effective)
- Dragon → Steel = 0.625× (not very effective)
- Dragon → Fairy = 0.39× (immune, treated as 0.39× in GO)
- Normal → Ghost = 0.39× (immune)

### Dual Type Examples
- Water → Fire/Rock = 1.6 × 1.6 = **2.56×** (double super effective)
- Water → Dragon/Fire = 1.0 × 1.6 = **1.6×** (neutral × super effective)
- Dragon → Steel/Fairy = 0.625 × 0.39 = **0.24375×** (≈ 0.2457×)
- Fire → Grass/Water = 1.6 × 0.625 = **1.0×** (cancel out to neutral)
- Ground → Rock/Flying = 1.6 × 0.39 = **0.624×** (super effective × immune)

## TypeScript Implementation

```typescript
import typeChart from './type-effectiveness.json';

/**
 * Calculate type effectiveness multiplier
 * @param attackerTypes - Attacker's types (doesn't affect calculation in GO)
 * @param defenderTypes - Defender's types (1 or 2)
 * @param moveType - The type of the attacking move
 * @returns Damage multiplier (0.39, 0.625, 1.0, 1.6, 2.56, etc.)
 */
export function calculateEffectiveness(
  attackerTypes: string[],
  defenderTypes: string[],
  moveType: string
): number {
  let multiplier = 1.0;
  
  for (const defenderType of defenderTypes) {
    const effectiveness = typeChart[moveType]?.[defenderType] ?? 1.0;
    multiplier *= effectiveness;
  }
  
  return multiplier;
}

/**
 * Get STAB (Same Type Attack Bonus) multiplier
 * @param pokemonTypes - Pokémon's types
 * @param moveType - Move type
 * @returns 1.2 if STAB applies, 1.0 otherwise
 */
export function getSTAB(pokemonTypes: string[], moveType: string): number {
  return pokemonTypes.includes(moveType) ? 1.2 : 1.0;
}

/**
 * Calculate total damage multiplier including STAB
 * @param attackerTypes - Attacker's types (for STAB calculation)
 * @param defenderTypes - Defender's types (for effectiveness)
 * @param moveType - The type of the move
 * @returns Combined multiplier (effectiveness × STAB)
 */
export function calculateTotalMultiplier(
  attackerTypes: string[],
  defenderTypes: string[],
  moveType: string
): number {
  const effectiveness = calculateEffectiveness(attackerTypes, defenderTypes, moveType);
  const stab = getSTAB(attackerTypes, moveType);
  return effectiveness * stab;
}

/**
 * Determine effectiveness category for display
 * @param multiplier - The calculated multiplier
 * @returns Category string
 */
export function getEffectivenessCategory(multiplier: number): string {
  if (multiplier >= 2.0) return 'Double Super Effective';
  if (multiplier >= 1.6) return 'Super Effective';
  if (multiplier > 1.0) return 'Effective';
  if (multiplier === 1.0) return 'Neutral';
  if (multiplier > 0.625) return 'Not Very Effective';
  if (multiplier >= 0.39) return 'Resisted';
  return 'Heavily Resisted';
}
```

## Usage Examples

```typescript
// Single type interactions
calculateEffectiveness([], ['fire'], 'water');
// => 1.6 (Water is super effective vs Fire)

calculateEffectiveness([], ['grass'], 'fire');
// => 1.6 (Fire is super effective vs Grass)

calculateEffectiveness([], ['ghost'], 'normal');
// => 0.39 (Normal can't hit Ghost)

// Dual type interactions
calculateEffectiveness([], ['fire', 'rock'], 'water');
// => 2.56 (Water is super effective vs both Fire and Rock)

calculateEffectiveness([], ['dragon', 'fire'], 'water');
// => 1.6 (Water is neutral vs Dragon, super effective vs Fire)

calculateEffectiveness([], ['steel', 'fairy'], 'dragon');
// => 0.24375 (Dragon resisted by Steel, immune to Fairy)

// STAB calculations
calculateTotalMultiplier(['fire', 'ghost'], ['grass'], 'fire');
// => 1.92 (1.6 effectiveness × 1.2 STAB)

calculateTotalMultiplier(['water'], ['fire'], 'ice');
// => 1.6 (super effective, but no STAB)

// Edge cases
calculateEffectiveness([], ['grass', 'water'], 'fire');
// => 1.0 (1.6 vs Grass, 0.625 vs Water = neutral)

calculateEffectiveness([], ['rock', 'flying'], 'ground');
// => 0.624 (1.6 vs Rock, 0.39 vs Flying)
```

## Test Coverage

The type effectiveness matrix includes all 324 interactions (18 types × 18 types):

### Super Effective Interactions (1.6×)
- Fire → Grass, Ice, Bug, Steel
- Water → Fire, Ground, Rock
- Electric → Water, Flying
- Grass → Water, Ground, Rock
- Ice → Grass, Ground, Flying, Dragon
- Fighting → Normal, Ice, Rock, Dark, Steel
- Poison → Grass, Fairy
- Ground → Fire, Electric, Poison, Rock, Steel
- Flying → Grass, Fighting, Bug
- Psychic → Fighting, Poison
- Bug → Grass, Psychic, Dark
- Rock → Fire, Ice, Flying, Bug
- Ghost → Psychic, Ghost
- Dragon → Dragon
- Dark → Psychic, Ghost
- Steel → Ice, Rock, Fairy
- Fairy → Fighting, Dragon, Dark

### Not Very Effective Interactions (0.625×)
- Fire → Fire, Water, Rock, Dragon
- Water → Water, Grass, Dragon
- Electric → Electric, Grass, Dragon
- Grass → Fire, Grass, Poison, Flying, Bug, Dragon, Steel
- Ice → Fire, Water, Ice, Steel
- Fighting → Poison, Flying, Psychic, Bug, Fairy
- Poison → Poison, Ground, Rock, Ghost
- Ground → Grass, Bug
- Flying → Electric, Rock, Steel
- Psychic → Psychic, Steel
- Bug → Fire, Fighting, Poison, Flying, Ghost, Steel, Fairy
- Rock → Fighting, Ground, Steel
- Ghost → Dark
- Dragon → Steel
- Dark → Fighting, Dark, Fairy
- Steel → Fire, Water, Electric, Steel
- Fairy → Fire, Poison, Steel

### Immune Interactions (0.39×)
- Normal → Ghost
- Electric → Ground
- Fighting → Ghost
- Poison → Steel
- Ground → Flying
- Psychic → Dark
- Ghost → Normal
- Dragon → Fairy

## Validation

Run unit tests to verify all 324 interactions:
```bash
npm test type-effectiveness
```

Tests validate:
- All single-type interactions match Pokémon GO mechanics
- Dual-type calculations multiply correctly
- Edge cases (neutral, double resist, etc.)
- STAB bonuses apply correctly
