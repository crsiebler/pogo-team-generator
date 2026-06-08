import { describe, expect, test } from 'vitest';
import type { LineupScoreResult, LineupScoringContext } from './lineupScoring';
import {
  buildGblLineupRecommendation,
  buildPlayPokemonRosterRecommendations,
} from './recommendations';
import { createNormalizedScoreBreakdown } from '@/lib/genetic/fitness/scoreBreakdown';
import type { OrderedLineup, Pokemon } from '@/lib/types';

describe('buildPlayPokemonRosterRecommendations', () => {
  test('returns the top five recommended lineups by default with diagnostics', () => {
    const result = buildPlayPokemonRosterRecommendations([
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

    expect(Object.keys(result)).toEqual(['recommendedLineups']);
    expect(result).not.toHaveProperty('benchUtility');
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
});

describe('buildGblLineupRecommendation', () => {
  test('scores every ordered role permutation and returns the best lineup', () => {
    const scoredLineups: OrderedLineup[] = [];
    const result = buildGblLineupRecommendation(['alpha', 'bravo', 'charlie'], {
      scoreLineup: (lineup) => {
        scoredLineups.push(lineup);

        return makeLineupResult(
          lineup,
          lineup.lead === 'bravo' &&
            lineup.switch === 'charlie' &&
            lineup.closer === 'alpha'
            ? 0.94
            : 0.5,
        );
      },
    });

    expect(scoredLineups).toHaveLength(6);
    expect(scoredLineups).toEqual(
      expect.arrayContaining([
        { lead: 'alpha', switch: 'bravo', closer: 'charlie' },
        { lead: 'alpha', switch: 'charlie', closer: 'bravo' },
        { lead: 'bravo', switch: 'alpha', closer: 'charlie' },
        { lead: 'bravo', switch: 'charlie', closer: 'alpha' },
        { lead: 'charlie', switch: 'alpha', closer: 'bravo' },
        { lead: 'charlie', switch: 'bravo', closer: 'alpha' },
      ]),
    );
    expect(result).toEqual(
      expect.objectContaining({
        lineup: { lead: 'bravo', switch: 'charlie', closer: 'alpha' },
        score: 0.94,
        coverageMetrics: expect.objectContaining({ coverageRate: 0.94 }),
        coveredThreats: ['threat-a'],
        weaknesses: ['threat-b'],
        diagnosticLabel: 'ABC',
      }),
    );
  });

  test('rejects non-three-Pokemon GBL teams', () => {
    expect(() => buildGblLineupRecommendation(['alpha', 'bravo'])).toThrow(
      'GBL lineup recommendations require exactly 3 Pokemon.',
    );
  });

  test('rejects duplicate GBL team members before scoring', () => {
    expect(() =>
      buildGblLineupRecommendation(['alpha', 'alpha', 'bravo']),
    ).toThrow('GBL lineup recommendations require 3 unique Pokemon.');
  });

  test('rejects same-base GBL team members before scoring', () => {
    expect(() =>
      buildGblLineupRecommendation(['marowak', 'marowak_alolan', 'azumarill']),
    ).toThrow('GBL lineup recommendations require 3 unique Pokemon.');
  });

  test('uses canonical lineup scoring when a scoring context is provided', () => {
    const result = buildGblLineupRecommendation(['alpha', 'bravo', 'charlie'], {
      context: createGblTestContext(),
    });

    expect(result.lineup).toEqual({
      lead: 'bravo',
      switch: 'charlie',
      closer: 'alpha',
    });
    expect(result.coverageMetrics).toMatchObject({
      coverageRate: 1,
      dominatingMatchupCount: 0,
      overwhelmingLossCount: 0,
      singleAnswerThreatCount: 0,
    });
    expect(result.coveredThreats).toEqual(['threat-a']);
    expect(result.weaknesses).toEqual([]);
    expect(result.diagnosticLabel).toBe('ABC');
  });
});

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
    scoreBreakdown: createNormalizedScoreBreakdown({
      synergy: score,
      coverage: score,
      safety: score,
      consistency: 0.5,
      bulk: 0.5,
      defensiveRatio: 0.5,
      offensiveRatio: 0.5,
      role: 0.5,
    }),
  };
}

function createGblTestContext(): LineupScoringContext {
  const pokemonById: Record<string, Pokemon> = {
    alpha: makePokemon('alpha', ['water']),
    bravo: makePokemon('bravo', ['steel']),
    charlie: makePokemon('charlie', ['ghost']),
  };

  return {
    threats: ['threat-a'],
    getPokemon: (speciesId) => pokemonById[speciesId],
    getRankingScore: () => 80,
    getRoleScore: (speciesId, role) => {
      if (
        (speciesId === 'bravo' && role === 'lead') ||
        (speciesId === 'charlie' && role === 'switch') ||
        (speciesId === 'alpha' && role === 'closer')
      ) {
        return 1;
      }

      return 0.1;
    },
    getMatchupRating: () => 550,
    getMatchupQualityScore: () => 0.5,
  };
}

function makePokemon(speciesId: string, types: string[]): Pokemon {
  return {
    dex: 1,
    speciesName: speciesId,
    speciesId,
    baseStats: { atk: 140, def: 140, hp: 140 },
    types,
    fastMoves: [],
    chargedMoves: [],
    tags: [],
    defaultIVs: {},
    buddyDistance: 3,
    thirdMoveCost: 10000,
    released: true,
  };
}
