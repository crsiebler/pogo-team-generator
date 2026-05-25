import { describe, expect, test } from 'vitest';
import {
  calculateLineupPatternLabel,
  scoreOrderedLineup,
  type LineupScoringContext,
} from './lineupScoring';
import type { OrderedLineup, Pokemon } from '@/lib/types';

const pokemonById: Record<string, Pokemon> = {
  bulky: makePokemon('bulky', ['water'], { atk: 100, def: 180, hp: 170 }),
  balanced: makePokemon('balanced', ['steel'], { atk: 130, def: 150, hp: 150 }),
  glass: makePokemon('glass', ['fire'], { atk: 190, def: 95, hp: 95 }),
  closer: makePokemon('closer', ['ghost'], { atk: 150, def: 145, hp: 155 }),
  electric: makePokemon('electric', ['electric'], {
    atk: 145,
    def: 130,
    hp: 130,
  }),
  grass: makePokemon('grass', ['grass'], { atk: 140, def: 135, hp: 135 }),
  water: makePokemon('water', ['water'], { atk: 140, def: 135, hp: 135 }),
};

const defaultThreats = ['threat-a', 'threat-b', 'threat-c', 'threat-d'];

describe('scoreOrderedLineup', () => {
  test('lead-specific matchup data changes score for the same three Pokemon', () => {
    const lineupA: OrderedLineup = {
      lead: 'bulky',
      switch: 'balanced',
      closer: 'closer',
    };
    const lineupB: OrderedLineup = {
      lead: 'balanced',
      switch: 'bulky',
      closer: 'closer',
    };
    const context = createContext({
      matchupRatings: {
        bulky: { 'threat-a': 650, 'threat-b': 650 },
        balanced: { 'threat-a': 450, 'threat-b': 450 },
        closer: { 'threat-c': 550, 'threat-d': 550 },
      },
    });

    const scoreA = scoreOrderedLineup(lineupA, context).score;
    const scoreB = scoreOrderedLineup(lineupB, context).score;

    expect(scoreA).toBeGreaterThan(scoreB);
  });

  test('retains a bulk and stat-balance quality signal', () => {
    const bulkyLineup: OrderedLineup = {
      lead: 'bulky',
      switch: 'balanced',
      closer: 'closer',
    };
    const frailLineup: OrderedLineup = {
      lead: 'glass',
      switch: 'electric',
      closer: 'grass',
    };
    const context = createContext({
      matchupRatings: uniformMatchups(520),
      rankingScores: uniformScores(90),
      roleScores: uniformRoleScores(0.7),
    });

    expect(scoreOrderedLineup(bulkyLineup, context).score).toBeGreaterThan(
      scoreOrderedLineup(frailLineup, context).score,
    );
  });

  test('uses 600 and 400 battle-rating thresholds for coverage metrics', () => {
    const lineup: OrderedLineup = {
      lead: 'bulky',
      switch: 'balanced',
      closer: 'closer',
    };
    const result = scoreOrderedLineup(
      lineup,
      createContext({
        matchupRatings: {
          bulky: { 'threat-a': 601, 'threat-b': 399, 'threat-c': 500 },
          balanced: { 'threat-a': 450, 'threat-b': 450, 'threat-c': 650 },
          closer: { 'threat-a': 450, 'threat-b': 450, 'threat-d': 399 },
        },
      }),
    );

    expect(result.coverageMetrics.dominatingMatchupCount).toBe(2);
    expect(result.coverageMetrics.overwhelmingLossCount).toBe(2);
  });

  test('reports covered threats, weaknesses, and single-answer risks', () => {
    const lineup: OrderedLineup = {
      lead: 'bulky',
      switch: 'balanced',
      closer: 'closer',
    };
    const result = scoreOrderedLineup(
      lineup,
      createContext({
        matchupRatings: {
          bulky: { 'threat-a': 550, 'threat-b': 450, 'threat-c': 450 },
          balanced: { 'threat-a': 450, 'threat-b': 550, 'threat-c': 450 },
          closer: { 'threat-a': 450, 'threat-b': 450, 'threat-c': 450 },
        },
      }),
    );

    expect(result.coverageMetrics.coverageRate).toBe(2 / 3);
    expect(result.coveredThreats).toEqual(['threat-a', 'threat-b']);
    expect(result.weaknesses).toEqual(['threat-c']);
    expect(result.weaknesses).not.toContain('threat-d');
    expect(result.singleAnswerRisks).toEqual(['threat-a', 'threat-b']);
    expect(result.coverageMetrics.singleAnswerThreatCount).toBe(2);
    expect(result.componentScores.coreBreakerReliability).toBeCloseTo(2 / 3);
  });

  test('exposes separate top-threat and full-meta coverage diagnostics', () => {
    const lineup: OrderedLineup = {
      lead: 'bulky',
      switch: 'balanced',
      closer: 'closer',
    };
    const result = scoreOrderedLineup(
      lineup,
      createContext({
        threats: ['top-threat', 'rare-threat'],
        topThreats: ['top-threat'],
        fullMetaThreats: ['top-threat', 'rare-threat'],
        matchupRatings: {
          bulky: { 'top-threat': 650, 'rare-threat': 450 },
          balanced: { 'top-threat': 450, 'rare-threat': 450 },
          closer: { 'top-threat': 450, 'rare-threat': 450 },
        },
      }),
    );

    expect(result.coverageMetrics.topThreatCoverage).toEqual({
      coverageRate: 1,
      evaluatedThreatCount: 1,
      noAnswerThreatCount: 0,
      singleAnswerThreatCount: 1,
      dominatingMatchupCount: 1,
      overwhelmingLossCount: 0,
    });
    expect(result.coverageMetrics.fullMetaCoverage).toEqual({
      coverageRate: 0.5,
      evaluatedThreatCount: 2,
      noAnswerThreatCount: 1,
      singleAnswerThreatCount: 1,
      dominatingMatchupCount: 1,
      overwhelmingLossCount: 0,
    });
  });

  test('weights top-threat coverage higher than rare full-meta coverage', () => {
    const lineup: OrderedLineup = {
      lead: 'bulky',
      switch: 'balanced',
      closer: 'closer',
    };
    const topThreatHole = scoreOrderedLineup(
      lineup,
      createContext({
        threats: ['top-threat', 'rare-threat'],
        topThreats: ['top-threat'],
        fullMetaThreats: ['top-threat', 'rare-threat'],
        matchupRatings: {
          bulky: { 'top-threat': 350, 'rare-threat': 650 },
          balanced: { 'top-threat': 450, 'rare-threat': 450 },
          closer: { 'top-threat': 450, 'rare-threat': 450 },
        },
      }),
    );
    const rareFullMetaHole = scoreOrderedLineup(
      lineup,
      createContext({
        threats: ['top-threat', 'rare-threat'],
        topThreats: ['top-threat'],
        fullMetaThreats: ['top-threat', 'rare-threat'],
        matchupRatings: {
          bulky: { 'top-threat': 650, 'rare-threat': 350 },
          balanced: { 'top-threat': 450, 'rare-threat': 450 },
          closer: { 'top-threat': 450, 'rare-threat': 450 },
        },
      }),
    );

    expect(rareFullMetaHole.score).toBeGreaterThan(topThreatHole.score);
    expect(
      rareFullMetaHole.coverageMetrics.topThreatCoverage?.coverageRate,
    ).toBe(1);
    expect(topThreatHole.coverageMetrics.topThreatCoverage?.coverageRate).toBe(
      0,
    );
  });

  test('does not penalize unevaluated split pools as automatic coverage holes', () => {
    const lineup: OrderedLineup = {
      lead: 'bulky',
      switch: 'balanced',
      closer: 'closer',
    };
    const result = scoreOrderedLineup(
      lineup,
      createContext({
        threats: ['top-threat', 'rare-threat'],
        topThreats: ['missing-top-threat'],
        fullMetaThreats: ['rare-threat'],
        matchupRatings: {
          bulky: { 'rare-threat': 650 },
          balanced: { 'rare-threat': 450 },
          closer: { 'rare-threat': 450 },
        },
      }),
    );

    expect(result.coverageMetrics.topThreatCoverage).toMatchObject({
      coverageRate: 0,
      evaluatedThreatCount: 0,
    });
    expect(result.componentScores.matchupCoverage).toBeGreaterThan(0.5);
  });

  test('retains ranking, role, move, energy, and shield quality signals', () => {
    const lineup: OrderedLineup = {
      lead: 'bulky',
      switch: 'balanced',
      closer: 'closer',
    };
    const weakContext = createContext({
      rankingScores: uniformScores(40),
      roleScores: uniformRoleScores(0.2),
      matchupRatings: uniformMatchups(520),
      matchupQualityScores: uniformScores(0.3),
      recommendedMovesets: uniformMovesets('FAST_SLOW', 'POOR_A', 'POOR_B'),
      moves: {
        POOR_A: { type: 'normal' },
        POOR_B: { type: 'normal' },
      },
      pressureScores: { FAST_SLOW: { POOR_A: 0.1 } },
    });
    const strongContext = createContext({
      rankingScores: uniformScores(90),
      roleScores: {
        ...uniformRoleScores(0.2),
        balanced: { switch: 0.9 },
        closer: { closer: 0.9 },
      },
      matchupRatings: uniformMatchups(520),
      matchupQualityScores: uniformScores(0.8),
      recommendedMovesets: uniformMovesets('FAST_QUICK', 'WATER_A', 'GHOST_A'),
      moves: {
        WATER_A: { type: 'water' },
        GHOST_A: { type: 'ghost' },
      },
      pressureScores: { FAST_QUICK: { WATER_A: 0.45 } },
    });

    expect(scoreOrderedLineup(lineup, strongContext).score).toBeGreaterThan(
      scoreOrderedLineup(lineup, weakContext).score,
    );
  });

  test('retains type synergy and diversity signals', () => {
    const diverseLineup: OrderedLineup = {
      lead: 'bulky',
      switch: 'balanced',
      closer: 'closer',
    };
    const stackedLineup: OrderedLineup = {
      lead: 'water',
      switch: 'bulky',
      closer: 'water',
    };
    const context = createContext({
      matchupRatings: uniformMatchups(520),
      rankingScores: uniformScores(90),
      roleScores: uniformRoleScores(0.7),
    });

    expect(scoreOrderedLineup(diverseLineup, context).score).toBeGreaterThan(
      scoreOrderedLineup(stackedLineup, context).score,
    );
  });

  test('computes balanced, shield-spend, and shield-save resource path metrics from shield-specific matchups', () => {
    const lineup: OrderedLineup = {
      lead: 'bulky',
      switch: 'balanced',
      closer: 'closer',
    };
    const result = scoreOrderedLineup(
      lineup,
      createContext({
        threats: ['threat-a'],
        shieldMatchupRatings: {
          bulky: {
            'threat-a': { 0: 200, 1: 800, 2: 300 },
          },
          balanced: {
            'threat-a': { 0: 800, 1: 200, 2: 300 },
          },
          closer: {
            'threat-a': { 0: 800, 1: 200, 2: 300 },
          },
        },
      }),
    );

    expect(result.resourcePathMetrics?.balanced).toEqual({
      available: true,
      score: expect.closeTo(0.4),
    });
    expect(result.resourcePathMetrics?.shieldSpend).toEqual({
      available: true,
      score: expect.closeTo(0.6333333333333333),
    });
    expect(result.resourcePathMetrics?.shieldSave).toEqual({
      available: true,
      score: expect.closeTo(0.26666666666666666),
    });
  });

  test('does not treat missing shield-specific data as an automatic resource-path loss', () => {
    const lineup: OrderedLineup = {
      lead: 'bulky',
      switch: 'balanced',
      closer: 'closer',
    };
    const result = scoreOrderedLineup(
      lineup,
      createContext({
        threats: ['threat-a'],
        shieldMatchupRatings: {
          bulky: {
            'threat-a': { 1: 800 },
          },
        },
      }),
    );

    expect(result.resourcePathMetrics?.balanced).toEqual({
      available: true,
      score: expect.closeTo(0.6),
    });
    expect(result.resourcePathMetrics?.shieldSpend).toEqual({
      available: false,
    });
    expect(result.resourcePathMetrics?.shieldSave).toEqual({
      available: false,
    });
  });
});

