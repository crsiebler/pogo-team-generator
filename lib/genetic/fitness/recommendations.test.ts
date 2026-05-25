import { describe, expect, test } from 'vitest';
import type { LineupScoreResult } from './lineupScoring';
import {
  buildPlayPokemonRosterRecommendations,
  type PlayPokemonRosterRecommendationResult,
} from './recommendations';
import type { OrderedLineup } from '@/lib/types';

const roster = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];

describe('buildPlayPokemonRosterRecommendations', () => {
  test('returns the top five recommended lineups by default with diagnostics', () => {
    const result = buildPlayPokemonRosterRecommendations(roster, [
      makeLineupResult(
        { lead: 'alpha', switch: 'bravo', closer: 'charlie' },
        0.91,
        { resourcePathMetrics: true },
      ),
      makeLineupResult(
        { lead: 'delta', switch: 'echo', closer: 'foxtrot' },
        0.86,
      ),
      makeLineupResult(
        { lead: 'bravo', switch: 'charlie', closer: 'delta' },
        0.82,
      ),
      makeLineupResult(
        { lead: 'echo', switch: 'foxtrot', closer: 'alpha' },
        0.78,
      ),
      makeLineupResult(
        { lead: 'charlie', switch: 'delta', closer: 'echo' },
        0.74,
      ),
      makeLineupResult(
        { lead: 'foxtrot', switch: 'alpha', closer: 'bravo' },
        0.7,
      ),
    ]);

    expect(result.recommendedLineups).toHaveLength(5);
    expect(result.recommendedLineups[0]).toEqual(
      expect.objectContaining({
        lineup: { lead: 'alpha', switch: 'bravo', closer: 'charlie' },
        score: 0.91,
        coverageMetrics: expect.objectContaining({ coverageRate: 0.91 }),
        coveredThreats: ['threat-a'],
        weaknesses: ['threat-b'],
        diagnosticLabel: 'ABC',
        resourcePathMetrics: expect.objectContaining({
          balanced: { available: true, score: 0.8 },
        }),
      }),
    );
    expect(result.recommendedLineups.map((lineup) => lineup.score)).toEqual([
      0.91, 0.86, 0.82, 0.78, 0.74,
    ]);
  });

  test('calculates bench utility from recommended lineup appearances', () => {
    const result = buildPlayPokemonRosterRecommendations(
      roster,
      [
        makeLineupResult(
          { lead: 'alpha', switch: 'bravo', closer: 'charlie' },
          0.9,
        ),
        makeLineupResult(
          { lead: 'alpha', switch: 'delta', closer: 'echo' },
          0.8,
        ),
      ],
      { limit: 2, lowUtilityThreshold: 0.6 },
    );

    expectBenchUtility(result, 'alpha', {
      utilityScore: 1,
      totalAppearances: 2,
      leadAppearances: 2,
      switchAppearances: 0,
      closerAppearances: 0,
      warnings: [],
    });
    expectBenchUtility(result, 'bravo', {
      utilityScore: 0.5,
      totalAppearances: 1,
      leadAppearances: 0,
      switchAppearances: 1,
      closerAppearances: 0,
      warnings: ['low-utility'],
    });
    expectBenchUtility(result, 'foxtrot', {
      utilityScore: 0,
      totalAppearances: 0,
      leadAppearances: 0,
      switchAppearances: 0,
      closerAppearances: 0,
      warnings: ['unbringable'],
    });
  });
});

function expectBenchUtility(
  result: PlayPokemonRosterRecommendationResult,
  speciesId: string,
  expected: {
    utilityScore: number;
    totalAppearances: number;
    leadAppearances: number;
    switchAppearances: number;
    closerAppearances: number;
    warnings: string[];
  },
): void {
  const utility = result.benchUtility.find(
    (benchUtility) => benchUtility.speciesId === speciesId,
  );

  expect(utility).toEqual(
    expect.objectContaining({
      ...expected,
      utilityScore: expect.closeTo(expected.utilityScore, 3),
    }),
  );
}

function makeLineupResult(
  lineup: OrderedLineup,
  score: number,
  options: { resourcePathMetrics?: boolean } = {},
): LineupScoreResult {
  return {
    lineup,
    score,
    coverageMetrics: {
      coverageRate: score,
      dominatingMatchupCount: 1,
      overwhelmingLossCount: 0,
      singleAnswerThreatCount: 0,
    },
    coveredThreats: ['threat-a'],
    weaknesses: ['threat-b'],
    singleAnswerRisks: [],
    diagnosticLabel: 'ABC',
    resourcePathMetrics: options.resourcePathMetrics
      ? {
          balanced: { available: true, score: 0.8 },
          shieldSpend: { available: false },
          shieldSave: { available: true, score: 0.7 },
        }
      : undefined,
    componentScores: {
      rankingQuality: 0.5,
      roleStrength: 0.5,
      matchupCoverage: 0.5,
      typeSynergy: 0.5,
      typeDiversity: 0.5,
      moveCoverage: 0.5,
      energyPressure: 0.5,
      statBalance: 0.5,
      singleAnswerReliability: 0.5,
      coreBreakerReliability: 0.5,
      shieldReliability: 0.5,
    },
  };
}
