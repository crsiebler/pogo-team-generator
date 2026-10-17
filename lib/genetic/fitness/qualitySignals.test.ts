import { describe, expect, test, vi } from 'vitest';
import {
  createDefaultLineupScoringContext,
  type LineupScoringContext,
} from './lineupScoring';
import {
  calculateTeamBulk,
  calculateTeamConsistency,
  calculateTeamSafety,
  createBulkScoreLookup,
} from './qualitySignals';
import {
  MissingRankingDataError,
  getOverallRankings,
  getRankingForSpeciesId,
} from '@/lib/data/rankings';

describe('format-aware bulk', () => {
  test('uses defense times HP and bounds outliers against the pool distribution', () => {
    const rankings = Array.from({ length: 10 }, (_, index) => ({
      Pokemon: `pokemon-${index}`,
      Defense: index === 9 ? 10_000 : (index + 1) * 10,
      Stamina: 100,
    }));
    const scores = createBulkScoreLookup(rankings);
    expect(scores.get('pokemon-0')).toBeCloseTo(1 / 9);
    expect(scores.get('pokemon-7')).toBeCloseTo(8 / 9);
    expect(scores.get('pokemon-8')).toBe(1);
    expect(scores.get('pokemon-9')).toBe(1);
    expect(createBulkScoreLookup([...rankings].reverse())).toEqual(scores);
  });

  test('excludes invalid stats and handles an empty pool', () => {
    expect(createBulkScoreLookup([]).size).toBe(0);
    const scores = createBulkScoreLookup([
      { Pokemon: 'valid', Defense: 100, Stamina: 150 },
      { Pokemon: 'zero', Defense: 0, Stamina: 150 },
      { Pokemon: 'negative', Defense: -100, Stamina: -150 },
      { Pokemon: 'nonfinite', Defense: Number.NaN, Stamina: 150 },
    ]);
    expect([...scores]).toEqual([['valid', 1]]);
  });

  test('uses selected-format battle stats through the production context', () => {
    for (const formatId of ['great-league', 'ultra-league'] as const) {
      const context = createDefaultLineupScoringContext(
        formatId,
        0,
        'ranked-default',
      );
      const rankings = getOverallRankings(formatId);
      const ranking = getRankingForSpeciesId('azumarill', 'overall', formatId);
      expect(ranking).toBeDefined();
      const reference = rankings
        .map((entry) => entry.Defense * entry.Stamina)
        .sort((a, b) => a - b)[Math.ceil(rankings.length * 0.9) - 1];
      expect(context.getBulkScore?.('azumarill')).toBeCloseTo(
        Math.min(1, (ranking!.Defense * ranking!.Stamina) / reference),
      );
    }
  });

  test('retains missing members at neutral bulk and respects a supplied zero score', () => {
    const context = makeContext({
      getBulkScore: (id) => (id === 'known' ? 0 : undefined),
    });
    expect(calculateTeamBulk(['known', 'missing'], context)).toBe(0.25);
    expect(calculateTeamBulk([], context)).toBe(0.5);
  });
});

describe('ranking reliability', () => {
  test('uses equivalent percentage and normalized ranking inputs', () => {
    const percentage = makeContext({
      getRoleScore: () => 80,
      getRankingCategoryScore: () => 90,
    });
    const normalized = makeContext({
      getRoleScore: () => 0.8,
      getRankingCategoryScore: () => 0.9,
    });
    expect(calculateTeamSafety(['a'], percentage, 0.4)).toBeCloseTo(
      calculateTeamSafety(['a'], normalized, 0.4),
    );
    expect(calculateTeamConsistency(['a'], percentage, () => 0.4)).toBeCloseTo(
      calculateTeamConsistency(['a'], normalized, () => 0.4),
    );
  });

  test('retains matchup safety when no Switches score is available', () => {
    expect(calculateTeamSafety(['a'], makeContext(), 0.4)).toBe(0.4);
  });

  test.each([0, Number.NaN, Number.POSITIVE_INFINITY])(
    'uses the species fallback for unavailable consistency %s',
    (ranking) => {
      expect(
        calculateTeamConsistency(
          ['a'],
          makeContext({ getRankingCategoryScore: () => ranking }),
          () => 0.4,
        ),
      ).toBe(0.4);
    },
  );

  test('caches a missing consistency export per context without hiding other errors', () => {
    const missing = vi.fn(() => {
      throw new MissingRankingDataError(
        'great-league',
        'consistency',
        'fixture.csv',
      );
    });
    const context = makeContext({ getRankingCategoryScore: missing });
    expect(calculateTeamConsistency(['a', 'b'], context, () => 0.4)).toBe(0.4);
    calculateTeamConsistency(['a'], context, () => 0.4);
    expect(missing).toHaveBeenCalledTimes(1);
    const failure = new Error('malformed ranking');
    expect(() =>
      calculateTeamConsistency(
        ['a'],
        makeContext({
          getRankingCategoryScore: () => {
            throw failure;
          },
        }),
        () => 0.4,
      ),
    ).toThrow(failure);
    expect(
      calculateTeamConsistency(
        ['a'],
        makeContext({ getRankingCategoryScore: () => 100 }),
        () => 0.4,
      ),
    ).toBeGreaterThan(0.4);
  });
});

function makeContext(
  overrides: Partial<LineupScoringContext> = {},
): LineupScoringContext {
  return {
    threats: [],
    getPokemon: () => undefined,
    getRoleScore: () => 0,
    getRankingScore: () => 0,
    getMatchupRating: () => null,
    ...overrides,
  };
}
