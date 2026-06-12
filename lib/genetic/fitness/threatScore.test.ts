import { describe, expect, test } from 'vitest';
import { calculateOptimizerThreatScore } from './threatScore';

describe('calculateOptimizerThreatScore', () => {
  test('returns a lower score for teams with more answers to meta threats', () => {
    const safeResult = calculateOptimizerThreatScore(
      ['safe-a', 'safe-b', 'safe-c'],
      createContext({
        ratings: {
          'safe-a': { medicham: 650, lanturn: 560, registeel: 540 },
          'safe-b': { medicham: 550, lanturn: 450, registeel: 530 },
          'safe-c': { medicham: 450, lanturn: 550, registeel: 450 },
          'exposed-a': { medicham: 450, lanturn: 440, registeel: 430 },
          'exposed-b': { medicham: 420, lanturn: 430, registeel: 440 },
          'exposed-c': { medicham: 410, lanturn: 420, registeel: 430 },
        },
      }),
    );
    const exposedResult = calculateOptimizerThreatScore(
      ['exposed-a', 'exposed-b', 'exposed-c'],
      createContext({
        ratings: {
          'safe-a': { medicham: 650, lanturn: 560, registeel: 540 },
          'safe-b': { medicham: 550, lanturn: 450, registeel: 530 },
          'safe-c': { medicham: 450, lanturn: 550, registeel: 450 },
          'exposed-a': { medicham: 450, lanturn: 440, registeel: 430 },
          'exposed-b': { medicham: 420, lanturn: 430, registeel: 440 },
          'exposed-c': { medicham: 410, lanturn: 420, registeel: 430 },
        },
      }),
    );

    expect(safeResult.score).toBeLessThan(exposedResult.score);
    expect(safeResult.score).toBeGreaterThanOrEqual(0);
    expect(exposedResult.score).toBeLessThanOrEqual(1);
  });

  test('ranks worst top-meta and overall threats first', () => {
    const result = calculateOptimizerThreatScore(
      ['alpha', 'bravo', 'charlie'],
      createContext({
        topThreats: ['no-answer', 'single-answer', 'covered'],
        fullMetaThreats: ['no-answer', 'single-answer', 'covered', 'rare-hole'],
        ratings: {
          alpha: {
            'no-answer': 450,
            'single-answer': 560,
            covered: 560,
            'rare-hole': 450,
          },
          bravo: {
            'no-answer': 440,
            'single-answer': 450,
            covered: 540,
            'rare-hole': 450,
          },
          charlie: {
            'no-answer': 430,
            'single-answer': 450,
            covered: 530,
            'rare-hole': 450,
          },
        },
      }),
    );

    expect(result.topMetaThreats.map((entry) => entry.speciesId)).toEqual([
      'no-answer',
      'single-answer',
      'covered',
    ]);
    expect(result.overallTeamThreats.map((entry) => entry.speciesId)).toEqual([
      'no-answer',
      'rare-hole',
      'single-answer',
      'covered',
    ]);
    expect(result.topMetaThreats[0]?.threatValue).toBeGreaterThan(
      result.topMetaThreats[1]?.threatValue ?? 0,
    );
  });

  test('orders equivalent threats deterministically by rank and species id', () => {
    const result = calculateOptimizerThreatScore(
      ['alpha', 'bravo', 'charlie'],
      createContext({
        topThreats: ['zygarde', 'azumarill', 'bastiodon'],
        fullMetaThreats: ['zygarde', 'azumarill', 'bastiodon'],
        ranks: { zygarde: 8, azumarill: 8, bastiodon: 4 },
        ratings: {
          alpha: { zygarde: 500, azumarill: 500, bastiodon: 500 },
          bravo: { zygarde: 500, azumarill: 500, bastiodon: 500 },
          charlie: { zygarde: 500, azumarill: 500, bastiodon: 500 },
        },
      }),
    );

    expect(result.topMetaThreats.map((entry) => entry.speciesId)).toEqual([
      'bastiodon',
      'azumarill',
      'zygarde',
    ]);
  });

  test('excludes threats with no matchup rows from evaluated count', () => {
    const result = calculateOptimizerThreatScore(
      ['alpha', 'bravo', 'charlie'],
      createContext({
        topThreats: ['evaluated', 'missing'],
        fullMetaThreats: ['evaluated', 'missing'],
        ratings: {
          alpha: { evaluated: 520 },
          bravo: { evaluated: 480 },
          charlie: { evaluated: 470 },
        },
      }),
    );

    expect(result.evaluatedCount).toBe(1);
    expect(result.topMetaThreats).toHaveLength(1);
    expect(result.topMetaThreats[0]?.speciesId).toBe('evaluated');
  });

  test('uses configurable pool weights for top-meta and full-meta scoring', () => {
    const result = calculateOptimizerThreatScore(
      ['alpha', 'bravo', 'charlie'],
      createContext({
        topThreats: ['top-hole'],
        fullMetaThreats: ['full-covered'],
        ratings: {
          alpha: { 'top-hole': 450, 'full-covered': 560 },
          bravo: { 'top-hole': 450, 'full-covered': 560 },
          charlie: { 'top-hole': 450, 'full-covered': 560 },
        },
      }),
      { poolWeights: { topMeta: 0.9, fullMeta: 0.1 } },
    );

    expect(result.score).toBeCloseTo(0.9);
    expect(result.pools.topMeta).toEqual({
      score: 1,
      evaluatedCount: 1,
      weight: 0.9,
    });
    expect(result.pools.fullMeta).toEqual({
      score: 0,
      evaluatedCount: 1,
      weight: 0.1,
    });
  });

  test('keeps full-meta risk contributing without overpowering top-meta risk', () => {
    const coveredTopExposedFull = calculateOptimizerThreatScore(
      ['alpha', 'bravo', 'charlie'],
      createContext({
        topThreats: ['top-covered'],
        fullMetaThreats: ['full-hole'],
        ratings: {
          alpha: { 'top-covered': 560, 'full-hole': 450 },
          bravo: { 'top-covered': 560, 'full-hole': 450 },
          charlie: { 'top-covered': 560, 'full-hole': 450 },
        },
      }),
      { poolWeights: { topMeta: 0.75, fullMeta: 0.25 } },
    );
    const exposedTopCoveredFull = calculateOptimizerThreatScore(
      ['alpha', 'bravo', 'charlie'],
      createContext({
        topThreats: ['top-hole'],
        fullMetaThreats: ['full-covered'],
        ratings: {
          alpha: { 'top-hole': 450, 'full-covered': 560 },
          bravo: { 'top-hole': 450, 'full-covered': 560 },
          charlie: { 'top-hole': 450, 'full-covered': 560 },
        },
      }),
      { poolWeights: { topMeta: 0.75, fullMeta: 0.25 } },
    );

    expect(coveredTopExposedFull.score).toBeCloseTo(0.25);
    expect(exposedTopCoveredFull.score).toBeCloseTo(0.75);
    expect(exposedTopCoveredFull.score).toBeGreaterThan(
      coveredTopExposedFull.score,
    );
  });

  test('normalizes configured pool weights and only uses evaluated pools', () => {
    const result = calculateOptimizerThreatScore(
      ['alpha', 'bravo', 'charlie'],
      createContext({
        topThreats: ['top-hole'],
        fullMetaThreats: ['missing-full'],
        ratings: {
          alpha: { 'top-hole': 450 },
          bravo: { 'top-hole': 450 },
          charlie: { 'top-hole': 450 },
        },
      }),
      { poolWeights: { topMeta: 3, fullMeta: 1 } },
    );

    expect(result.score).toBe(1);
    expect(result.pools.topMeta).toEqual({
      score: 1,
      evaluatedCount: 1,
      weight: 1,
    });
    expect(result.pools.fullMeta).toEqual({
      score: null,
      evaluatedCount: 0,
      weight: 0,
    });
  });

  test('normalizes to full-meta weight when only full-meta is evaluated', () => {
    const result = calculateOptimizerThreatScore(
      ['alpha', 'bravo', 'charlie'],
      createContext({
        topThreats: ['missing-top'],
        fullMetaThreats: ['full-hole'],
        ratings: {
          alpha: { 'full-hole': 450 },
          bravo: { 'full-hole': 450 },
          charlie: { 'full-hole': 450 },
        },
      }),
      { poolWeights: { topMeta: 3, fullMeta: 1 } },
    );

    expect(result.score).toBe(1);
    expect(result.pools).toEqual({
      topMeta: { score: null, evaluatedCount: 0, weight: 0 },
      fullMeta: { score: 1, evaluatedCount: 1, weight: 1 },
    });
  });

  test('allows zero-valued configured weights to disable a pool', () => {
    const result = calculateOptimizerThreatScore(
      ['alpha', 'bravo', 'charlie'],
      createContext({
        topThreats: ['top-hole'],
        fullMetaThreats: ['full-hole'],
        ratings: {
          alpha: { 'top-hole': 450, 'full-hole': 450 },
          bravo: { 'top-hole': 450, 'full-hole': 450 },
          charlie: { 'top-hole': 450, 'full-hole': 450 },
        },
      }),
      { poolWeights: { topMeta: 1, fullMeta: 0 } },
    );

    expect(result.score).toBe(1);
    expect(result.pools).toEqual({
      topMeta: { score: 1, evaluatedCount: 1, weight: 1 },
      fullMeta: { score: 1, evaluatedCount: 1, weight: 0 },
    });
  });

  test('falls back to default weights when full-meta would overpower top-meta', () => {
    const result = calculateOptimizerThreatScore(
      ['alpha', 'bravo', 'charlie'],
      createContext({
        topThreats: ['top-hole'],
        fullMetaThreats: ['full-covered'],
        ratings: {
          alpha: { 'top-hole': 450, 'full-covered': 560 },
          bravo: { 'top-hole': 450, 'full-covered': 560 },
          charlie: { 'top-hole': 450, 'full-covered': 560 },
        },
      }),
      { poolWeights: { topMeta: 0.2, fullMeta: 0.8 } },
    );

    expect(result.score).toBeCloseTo(0.7);
    expect(result.pools).toEqual({
      topMeta: { score: 1, evaluatedCount: 1, weight: 0.7 },
      fullMeta: { score: 0, evaluatedCount: 1, weight: 0.3 },
    });
  });
});

function createContext(overrides: {
  topThreats?: string[];
  fullMetaThreats?: string[];
  ranks?: Record<string, number>;
  ratings: Record<string, Record<string, number>>;
}): Parameters<typeof calculateOptimizerThreatScore>[1] {
  const topThreats = overrides.topThreats ?? ['medicham', 'lanturn'];
  const fullMetaThreats = overrides.fullMetaThreats ?? [
    ...topThreats,
    'registeel',
  ];

  return {
    topThreats,
    fullMetaThreats,
    getThreatName: (speciesId) => speciesId,
    getThreatRank: (speciesId) =>
      overrides.ranks?.[speciesId] ?? fullMetaThreats.indexOf(speciesId) + 1,
    getMatchupRating: (speciesId, threatSpeciesId) =>
      overrides.ratings[speciesId]?.[threatSpeciesId] ?? null,
  };
}
