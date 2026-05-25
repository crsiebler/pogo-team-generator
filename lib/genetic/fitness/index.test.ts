import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scoreOrderedLineup } from './lineupScoring';
import { buildGblLineupRecommendation } from './recommendations';
import { scoreFastRosterLineup, scorePlayPokemonRoster } from './rosterScoring';
import {
  calculateLineupAwareFitness,
  createLineupAwareFitnessContext,
  evaluatePopulation,
} from './index';
import type { Chromosome, OrderedLineup } from '@/lib/types';

vi.mock('./lineupScoring', () => ({
  createDefaultLineupScoringContext: vi.fn(() => ({
    threats: ['azumarill'],
    getPokemon: vi.fn(),
    getRankingScore: vi.fn(() => 80),
    getRoleScore: vi.fn(() => 0.8),
    getMatchupRating: vi.fn(() => 600),
  })),
  scoreOrderedLineup: vi.fn((lineup: OrderedLineup) => ({
    lineup,
    score: 0.7,
    coverageMetrics: {
      coverageRate: 1,
      dominatingMatchupCount: 1,
      overwhelmingLossCount: 0,
      singleAnswerThreatCount: 0,
    },
    coveredThreats: ['azumarill'],
    weaknesses: [],
    singleAnswerRisks: [],
    diagnosticLabel: 'ABC',
    componentScores: {
      rankingQuality: 0.7,
      roleStrength: 0.7,
      matchupCoverage: 0.7,
      typeSynergy: 0.7,
      typeDiversity: 0.7,
      moveCoverage: 0.7,
      energyPressure: 0.7,
      statBalance: 0.7,
      singleAnswerReliability: 0.7,
      coreBreakerReliability: 0.7,
      shieldReliability: 0.7,
    },
  })),
}));

vi.mock('./recommendations', () => ({
  buildGblLineupRecommendation: vi.fn(() => ({
    lineup: { lead: 'a', switch: 'b', closer: 'c' },
    score: 0.82,
    coverageMetrics: {
      coverageRate: 1,
      dominatingMatchupCount: 1,
      overwhelmingLossCount: 0,
      singleAnswerThreatCount: 0,
    },
    coveredThreats: ['azumarill'],
    weaknesses: [],
    diagnosticLabel: 'ABC',
  })),
  buildPlayPokemonRosterRecommendations: vi.fn(() => ({
    recommendedLineups: [],
    benchUtility: [],
  })),
}));

vi.mock('./rosterScoring', () => ({
  scoreFastRosterLineup: vi.fn((lineup: OrderedLineup) => ({
    lineup,
    score: 0.65,
    coverageMetrics: {
      coverageRate: 1,
      dominatingMatchupCount: 1,
      overwhelmingLossCount: 0,
      singleAnswerThreatCount: 0,
    },
    coveredThreats: ['azumarill'],
    weaknesses: [],
    singleAnswerRisks: [],
    diagnosticLabel: 'unknown',
    componentScores: {
      rankingQuality: 0.65,
      roleStrength: 0.65,
      matchupCoverage: 0.65,
      typeSynergy: 0.5,
      typeDiversity: 0.5,
      moveCoverage: 0.5,
      energyPressure: 0.5,
      statBalance: 0.5,
      singleAnswerReliability: 0.65,
      coreBreakerReliability: 0.65,
      shieldReliability: 0.5,
    },
  })),
  scorePlayPokemonRoster: vi.fn((roster, context, config) => {
    const lineup = { lead: roster[0], switch: roster[1], closer: roster[2] };
    context.scoreLineup(lineup);
    context.scoreLineup(lineup);

    return {
      roster,
      fitness: config.mode === 'fast' ? 0.91 : 0.73,
      evaluatedLineupCount: 60,
      metrics: {
        viableLineupCount: 5,
        topLineupQuality: 0.9,
        topNLineupDepth: 0.8,
        dominatingMatchupRate: 0.2,
        overwhelmingLossRate: 0.1,
        singleAnswerRisks: [],
        viableLeadDiversity: 3,
        benchUtilitySummary: [],
      },
    };
  }),
}));

function createChromosome(team: string[]): Chromosome {
  return { team, fitness: 0 };
}

describe('lineup-aware fitness entry point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scores PlayPokemon chromosomes through fast roster scoring with cached lineup scoring', () => {
    const chromosome = createChromosome(['a', 'b', 'c', 'd', 'e', 'f']);
    const context = createLineupAwareFitnessContext('jungle-cup');

    const fitness = calculateLineupAwareFitness(
      chromosome,
      'PlayPokemon',
      'jungle-cup',
      context,
    );

    expect(fitness).toBe(0.91);
    expect(scorePlayPokemonRoster).toHaveBeenCalledWith(
      chromosome.team,
      expect.objectContaining({ scoreLineup: expect.any(Function) }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    expect(scoreFastRosterLineup).toHaveBeenCalledTimes(1);
    expect(scoreOrderedLineup).not.toHaveBeenCalled();
  });

  it('scores GBL chromosomes through the canonical role-ordered lineup helper', () => {
    const chromosome = createChromosome(['a', 'b', 'c']);

    const fitness = calculateLineupAwareFitness(chromosome, 'GBL');

    expect(fitness).toBe(0.82);
    expect(buildGblLineupRecommendation).toHaveBeenCalledWith(
      chromosome.team,
      expect.objectContaining({ scoreLineup: expect.any(Function) }),
    );
  });

  it('evaluates a population without accepting an algorithm routing parameter', () => {
    const population = [
      createChromosome(['a', 'b', 'c', 'd', 'e', 'f']),
      createChromosome(['g', 'h', 'i', 'j', 'k', 'l']),
    ];

    evaluatePopulation(population, 'PlayPokemon', 'jungle-cup');

    expect(population.map((chromosome) => chromosome.fitness)).toEqual([
      0.91, 0.91,
    ]);
    expect(scorePlayPokemonRoster).toHaveBeenCalledTimes(2);
  });
});
