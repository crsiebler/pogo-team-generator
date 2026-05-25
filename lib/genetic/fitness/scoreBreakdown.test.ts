import { describe, expect, it } from 'vitest';
import {
  OPTIMIZER_HARD_CONSTRAINT_CATEGORIES,
  OPTIMIZER_SCORE_COMPONENT_WEIGHTS,
  aggregateWeightedScore,
  createNormalizedScoreBreakdown,
} from './scoreBreakdown';

describe('optimizer weighted score breakdown', () => {
  it('uses the documented normalized component weights', () => {
    expect(OPTIMIZER_SCORE_COMPONENT_WEIGHTS).toEqual({
      synergy: 0.24,
      coverage: 0.21,
      safety: 0.17,
      consistency: 0.13,
      bulk: 0.1,
      defensiveRatio: 0.07,
      offensiveRatio: 0.05,
      role: 0.03,
    });
    expect(Object.isFrozen(OPTIMIZER_SCORE_COMPONENT_WEIGHTS)).toBe(true);
  });

  it('limits hard constraints to validity and legality concerns', () => {
    expect(OPTIMIZER_HARD_CONSTRAINT_CATEGORIES).toEqual([
      'validity',
      'legality',
    ]);
  });

  it('bounds every score component to the normalized 0..1 range before aggregation', () => {
    const breakdown = createNormalizedScoreBreakdown({
      synergy: 1.5,
      coverage: 1.2,
      safety: 0.8,
      consistency: 0.6,
      bulk: 0.4,
      defensiveRatio: -0.2,
      offensiveRatio: 0.2,
      role: 2,
    });

    expect(breakdown.components).toEqual({
      synergy: 1,
      coverage: 1,
      safety: 0.8,
      consistency: 0.6,
      bulk: 0.4,
      defensiveRatio: 0,
      offensiveRatio: 0.2,
      role: 1,
    });
    expect(breakdown.score).toBeCloseTo(0.744, 5);
  });

  it('normalizes non-finite score components before aggregation', () => {
    const breakdown = createNormalizedScoreBreakdown({
      synergy: Number.NaN,
      coverage: Number.POSITIVE_INFINITY,
      safety: Number.NEGATIVE_INFINITY,
      consistency: 0.6,
      bulk: 0.4,
      defensiveRatio: 0.3,
      offensiveRatio: 0.2,
      role: 0.1,
    });

    expect(breakdown.components).toEqual({
      synergy: 0,
      coverage: 1,
      safety: 0,
      consistency: 0.6,
      bulk: 0.4,
      defensiveRatio: 0.3,
      offensiveRatio: 0.2,
      role: 0.1,
    });
    expect(Number.isNaN(breakdown.score)).toBe(false);
    expect(breakdown.score).toBeCloseTo(0.362, 5);
  });

  it('lets lower-priority categories influence close outcomes without dominating higher-priority components', () => {
    const strongerLowerPriority = aggregateWeightedScore({
      synergy: 0.7,
      coverage: 0.7,
      safety: 0.7,
      consistency: 0.9,
      bulk: 0.9,
      defensiveRatio: 0.9,
      offensiveRatio: 0.9,
      role: 0.9,
    });
    const weakerLowerPriority = aggregateWeightedScore({
      synergy: 0.7,
      coverage: 0.7,
      safety: 0.7,
      consistency: 0.2,
      bulk: 0.2,
      defensiveRatio: 0.2,
      offensiveRatio: 0.2,
      role: 0.2,
    });
    const modestCoverageOnly = aggregateWeightedScore({
      synergy: 0,
      coverage: 0.2,
      safety: 0,
      consistency: 0,
      bulk: 0,
      defensiveRatio: 0,
      offensiveRatio: 0,
      role: 0,
    });
    const perfectRoleOnly = aggregateWeightedScore({
      synergy: 0,
      coverage: 0,
      safety: 0,
      consistency: 0,
      bulk: 0,
      defensiveRatio: 0,
      offensiveRatio: 0,
      role: 1,
    });

    expect(strongerLowerPriority).toBeGreaterThan(weakerLowerPriority);
    expect(modestCoverageOnly).toBeGreaterThan(perfectRoleOnly);
  });

  it('keeps higher-priority categories ahead when score gaps are comparable', () => {
    const betterSynergy = aggregateWeightedScore({
      synergy: 0.7,
      coverage: 0.7,
      safety: 0.7,
      consistency: 0.2,
      bulk: 0.2,
      defensiveRatio: 0.2,
      offensiveRatio: 0.2,
      role: 0.2,
    });
    const betterRole = aggregateWeightedScore({
      synergy: 0.2,
      coverage: 0.7,
      safety: 0.7,
      consistency: 0.2,
      bulk: 0.2,
      defensiveRatio: 0.2,
      offensiveRatio: 0.2,
      role: 0.7,
    });

    expect(betterSynergy).toBeGreaterThan(betterRole);
  });

  it('prevents role score alone from dominating the weighted score', () => {
    const onlyRoleIsElite = aggregateWeightedScore({
      synergy: 0,
      coverage: 0,
      safety: 0,
      consistency: 0,
      bulk: 0,
      defensiveRatio: 0,
      offensiveRatio: 0,
      role: 1,
    });

    expect(onlyRoleIsElite).toBe(0.03);
  });
});
