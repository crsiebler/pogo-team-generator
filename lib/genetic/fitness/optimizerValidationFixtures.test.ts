import { describe, expect, test } from 'vitest';
import {
  scoreOrderedLineup,
  type LineupScoreResult,
  type LineupScoringContext,
} from './lineupScoring';
import {
  scorePlayPokemonRoster,
  type PlayPokemonRosterScoringContext,
} from './rosterScoring';
import { createNormalizedScoreBreakdown } from './scoreBreakdown';
import { calculateTypeEffectivenessMultiplier } from './typeEffectivenessRatios';
import type { OrderedLineup, Pokemon } from '@/lib/types';

describe('optimizer validation fixtures', () => {
  test('allows synergy to beat slightly better coverage in weighted scoring', () => {
    const synergisticLineup = scoreOrderedLineup(
      { lead: 'ground-anchor', switch: 'water-switch', closer: 'water-closer' },
      createLineupContext({
        threats: ['electric-top', 'grass-rare'],
        topThreats: ['electric-top'],
        fullMetaThreats: ['electric-top', 'grass-rare'],
        matchupRatings: {
          'ground-anchor': { 'electric-top': 700, 'grass-rare': 470 },
          'water-switch': { 'electric-top': 450, 'grass-rare': 470 },
          'water-closer': { 'electric-top': 450, 'grass-rare': 470 },
        },
      }),
    );
    const coverageFirstLineup = scoreOrderedLineup(
      { lead: 'water-lead', switch: 'water-switch', closer: 'water-closer' },
      createLineupContext({
        threats: ['electric-top', 'grass-rare'],
        topThreats: ['electric-top'],
        fullMetaThreats: ['electric-top', 'grass-rare'],
        matchupRatings: {
          'water-lead': { 'electric-top': 620, 'grass-rare': 620 },
          'water-switch': { 'electric-top': 470, 'grass-rare': 620 },
          'water-closer': { 'electric-top': 470, 'grass-rare': 470 },
        },
      }),
    );

    expect(synergisticLineup.scoreBreakdown.components.coverage).toBeLessThan(
      coverageFirstLineup.scoreBreakdown.components.coverage,
    );
    expect(synergisticLineup.scoreBreakdown.components.synergy).toBeGreaterThan(
      coverageFirstLineup.scoreBreakdown.components.synergy,
    );
    expect(synergisticLineup.score).toBeGreaterThan(coverageFirstLineup.score);
  });

  test('classifies and scores ABC ABB and ABA structure fixtures', () => {
    const context = createLineupContext({
      threats: ['electric-top'],
      topThreats: ['electric-top'],
      matchupRatings: {
        'fire-lead': { 'electric-top': 520 },
        'steel-switch': { 'electric-top': 520 },
        'ghost-closer': { 'electric-top': 520 },
        'ground-anchor': { 'electric-top': 700 },
        'ground-decoy': { 'electric-top': 450 },
        'water-switch': { 'electric-top': 450 },
        'water-closer': { 'electric-top': 450 },
        'water-lead': { 'electric-top': 450 },
        'ground-switch': { 'electric-top': 700 },
      },
    });

    const abc = scoreOrderedLineup(
      { lead: 'fire-lead', switch: 'steel-switch', closer: 'ghost-closer' },
      context,
    );
    const coherentAbb = scoreOrderedLineup(
      { lead: 'ground-anchor', switch: 'water-switch', closer: 'water-closer' },
      context,
    );
    const unsupportedAbb = scoreOrderedLineup(
      { lead: 'ground-decoy', switch: 'water-switch', closer: 'water-closer' },
      context,
    );
    const fragileAba = scoreOrderedLineup(
      { lead: 'water-lead', switch: 'ground-switch', closer: 'water-closer' },
      context,
    );
    const sharedStrengthAba = scoreOrderedLineup(
      { lead: 'water-lead', switch: 'ground-switch', closer: 'water-closer' },
      createLineupContext({
        threats: ['electric-top'],
        topThreats: ['electric-top'],
        matchupRatings: {
          'water-lead': { 'electric-top': 650 },
          'ground-switch': { 'electric-top': 700 },
          'water-closer': { 'electric-top': 650 },
        },
      }),
    );

    expect(abc.diagnosticLabel).toBe('ABC');
    expect(coherentAbb.diagnosticLabel).toBe('ABB');
    expect(fragileAba.diagnosticLabel).toBe('ABA');
    expect(coherentAbb.score).toBeGreaterThan(unsupportedAbb.score);
    expect(coherentAbb.scoreBreakdown.components.synergy).toBeGreaterThan(
      unsupportedAbb.scoreBreakdown.components.synergy,
    );
    expect(coherentAbb.scoreBreakdown.components.safety).toBeGreaterThan(
      unsupportedAbb.scoreBreakdown.components.safety,
    );
    expect(sharedStrengthAba.score).toBeGreaterThan(fragileAba.score);
    expect(sharedStrengthAba.scoreBreakdown.components.safety).toBeGreaterThan(
      fragileAba.scoreBreakdown.components.safety,
    );
  });

  test('penalizes severe shared weakness fixtures', () => {
    const sharedWeakness = scoreOrderedLineup(
      { lead: 'water-lead', switch: 'flyer', closer: 'water-closer' },
      createLineupContext({
        threats: ['electric-top'],
        topThreats: ['electric-top'],
        matchupRatings: {
          'water-lead': { 'electric-top': 350 },
          flyer: { 'electric-top': 350 },
          'water-closer': { 'electric-top': 350 },
        },
      }),
    );
    const distributedResistance = scoreOrderedLineup(
      { lead: 'ground-anchor', switch: 'grass-safe', closer: 'steel-switch' },
      createLineupContext({
        threats: ['electric-top'],
        topThreats: ['electric-top'],
        matchupRatings: {
          'ground-anchor': { 'electric-top': 700 },
          'grass-safe': { 'electric-top': 560 },
          'steel-switch': { 'electric-top': 520 },
        },
      }),
    );

    expect(sharedWeakness.coverageMetrics.overwhelmingLossCount).toBe(3);
    expect(distributedResistance.score).toBeGreaterThan(sharedWeakness.score);
  });

  test('keeps top-threat and full-meta coverage distinct in validation fixtures', () => {
    const topThreatHole = scoreOrderedLineup(
      { lead: 'fire-lead', switch: 'steel-switch', closer: 'ghost-closer' },
      createLineupContext({
        threats: ['electric-top', 'grass-rare'],
        topThreats: ['electric-top'],
        fullMetaThreats: ['electric-top', 'grass-rare'],
        matchupRatings: {
          'fire-lead': { 'electric-top': 350, 'grass-rare': 700 },
          'steel-switch': { 'electric-top': 470, 'grass-rare': 520 },
          'ghost-closer': { 'electric-top': 470, 'grass-rare': 520 },
        },
      }),
    );
    const rareHole = scoreOrderedLineup(
      { lead: 'fire-lead', switch: 'steel-switch', closer: 'ghost-closer' },
      createLineupContext({
        threats: ['electric-top', 'grass-rare'],
        topThreats: ['electric-top'],
        fullMetaThreats: ['electric-top', 'grass-rare'],
        matchupRatings: {
          'fire-lead': { 'electric-top': 700, 'grass-rare': 350 },
          'steel-switch': { 'electric-top': 520, 'grass-rare': 470 },
          'ghost-closer': { 'electric-top': 520, 'grass-rare': 470 },
        },
      }),
    );

    expect(topThreatHole.coverageMetrics.topThreatCoverage?.coverageRate).toBe(
      0,
    );
    expect(rareHole.coverageMetrics.topThreatCoverage?.coverageRate).toBe(1);
    expect(topThreatHole.coverageMetrics.fullMetaCoverage?.coverageRate).toBe(
      0.5,
    );
    expect(rareHole.coverageMetrics.fullMetaCoverage?.coverageRate).toBe(0.5);
    expect(rareHole.score).toBeGreaterThan(topThreatHole.score);

    const fullMetaCovered = scoreOrderedLineup(
      { lead: 'fire-lead', switch: 'steel-switch', closer: 'ghost-closer' },
      createLineupContext({
        threats: ['electric-top', 'grass-rare'],
        topThreats: ['electric-top'],
        fullMetaThreats: ['electric-top', 'grass-rare'],
        matchupRatings: {
          'fire-lead': { 'electric-top': 700, 'grass-rare': 700 },
          'steel-switch': { 'electric-top': 520, 'grass-rare': 520 },
          'ghost-closer': { 'electric-top': 520, 'grass-rare': 520 },
        },
      }),
    );

    expect(
      fullMetaCovered.coverageMetrics.topThreatCoverage?.coverageRate,
    ).toBe(rareHole.coverageMetrics.topThreatCoverage?.coverageRate);
    expect(
      fullMetaCovered.coverageMetrics.fullMetaCoverage?.coverageRate,
    ).toBeGreaterThan(
      rareHole.coverageMetrics.fullMetaCoverage?.coverageRate ?? 0,
    );
    expect(fullMetaCovered.scoreBreakdown.components.coverage).toBeGreaterThan(
      rareHole.scoreBreakdown.components.coverage,
    );
  });

  test('covers dual-type type-effectiveness validation fixtures', () => {
    expect(
      calculateTypeEffectivenessMultiplier('water', ['fire', 'rock']),
    ).toBe(2.56);
    expect(
      calculateTypeEffectivenessMultiplier('fire', ['grass', 'water']),
    ).toBe(1);
    expect(calculateTypeEffectivenessMultiplier('dragon', ['fairy'])).toBe(
      0.39,
    );
  });

  test('prefers multiple viable lineups over one excellent trio with dead roster slots', () => {
    const oneLineRoster = scorePlayPokemonRoster(
      validationRoster,
      createRosterContext({
        scoreLineup: (lineup) =>
          makeLineupResult(lineup, {
            score: isExactLineup(lineup, 'alpha', 'bravo', 'charlie')
              ? 0.98
              : 0.2,
          }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const deepRoster = scorePlayPokemonRoster(
      validationRoster,
      createRosterContext({
        scoreLineup: (lineup) =>
          makeLineupResult(lineup, {
            score: lineup.lead === 'foxtrot' ? 0.45 : 0.72,
          }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(oneLineRoster.metrics.viableLineupCount).toBe(1);
    expect(
      oneLineRoster.metrics.benchUtilitySummary
        .filter((utility) => utility.warnings.includes('unbringable'))
        .map((utility) => utility.speciesId)
        .toSorted(),
    ).toEqual(['delta', 'echo', 'foxtrot']);
    expect(deepRoster.metrics.viableLineupCount).toBeGreaterThan(
      oneLineRoster.metrics.viableLineupCount,
    );
    expect(deepRoster.fitness).toBeGreaterThan(oneLineRoster.fitness);
  });

  test('penalizes strong coverage fixtures with poor bulk', () => {
    const bulkyRoster = [
      'bulky-a',
      'bulky-b',
      'bulky-c',
      'alpha',
      'bravo',
      'charlie',
    ];
    const brittleRoster = [
      'brittle-a',
      'brittle-b',
      'brittle-c',
      'alpha',
      'bravo',
      'charlie',
    ];
    const context = createRosterContext({
      scoreLineup: (lineup) => makeLineupResult(lineup, { score: 0.7 }),
    });

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

    expect(bulkyResult.scoreBreakdown.components.coverage).toBeCloseTo(
      brittleResult.scoreBreakdown.components.coverage,
      5,
    );
    expect(bulkyResult.scoreBreakdown.components.bulk).toBeGreaterThan(
      brittleResult.scoreBreakdown.components.bulk,
    );
    expect(bulkyResult.fitness).toBeGreaterThan(brittleResult.fitness);
  });

  test('penalizes strong individual Pokemon when pick-3 synergy is poor', () => {
    const poorPickThree = scorePlayPokemonRoster(
      validationRoster,
      createRosterContext({
        getRankingScore: () => 95,
        getRankingCategoryScore: () => 95,
        scoreLineup: (lineup) =>
          makeLineupResult(lineup, {
            score: 0.45,
            weaknesses: [lineup.lead, lineup.switch],
            singleAnswerRisks: [lineup.closer],
          }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );
    const playablePickThree = scorePlayPokemonRoster(
      validationRoster,
      createRosterContext({
        getRankingScore: () => 70,
        getRankingCategoryScore: () => 40,
        scoreLineup: (lineup) =>
          makeLineupResult(lineup, {
            score: lineup.lead === 'foxtrot' ? 0.5 : 0.72,
            coveredThreats: [lineup.lead, lineup.switch, lineup.closer],
          }),
      }),
      { mode: 'fast', includeDiagnostics: false, recommendationLimit: 0 },
    );

    expect(poorPickThree.scoreBreakdown.components.consistency).toBeGreaterThan(
      playablePickThree.scoreBreakdown.components.consistency,
    );
    expect(playablePickThree.scoreBreakdown.components.synergy).toBeGreaterThan(
      poorPickThree.scoreBreakdown.components.synergy,
    );
    expect(playablePickThree.fitness).toBeGreaterThan(poorPickThree.fitness);
  });
});

const validationRoster = [
  'alpha',
  'bravo',
  'charlie',
  'delta',
  'echo',
  'foxtrot',
];

const fixturePokemon: Record<string, Pokemon> = {
  alpha: makePokemon('alpha', ['normal']),
  bravo: makePokemon('bravo', ['water']),
  charlie: makePokemon('charlie', ['grass']),
  delta: makePokemon('delta', ['fire']),
  echo: makePokemon('echo', ['steel']),
  foxtrot: makePokemon('foxtrot', ['ghost']),
  'fire-lead': makePokemon('fire-lead', ['fire']),
  'steel-switch': makePokemon('steel-switch', ['steel']),
  'ghost-closer': makePokemon('ghost-closer', ['ghost']),
  'ground-anchor': makePokemon('ground-anchor', ['ground']),
  'ground-decoy': makePokemon('ground-decoy', ['ground']),
  'ground-switch': makePokemon('ground-switch', ['ground']),
  'water-lead': makePokemon('water-lead', ['water']),
  'water-switch': makePokemon('water-switch', ['water']),
  'water-closer': makePokemon('water-closer', ['water']),
  'grass-safe': makePokemon('grass-safe', ['grass']),
  flyer: makePokemon('flyer', ['flying']),
  'electric-top': makePokemon('electric-top', ['electric']),
  'grass-rare': makePokemon('grass-rare', ['grass']),
  'bulky-a': makePokemon('bulky-a', ['normal'], { atk: 90, def: 180, hp: 180 }),
  'bulky-b': makePokemon('bulky-b', ['water'], { atk: 90, def: 180, hp: 180 }),
  'bulky-c': makePokemon('bulky-c', ['grass'], { atk: 90, def: 180, hp: 180 }),
  'brittle-a': makePokemon('brittle-a', ['normal'], {
    atk: 220,
    def: 80,
    hp: 80,
  }),
  'brittle-b': makePokemon('brittle-b', ['water'], {
    atk: 220,
    def: 80,
    hp: 80,
  }),
  'brittle-c': makePokemon('brittle-c', ['grass'], {
    atk: 220,
    def: 80,
    hp: 80,
  }),
};

function createLineupContext(
  overrides: Partial<LineupScoringContext> & {
    matchupRatings?: Record<string, Record<string, number>>;
  } = {},
): LineupScoringContext {
  const matchupRatings = overrides.matchupRatings ?? {};

  return {
    threats: overrides.threats ?? ['electric-top'],
    topThreats: overrides.topThreats,
    fullMetaThreats: overrides.fullMetaThreats,
    getPokemon: (speciesId) => fixturePokemon[speciesId],
    getRankingScore: () => 80,
    getRoleScore: () => 0.7,
    getRankingCategoryScore: () => 70,
    getMatchupRating: (speciesId, threat) =>
      matchupRatings[speciesId]?.[threat] ?? 520,
    getMatchupQualityScore: () => 0.7,
    getRecommendedMoveset: (speciesId) => ({
      fastMove: null,
      chargedMove1: `${fixturePokemon[speciesId]?.types[0] ?? 'normal'}-move`,
      chargedMove2: fixturePokemon[speciesId]?.types[1]
        ? `${fixturePokemon[speciesId].types[1]}-move`
        : null,
    }),
    getMove: (moveId) => ({ type: moveId.replace('-move', '') }),
    getPressureScore: () => 0.35,
    ...overrides,
  };
}

function createRosterContext(
  overrides: Partial<PlayPokemonRosterScoringContext> = {},
): PlayPokemonRosterScoringContext {
  return {
    ...createLineupContext(),
    threats: ['electric-top', 'grass-rare'],
    topThreats: ['electric-top'],
    fullMetaThreats: ['electric-top', 'grass-rare'],
    ...overrides,
  };
}

function makeLineupResult(
  lineup: OrderedLineup,
  overrides: {
    score: number;
    coveredThreats?: string[];
    weaknesses?: string[];
    singleAnswerRisks?: string[];
  },
): LineupScoreResult {
  return {
    lineup,
    score: overrides.score,
    coverageMetrics: {
      coverageRate: overrides.score,
      dominatingMatchupCount: 0,
      overwhelmingLossCount: 0,
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
    scoreBreakdown: createNormalizedScoreBreakdown({
      synergy: overrides.score,
      coverage: overrides.score,
      safety: overrides.score,
      consistency: 0.5,
      bulk: 0.5,
      defensiveRatio: 0.5,
      offensiveRatio: 0.5,
      role: 0.5,
    }),
  };
}

function isExactLineup(
  lineup: OrderedLineup,
  lead: string,
  switchPokemon: string,
  closer: string,
): boolean {
  return (
    lineup.lead === lead &&
    lineup.switch === switchPokemon &&
    lineup.closer === closer
  );
}

function makePokemon(
  speciesId: string,
  types: string[],
  baseStats: Pokemon['baseStats'] = { atk: 120, def: 140, hp: 140 },
): Pokemon {
  return {
    dex: 1,
    speciesName: speciesId,
    speciesId,
    baseStats,
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
