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

  test('weights top-threat coverage above rare full-meta holes in fast roster scoring', () => {
    const topThreatSafeRoster = scorePlayPokemonRoster(
      roster,
      createContext({
        threats: ['top-threat', 'rare-threat'],
        topThreats: ['top-threat'],
        fullMetaThreats: ['top-threat', 'rare-threat'],
        getMatchupRating: (speciesId, threat) => {
          if (threat === 'top-threat') {
            return speciesId === 'alpha' ? 650 : 450;
          }

          return speciesId === 'alpha' ? 350 : 450;
        },
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const topThreatHoleRoster = scorePlayPokemonRoster(
      roster,
      createContext({
        threats: ['top-threat', 'rare-threat'],
        topThreats: ['top-threat'],
        fullMetaThreats: ['top-threat', 'rare-threat'],
        getMatchupRating: (speciesId, threat) => {
          if (threat === 'top-threat') {
            return speciesId === 'alpha' ? 350 : 450;
          }

          return speciesId === 'alpha' ? 650 : 450;
        },
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(topThreatSafeRoster.fitness).toBeGreaterThan(
      topThreatHoleRoster.fitness,
    );
  });

  test('deduplicates split threat pools before fast scoring diagnostics', () => {
    const result = scorePlayPokemonRoster(
      roster,
      createContext({
        threats: ['top-threat', 'rare-threat'],
        topThreats: ['top-threat', 'top-threat'],
        fullMetaThreats: ['top-threat', 'rare-threat', 'rare-threat'],
        getMatchupRating: (speciesId, threat) => {
          if (threat === 'top-threat') {
            return speciesId === 'alpha' ? 650 : 450;
          }

          return speciesId === 'alpha' ? 350 : 450;
        },
      }),
      { mode: 'full', includeDiagnostics: true, recommendationLimit: 1 },
    );

    expect(
      result.lineupScores?.[0]?.coverageMetrics.topThreatCoverage
        ?.evaluatedThreatCount,
    ).toBe(1);
    expect(
      result.lineupScores?.[0]?.coverageMetrics.fullMetaCoverage
        ?.evaluatedThreatCount,
    ).toBe(2);
  });

  test('does not penalize roster coverage breadth for unevaluated split pools', () => {
    const scoreLineupWithoutSplitPools = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, {
        score: 0.68,
        coveredThreats: ['rare-threat'],
      });
    const scoreLineupWithUnevaluatedTopPool = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, {
        score: 0.68,
        coveredThreats: ['rare-threat'],
        topThreatCoverage: {
          coverageRate: 0,
          evaluatedThreatCount: 0,
          noAnswerThreatCount: 0,
          singleAnswerThreatCount: 0,
          dominatingMatchupCount: 0,
          overwhelmingLossCount: 0,
        },
        fullMetaCoverage: {
          coverageRate: 1,
          evaluatedThreatCount: 1,
          noAnswerThreatCount: 0,
          singleAnswerThreatCount: 1,
          dominatingMatchupCount: 1,
          overwhelmingLossCount: 0,
        },
      });

    const baseline = scorePlayPokemonRoster(
      roster,
      createContext({ scoreLineup: scoreLineupWithoutSplitPools }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const withUnevaluatedTopPool = scorePlayPokemonRoster(
      roster,
      createContext({ scoreLineup: scoreLineupWithUnevaluatedTopPool }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(withUnevaluatedTopPool.fitness).toBeCloseTo(baseline.fitness, 5);
  });

  test('clamps non-finite split-pool diagnostic rates before roster aggregation', () => {
    const result = scorePlayPokemonRoster(
      roster,
      createContext({
        scoreLineup: (lineup) =>
          makeLineupResult(lineup, {
            score: 0.68,
            coveredThreats: ['rare-threat'],
            topThreatCoverage: {
              coverageRate: Number.POSITIVE_INFINITY,
              evaluatedThreatCount: 1,
              noAnswerThreatCount: 0,
              singleAnswerThreatCount: 0,
              dominatingMatchupCount: 0,
              overwhelmingLossCount: 0,
            },
          }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(result.fitness).toBeGreaterThanOrEqual(0);
    expect(result.fitness).toBeLessThanOrEqual(1);
  });

  test('scores a redundant Electric-heavy roster below broader type coverage when lineup quality is comparable', () => {
    const redundantElectricRoster = [
      'electric-a',
      'electric-b',
      'electric-c',
      'electric-d',
      'water-a',
      'grass-a',
    ];
    const broadCoverageRoster = [
      'electric-a',
      'water-a',
      'grass-a',
      'ground-a',
      'fire-a',
      'flying-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });

    const redundantResult = scorePlayPokemonRoster(
      redundantElectricRoster,
      createTypeCoverageContext({ scoreLineup }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const broadResult = scorePlayPokemonRoster(
      broadCoverageRoster,
      createTypeCoverageContext({ scoreLineup }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(broadResult.fitness).toBeGreaterThan(redundantResult.fitness);
  });

  test('weights offensive and defensive coverage against injected meta threats', () => {
    const metaFocusedRoster = [
      'electric-a',
      'rock-a',
      'water-a',
      'grass-a',
      'ground-a',
      'fire-a',
    ];
    const offMetaRoster = [
      'ghost-a',
      'poison-a',
      'bug-a',
      'normal-a',
      'dark-a',
      'psychic-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });
    const context = createTypeCoverageContext({
      threats: ['threat-water', 'threat-flying'],
      scoreLineup,
    });

    const metaFocusedResult = scorePlayPokemonRoster(
      metaFocusedRoster,
      context,
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const offMetaResult = scorePlayPokemonRoster(offMetaRoster, context, {
      mode: 'fast',
      includeDiagnostics: false,
      recommendationLimit: 0,
    });

    expect(metaFocusedResult.fitness).toBeGreaterThan(offMetaResult.fitness);
  });

  test('uses Pokemon typing for roster coverage when move metadata is unavailable', () => {
    const redundantElectricRoster = [
      'electric-a',
      'electric-b',
      'electric-c',
      'electric-d',
      'water-a',
      'grass-a',
    ];
    const broadCoverageRoster = [
      'electric-a',
      'water-a',
      'grass-a',
      'ground-a',
      'fire-a',
      'flying-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });

    const redundantResult = scorePlayPokemonRoster(
      redundantElectricRoster,
      createTypeCoverageContext({
        getMove: undefined,
        getRecommendedMoveset: undefined,
        scoreLineup,
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const broadResult = scorePlayPokemonRoster(
      broadCoverageRoster,
      createTypeCoverageContext({
        getMove: undefined,
        getRecommendedMoveset: undefined,
        scoreLineup,
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(broadResult.fitness).toBeGreaterThan(redundantResult.fitness);
  });

  test('falls back to each Pokemon typing when only partial move metadata resolves', () => {
    const redundantElectricRoster = [
      'electric-a',
      'electric-b',
      'electric-c',
      'electric-d',
      'normal-a',
      'poison-a',
    ];
    const broadCoverageRoster = [
      'electric-a',
      'water-a',
      'grass-a',
      'ground-a',
      'fire-a',
      'flying-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, {
        score: [lineup.lead, lineup.switch, lineup.closer].some((speciesId) =>
          ['electric-b', 'electric-c', 'electric-d'].includes(speciesId),
        )
          ? 0.4
          : 0.9,
      });
    const context = createTypeCoverageContext({
      threats: ['threat-ground'],
      getRecommendedMoveset: (speciesId) => ({
        fastMove: null,
        chargedMove1:
          speciesId === 'electric-a' ? 'electric-move' : 'missing-move',
        chargedMove2: null,
      }),
      getMove: (moveId) =>
        moveId === 'electric-move' ? { type: 'electric' } : undefined,
      scoreLineup,
    });

    const redundantResult = scorePlayPokemonRoster(
      redundantElectricRoster,
      context,
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const broadResult = scorePlayPokemonRoster(broadCoverageRoster, context, {
      mode: 'fast',
      includeDiagnostics: false,
      recommendationLimit: 0,
    });

    expect(broadResult.fitness).toBeGreaterThan(redundantResult.fitness + 0.1);
  });

  test('keeps Pokemon typing when one recommended charged move is unresolved', () => {
    const partialMoveRoster = [
      'fire-grass-a',
      'electric-a',
      'bug-a',
      'flying-a',
      'normal-a',
      'poison-a',
    ];
    const resolvedMoveRoster = [
      'fire-a',
      'electric-a',
      'bug-a',
      'flying-a',
      'normal-a',
      'poison-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });
    const context = createTypeCoverageContext({
      threats: ['threat-ground'],
      getRecommendedMoveset: (speciesId) => ({
        fastMove: null,
        chargedMove1: speciesId.startsWith('fire')
          ? 'fire-move'
          : `${speciesId.split('-')[0]}-move`,
        chargedMove2: speciesId === 'fire-grass-a' ? 'missing-move' : null,
      }),
      getMove: (moveId) =>
        moveId === 'missing-move'
          ? undefined
          : { type: moveId.replace('-move', '') },
      scoreLineup,
    });

    const partialMoveResult = scorePlayPokemonRoster(
      partialMoveRoster,
      context,
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const resolvedMoveResult = scorePlayPokemonRoster(
      resolvedMoveRoster,
      context,
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(partialMoveResult.fitness).toBeGreaterThan(
      resolvedMoveResult.fitness,
    );
  });

  test('uses expected meta move types when scoring defensive coverage', () => {
    const electricWeakRoster = [
      'water-a',
      'flying-a',
      'water-grass-a',
      'normal-a',
      'poison-a',
      'bug-a',
    ];
    const electricResistantRoster = [
      'ground-a',
      'grass-a',
      'electric-a',
      'rock-a',
      'fire-a',
      'normal-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });
    const context = createTypeCoverageContext({
      threats: ['threat-water'],
      getRecommendedMoveset: (speciesId) => ({
        fastMove: null,
        chargedMove1:
          speciesId === 'threat-water'
            ? 'electric-move'
            : `${speciesId.split('-')[0]}-move`,
        chargedMove2: null,
      }),
      getMove: (moveId) => ({ type: moveId.replace('-move', '') }),
      scoreLineup,
    });

    const electricWeakResult = scorePlayPokemonRoster(
      electricWeakRoster,
      context,
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const electricResistantResult = scorePlayPokemonRoster(
      electricResistantRoster,
      context,
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(electricResistantResult.fitness).toBeGreaterThan(
      electricWeakResult.fitness,
    );
  });

  test('weights repeated expected meta attack move types in defensive coverage', () => {
    const frequentGroundResistantRoster = [
      'grass-a',
      'flying-a',
      'bug-a',
      'normal-a',
      'water-a',
      'ground-a',
    ];
    const rareElectricResistantRoster = [
      'electric-a',
      'grass-a',
      'ground-a',
      'normal-a',
      'fire-a',
      'rock-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });
    const context = createTypeCoverageContext({
      threats: ['threat-ground-a', 'threat-ground-b', 'threat-electric'],
      getRecommendedMoveset: (speciesId) => ({
        fastMove: null,
        chargedMove1: speciesId.startsWith('threat-ground')
          ? 'ground-move'
          : speciesId === 'threat-electric'
            ? 'electric-move'
            : `${speciesId.split('-')[0]}-move`,
        chargedMove2: null,
      }),
      getMove: (moveId) => ({ type: moveId.replace('-move', '') }),
      scoreLineup,
    });

    const frequentGroundResult = scorePlayPokemonRoster(
      frequentGroundResistantRoster,
      context,
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const rareElectricResult = scorePlayPokemonRoster(
      rareElectricResistantRoster,
      context,
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(frequentGroundResult.fitness).toBeGreaterThan(
      rareElectricResult.fitness,
    );
  });

  test('preserves duplicate charged move types on one threat for defensive coverage weighting', () => {
    const frequentGroundResistantRoster = [
      'grass-a',
      'flying-a',
      'bug-a',
      'normal-a',
      'water-a',
      'ground-a',
    ];
    const rareElectricResistantRoster = [
      'electric-a',
      'grass-a',
      'ground-a',
      'normal-a',
      'fire-a',
      'rock-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });
    const context = createTypeCoverageContext({
      threats: ['threat-ground-a', 'threat-electric'],
      getRecommendedMoveset: (speciesId) => ({
        fastMove: null,
        chargedMove1:
          speciesId === 'threat-ground-a'
            ? 'ground-move-a'
            : speciesId === 'threat-electric'
              ? 'electric-move'
              : `${speciesId.split('-')[0]}-move`,
        chargedMove2: speciesId === 'threat-ground-a' ? 'ground-move-b' : null,
      }),
      getMove: (moveId) => ({ type: moveId.split('-')[0] }),
      scoreLineup,
    });

    const frequentGroundResult = scorePlayPokemonRoster(
      frequentGroundResistantRoster,
      context,
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const rareElectricResult = scorePlayPokemonRoster(
      rareElectricResistantRoster,
      context,
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(frequentGroundResult.fitness).toBeGreaterThan(
      rareElectricResult.fitness,
    );
  });

  test('penalizes duplicated primary types that are absent from top recommended lineups', () => {
    const redundantRoster = [
      'electric-a',
      'electric-b',
      'electric-c',
      'water-a',
      'grass-a',
      'ground-a',
    ];
    const broadRoster = [
      'electric-a',
      'rock-a',
      'water-a',
      'grass-a',
      'ground-a',
      'fire-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, {
        score: [lineup.lead, lineup.switch, lineup.closer].some((speciesId) =>
          ['electric-b', 'electric-c'].includes(speciesId),
        )
          ? 0.4
          : 0.9,
      });

    const redundantResult = scorePlayPokemonRoster(
      redundantRoster,
      createTypeCoverageContext({ scoreLineup }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const broadResult = scorePlayPokemonRoster(
      broadRoster,
      createTypeCoverageContext({ scoreLineup }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(broadResult.fitness).toBeGreaterThan(redundantResult.fitness);
  });

  test('keeps primary redundancy scoring stable when tied top lineups reorder appearances', () => {
    const firstOrderRoster = [
      'electric-a',
      'electric-b',
      'electric-c',
      'water-a',
      'grass-a',
      'ground-a',
    ];
    const secondOrderRoster = [
      'electric-c',
      'ground-a',
      'grass-a',
      'water-a',
      'electric-b',
      'electric-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });

    const firstResult = scorePlayPokemonRoster(
      firstOrderRoster,
      createTypeCoverageContext({ scoreLineup }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const secondResult = scorePlayPokemonRoster(
      secondOrderRoster,
      createTypeCoverageContext({ scoreLineup }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(firstResult.fitness).toBeCloseTo(secondResult.fitness, 5);
  });

  test('does not penalize duplicated primary types when all duplicate members appear in top tied lineups', () => {
    const usefulDuplicatePrimaryRoster = [
      'electric-water-a',
      'electric-grass-a',
      'electric-ground-a',
      'fire-a',
      'flying-a',
      'rock-a',
    ];
    const primaryDistinctRoster = [
      'water-electric-a',
      'grass-electric-a',
      'ground-electric-a',
      'fire-a',
      'flying-a',
      'rock-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });

    const usefulDuplicateResult = scorePlayPokemonRoster(
      usefulDuplicatePrimaryRoster,
      createTypeCoverageContext({ scoreLineup }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const primaryDistinctResult = scorePlayPokemonRoster(
      primaryDistinctRoster,
      createTypeCoverageContext({ scoreLineup }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(usefulDuplicateResult.fitness).toBeCloseTo(
      primaryDistinctResult.fitness,
      5,
    );
  });

  test('does not over-penalize complementary shared secondary typing when roles and weaknesses differ', () => {
    const harmfulSharedPrimaryRoster = [
      'fairy-a',
      'fairy-b',
      'fairy-c',
      'water-a',
      'ground-a',
      'fire-a',
    ];
    const complementarySharedSecondaryRoster = [
      'water-fairy-a',
      'steel-fairy-a',
      'ground-a',
      'fire-a',
      'flying-a',
      'grass-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });

    const harmfulResult = scorePlayPokemonRoster(
      harmfulSharedPrimaryRoster,
      createTypeCoverageContext({ scoreLineup }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const complementaryResult = scorePlayPokemonRoster(
      complementarySharedSecondaryRoster,
      createTypeCoverageContext({ scoreLineup }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(complementaryResult.fitness).toBeGreaterThan(harmfulResult.fitness);
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
    topThreatCoverage?: LineupScoreResult['coverageMetrics']['topThreatCoverage'];
    fullMetaCoverage?: LineupScoreResult['coverageMetrics']['fullMetaCoverage'];
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
      topThreatCoverage: overrides.topThreatCoverage,
      fullMetaCoverage: overrides.fullMetaCoverage,
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

function createTypeCoverageContext(
  overrides: Partial<PlayPokemonRosterScoringContext> = {},
): PlayPokemonRosterScoringContext {
  const pokemonBySpeciesId: Record<string, Pokemon> = {
    'electric-a': makeTypedPokemon('electric-a', ['electric']),
    'electric-b': makeTypedPokemon('electric-b', ['electric']),
    'electric-c': makeTypedPokemon('electric-c', ['electric']),
    'electric-d': makeTypedPokemon('electric-d', ['electric']),
    'water-a': makeTypedPokemon('water-a', ['water']),
    'grass-a': makeTypedPokemon('grass-a', ['grass']),
    'ground-a': makeTypedPokemon('ground-a', ['ground']),
    'rock-a': makeTypedPokemon('rock-a', ['rock']),
    'fire-a': makeTypedPokemon('fire-a', ['fire']),
    'flying-a': makeTypedPokemon('flying-a', ['flying']),
    'ghost-a': makeTypedPokemon('ghost-a', ['ghost']),
    'poison-a': makeTypedPokemon('poison-a', ['poison']),
    'bug-a': makeTypedPokemon('bug-a', ['bug']),
    'normal-a': makeTypedPokemon('normal-a', ['normal']),
    'dark-a': makeTypedPokemon('dark-a', ['dark']),
    'psychic-a': makeTypedPokemon('psychic-a', ['psychic']),
    'fairy-a': makeTypedPokemon('fairy-a', ['fairy']),
    'fairy-b': makeTypedPokemon('fairy-b', ['fairy']),
    'fairy-c': makeTypedPokemon('fairy-c', ['fairy']),
    'fire-grass-a': makeTypedPokemon('fire-grass-a', ['fire', 'grass']),
    'water-grass-a': makeTypedPokemon('water-grass-a', ['water', 'grass']),
    'water-fairy-a': makeTypedPokemon('water-fairy-a', ['water', 'fairy']),
    'steel-fairy-a': makeTypedPokemon('steel-fairy-a', ['steel', 'fairy']),
    'electric-water-a': makeTypedPokemon('electric-water-a', [
      'electric',
      'water',
    ]),
    'electric-grass-a': makeTypedPokemon('electric-grass-a', [
      'electric',
      'grass',
    ]),
    'electric-ground-a': makeTypedPokemon('electric-ground-a', [
      'electric',
      'ground',
    ]),
    'water-electric-a': makeTypedPokemon('water-electric-a', [
      'water',
      'electric',
    ]),
    'grass-electric-a': makeTypedPokemon('grass-electric-a', [
      'grass',
      'electric',
    ]),
    'ground-electric-a': makeTypedPokemon('ground-electric-a', [
      'ground',
      'electric',
    ]),
    'threat-water': makeTypedPokemon('threat-water', ['water']),
    'threat-flying': makeTypedPokemon('threat-flying', ['flying']),
    'threat-ground': makeTypedPokemon('threat-ground', ['ground']),
    'threat-ground-a': makeTypedPokemon('threat-ground-a', ['normal']),
    'threat-ground-b': makeTypedPokemon('threat-ground-b', ['normal']),
    'threat-electric': makeTypedPokemon('threat-electric', ['normal']),
  };

  return createContext({
    getPokemon: (speciesId) => pokemonBySpeciesId[speciesId],
    getRecommendedMoveset: (speciesId) => ({
      fastMove: null,
      chargedMove1: `${pokemonBySpeciesId[speciesId]?.types[0] ?? 'normal'}-move`,
      chargedMove2: pokemonBySpeciesId[speciesId]?.types[1]
        ? `${pokemonBySpeciesId[speciesId].types[1]}-move`
        : null,
    }),
    getMove: (moveId) => ({ type: moveId.replace('-move', '') }),
    ...overrides,
  });
}

function makeTypedPokemon(speciesId: string, types: string[]): Pokemon {
  return {
    ...makePokemon(speciesId),
    types,
  };
}
