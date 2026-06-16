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
  fire: makePokemon('fire', ['fire'], { atk: 140, def: 135, hp: 135 }),
  glass: makePokemon('glass', ['fire'], { atk: 190, def: 95, hp: 95 }),
  closer: makePokemon('closer', ['ghost'], { atk: 150, def: 145, hp: 155 }),
  electric: makePokemon('electric', ['electric'], {
    atk: 145,
    def: 130,
    hp: 130,
  }),
  flyer: makePokemon('flyer', ['flying'], { atk: 140, def: 135, hp: 135 }),
  ground: makePokemon('ground', ['ground'], { atk: 140, def: 135, hp: 135 }),
  grass: makePokemon('grass', ['grass'], { atk: 140, def: 135, hp: 135 }),
  water: makePokemon('water', ['water'], { atk: 140, def: 135, hp: 135 }),
  'electric-threat': makePokemon('electric-threat', ['electric'], {
    atk: 140,
    def: 135,
    hp: 135,
  }),
  'grass-threat': makePokemon('grass-threat', ['grass'], {
    atk: 140,
    def: 135,
    hp: 135,
  }),
  'threat-fire-rock': makePokemon('threat-fire-rock', ['fire', 'rock'], {
    atk: 140,
    def: 135,
    hp: 135,
  }),
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
    expect(result.weaknesses).toEqual(['threat-c', 'threat-a', 'threat-b']);
    expect(result.weaknesses).not.toContain('threat-d');
    expect(result.singleAnswerRisks).toEqual(['threat-a', 'threat-b']);
    expect(result.coverageMetrics.singleAnswerThreatCount).toBe(2);
    expect(result.componentScores.coreBreakerReliability).toBeCloseTo(2 / 3);
  });

  test('reports lineup weaknesses as threats that beat a majority of the lineup', () => {
    const lineup: OrderedLineup = {
      lead: 'bulky',
      switch: 'balanced',
      closer: 'closer',
    };
    const result = scoreOrderedLineup(
      lineup,
      createContext({
        threats: ['majority-loss', 'single-loss', 'missing-threat'],
        topThreats: ['majority-loss', 'single-loss', 'missing-threat'],
        fullMetaThreats: ['majority-loss', 'single-loss', 'missing-threat'],
        matchupRatings: {
          bulky: { 'majority-loss': 550, 'single-loss': 450 },
          balanced: { 'majority-loss': 450, 'single-loss': 550 },
          closer: { 'majority-loss': 450, 'single-loss': 550 },
        },
      }),
    );

    expect(result.coveredThreats).toEqual(['majority-loss', 'single-loss']);
    expect(result.weaknesses).toEqual(['majority-loss']);
    expect(result.weaknesses).not.toContain('single-loss');
    expect(result.weaknesses).not.toContain('missing-threat');
  });

  test('sorts lineup weaknesses by average matchup rating and caps the list', () => {
    const lineup: OrderedLineup = {
      lead: 'bulky',
      switch: 'balanced',
      closer: 'closer',
    };
    const threats = [
      'least-severe',
      'sixth-severe',
      'most-severe',
      'third-severe',
      'fourth-severe',
      'second-severe',
      'fifth-severe',
      'not-majority-loss',
    ];
    const result = scoreOrderedLineup(
      lineup,
      createContext({
        threats,
        topThreats: threats,
        fullMetaThreats: threats,
        matchupRatings: {
          bulky: {
            'least-severe': 490,
            'sixth-severe': 430,
            'most-severe': 300,
            'third-severe': 360,
            'fourth-severe': 390,
            'second-severe': 330,
            'fifth-severe': 410,
            'not-majority-loss': 520,
          },
          balanced: {
            'least-severe': 510,
            'sixth-severe': 430,
            'most-severe': 300,
            'third-severe': 360,
            'fourth-severe': 390,
            'second-severe': 330,
            'fifth-severe': 410,
            'not-majority-loss': 520,
          },
          closer: {
            'least-severe': 490,
            'sixth-severe': 430,
            'most-severe': 300,
            'third-severe': 360,
            'fourth-severe': 390,
            'second-severe': 330,
            'fifth-severe': 410,
            'not-majority-loss': 480,
          },
        },
      }),
    );

    expect(result.weaknesses).toEqual([
      'most-severe',
      'second-severe',
      'third-severe',
      'fourth-severe',
      'fifth-severe',
    ]);
  });

  test('uses soft matchup quality for coverage scoring while retaining binary diagnostics', () => {
    const lineup: OrderedLineup = {
      lead: 'bulky',
      switch: 'balanced',
      closer: 'closer',
    };
    const decisiveAnswer = scoreOrderedLineup(
      lineup,
      createContext({
        threats: ['threat-a'],
        topThreats: ['threat-a'],
        fullMetaThreats: ['threat-a'],
        matchupRatings: {
          bulky: { 'threat-a': 520 },
          balanced: { 'threat-a': 300 },
          closer: { 'threat-a': 700 },
        },
      }),
    );
    const closeAnswer = scoreOrderedLineup(
      lineup,
      createContext({
        threats: ['threat-a'],
        topThreats: ['threat-a'],
        fullMetaThreats: ['threat-a'],
        matchupRatings: {
          bulky: { 'threat-a': 520 },
          balanced: { 'threat-a': 480 },
          closer: { 'threat-a': 520 },
        },
      }),
    );

    expect(decisiveAnswer.coverageMetrics.coverageRate).toBe(
      closeAnswer.coverageMetrics.coverageRate,
    );
    expect(decisiveAnswer.componentScores.matchupCoverage).toBeGreaterThan(
      closeAnswer.componentScores.matchupCoverage,
    );
    expect(decisiveAnswer.scoreBreakdown.components.coverage).toBeGreaterThan(
      closeAnswer.scoreBreakdown.components.coverage,
    );
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

  test('exposes lower-is-better threat score diagnostics', () => {
    const lineup: OrderedLineup = {
      lead: 'bulky',
      switch: 'balanced',
      closer: 'closer',
    };
    const result = scoreOrderedLineup(
      lineup,
      createContext({
        threats: ['top-hole', 'single-answer', 'rare-hole'],
        topThreats: ['top-hole', 'single-answer'],
        fullMetaThreats: ['top-hole', 'single-answer', 'rare-hole'],
        matchupRatings: {
          bulky: {
            'top-hole': 450,
            'single-answer': 560,
            'rare-hole': 450,
          },
          balanced: {
            'top-hole': 440,
            'single-answer': 450,
            'rare-hole': 450,
          },
          closer: {
            'top-hole': 430,
            'single-answer': 450,
            'rare-hole': 450,
          },
        },
      }),
    );

    expect(result.scoreBreakdown.threatScore).toEqual(
      expect.objectContaining({
        score: expect.any(Number),
        evaluatedCount: 3,
      }),
    );
    expect(result.scoreBreakdown.threatScore?.topMetaThreats).toEqual([
      expect.objectContaining({ speciesId: 'top-hole', teamAnswers: 0 }),
      expect.objectContaining({ speciesId: 'single-answer', teamAnswers: 1 }),
    ]);
    expect(result.scoreBreakdown.threatScore?.overallTeamThreats).toEqual([
      expect.objectContaining({ speciesId: 'top-hole', teamAnswers: 0 }),
      expect.objectContaining({ speciesId: 'rare-hole', teamAnswers: 0 }),
      expect.objectContaining({ speciesId: 'single-answer', teamAnswers: 1 }),
    ]);
  });

  test('can omit display-only threat score diagnostics for hot-path scoring', () => {
    const result = scoreOrderedLineup(
      { lead: 'bulky', switch: 'balanced', closer: 'closer' },
      createContext({ matchupRatings: uniformMatchups(520) }),
      { includeThreatScore: false },
    );

    expect(result.scoreBreakdown.threatScore).toBeUndefined();
  });

  test('passes configured threat score pool weights into diagnostics', () => {
    const result = scoreOrderedLineup(
      { lead: 'bulky', switch: 'balanced', closer: 'closer' },
      createContext({
        threats: ['top-hole', 'rare-covered'],
        topThreats: ['top-hole'],
        fullMetaThreats: ['rare-covered'],
        threatScorePoolWeights: { topMeta: 0.8, fullMeta: 0.2 },
        matchupRatings: {
          bulky: { 'top-hole': 450, 'rare-covered': 560 },
          balanced: { 'top-hole': 450, 'rare-covered': 560 },
          closer: { 'top-hole': 450, 'rare-covered': 560 },
        },
      }),
    );

    expect(result.scoreBreakdown.threatScore?.score).toBeCloseTo(
      0.5333333333333334,
    );
    expect(result.scoreBreakdown.threatScore?.pools).toEqual({
      topMeta: {
        score: expect.closeTo(0.6666666666666667),
        evaluatedCount: 1,
        weight: 0.8,
      },
      fullMeta: { score: 0, evaluatedCount: 1, weight: 0.2 },
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

  test('combines lineup scoring through normalized weighted optimizer components', () => {
    const waterPressure = scoreOrderedLineup(
      {
        lead: 'water',
        switch: 'bulky',
        closer: 'ground',
      },
      createContext({
        threats: ['threat-fire-rock'],
        topThreats: ['threat-fire-rock'],
        fullMetaThreats: ['threat-fire-rock'],
        matchupRatings: uniformMatchups(560),
        rankingScores: uniformScores(90),
        roleScores: uniformRoleScores(0.8),
        recommendedMovesets: uniformMovesets('WATER_A', 'WATER_A', 'WATER_B'),
        moves: {
          WATER_A: { type: 'water' },
          WATER_B: { type: 'water' },
        },
      }),
    );
    const resistedPressure = scoreOrderedLineup(
      {
        lead: 'water',
        switch: 'bulky',
        closer: 'ground',
      },
      createContext({
        threats: ['threat-fire-rock'],
        topThreats: ['threat-fire-rock'],
        fullMetaThreats: ['threat-fire-rock'],
        matchupRatings: uniformMatchups(560),
        rankingScores: uniformScores(90),
        roleScores: uniformRoleScores(0.8),
        recommendedMovesets: uniformMovesets(
          'DRAGON_A',
          'DRAGON_A',
          'DRAGON_B',
        ),
        moves: {
          DRAGON_A: { type: 'dragon' },
          DRAGON_B: { type: 'dragon' },
        },
      }),
    );

    expect(waterPressure.scoreBreakdown.components).toEqual({
      synergy: expect.any(Number),
      coverage: expect.any(Number),
      safety: expect.any(Number),
      consistency: expect.any(Number),
      bulk: expect.any(Number),
      defensiveRatio: expect.any(Number),
      offensiveRatio: expect.any(Number),
      role: expect.any(Number),
    });
    expect(waterPressure.score).toBe(waterPressure.scoreBreakdown.score);
    expect(
      Object.values(waterPressure.scoreBreakdown.components).every(
        (score) => score >= 0 && score <= 1,
      ),
    ).toBe(true);
    expect(
      waterPressure.scoreBreakdown.components.offensiveRatio,
    ).toBeGreaterThan(
      resistedPressure.scoreBreakdown.components.offensiveRatio,
    );
  });

  test('allows coherent ABB lineups to score well when the lead covers the backline weakness', () => {
    const coherentAbb = scoreOrderedLineup(
      {
        lead: 'ground',
        switch: 'water',
        closer: 'bulky',
      },
      createContext({
        threats: ['electric-threat'],
        topThreats: ['electric-threat'],
        matchupRatings: {
          ground: { 'electric-threat': 700 },
          water: { 'electric-threat': 350 },
          bulky: { 'electric-threat': 350 },
        },
        rankingScores: uniformScores(80),
        roleScores: uniformRoleScores(0.7),
      }),
    );
    const unsupportedAbb = scoreOrderedLineup(
      {
        lead: 'fire',
        switch: 'water',
        closer: 'bulky',
      },
      createContext({
        threats: ['electric-threat'],
        topThreats: ['electric-threat'],
        matchupRatings: {
          fire: { 'electric-threat': 450 },
          water: { 'electric-threat': 350 },
          bulky: { 'electric-threat': 350 },
        },
        rankingScores: uniformScores(80),
        roleScores: uniformRoleScores(0.7),
      }),
    );
    const backlineAnswerAbb = scoreOrderedLineup(
      {
        lead: 'fire',
        switch: 'water',
        closer: 'bulky',
      },
      createContext({
        threats: ['electric-threat'],
        topThreats: ['electric-threat'],
        matchupRatings: {
          fire: { 'electric-threat': 350 },
          water: { 'electric-threat': 700 },
          bulky: { 'electric-threat': 350 },
        },
        rankingScores: uniformScores(80),
        roleScores: uniformRoleScores(0.7),
      }),
    );

    expect(coherentAbb.diagnosticLabel).toBe('ABB');
    expect(coherentAbb.score).toBeGreaterThan(unsupportedAbb.score);
    expect(coherentAbb.scoreBreakdown.components.synergy).toBeGreaterThan(
      unsupportedAbb.scoreBreakdown.components.synergy,
    );
    expect(coherentAbb.scoreBreakdown.components.synergy).toBeGreaterThan(
      backlineAnswerAbb.scoreBreakdown.components.synergy,
    );
  });

  test('rewards matchup-profile ABB support without relying on type-share labels', () => {
    const matchupSupported = scoreOrderedLineup(
      {
        lead: 'ground',
        switch: 'balanced',
        closer: 'closer',
      },
      createContext({
        threats: ['electric-threat'],
        topThreats: ['electric-threat'],
        matchupRatings: {
          ground: { 'electric-threat': 700 },
          balanced: { 'electric-threat': 350 },
          closer: { 'electric-threat': 350 },
        },
        rankingScores: uniformScores(80),
        roleScores: uniformRoleScores(0.7),
      }),
    );
    const unsupported = scoreOrderedLineup(
      {
        lead: 'fire',
        switch: 'balanced',
        closer: 'closer',
      },
      createContext({
        threats: ['electric-threat'],
        topThreats: ['electric-threat'],
        matchupRatings: {
          fire: { 'electric-threat': 450 },
          balanced: { 'electric-threat': 350 },
          closer: { 'electric-threat': 350 },
        },
        rankingScores: uniformScores(80),
        roleScores: uniformRoleScores(0.7),
      }),
    );

    expect(matchupSupported.diagnosticLabel).toBe('ABC');
    expect(matchupSupported.scoreBreakdown.components.synergy).toBeGreaterThan(
      unsupported.scoreBreakdown.components.synergy,
    );
  });

  test('penalizes ABA shared weakness when it creates top-threat lead-alignment fragility', () => {
    const fragileAba = scoreOrderedLineup(
      {
        lead: 'water',
        switch: 'ground',
        closer: 'bulky',
      },
      createContext({
        threats: ['electric-threat'],
        topThreats: ['electric-threat'],
        matchupRatings: {
          water: { 'electric-threat': 350 },
          ground: { 'electric-threat': 700 },
          bulky: { 'electric-threat': 350 },
        },
        rankingScores: uniformScores(80),
        roleScores: uniformRoleScores(0.7),
      }),
    );
    const redundantAnswerAba = scoreOrderedLineup(
      {
        lead: 'water',
        switch: 'ground',
        closer: 'bulky',
      },
      createContext({
        threats: ['electric-threat'],
        topThreats: ['electric-threat'],
        matchupRatings: {
          water: { 'electric-threat': 650 },
          ground: { 'electric-threat': 700 },
          bulky: { 'electric-threat': 650 },
        },
        rankingScores: uniformScores(80),
        roleScores: uniformRoleScores(0.7),
      }),
    );

    expect(fragileAba.diagnosticLabel).toBe('ABA');
    expect(redundantAnswerAba.score).toBeGreaterThan(fragileAba.score);
    expect(redundantAnswerAba.scoreBreakdown.components.safety).toBeGreaterThan(
      fragileAba.scoreBreakdown.components.safety,
    );
  });

  test('applies top-threat ABA fragility even when another threat is lead-covered', () => {
    const supportedButFragile = scoreOrderedLineup(
      {
        lead: 'water',
        switch: 'ground',
        closer: 'bulky',
      },
      createContext({
        threats: ['grass-threat', 'electric-threat'],
        topThreats: ['grass-threat', 'electric-threat'],
        matchupRatings: {
          water: { 'grass-threat': 700, 'electric-threat': 350 },
          ground: { 'grass-threat': 350, 'electric-threat': 700 },
          bulky: { 'grass-threat': 350, 'electric-threat': 350 },
        },
        rankingScores: uniformScores(80),
        roleScores: uniformRoleScores(0.7),
      }),
    );
    const supportedOnly = scoreOrderedLineup(
      {
        lead: 'water',
        switch: 'ground',
        closer: 'bulky',
      },
      createContext({
        threats: ['grass-threat', 'electric-threat'],
        topThreats: ['grass-threat', 'electric-threat'],
        matchupRatings: {
          water: { 'grass-threat': 700, 'electric-threat': 550 },
          ground: { 'grass-threat': 350, 'electric-threat': 700 },
          bulky: { 'grass-threat': 350, 'electric-threat': 350 },
        },
        rankingScores: uniformScores(80),
        roleScores: uniformRoleScores(0.7),
      }),
    );

    expect(supportedButFragile.diagnosticLabel).toBe('ABA');
    expect(supportedButFragile.scoreBreakdown.components.safety).toBeLessThan(
      supportedOnly.scoreBreakdown.components.safety,
    );
    expect(supportedButFragile.scoreBreakdown.components.synergy).toBeLessThan(
      supportedOnly.scoreBreakdown.components.synergy,
    );
  });

  test('treats sub-500 top-threat losses as structure fragility', () => {
    const fragileAba = scoreOrderedLineup(
      {
        lead: 'water',
        switch: 'ground',
        closer: 'bulky',
      },
      createContext({
        threats: ['electric-threat'],
        topThreats: ['electric-threat'],
        matchupRatings: {
          water: { 'electric-threat': 450 },
          ground: { 'electric-threat': 700 },
          bulky: { 'electric-threat': 450 },
        },
        rankingScores: uniformScores(80),
        roleScores: uniformRoleScores(0.7),
      }),
    );
    const neutralAba = scoreOrderedLineup(
      {
        lead: 'water',
        switch: 'ground',
        closer: 'bulky',
      },
      createContext({
        threats: ['electric-threat'],
        topThreats: ['electric-threat'],
        matchupRatings: {
          water: { 'electric-threat': 500 },
          ground: { 'electric-threat': 700 },
          bulky: { 'electric-threat': 500 },
        },
        rankingScores: uniformScores(80),
        roleScores: uniformRoleScores(0.7),
      }),
    );

    expect(neutralAba.scoreBreakdown.components.synergy).toBeGreaterThan(
      fragileAba.scoreBreakdown.components.synergy,
    );
  });

  test('weights defensive ratio by top-threat and full-meta expected attack types separately', () => {
    const lineup: OrderedLineup = {
      lead: 'ground',
      switch: 'water',
      closer: 'flyer',
    };
    const fullMetaOnlyElectric = scoreOrderedLineup(
      lineup,
      createContext({
        threats: ['grass-threat'],
        topThreats: ['electric-threat'],
        fullMetaThreats: ['grass-threat'],
        matchupRatings: uniformMatchups(520),
        rankingScores: uniformScores(80),
        roleScores: uniformRoleScores(0.7),
        recommendedMovesets: {
          ...uniformMovesets('FAST', 'WATER_A', 'GHOST_A'),
          'electric-threat': {
            fastMove: 'ELECTRIC_FAST',
            chargedMove1: 'ELECTRIC_A',
            chargedMove2: 'ELECTRIC_B',
          },
          'grass-threat': {
            fastMove: 'GRASS_FAST',
            chargedMove1: 'GRASS_A',
            chargedMove2: 'GRASS_B',
          },
        },
        moves: {
          WATER_A: { type: 'water' },
          GHOST_A: { type: 'ghost' },
          ELECTRIC_FAST: { type: 'electric' },
          ELECTRIC_A: { type: 'electric' },
          ELECTRIC_B: { type: 'electric' },
          GRASS_FAST: { type: 'grass' },
          GRASS_A: { type: 'grass' },
          GRASS_B: { type: 'grass' },
        },
      }),
    );
    const fullMetaOnlyGrass = scoreOrderedLineup(
      lineup,
      createContext({
        threats: ['grass-threat'],
        topThreats: ['grass-threat'],
        fullMetaThreats: ['grass-threat'],
        matchupRatings: uniformMatchups(520),
        rankingScores: uniformScores(80),
        roleScores: uniformRoleScores(0.7),
        recommendedMovesets: {
          ...uniformMovesets('FAST', 'WATER_A', 'GHOST_A'),
          'grass-threat': {
            fastMove: 'GRASS_FAST',
            chargedMove1: 'GRASS_A',
            chargedMove2: 'GRASS_B',
          },
        },
        moves: {
          WATER_A: { type: 'water' },
          GHOST_A: { type: 'ghost' },
          GRASS_FAST: { type: 'grass' },
          GRASS_A: { type: 'grass' },
          GRASS_B: { type: 'grass' },
        },
      }),
    );

    expect(
      fullMetaOnlyElectric.scoreBreakdown.components.defensiveRatio,
    ).toBeGreaterThan(
      fullMetaOnlyGrass.scoreBreakdown.components.defensiveRatio,
    );
  });

  test('bounds top-threat expected attack pools before defensive ratio scoring', () => {
    const topElectricThreats = Array.from(
      { length: 50 },
      (_value, index) => `electric-top-${index}`,
    );
    const lineup: OrderedLineup = {
      lead: 'ground',
      switch: 'water',
      closer: 'flyer',
    };
    const context = createContext({
      threats: ['grass-threat'],
      fullMetaThreats: ['grass-threat'],
      matchupRatings: uniformMatchups(520),
      rankingScores: uniformScores(80),
      roleScores: uniformRoleScores(0.7),
      getPokemon: (speciesId) => {
        if (speciesId.startsWith('electric-top-')) {
          return makePokemon(speciesId, ['electric'], {
            atk: 140,
            def: 135,
            hp: 135,
          });
        }

        return pokemonById[speciesId];
      },
      getRecommendedMoveset: (speciesId) => {
        if (speciesId.startsWith('electric-top-')) {
          return {
            fastMove: 'ELECTRIC_FAST',
            chargedMove1: 'ELECTRIC_A',
            chargedMove2: 'ELECTRIC_B',
          };
        }
        if (speciesId === 'grass-threat') {
          return {
            fastMove: 'GRASS_FAST',
            chargedMove1: 'GRASS_A',
            chargedMove2: 'GRASS_B',
          };
        }

        return uniformMovesets('FAST', 'WATER_A', 'GHOST_A')[speciesId];
      },
      moves: {
        WATER_A: { type: 'water' },
        GHOST_A: { type: 'ghost' },
        ELECTRIC_FAST: { type: 'electric' },
        ELECTRIC_A: { type: 'electric' },
        ELECTRIC_B: { type: 'electric' },
        GRASS_FAST: { type: 'grass' },
        GRASS_A: { type: 'grass' },
        GRASS_B: { type: 'grass' },
      },
    });
    const bounded = scoreOrderedLineup(lineup, {
      ...context,
      topThreats: topElectricThreats,
    });
    const oversized = scoreOrderedLineup(lineup, {
      ...context,
      topThreats: [...topElectricThreats, 'grass-threat'],
    });

    expect(oversized.scoreBreakdown.components.defensiveRatio).toBeCloseTo(
      bounded.scoreBreakdown.components.defensiveRatio,
      5,
    );
  });

  test('uses chargers attackers and consistency as supporting role signals', () => {
    const lineup: OrderedLineup = {
      lead: 'bulky',
      switch: 'balanced',
      closer: 'closer',
    };
    const weakSupport = scoreOrderedLineup(
      lineup,
      createContext({
        rankingScores: uniformScores(80),
        roleScores: {
          bulky: { lead: 0.8 },
          balanced: { switch: 0.8 },
          closer: { closer: 0.8 },
        },
        categoryScores: uniformCategoryScores(20),
        matchupRatings: uniformMatchups(520),
      }),
    );
    const strongSupport = scoreOrderedLineup(
      lineup,
      createContext({
        rankingScores: uniformScores(80),
        roleScores: {
          bulky: { lead: 0.8 },
          balanced: { switch: 0.8 },
          closer: { closer: 0.8 },
        },
        categoryScores: {
          bulky: { chargers: 90, attackers: 20, consistency: 90 },
          balanced: { chargers: 92, attackers: 20, consistency: 88 },
          closer: { chargers: 20, attackers: 94, consistency: 90 },
        },
        matchupRatings: uniformMatchups(520),
      }),
    );

    expect(strongSupport.componentScores.roleStrength).toBeGreaterThan(
      weakSupport.componentScores.roleStrength,
    );
    expect(strongSupport.score).toBeGreaterThan(weakSupport.score);
  });

  test('keeps primary role rankings ahead of supporting role exports', () => {
    const lineup: OrderedLineup = {
      lead: 'bulky',
      switch: 'balanced',
      closer: 'closer',
    };
    const primaryRoleFit = scoreOrderedLineup(
      lineup,
      createContext({
        rankingScores: uniformScores(80),
        roleScores: {
          bulky: { lead: 0.9 },
          balanced: { switch: 0.9 },
          closer: { closer: 0.9 },
        },
        categoryScores: uniformCategoryScores(20),
        matchupRatings: uniformMatchups(520),
      }),
    );
    const supportOnlyFit = scoreOrderedLineup(
      lineup,
      createContext({
        rankingScores: uniformScores(80),
        roleScores: uniformRoleScores(0.2),
        categoryScores: uniformCategoryScores(95),
        matchupRatings: uniformMatchups(520),
      }),
    );

    expect(primaryRoleFit.componentScores.roleStrength).toBeGreaterThan(
      supportOnlyFit.componentScores.roleStrength,
    );
    expect(primaryRoleFit.score).toBeGreaterThan(supportOnlyFit.score);
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
      score: expect.closeTo(0.3333333333333333),
    });
    expect(result.resourcePathMetrics?.shieldSpend).toEqual({
      available: true,
      score: expect.closeTo(0.6666666666666666),
    });
    expect(result.resourcePathMetrics?.shieldSave).toEqual({
      available: true,
      score: expect.closeTo(0),
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
      score: expect.closeTo(0.6666666666666666),
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
    categoryScores?: Record<
      string,
      Partial<Record<'chargers' | 'attackers' | 'consistency', number>>
    >;
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
  const categoryScores = overrides.categoryScores ?? uniformCategoryScores(50);
  const recommendedMovesets =
    overrides.recommendedMovesets ??
    uniformMovesets('FAST', 'CHARGED_A', 'CHARGED_B');
  const roleScores = overrides.roleScores ?? uniformRoleScores(0.5);

  return {
    threats: defaultThreats,
    getPokemon: (speciesId) => pokemonById[speciesId],
    getRankingScore: (speciesId) => rankingScores[speciesId] ?? 80,
    getRoleScore: (speciesId, role) => roleScores[speciesId]?.[role] ?? 0.5,
    getRankingCategoryScore: (speciesId, category) =>
      categoryScores[speciesId]?.[category] ?? 50,
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

function uniformCategoryScores(
  value: number,
): Record<
  string,
  Partial<Record<'chargers' | 'attackers' | 'consistency', number>>
> {
  return Object.fromEntries(
    Object.keys(pokemonById).map((speciesId) => [
      speciesId,
      { chargers: value, attackers: value, consistency: value },
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