describe('calculateLineupPatternLabel', () => {
  test('classifies ABC, ABB, and ABA structures as diagnostics', () => {
    expect(
      calculateLineupPatternLabel(
        { lead: 'water', switch: 'electric', closer: 'grass' },
        createContext(),
      ),
    ).toBe('ABC');
    expect(
      calculateLineupPatternLabel(
        { lead: 'water', switch: 'grass', closer: 'grass' },
        createContext(),
      ),
    ).toBe('ABB');
    expect(
      calculateLineupPatternLabel(
        { lead: 'water', switch: 'electric', closer: 'water' },
        createContext(),
      ),
    ).toBe('ABA');
  });
});

function createContext(
  overrides: Partial<LineupScoringContext> & {
    matchupRatings?: Record<string, Record<string, number>>;
    matchupQualityScores?: Record<string, number>;
    moves?: Record<string, { type: string }>;
    pressureScores?: Record<string, Record<string, number>>;
    rankingScores?: Record<string, number>;
    recommendedMovesets?: Record<
      string,
      {
        fastMove: string | null;
        chargedMove1: string | null;
        chargedMove2: string | null;
      }
    >;
    roleScores?: Record<
      string,
      Partial<Record<'lead' | 'switch' | 'closer', number>>
    >;
    shieldMatchupRatings?: Record<
      string,
      Record<string, Partial<Record<0 | 1 | 2, number>>>
    >;
  } = {},
): LineupScoringContext {
  const matchupRatings = overrides.matchupRatings ?? uniformMatchups(500);
  const matchupQualityScores =
    overrides.matchupQualityScores ?? uniformScores(0.5);
  const moves = overrides.moves ?? {
    CHARGED_A: { type: 'water' },
    CHARGED_B: { type: 'ghost' },
  };
  const pressureScores = overrides.pressureScores ?? {};
  const rankingScores = overrides.rankingScores ?? uniformScores(80);
  const recommendedMovesets =
    overrides.recommendedMovesets ??
    uniformMovesets('FAST', 'CHARGED_A', 'CHARGED_B');
  const roleScores = overrides.roleScores ?? uniformRoleScores(0.5);

  return {
    threats: defaultThreats,
    getPokemon: (speciesId) => pokemonById[speciesId],
    getRankingScore: (speciesId) => rankingScores[speciesId] ?? 80,
    getRoleScore: (speciesId, role) => roleScores[speciesId]?.[role] ?? 0.5,
    getMatchupRating: (speciesId, threatId) =>
      matchupRatings[speciesId]?.[threatId] ?? null,
    getShieldScenarioMatchupRating: (speciesId, threatId, shields) =>
      overrides.shieldMatchupRatings?.[speciesId]?.[threatId]?.[shields] ??
      null,
    getMatchupQualityScore: (speciesId) =>
      matchupQualityScores[speciesId] ?? 0.5,
    getMove: (moveId) => moves[moveId],
    getRecommendedMoveset: (speciesId) => recommendedMovesets[speciesId],
    getPressureScore: (fastMoveId, chargedMoveId) =>
      pressureScores[fastMoveId]?.[chargedMoveId] ?? 0,
    ...overrides,
  };
}

