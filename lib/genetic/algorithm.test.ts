import { DEFAULT_BATTLE_FORMAT_ID } from '@lib/data/battleFormats';
import { getBattleFrontierMasterTeamLegality } from '@lib/data/battleFrontierMasterRules';
import { getRankedPokemonForFormat } from '@lib/data/pokemon';
import { getAutomaticCandidatePokemonNames } from '@lib/data/rankings';
import { ensureSimulationDataAvailable } from '@lib/data/simulations';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chromosome, OptimizerScoreBreakdown, Pokemon } from '../types';
import { generateMultipleTeams, generateTeam } from './algorithm';
import {
  calculateDiversity,
  cloneChromosome,
  getBestChromosome,
  hasConverged,
  initializePopulation,
} from './chromosome';
import { evaluatePopulation } from './fitness';
import {
  buildGblLineupRecommendation,
  buildPlayPokemonRosterRecommendations,
  createDefaultLineupScoringContext,
  createLineupAwareFitnessContext,
  scorePlayPokemonRoster,
} from './fitness';
import { createNextGeneration, getAdaptiveMutationRate } from './operators';

vi.mock('@lib/data/rankings', () => ({
  getAutomaticCandidatePokemonNames: vi.fn(),
}));

vi.mock('@lib/data/pokemon', () => ({
  getRankedPokemonForFormat: vi.fn(),
}));

vi.mock('@lib/data/battleFrontierMasterRules', () => ({
  getBattleFrontierMasterTeamLegality: vi.fn(),
}));

vi.mock('@lib/data/simulations', () => ({
  ensureSimulationDataAvailable: vi.fn(),
}));

vi.mock('./chromosome', () => ({
  initializePopulation: vi.fn(),
  getBestChromosome: vi.fn(),
  hasConverged: vi.fn(),
  calculateDiversity: vi.fn(),
  cloneChromosome: vi.fn(),
}));

vi.mock('./fitness', () => ({
  buildGblLineupRecommendation: vi.fn(),
  buildPlayPokemonRosterRecommendations: vi.fn(),
  createDefaultLineupScoringContext: vi.fn(),
  createLineupAwareFitnessContext: vi.fn(),
  evaluatePopulation: vi.fn(),
  scorePlayPokemonRoster: vi.fn(),
}));

vi.mock('./operators', () => ({
  createNextGeneration: vi.fn(),
  getAdaptiveMutationRate: vi.fn(),
}));

function createPokemon(speciesId: string, speciesName: string): Pokemon {
  return {
    dex: 0,
    speciesId,
    speciesName,
    baseStats: { atk: 0, def: 0, hp: 0 },
    types: ['normal'],
    fastMoves: [],
    chargedMoves: [],
    tags: [],
    defaultIVs: { cp1500: [1, 1, 1, 1], cp2500: [1, 1, 1, 1] },
    buddyDistance: 1,
    thirdMoveCost: 10000,
    released: true,
  };
}

function createScoreBreakdown(score: number): OptimizerScoreBreakdown {
  return {
    components: {
      synergy: score,
      coverage: score,
      safety: score,
      consistency: score,
      bulk: score,
      defensiveRatio: score,
      offensiveRatio: score,
      role: score,
    },
    weights: {
      synergy: 0.24,
      coverage: 0.21,
      safety: 0.17,
      consistency: 0.13,
      bulk: 0.1,
      defensiveRatio: 0.07,
      offensiveRatio: 0.05,
      role: 0.03,
    },
    score,
  };
}

function createChromosomeWithTeam(
  team: string[],
  fitness: number = 1,
): Chromosome {
  return {
    team,
    anchors: [],
    fitness,
  };
}

