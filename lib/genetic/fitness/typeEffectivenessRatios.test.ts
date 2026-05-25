import {
  calculateDefensiveTypeRatio,
  calculateOffensiveTypeRatio,
  calculateTypeEffectivenessMultiplier,
} from './typeEffectivenessRatios';

describe('type effectiveness ratios', () => {
  test('multiplies both defender types for dual-type defenders', () => {
    expect(
      calculateTypeEffectivenessMultiplier('water', ['fire', 'rock']),
    ).toBe(2.56);
  });

  test('uses Pokemon GO immunity-style resistance instead of zero damage', () => {
    expect(calculateTypeEffectivenessMultiplier('normal', ['ghost'])).toBe(
      0.39,
    );
    expect(calculateTypeEffectivenessMultiplier('dragon', ['fairy'])).toBe(
      0.39,
    );
  });

  test('handles neutral cancellation for mixed dual-type defenders', () => {
    expect(
      calculateTypeEffectivenessMultiplier('fire', ['grass', 'water']),
    ).toBe(1);
  });

  test('rewards double resistance more than neutral defensive exposure', () => {
    const doubleResistance = calculateDefensiveTypeRatio({
      defenderTypes: [['steel', 'fairy']],
      incomingAttackTypes: ['dragon'],
    });
    const neutralExposure = calculateDefensiveTypeRatio({
      defenderTypes: [['normal']],
      incomingAttackTypes: ['water'],
    });

    expect(doubleResistance).toBeGreaterThan(neutralExposure);
    expect(doubleResistance).toBeLessThanOrEqual(1);
    expect(neutralExposure).toBeGreaterThanOrEqual(0);
  });

  test('counts two ordinary resistances as a double resistance', () => {
    expect(
      calculateTypeEffectivenessMultiplier('grass', ['fire', 'poison']),
    ).toBe(0.390625);

    const doubleResistance = calculateDefensiveTypeRatio({
      defenderTypes: [['fire', 'poison']],
      incomingAttackTypes: ['grass'],
    });
    const singleResistance = calculateDefensiveTypeRatio({
      defenderTypes: [['fire']],
      incomingAttackTypes: ['grass'],
    });

    expect(doubleResistance).toBeGreaterThan(singleResistance);
  });

  test('rewards double super effective offensive pressure over neutral pressure', () => {
    const doubleSuperEffective = calculateOffensiveTypeRatio({
      attackingMoveTypes: ['water'],
      defenderTypeProfiles: [['fire', 'rock']],
    });
    const neutral = calculateOffensiveTypeRatio({
      attackingMoveTypes: ['water'],
      defenderTypeProfiles: [['normal']],
    });

    expect(doubleSuperEffective).toBeGreaterThan(neutral);
    expect(doubleSuperEffective).toBeLessThanOrEqual(1);
    expect(neutral).toBeGreaterThanOrEqual(0);
  });

  test('penalizes double defensive weakness more than single weakness', () => {
    const doubleWeakness = calculateDefensiveTypeRatio({
      defenderTypes: [['water', 'flying']],
      incomingAttackTypes: ['electric'],
    });
    const singleWeakness = calculateDefensiveTypeRatio({
      defenderTypes: [['water']],
      incomingAttackTypes: ['electric'],
    });

    expect(doubleWeakness).toBeLessThan(singleWeakness);
  });

  test('penalizes shared weaknesses in defensive ratio scoring', () => {
    const sharedWeakness = calculateDefensiveTypeRatio({
      defenderTypes: [['water'], ['flying'], ['water', 'flying']],
      incomingAttackTypes: ['electric'],
    });
    const distributedResistance = calculateDefensiveTypeRatio({
      defenderTypes: [['ground'], ['grass'], ['electric']],
      incomingAttackTypes: ['electric'],
    });

    expect(distributedResistance).toBeGreaterThan(sharedWeakness);
  });
});
