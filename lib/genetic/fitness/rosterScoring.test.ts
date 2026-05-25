import { describe, expect, test, vi } from 'vitest';
import type { LineupScoreResult } from './lineupScoring';
import {
  scorePlayPokemonRoster,
  type PlayPokemonRosterScoringContext,
} from './rosterScoring';
import type { OrderedLineup, Pokemon } from '@/lib/types';

const roster = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];

describe('scorePlayPokemonRoster', () => {
  test('evaluates exactly 60 enumerated lineups for a PlayPokemon roster', () => {
    const scoreLineup = vi.fn((lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.6 }),
    );

    const result = scorePlayPokemonRoster(
      roster,
      createContext({ scoreLineup }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(scoreLineup).toHaveBeenCalledTimes(60);
    expect(result.evaluatedLineupCount).toBe(60);
    expect(result.metrics.viableLineupCount).toBe(60);
  });

  test('uses fast mode without returning all lineup diagnostics', () => {
    const result = scorePlayPokemonRoster(
      roster,
      createContext({
        scoreLineup: (lineup) => makeLineupResult(lineup, { score: 0.65 }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(result.lineupScores).toBeUndefined();
    expect(result.metrics.topLineupQuality).toBe(0.65);
  });

  test('fast mode fallback does not require diagnostic-only lineup data', () => {
    const result = scorePlayPokemonRoster(
      roster,
      createContext({
        getPokemon: () => {
          throw new Error('getPokemon should not be needed for fast scoring');
        },
        getShieldScenarioMatchupRating: () => {
          throw new Error('shield paths should not be needed for fast scoring');
        },
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(result.evaluatedLineupCount).toBe(60);
    expect(result.lineupScores).toBeUndefined();
  });

  test('uses full mode to keep bounded finalist diagnostics', () => {
    const result = scorePlayPokemonRoster(
      roster,
      createContext({
        scoreLineup: (lineup) => makeLineupResult(lineup, { score: 0.6 }),
      }),
      { mode: 'full', includeDiagnostics: true, recommendationLimit: 5 },
    );

    expect(result.lineupScores).toHaveLength(5);
  });

  test('rewards roster depth over one excellent lineup with a dead bench', () => {
    const shallowResult = scorePlayPokemonRoster(
      roster,
      createContext({
        scoreLineup: (lineup) =>
          makeLineupResult(lineup, {
            score:
              lineup.lead === 'alpha' &&
              lineup.switch === 'bravo' &&
              lineup.closer === 'charlie'
                ? 0.98
                : 0.2,
          }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const deepResult = scorePlayPokemonRoster(
      roster,
      createContext({
        scoreLineup: (lineup) =>
          makeLineupResult(lineup, {
            score: lineup.lead === 'foxtrot' ? 0.45 : 0.72,
          }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(deepResult.metrics.viableLineupCount).toBeGreaterThan(
      shallowResult.metrics.viableLineupCount,
    );
    expect(deepResult.metrics.benchUtilitySummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ speciesId: 'foxtrot' }),
      ]),
    );
    expect(deepResult.fitness).toBeGreaterThan(shallowResult.fitness);
  });

  test('aggregates lineup coverage risks and viable lead diversity', () => {
    const result = scorePlayPokemonRoster(
      roster,
      createContext({
        scoreLineup: (lineup) =>
          makeLineupResult(lineup, {
            score:
              lineup.lead === 'alpha' || lineup.lead === 'bravo' ? 0.7 : 0.3,
            dominatingMatchupCount: lineup.lead === 'alpha' ? 3 : 0,
            overwhelmingLossCount: lineup.lead === 'charlie' ? 3 : 0,
            singleAnswerRisks: lineup.lead === 'alpha' ? ['threat-a'] : [],
          }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(result.metrics.viableLeadDiversity).toBe(2);
    expect(result.metrics.dominatingMatchupRate).toBeGreaterThan(0);
    expect(result.metrics.overwhelmingLossRate).toBeGreaterThan(0);
    expect(result.metrics.singleAnswerRisks).toEqual(['threat-a']);
  });

  test('penalizes repeated single-answer dependency frequency', () => {
    const isolatedRisk = scorePlayPokemonRoster(
      roster,
      createContext({
        scoreLineup: (lineup) =>
          makeLineupResult(lineup, {
            score: 0.7,
            singleAnswerRisks:
              lineup.lead === 'alpha' &&
              lineup.switch === 'bravo' &&
              lineup.closer === 'charlie'
                ? ['threat-a']
                : [],
          }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const repeatedRisk = scorePlayPokemonRoster(
      roster,
      createContext({
        scoreLineup: (lineup) =>
          makeLineupResult(lineup, {
            score: 0.7,
            singleAnswerRisks: lineup.lead === 'alpha' ? ['threat-a'] : [],
          }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(isolatedRisk.metrics.singleAnswerRisks).toEqual(['threat-a']);
    expect(repeatedRisk.metrics.singleAnswerRisks).toEqual(['threat-a']);
    expect(isolatedRisk.fitness).toBeGreaterThan(repeatedRisk.fitness);
  });

  test('penalizes repeated shared weaknesses and rewards broader threat coverage', () => {
    const narrowCoverage = scorePlayPokemonRoster(
      roster,
      createContext({
        scoreLineup: (lineup) =>
          makeLineupResult(lineup, {
            score: 0.7,
            coveredThreats: ['threat-a'],
            weaknesses: lineup.lead === 'alpha' ? ['threat-b'] : [],
          }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const broadCoverage = scorePlayPokemonRoster(
      roster,
      createContext({
        scoreLineup: (lineup) =>
          makeLineupResult(lineup, {
            score: 0.7,
            coveredThreats: [lineup.lead, lineup.switch, lineup.closer],
            weaknesses: [],
          }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(broadCoverage.fitness).toBeGreaterThan(narrowCoverage.fitness);
  });
});

function createContext(
  overrides: Partial<PlayPokemonRosterScoringContext> = {},
): PlayPokemonRosterScoringContext {
  return {
    threats: ['threat-a', 'threat-b', 'threat-c'],
    getPokemon: (speciesId) => makePokemon(speciesId),
    getRankingScore: () => 80,
    getRoleScore: () => 0.7,
    getMatchupRating: () => 520,
    ...overrides,
  };
}

function makeLineupResult(
  lineup: OrderedLineup,
  overrides: {
    score: number;
    coveredThreats?: string[];
    dominatingMatchupCount?: number;
    overwhelmingLossCount?: number;
    singleAnswerRisks?: string[];
    weaknesses?: string[];
  },
): LineupScoreResult {
  return {
    lineup,
    score: overrides.score,
    coverageMetrics: {
      coverageRate: overrides.score,
      dominatingMatchupCount: overrides.dominatingMatchupCount ?? 0,
      overwhelmingLossCount: overrides.overwhelmingLossCount ?? 0,
      singleAnswerThreatCount: overrides.singleAnswerRisks?.length ?? 0,
    },
    coveredThreats: overrides.coveredThreats ?? [],
    weaknesses: overrides.weaknesses ?? [],
    singleAnswerRisks: overrides.singleAnswerRisks ?? [],
    diagnosticLabel: 'ABC',
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

function makePokemon(speciesId: string): Pokemon {
  return {
    dex: 1,
    speciesName: speciesId,
    speciesId,
    baseStats: { atk: 100, def: 100, hp: 100 },
    types: ['normal'],
    fastMoves: [],
    chargedMoves: [],
    tags: [],
    defaultIVs: {},
    buddyDistance: 3,
    thirdMoveCost: 10000,
    released: true,
  };
}