describe('generateTeam format-aware candidate selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getAdaptiveMutationRate).mockReturnValue(0.1);
    vi.mocked(calculateDiversity).mockReturnValue(1);
    vi.mocked(hasConverged).mockReturnValue(false);
    vi.mocked(createNextGeneration).mockImplementation(
      (population) => population,
    );
    vi.mocked(cloneChromosome).mockImplementation((chromosome) => chromosome);
    vi.mocked(evaluatePopulation).mockImplementation(() => undefined);
    vi.mocked(createDefaultLineupScoringContext).mockReturnValue({
      threats: ['azumarill'],
    } as never);
    vi.mocked(createLineupAwareFitnessContext).mockReturnValue({
      scoringContext: { threats: ['azumarill'] },
      scoreLineup: vi.fn(),
      scoreFastLineup: vi.fn(),
    } as never);
    vi.mocked(buildGblLineupRecommendation).mockReturnValue({
      lineup: { lead: 'mewtwo', switch: 'dragonite', closer: 'mew' },
      score: 0.88,
      scoreBreakdown: createScoreBreakdown(0.88),
      coverageMetrics: {
        coverageRate: 0.8,
        dominatingMatchupCount: 2,
        overwhelmingLossCount: 0,
        singleAnswerThreatCount: 1,
      },
      coveredThreats: ['azumarill'],
      weaknesses: ['bastiodon'],
      diagnosticLabel: 'ABC',
    });
    vi.mocked(buildPlayPokemonRosterRecommendations).mockReturnValue({
      recommendedLineups: [
        {
          lineup: { lead: 'mew', switch: 'mewtwo', closer: 'dragonite' },
          score: 0.9,
          scoreBreakdown: createScoreBreakdown(0.9),
          coverageMetrics: {
            coverageRate: 0.8,
            dominatingMatchupCount: 2,
            overwhelmingLossCount: 0,
            singleAnswerThreatCount: 1,
          },
          coveredThreats: ['azumarill'],
          weaknesses: ['bastiodon'],
          diagnosticLabel: 'ABC',
        },
      ],
    });
    vi.mocked(scorePlayPokemonRoster).mockReturnValue({
      roster: ['mew', 'mewtwo', 'dragonite', 'lugia', 'ho_oh', 'rayquaza'],
      fitness: 0.9,
      scoreBreakdown: createScoreBreakdown(0.9),
      evaluatedLineupCount: 120,
      metrics: {
        viableLineupCount: 12,
        topLineupQuality: 0.9,
        topNLineupDepth: 0.8,
        dominatingMatchupRate: 0.2,
        overwhelmingLossRate: 0.05,
        singleAnswerRisks: [],
        viableLeadDiversity: 4,
        benchUtilitySummary: [],
      },
      lineupScores: [],
    });
    vi.mocked(ensureSimulationDataAvailable).mockImplementation(
      () => undefined,
    );
    vi.mocked(getBattleFrontierMasterTeamLegality).mockReturnValue({
      isLegal: true,
      totalPoints: 0,
      fivePointPokemonCount: 0,
      megaCount: 0,
      violations: [],
    });

    const initialPopulation = [
      createChromosomeWithTeam(['mew', 'mewtwo', 'dragonite']),
    ];

    vi.mocked(initializePopulation).mockReturnValue(initialPopulation);
    vi.mocked(getBestChromosome).mockImplementation(
      (population) => population[0],
    );
  });

  it('loads top-ranked names and eligibility pool for selected format', async () => {
    const rankedNames = new Set<string>(['Mew']);

    vi.mocked(getAutomaticCandidatePokemonNames).mockReturnValue(rankedNames);
    vi.mocked(getRankedPokemonForFormat).mockReturnValue([
      createPokemon('mew', 'Mew'),
    ]);

    await generateTeam({
      mode: 'GBL',
      formatId: 'battle-frontier-bayou-cup',
      populationSize: 1,
      generations: 0,
    });

    expect(getAutomaticCandidatePokemonNames).toHaveBeenCalledWith(
      'battle-frontier-bayou-cup',
    );
    expect(getRankedPokemonForFormat).toHaveBeenCalledWith(
      rankedNames,
      'battle-frontier-bayou-cup',
    );
    expect(ensureSimulationDataAvailable).toHaveBeenCalledWith(
      'battle-frontier-bayou-cup',
    );
    expect(initializePopulation).toHaveBeenCalledWith(
      1,
      ['mew'],
      3,
      [],
      'battle-frontier-bayou-cup',
    );
    expect(evaluatePopulation).toHaveBeenCalledWith(
      expect.any(Array),
      'GBL',
      'battle-frontier-bayou-cup',
      expect.objectContaining({
        scoringContext: { threats: ['azumarill'] },
      }),
    );
  });

  it('excludes specialist-band candidates from automatic generation pools while preserving explicit anchors', async () => {
    const nonSpecialistNames = new Set<string>(['Elite Anchor', 'Generalist']);

    vi.mocked(getAutomaticCandidatePokemonNames).mockReturnValue(
      nonSpecialistNames,
    );
    vi.mocked(getRankedPokemonForFormat).mockReturnValue([
      createPokemon('elite_anchor', 'Elite Anchor'),
      createPokemon('generalist', 'Generalist'),
    ]);
    vi.mocked(initializePopulation).mockReturnValue([
      createChromosomeWithTeam([
        'specialist_anchor',
        'elite_anchor',
        'generalist',
      ]),
    ]);

    await generateTeam({
      mode: 'GBL',
      formatId: 'great-league',
      anchorPokemon: ['specialist_anchor'],
      populationSize: 1,
      generations: 0,
    });

    expect(getRankedPokemonForFormat).toHaveBeenCalledWith(
      nonSpecialistNames,
      'great-league',
    );
    expect(initializePopulation).toHaveBeenCalledWith(
      1,
      ['elite_anchor', 'generalist'],
      3,
      ['specialist_anchor'],
      'great-league',
    );
    expect(createNextGeneration).not.toHaveBeenCalledWith(
      expect.any(Array),
      expect.arrayContaining(['low_ranked_specialist']),
      expect.any(String),
      expect.any(Object),
    );
  });

  it('defaults pool selection to Great League format when omitted', async () => {
    vi.mocked(getAutomaticCandidatePokemonNames).mockReturnValue(
      new Set<string>(['Mew']),
    );
    vi.mocked(getRankedPokemonForFormat).mockReturnValue([
      createPokemon('mew', 'Mew'),
    ]);

    await generateTeam({
      mode: 'GBL',
      populationSize: 1,
      generations: 0,
    });

    expect(getAutomaticCandidatePokemonNames).toHaveBeenCalledWith(
      DEFAULT_BATTLE_FORMAT_ID,
    );
    expect(getRankedPokemonForFormat).toHaveBeenCalledWith(
      expect.any(Set),
      DEFAULT_BATTLE_FORMAT_ID,
    );
    expect(ensureSimulationDataAvailable).toHaveBeenCalledWith(
      DEFAULT_BATTLE_FORMAT_ID,
    );
  });

  it('passes the selected format into next-generation operators', async () => {
    vi.mocked(getAutomaticCandidatePokemonNames).mockReturnValue(
      new Set<string>(['Mew']),
    );
    vi.mocked(getRankedPokemonForFormat).mockReturnValue([
      createPokemon('mew', 'Mew'),
    ]);

    await generateTeam({
      mode: 'GBL',
      formatId: 'battle-frontier-master',
      populationSize: 1,
      generations: 1,
    });

    expect(createNextGeneration).toHaveBeenCalledWith(
      expect.any(Array),
      ['mew'],
      'GBL',
      expect.objectContaining({
        formatId: 'battle-frontier-master',
      }),
    );
  });

  it('rejects illegal final Battle Frontier Master teams before returning', async () => {
    const illegalTeam = ['palkia_origin', 'eternatus', 'swampert_mega'];

    vi.mocked(getAutomaticCandidatePokemonNames).mockReturnValue(
      new Set<string>(['Palkia', 'Eternatus', 'Swampert']),
    );
    vi.mocked(getRankedPokemonForFormat).mockReturnValue([
      createPokemon('palkia_origin', 'Palkia (Origin)'),
      createPokemon('eternatus', 'Eternatus'),
      createPokemon('swampert_mega', 'Swampert (Mega)'),
    ]);
    vi.mocked(initializePopulation).mockReturnValue([
      createChromosomeWithTeam(illegalTeam),
    ]);
    vi.mocked(getBestChromosome).mockReturnValue(
      createChromosomeWithTeam(illegalTeam),
    );
    vi.mocked(getBattleFrontierMasterTeamLegality).mockReturnValue({
      isLegal: false,
      totalPoints: 15,
      fivePointPokemonCount: 2,
      megaCount: 1,
      violations: ['points-cap', 'five-point-limit'],
    });

    await expect(
      generateTeam({
        mode: 'GBL',
        formatId: 'battle-frontier-master',
        populationSize: 1,
        generations: 0,
      }),
    ).rejects.toThrow(
      'Final Battle Frontier Master team is illegal. This should never happen.',
    );

    expect(getBattleFrontierMasterTeamLegality).toHaveBeenCalledWith(
      illegalTeam,
    );
  });

  it('adds one role-ordered lineup recommendation for generated GBL teams', async () => {
    vi.mocked(getAutomaticCandidatePokemonNames).mockReturnValue(
      new Set<string>(['Mew']),
    );
    vi.mocked(getRankedPokemonForFormat).mockReturnValue([
      createPokemon('mew', 'Mew'),
    ]);

    const result = await generateTeam({
      mode: 'GBL',
      formatId: 'battle-frontier-bayou-cup',
      populationSize: 1,
      generations: 0,
    });

    expect(createDefaultLineupScoringContext).toHaveBeenCalledWith(
      'battle-frontier-bayou-cup',
    );
    expect(buildGblLineupRecommendation).toHaveBeenCalledWith(
      ['mew', 'mewtwo', 'dragonite'],
      { context: { threats: ['azumarill'] } },
    );
    expect(result.team).toEqual(['mew', 'mewtwo', 'dragonite']);
    expect(result.recommendedLineups).toEqual([
      expect.objectContaining({
        lineup: { lead: 'mewtwo', switch: 'dragonite', closer: 'mew' },
        score: 0.88,
      }),
    ]);
  });

  it('builds bounded full diagnostics for the final PlayPokemon roster only', async () => {
    vi.mocked(getAutomaticCandidatePokemonNames).mockReturnValue(
      new Set(['Mew', 'Mewtwo', 'Dragonite', 'Lugia', 'Ho-Oh', 'Rayquaza']),
    );
    vi.mocked(getRankedPokemonForFormat).mockReturnValue([
      createPokemon('mew', 'Mew'),
      createPokemon('mewtwo', 'Mewtwo'),
      createPokemon('dragonite', 'Dragonite'),
      createPokemon('lugia', 'Lugia'),
      createPokemon('ho_oh', 'Ho-Oh'),
      createPokemon('rayquaza', 'Rayquaza'),
    ]);
    vi.mocked(initializePopulation).mockReturnValue([
      createChromosomeWithTeam([
        'mew',
        'mewtwo',
        'dragonite',
        'lugia',
        'ho_oh',
        'rayquaza',
      ]),
    ]);

    const result = await generateTeam({
      mode: 'PlayPokemon',
      formatId: 'battle-frontier-bayou-cup',
      populationSize: 1,
      generations: 0,
    });

    expect(evaluatePopulation).toHaveBeenCalledWith(
      expect.any(Array),
      'PlayPokemon',
      'battle-frontier-bayou-cup',
      expect.objectContaining({
        scoringContext: { threats: ['azumarill'] },
      }),
    );
    expect(scorePlayPokemonRoster).toHaveBeenCalledWith(
      result.team,
      expect.any(Object),
      { mode: 'full', includeDiagnostics: true, recommendationLimit: 5 },
    );
    expect(buildPlayPokemonRosterRecommendations).toHaveBeenCalledWith([], {
      limit: 5,
    });
    expect(result.recommendedLineups).toEqual([
      expect.objectContaining({
        lineup: { lead: 'mew', switch: 'mewtwo', closer: 'dragonite' },
      }),
    ]);
    expect(result).not.toHaveProperty('rosterMetrics');
    expect(result).not.toHaveProperty('benchUtility');
  });

  it('returns final PlayPokemon fitness from recomputed full roster diagnostics', async () => {
    vi.mocked(getAutomaticCandidatePokemonNames).mockReturnValue(
      new Set(['Mew', 'Mewtwo', 'Dragonite', 'Lugia', 'Ho-Oh', 'Rayquaza']),
    );
    vi.mocked(getRankedPokemonForFormat).mockReturnValue([
      createPokemon('mew', 'Mew'),
      createPokemon('mewtwo', 'Mewtwo'),
      createPokemon('dragonite', 'Dragonite'),
      createPokemon('lugia', 'Lugia'),
      createPokemon('ho_oh', 'Ho-Oh'),
      createPokemon('rayquaza', 'Rayquaza'),
    ]);
    vi.mocked(initializePopulation).mockReturnValue([
      createChromosomeWithTeam(
        ['mew', 'mewtwo', 'dragonite', 'lugia', 'ho_oh', 'rayquaza'],
        0.42,
      ),
    ]);
    vi.mocked(scorePlayPokemonRoster).mockReturnValue({
      roster: ['mew', 'mewtwo', 'dragonite', 'lugia', 'ho_oh', 'rayquaza'],
      fitness: 0.91,
      scoreBreakdown: createScoreBreakdown(0.91),
      evaluatedLineupCount: 120,
      metrics: {
        viableLineupCount: 12,
        topLineupQuality: 0.91,
        topNLineupDepth: 0.8,
        dominatingMatchupRate: 0.2,
        overwhelmingLossRate: 0.05,
        singleAnswerRisks: [],
        viableLeadDiversity: 4,
        benchUtilitySummary: [],
      },
      lineupScores: [],
    });

    const result = await generateTeam({
      mode: 'PlayPokemon',
      formatId: 'battle-frontier-bayou-cup',
      populationSize: 1,
      generations: 0,
    });

    expect(result.fitness).toBe(0.91);
    expect(result.scoreBreakdown?.score).toBe(0.91);
    expect(result.fitness).toBe(result.scoreBreakdown?.score);
  });

  it('returns final GBL fitness from the final lineup recommendation score', async () => {
    vi.mocked(getAutomaticCandidatePokemonNames).mockReturnValue(
      new Set(['Mew', 'Mewtwo', 'Dragonite']),
    );
    vi.mocked(getRankedPokemonForFormat).mockReturnValue([
      createPokemon('mew', 'Mew'),
      createPokemon('mewtwo', 'Mewtwo'),
      createPokemon('dragonite', 'Dragonite'),
    ]);
    vi.mocked(initializePopulation).mockReturnValue([
      createChromosomeWithTeam(['mew', 'mewtwo', 'dragonite'], 0.51),
    ]);
    vi.mocked(buildGblLineupRecommendation).mockReturnValue({
      lineup: { lead: 'mewtwo', switch: 'dragonite', closer: 'mew' },
      score: 0.83,
      scoreBreakdown: createScoreBreakdown(0.83),
      coverageMetrics: {
        coverageRate: 0.8,
        dominatingMatchupCount: 2,
        overwhelmingLossCount: 0,
        singleAnswerThreatCount: 1,
      },
      coveredThreats: ['azumarill'],
      weaknesses: ['bastiodon'],
      diagnosticLabel: 'ABC',
    });

    const result = await generateTeam({
      mode: 'GBL',
      formatId: 'battle-frontier-bayou-cup',
      populationSize: 1,
      generations: 0,
    });

    expect(result.fitness).toBe(0.83);
    expect(result.scoreBreakdown?.score).toBe(0.83);
    expect(result.recommendedLineups?.[0].score).toBe(0.83);
    expect(result.fitness).toBe(result.scoreBreakdown?.score);
  });

  it('sorts multiple teams by recomputed final fitness', async () => {
    vi.mocked(getAutomaticCandidatePokemonNames).mockReturnValue(
      new Set(['Mew', 'Mewtwo', 'Dragonite', 'Lugia', 'Ho-Oh', 'Rayquaza']),
    );
    vi.mocked(getRankedPokemonForFormat).mockReturnValue([
      createPokemon('mew', 'Mew'),
      createPokemon('mewtwo', 'Mewtwo'),
      createPokemon('dragonite', 'Dragonite'),
      createPokemon('lugia', 'Lugia'),
      createPokemon('ho_oh', 'Ho-Oh'),
      createPokemon('rayquaza', 'Rayquaza'),
    ]);
    vi.mocked(initializePopulation)
      .mockReturnValueOnce([
        createChromosomeWithTeam(
          ['mew', 'mewtwo', 'dragonite', 'lugia', 'ho_oh', 'rayquaza'],
          0.95,
        ),
      ])
      .mockReturnValueOnce([
        createChromosomeWithTeam(
          ['mewtwo', 'mew', 'dragonite', 'lugia', 'ho_oh', 'rayquaza'],
          0.5,
        ),
      ]);
    vi.mocked(scorePlayPokemonRoster)
      .mockReturnValueOnce({
        roster: ['mew', 'mewtwo', 'dragonite', 'lugia', 'ho_oh', 'rayquaza'],
        fitness: 0.61,
        scoreBreakdown: createScoreBreakdown(0.61),
        evaluatedLineupCount: 120,
        metrics: {
          viableLineupCount: 8,
          topLineupQuality: 0.61,
          topNLineupDepth: 0.6,
          dominatingMatchupRate: 0.2,
          overwhelmingLossRate: 0.05,
          singleAnswerRisks: [],
          viableLeadDiversity: 3,
          benchUtilitySummary: [],
        },
        lineupScores: [],
      })
      .mockReturnValueOnce({
        roster: ['mewtwo', 'mew', 'dragonite', 'lugia', 'ho_oh', 'rayquaza'],
        fitness: 0.82,
        scoreBreakdown: createScoreBreakdown(0.82),
        evaluatedLineupCount: 120,
        metrics: {
          viableLineupCount: 12,
          topLineupQuality: 0.82,
          topNLineupDepth: 0.8,
          dominatingMatchupRate: 0.3,
          overwhelmingLossRate: 0.02,
          singleAnswerRisks: [],
          viableLeadDiversity: 4,
          benchUtilitySummary: [],
        },
        lineupScores: [],
      });

    const results = await generateMultipleTeams(
      {
        mode: 'PlayPokemon',
        formatId: 'battle-frontier-bayou-cup',
        populationSize: 1,
        generations: 0,
      },
      2,
    );

    expect(results.map((result) => result.fitness)).toEqual([0.82, 0.61]);
    expect(results.map((result) => result.scoreBreakdown?.score)).toEqual([
      0.82, 0.61,
    ]);
  });

  it('reuses one lineup-aware fitness context across the GA run', async () => {
    vi.mocked(getAutomaticCandidatePokemonNames).mockReturnValue(
      new Set(['Mew', 'Mewtwo', 'Dragonite']),
    );
    vi.mocked(getRankedPokemonForFormat).mockReturnValue([
      createPokemon('mew', 'Mew'),
      createPokemon('mewtwo', 'Mewtwo'),
      createPokemon('dragonite', 'Dragonite'),
    ]);

    await generateTeam({
      mode: 'GBL',
      formatId: 'battle-frontier-bayou-cup',
      populationSize: 1,
      generations: 2,
    });

    expect(createLineupAwareFitnessContext).toHaveBeenCalledTimes(1);
    const sharedContext = vi.mocked(createLineupAwareFitnessContext).mock
      .results[0].value;
    expect(evaluatePopulation).toHaveBeenCalledTimes(3);
    expect(evaluatePopulation).toHaveBeenNthCalledWith(
      1,
      expect.any(Array),
      'GBL',
      'battle-frontier-bayou-cup',
      sharedContext,
    );
    expect(evaluatePopulation).toHaveBeenNthCalledWith(
      2,
      expect.any(Array),
      'GBL',
      'battle-frontier-bayou-cup',
      sharedContext,
    );
    expect(evaluatePopulation).toHaveBeenNthCalledWith(
      3,
      expect.any(Array),
      'GBL',
      'battle-frontier-bayou-cup',
      sharedContext,
    );
  });
});
