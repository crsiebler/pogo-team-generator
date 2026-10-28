import { describe, expect, it } from 'vitest';
import {
  OPTIMIZER_HARD_CONSTRAINT_CATEGORIES,
  OPTIMIZER_SCORE_COMPONENT_WEIGHTS,
  aggregateWeightedScore,
  createNormalizedScoreBreakdown,
} from './scoreBreakdown';
import { calculateOptimizerThreatScore } from './threatScore';

describe('optimizer weighted score breakdown', () => {
  it('uses the documented normalized component weights', () => {
    expect(OPTIMIZER_SCORE_COMPONENT_WEIGHTS).toEqual({
      synergy: 0.1,
      coverage: 0,
      safety: 0.4,
      consistency: 0.3,
      bulk: 0.2,
      defensiveRatio: 0,
      offensiveRatio: 0,
      role: 0,
    });
    expect(Object.isFrozen(OPTIMIZER_SCORE_COMPONENT_WEIGHTS)).toBe(true);
  });

  it('prioritizes equal gains in safety, consistency, bulk, then synergy', () => {
    const base = {
      synergy: 0.5,
      coverage: 0.5,
      safety: 0.5,
      consistency: 0.5,
      bulk: 0.5,
      defensiveRatio: 0.5,
      offensiveRatio: 0.5,
      role: 0.5,
    };
    const scores = ['safety', 'consistency', 'bulk', 'synergy'].map(
      (component) => aggregateWeightedScore({ ...base, [component]: 0.7 }),
    );
    for (let index = 1; index < scores.length; index++) {
      expect(scores[index - 1]).toBeGreaterThan(scores[index]);
    }
  });

  it('prefers the lower threat score when component quality is equal', () => {
    const components = {
      synergy: 0.7,
      coverage: 0.7,
      safety: 0.7,
      consistency: 0.7,
      bulk: 0.7,
      defensiveRatio: 0.7,
      offensiveRatio: 0.7,
      role: 0.7,
    };
    const score = (rating: number): number =>
      createNormalizedScoreBreakdown(components, undefined, {
        threatScore: calculateOptimizerThreatScore(['a', 'b', 'c'], {
          topThreats: ['threat'],
          fullMetaThreats: ['threat'],
          getThreatName: (id) => id,
          getThreatRank: () => 1,
          getMatchupRating: () => rating,
        }),
      }).score;
    expect(score(600)).toBeGreaterThan(score(450));
  });

  it('combines threat resilience and quality with the requested weighted priorities', () => {
    const components = {
      coverage: 0.9,
      safety: 0.8,
      consistency: 0.6,
      bulk: 0.4,
      synergy: 0.2,
      defensiveRatio: 0.9,
      offensiveRatio: 0.9,
      role: 0.9,
    };
    const score = (risk: number, quality = components): number =>
      createNormalizedScoreBreakdown(quality, undefined, {
        threatRisk: { score: risk, evaluatedCount: 10 },
      }).score;
    expect(score(0.3)).toBeCloseTo(
      0.5 * 0.7 + 0.2 * 0.8 + 0.15 * 0.6 + 0.1 * 0.4 + 0.05 * 0.2,
    );
    expect(score(0.2)).toBeGreaterThan(
      score(0.4, { ...components, safety: 1 }),
    );
    expect(score(0.3, { ...components, safety: 0.9 })).toBeGreaterThan(
      score(0.3),
    );
    // Weighted tradeoffs remain possible; this is not strict threat-only sorting.
    expect(score(0.31, { ...components, safety: 1 })).toBeGreaterThan(
      score(0.3),
    );
    expect(
      score(0.3, {
        ...components,
        coverage: 0,
        defensiveRatio: 0,
        offensiveRatio: 0,
        role: 0,
      }),
    ).toBe(score(0.3));
  });

  it('limits hard constraints to validity and legality concerns', () => {
    expect(OPTIMIZER_HARD_CONSTRAINT_CATEGORIES).toEqual([
      'validity',
      'legality',
    ]);
  });

  it('does not reward missing or invalid threat evidence as zero risk', () => {
    const components = {
      synergy: 0.7,
      coverage: 0.7,
      safety: 0.7,
      consistency: 0.7,
      bulk: 0.7,
      defensiveRatio: 0.7,
      offensiveRatio: 0.7,
      role: 0.7,
    };
    for (const threatRisk of [
      { score: 0, evaluatedCount: 0 },
      { score: Number.NaN, evaluatedCount: 1 },
    ]) {
      const result = createNormalizedScoreBreakdown(components, undefined, {
        threatRisk,
      });
      expect(result.threatContribution).toBe(0);
      expect(result.score).toBeCloseTo(0.35);
    }
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
    expect(breakdown.score).toBeCloseTo(0.68, 5);
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
    expect(breakdown.score).toBeCloseTo(0.26, 5);
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
    const modestSafetyOnly = aggregateWeightedScore({
      synergy: 0,
      coverage: 0,
      safety: 0.2,
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
    expect(modestSafetyOnly).toBeGreaterThan(perfectRoleOnly);
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

    expect(onlyRoleIsElite).toBe(0);
  });
});