function makePokemon(
  speciesId: string,
  types: string[],
  baseStats: Pokemon['baseStats'],
): Pokemon {
  return {
    dex: 1,
    speciesName: speciesId,
    speciesId,
    baseStats,
    types,
    fastMoves: ['FAST'],
    chargedMoves: ['CHARGED_A', 'CHARGED_B'],
    tags: [],
    defaultIVs: {},
    buddyDistance: 3,
    thirdMoveCost: 10000,
    released: true,
  };
}

function uniformMatchups(
  value: number,
): Record<string, Record<string, number>> {
  return Object.fromEntries(
    Object.keys(pokemonById).map((speciesId) => [
      speciesId,
      Object.fromEntries(defaultThreats.map((threat) => [threat, value])),
    ]),
  );
}

function uniformScores(value: number): Record<string, number> {
  return Object.fromEntries(
    Object.keys(pokemonById).map((speciesId) => [speciesId, value]),
  );
}

function uniformRoleScores(
  value: number,
): Record<string, Partial<Record<'lead' | 'switch' | 'closer', number>>> {
  return Object.fromEntries(
    Object.keys(pokemonById).map((speciesId) => [
      speciesId,
      { lead: value, switch: value, closer: value },
    ]),
  );
}

function uniformMovesets(
  fastMove: string,
  chargedMove1: string,
  chargedMove2: string,
): Record<
  string,
  { fastMove: string; chargedMove1: string; chargedMove2: string }
> {
  return Object.fromEntries(
    Object.keys(pokemonById).map((speciesId) => [
      speciesId,
      { fastMove, chargedMove1, chargedMove2 },
    ]),
  );
}
