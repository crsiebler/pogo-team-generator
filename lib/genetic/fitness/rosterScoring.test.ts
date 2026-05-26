import { describe, expect, test, vi } from 'vitest';
import type { LineupScoreResult } from './lineupScoring';
import {
  scorePlayPokemonRoster,
  type PlayPokemonRosterScoringContext,
} from './rosterScoring';
import { MissingRankingDataError } from '@/lib/data/rankings';
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

  test('fast mode uses shield resource paths for safety when available', () => {
    const resilientResult = scorePlayPokemonRoster(
      roster,
      createContext({
        getShieldScenarioMatchupRating: (_speciesId, _threat, shields) =>
          shields === 0 ? 540 : shields === 1 ? 580 : 620,
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const brittleResult = scorePlayPokemonRoster(
      roster,
      createContext({
        getShieldScenarioMatchupRating: (_speciesId, _threat, shields) =>
          shields === 0 ? 320 : shields === 1 ? 420 : 480,
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(resilientResult.scoreBreakdown.components.safety).toBeGreaterThan(
      brittleResult.scoreBreakdown.components.safety,
    );
  });

  test('fast mode treats missing shield rows neutrally', () => {
    const completeResult = scorePlayPokemonRoster(
      roster,
      createContext({
        getShieldScenarioMatchupRating: () => 900,
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const sparseResult = scorePlayPokemonRoster(
      roster,
      createContext({
        getShieldScenarioMatchupRating: (_speciesId, threat) =>
          threat === 'threat-a' ? 900 : null,
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(completeResult.scoreBreakdown.components.safety).toBeGreaterThan(
      sparseResult.scoreBreakdown.components.safety,
    );
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

    expect(
      withUnevaluatedTopPool.scoreBreakdown.components.coverage,
    ).toBeCloseTo(baseline.scoreBreakdown.components.coverage, 5);
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

  test('uses selected fast and charged move types in offensive type ratio scoring', () => {
    const waterFastRoster = [
      'water-a',
      'grass-a',
      'ground-a',
      'fire-a',
      'flying-a',
      'bug-a',
    ];
    const neutralFastRoster = [
      'normal-a',
      'grass-a',
      'ground-a',
      'fire-a',
      'flying-a',
      'bug-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });
    const context = createTypeCoverageContext({
      threats: ['threat-fire-rock'],
      getRecommendedMoveset: (speciesId) => ({
        fastMove: speciesId === 'water-a' ? 'water-move' : 'normal-move',
        chargedMove1: 'normal-move',
        chargedMove2: null,
      }),
      getMove: (moveId) => ({ type: moveId.replace('-move', '') }),
      scoreLineup,
    });

    const waterFastResult = scorePlayPokemonRoster(waterFastRoster, context, {
      mode: 'fast',
      includeDiagnostics: false,
      recommendationLimit: 0,
    });
    const neutralFastResult = scorePlayPokemonRoster(
      neutralFastRoster,
      context,
      {
        mode: 'fast',
        includeDiagnostics: false,
        recommendationLimit: 0,
      },
    );

    expect(waterFastResult.fitness).toBeGreaterThan(neutralFastResult.fitness);
  });

  test('exposes normalized safety consistency and bulk components before aggregation', () => {
    const result = scorePlayPokemonRoster(
      roster,
      createTypeCoverageContext({
        scoreLineup: (lineup) => makeLineupResult(lineup, { score: 0.68 }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(result.scoreBreakdown.components.safety).toBeGreaterThanOrEqual(0);
    expect(result.scoreBreakdown.components.safety).toBeLessThanOrEqual(1);
    expect(result.scoreBreakdown.components.consistency).toBeGreaterThanOrEqual(
      0,
    );
    expect(result.scoreBreakdown.components.consistency).toBeLessThanOrEqual(1);
    expect(result.scoreBreakdown.components.bulk).toBeGreaterThanOrEqual(0);
    expect(result.scoreBreakdown.components.bulk).toBeLessThanOrEqual(1);
  });

  test('weights overwhelming top-threat losses more heavily than rare full-meta losses', () => {
    const scoreLineupWithTopThreatLosses = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, {
        score: 0.68,
        topThreatCoverage: {
          coverageRate: 0.8,
          evaluatedThreatCount: 5,
          noAnswerThreatCount: 1,
          singleAnswerThreatCount: 1,
          dominatingMatchupCount: 3,
          overwhelmingLossCount: 6,
        },
        fullMetaCoverage: {
          coverageRate: 0.9,
          evaluatedThreatCount: 20,
          noAnswerThreatCount: 2,
          singleAnswerThreatCount: 2,
          dominatingMatchupCount: 8,
          overwhelmingLossCount: 0,
        },
      });
    const scoreLineupWithRareLosses = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, {
        score: 0.68,
        topThreatCoverage: {
          coverageRate: 0.8,
          evaluatedThreatCount: 5,
          noAnswerThreatCount: 1,
          singleAnswerThreatCount: 1,
          dominatingMatchupCount: 3,
          overwhelmingLossCount: 0,
        },
        fullMetaCoverage: {
          coverageRate: 0.9,
          evaluatedThreatCount: 20,
          noAnswerThreatCount: 2,
          singleAnswerThreatCount: 2,
          dominatingMatchupCount: 8,
          overwhelmingLossCount: 6,
        },
      });

    const topThreatLossResult = scorePlayPokemonRoster(
      roster,
      createTypeCoverageContext({
        scoreLineup: scoreLineupWithTopThreatLosses,
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const rareLossResult = scorePlayPokemonRoster(
      roster,
      createTypeCoverageContext({ scoreLineup: scoreLineupWithRareLosses }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(rareLossResult.scoreBreakdown.components.safety).toBeGreaterThan(
      topThreatLossResult.scoreBreakdown.components.safety,
    );
    expect(rareLossResult.fitness).toBeGreaterThan(topThreatLossResult.fitness);
  });

  test('keeps repeated weakness and coverage-breadth risks in safety when split pools exist', () => {
    const splitCoverage = {
      coverageRate: 0.9,
      evaluatedThreatCount: 10,
      noAnswerThreatCount: 1,
      singleAnswerThreatCount: 1,
      dominatingMatchupCount: 5,
      overwhelmingLossCount: 0,
    };
    const resilientResult = scorePlayPokemonRoster(
      roster,
      createTypeCoverageContext({
        scoreLineup: (lineup) =>
          makeLineupResult(lineup, {
            score: 0.68,
            coveredThreats: [lineup.lead, lineup.switch, lineup.closer],
            topThreatCoverage: splitCoverage,
            fullMetaCoverage: splitCoverage,
          }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const fragileResult = scorePlayPokemonRoster(
      roster,
      createTypeCoverageContext({
        scoreLineup: (lineup) =>
          makeLineupResult(lineup, {
            score: 0.68,
            coveredThreats: ['threat-a'],
            weaknesses: lineup.lead === 'alpha' ? ['sweep-risk'] : [],
            singleAnswerRisks:
              lineup.lead === 'alpha' ? ['alignment-fragility'] : [],
            topThreatCoverage: splitCoverage,
            fullMetaCoverage: splitCoverage,
          }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(resilientResult.scoreBreakdown.components.safety).toBeGreaterThan(
      fragileResult.scoreBreakdown.components.safety,
    );
  });

  test('uses available resource paths as bad-lead recovery safety signals', () => {
    const splitCoverage = {
      coverageRate: 0.9,
      evaluatedThreatCount: 10,
      noAnswerThreatCount: 1,
      singleAnswerThreatCount: 1,
      dominatingMatchupCount: 5,
      overwhelmingLossCount: 0,
    };
    const resilientResult = scorePlayPokemonRoster(
      roster,
      createTypeCoverageContext({
        scoreLineup: (lineup) =>
          makeLineupResult(lineup, {
            score: 0.68,
            topThreatCoverage: splitCoverage,
            fullMetaCoverage: splitCoverage,
            resourcePathMetrics: {
              balanced: { available: true, score: 0.75 },
              shieldSpend: { available: true, score: 0.72 },
              shieldSave: { available: true, score: 0.7 },
            },
          }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const brittleResult = scorePlayPokemonRoster(
      roster,
      createTypeCoverageContext({
        scoreLineup: (lineup) =>
          makeLineupResult(lineup, {
            score: 0.68,
            topThreatCoverage: splitCoverage,
            fullMetaCoverage: splitCoverage,
            resourcePathMetrics: {
              balanced: { available: true, score: 0.45 },
              shieldSpend: { available: true, score: 0.35 },
              shieldSave: { available: true, score: 0.32 },
            },
          }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(resilientResult.scoreBreakdown.components.safety).toBeGreaterThan(
      brittleResult.scoreBreakdown.components.safety,
    );
  });

  test('uses PvPoke consistency ranking data when available', () => {
    const consistentRoster = [
      'consistent-a',
      'consistent-b',
      'consistent-c',
      'normal-a',
      'water-a',
      'grass-a',
    ];
    const volatileRoster = [
      'volatile-a',
      'volatile-b',
      'volatile-c',
      'normal-a',
      'water-a',
      'grass-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });
    const context = createTypeCoverageContext({
      scoreLineup,
      getRankingCategoryScore: (speciesId, category) =>
        category === 'consistency' && speciesId.startsWith('consistent')
          ? 92
          : category === 'consistency' && speciesId.startsWith('volatile')
            ? 28
            : 70,
    });

    const consistentResult = scorePlayPokemonRoster(consistentRoster, context, {
      mode: 'fast',
      includeDiagnostics: false,
      recommendationLimit: 0,
    });
    const volatileResult = scorePlayPokemonRoster(volatileRoster, context, {
      mode: 'fast',
      includeDiagnostics: false,
      recommendationLimit: 0,
    });

    expect(
      consistentResult.scoreBreakdown.components.consistency,
    ).toBeGreaterThan(volatileResult.scoreBreakdown.components.consistency);
    expect(consistentResult.fitness).toBeGreaterThan(volatileResult.fitness);
  });

  test('uses proxy consistency for roster members missing consistency rankings', () => {
    const partiallyRankedRoster = [
      'consistent-a',
      'bait-a',
      'bait-b',
      'bait-c',
      'normal-a',
      'water-a',
    ];
    const fullyRankedRoster = [
      'consistent-a',
      'stable-a',
      'stable-b',
      'stable-c',
      'normal-a',
      'water-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });
    const context = createTypeCoverageContext({
      scoreLineup,
      getRankingCategoryScore: (speciesId, category) =>
        category === 'consistency' && speciesId === 'consistent-a' ? 95 : 0,
      getRecommendedMoveset: (speciesId) => ({
        fastMove: null,
        chargedMove1: speciesId.startsWith('bait')
          ? 'bait-move'
          : 'stable-move',
        chargedMove2: speciesId.startsWith('bait')
          ? 'nuke-move'
          : 'coverage-move',
      }),
      getMove: (moveId) => {
        if (moveId === 'bait-move')
          return { type: 'normal', power: 20, energy: 35 };
        if (moveId === 'nuke-move')
          return { type: 'normal', power: 150, energy: 80 };
        if (moveId === 'stable-move')
          return { type: 'normal', power: 90, energy: 50 };
        return { type: 'water', power: 80, energy: 50 };
      },
    });

    const partiallyRankedResult = scorePlayPokemonRoster(
      partiallyRankedRoster,
      context,
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const fullyRankedResult = scorePlayPokemonRoster(
      fullyRankedRoster,
      context,
      {
        mode: 'fast',
        includeDiagnostics: false,
        recommendationLimit: 0,
      },
    );

    expect(
      fullyRankedResult.scoreBreakdown.components.consistency,
    ).toBeGreaterThan(
      partiallyRankedResult.scoreBreakdown.components.consistency,
    );
  });

  test('caches unavailable consistency rankings on the scoring context', () => {
    const getRankingCategoryScore = vi.fn(() => {
      throw new MissingRankingDataError(
        'great-league',
        'overall',
        'rankings/cp1500/all/consistency_rankings.csv',
      );
    });
    const context = createTypeCoverageContext({
      getRankingCategoryScore,
      scoreLineup: (lineup) => makeLineupResult(lineup, { score: 0.68 }),
    });

    scorePlayPokemonRoster(roster, context, {
      mode: 'fast',
      includeDiagnostics: false,
      recommendationLimit: 0,
    });
    scorePlayPokemonRoster(roster, context, {
      mode: 'fast',
      includeDiagnostics: false,
      recommendationLimit: 0,
    });

    expect(getRankingCategoryScore).toHaveBeenCalledTimes(4);
  });

  test('propagates transient optional role ranking errors', () => {
    const getRankingCategoryScore = vi.fn((_speciesId, category) => {
      if (category === 'consistency') {
        return 0;
      }

      throw new Error('temporary ranking read failure');
    });
    const context = createTypeCoverageContext({
      getRankingCategoryScore,
      scoreLineup: (lineup) => makeLineupResult(lineup, { score: 0.68 }),
    });

    expect(() =>
      scorePlayPokemonRoster(roster, context, {
        mode: 'fast',
        includeDiagnostics: false,
        recommendationLimit: 0,
      }),
    ).toThrow('temporary ranking read failure');
    expect(() =>
      scorePlayPokemonRoster(roster, context, {
        mode: 'fast',
        includeDiagnostics: false,
        recommendationLimit: 0,
      }),
    ).toThrow('temporary ranking read failure');

    expect(getRankingCategoryScore).toHaveBeenCalledTimes(16);
  });

  test('falls back to move volatility and shield stability for consistency', () => {
    const stableRoster = [
      'stable-a',
      'stable-b',
      'stable-c',
      'normal-a',
      'water-a',
      'grass-a',
    ];
    const baitDependentRoster = [
      'bait-a',
      'bait-b',
      'bait-c',
      'normal-a',
      'water-a',
      'grass-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });
    const context = createTypeCoverageContext({
      scoreLineup,
      getRecommendedMoveset: (speciesId) => ({
        fastMove: null,
        chargedMove1: speciesId.startsWith('bait')
          ? 'bait-move'
          : 'stable-move',
        chargedMove2: speciesId.startsWith('bait')
          ? 'nuke-move'
          : 'coverage-move',
      }),
      getMove: (moveId) => {
        if (moveId === 'bait-move')
          return { type: 'normal', power: 20, energy: 35 };
        if (moveId === 'nuke-move')
          return { type: 'normal', power: 150, energy: 80 };
        if (moveId === 'stable-move')
          return { type: 'normal', power: 90, energy: 50 };
        return { type: 'water', power: 80, energy: 50 };
      },
      getShieldScenarioMatchupRating: (speciesId, _threat, shields) => {
        if (speciesId.startsWith('bait')) {
          return shields === 2 ? 720 : shields === 1 ? 500 : 330;
        }

        return shields === 2 ? 610 : shields === 1 ? 570 : 530;
      },
    });

    const stableResult = scorePlayPokemonRoster(stableRoster, context, {
      mode: 'fast',
      includeDiagnostics: false,
      recommendationLimit: 0,
    });
    const baitResult = scorePlayPokemonRoster(baitDependentRoster, context, {
      mode: 'fast',
      includeDiagnostics: false,
      recommendationLimit: 0,
    });

    expect(stableResult.scoreBreakdown.components.consistency).toBeGreaterThan(
      baitResult.scoreBreakdown.components.consistency,
    );
    expect(stableResult.fitness).toBeGreaterThan(baitResult.fitness);
  });

  test('rewards useful neutral-or-better charged damage in consistency fallback', () => {
    const neutralDamageRoster = [
      'fire-a',
      'fire-b',
      'fire-c',
      'normal-a',
      'water-a',
      'grass-a',
    ];
    const resistedDamageRoster = [
      'dragon-a',
      'dragon-b',
      'dragon-c',
      'normal-a',
      'water-a',
      'grass-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });
    const context = createTypeCoverageContext({
      threats: ['threat-steel-fairy'],
      scoreLineup,
      getRecommendedMoveset: (speciesId) => ({
        fastMove: null,
        chargedMove1: speciesId.startsWith('dragon')
          ? 'dragon-move'
          : speciesId.startsWith('fire')
            ? 'fire-move'
            : 'normal-move',
        chargedMove2: null,
      }),
      getMove: (moveId) => ({
        type: moveId.replace('-move', ''),
        power: 90,
        energy: 50,
      }),
    });

    const neutralDamageResult = scorePlayPokemonRoster(
      neutralDamageRoster,
      context,
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const resistedDamageResult = scorePlayPokemonRoster(
      resistedDamageRoster,
      context,
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(
      neutralDamageResult.scoreBreakdown.components.consistency,
    ).toBeGreaterThan(
      resistedDamageResult.scoreBreakdown.components.consistency,
    );
  });

  test('penalizes brittle low-bulk rosters using defense hp over attack', () => {
    const bulkyRoster = [
      'bulky-a',
      'bulky-b',
      'bulky-c',
      'normal-a',
      'water-a',
      'grass-a',
    ];
    const brittleRoster = [
      'brittle-a',
      'brittle-b',
      'brittle-c',
      'normal-a',
      'water-a',
      'grass-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });
    const context = createTypeCoverageContext({ scoreLineup });

    const bulkyResult = scorePlayPokemonRoster(bulkyRoster, context, {
      mode: 'fast',
      includeDiagnostics: false,
      recommendationLimit: 0,
    });
    const brittleResult = scorePlayPokemonRoster(brittleRoster, context, {
      mode: 'fast',
      includeDiagnostics: false,
      recommendationLimit: 0,
    });

    expect(bulkyResult.scoreBreakdown.components.bulk).toBeGreaterThan(
      brittleResult.scoreBreakdown.components.bulk,
    );
    expect(bulkyResult.fitness).toBeGreaterThan(brittleResult.fitness);
  });

  test('uses chargers attackers and consistency for roster role scoring', () => {
    const specializedRoster = [
      'normal-a',
      'water-a',
      'grass-a',
      'fire-a',
      'flying-a',
      'rock-a',
    ];
    const unsupportedRoster = [
      'ghost-a',
      'poison-a',
      'bug-a',
      'dark-a',
      'psychic-a',
      'electric-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });
    const context = createTypeCoverageContext({
      scoreLineup,
      getRoleScore: (speciesId, role) => {
        if (specializedRoster.includes(speciesId)) {
          return role === 'lead' || role === 'switch' || role === 'closer'
            ? 0.75
            : 0.5;
        }

        return 0.75;
      },
      getRankingCategoryScore: (speciesId, category) => {
        if (!specializedRoster.includes(speciesId)) {
          return 20;
        }

        return category === 'consistency' ? 85 : 90;
      },
    });

    const specializedResult = scorePlayPokemonRoster(
      specializedRoster,
      context,
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const unsupportedResult = scorePlayPokemonRoster(
      unsupportedRoster,
      context,
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(specializedResult.scoreBreakdown.components.role).toBeGreaterThan(
      unsupportedResult.scoreBreakdown.components.role,
    );
    expect(specializedResult.fitness).toBeGreaterThan(
      unsupportedResult.fitness,
    );
  });

  test('uses supporting role exports in fast lineup scoring', () => {
    const weakSupportResult = scorePlayPokemonRoster(
      roster,
      createTypeCoverageContext({
        getRoleScore: () => 0.7,
        getRankingCategoryScore: () => 20,
        getMatchupRating: () => 520,
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const strongSupportResult = scorePlayPokemonRoster(
      roster,
      createTypeCoverageContext({
        getRoleScore: () => 0.7,
        getRankingCategoryScore: (_speciesId, category) =>
          category === 'attackers' ? 92 : 88,
        getMatchupRating: () => 520,
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(strongSupportResult.metrics.topLineupQuality).toBeGreaterThan(
      weakSupportResult.metrics.topLineupQuality,
    );
    expect(strongSupportResult.fitness).toBeGreaterThan(
      weakSupportResult.fitness,
    );
  });

  test('keeps primary role rankings ahead of supporting role categories', () => {
    const primaryRoster = [
      'normal-a',
      'water-a',
      'grass-a',
      'fire-a',
      'flying-a',
      'rock-a',
    ];
    const supportOnlyRoster = [
      'ghost-a',
      'poison-a',
      'bug-a',
      'dark-a',
      'psychic-a',
      'electric-a',
    ];
    const scoreLineup = (lineup: OrderedLineup) =>
      makeLineupResult(lineup, { score: 0.68 });
    const context = createTypeCoverageContext({
      scoreLineup,
      getRoleScore: (speciesId) =>
        primaryRoster.includes(speciesId) ? 0.9 : 0.2,
      getRankingCategoryScore: (speciesId) =>
        supportOnlyRoster.includes(speciesId) ? 95 : 20,
    });

    const primaryResult = scorePlayPokemonRoster(primaryRoster, context, {
      mode: 'fast',
      includeDiagnostics: false,
      recommendationLimit: 0,
    });
    const supportOnlyResult = scorePlayPokemonRoster(
      supportOnlyRoster,
      context,
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(primaryResult.scoreBreakdown.components.role).toBeGreaterThan(
      supportOnlyResult.scoreBreakdown.components.role,
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
    resourcePathMetrics?: LineupScoreResult['resourcePathMetrics'];
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
    resourcePathMetrics: overrides.resourcePathMetrics,
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
    'fire-b': makeTypedPokemon('fire-b', ['fire']),
    'fire-c': makeTypedPokemon('fire-c', ['fire']),
    'dragon-a': makeTypedPokemon('dragon-a', ['dragon']),
    'dragon-b': makeTypedPokemon('dragon-b', ['dragon']),
    'dragon-c': makeTypedPokemon('dragon-c', ['dragon']),
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
    'threat-fire-rock': makeTypedPokemon('threat-fire-rock', ['fire', 'rock']),
    'threat-steel-fairy': makeTypedPokemon('threat-steel-fairy', [
      'steel',
      'fairy',
    ]),
    'consistent-a': makeTypedPokemon('consistent-a', ['normal']),
    'consistent-b': makeTypedPokemon('consistent-b', ['water']),
    'consistent-c': makeTypedPokemon('consistent-c', ['grass']),
    'volatile-a': makeTypedPokemon('volatile-a', ['normal']),
    'volatile-b': makeTypedPokemon('volatile-b', ['water']),
    'volatile-c': makeTypedPokemon('volatile-c', ['grass']),
    'stable-a': makeTypedPokemon('stable-a', ['normal']),
    'stable-b': makeTypedPokemon('stable-b', ['water']),
    'stable-c': makeTypedPokemon('stable-c', ['grass']),
    'bait-a': makeTypedPokemon('bait-a', ['normal']),
    'bait-b': makeTypedPokemon('bait-b', ['water']),
    'bait-c': makeTypedPokemon('bait-c', ['grass']),
    'bulky-a': makeTypedPokemonWithStats('bulky-a', ['normal'], {
      atk: 90,
      def: 180,
      hp: 180,
    }),
    'bulky-b': makeTypedPokemonWithStats('bulky-b', ['water'], {
      atk: 90,
      def: 180,
      hp: 180,
    }),
    'bulky-c': makeTypedPokemonWithStats('bulky-c', ['grass'], {
      atk: 90,
      def: 180,
      hp: 180,
    }),
    'brittle-a': makeTypedPokemonWithStats('brittle-a', ['normal'], {
      atk: 220,
      def: 80,
      hp: 80,
    }),
    'brittle-b': makeTypedPokemonWithStats('brittle-b', ['water'], {
      atk: 220,
      def: 80,
      hp: 80,
    }),
    'brittle-c': makeTypedPokemonWithStats('brittle-c', ['grass'], {
      atk: 220,
      def: 80,
      hp: 80,
    }),
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

function makeTypedPokemonWithStats(
  speciesId: string,
  types: string[],
  baseStats: Pokemon['baseStats'],
): Pokemon {
  return {
    ...makeTypedPokemon(speciesId, types),
    baseStats,
  };
}
