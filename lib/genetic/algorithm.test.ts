import { DEFAULT_BATTLE_FORMAT_ID } from '@lib/data/battleFormats';
import { buildCandidateProfiles } from '@lib/data/candidateProfiles';
import { getMegaMasterTeamLegality } from '@lib/data/megaMasterRules';
import {
  getPokemonBySpeciesId,
  getRankedPokemonForFormat,
} from '@lib/data/pokemon';
import {
  getAutomaticCandidatePokemonNames,
  getCandidateRankingBands,
  getConsistencyRankings,
  getOverallRankings,
  getRankedPokemonNames,
  getRoleBasedThreatSpeciesIds,
  getSwitchesRankings,
  speciesIdToRankingName,
} from '@lib/data/rankings';
import {
  countersThreats,
  ensureSimulationDataAvailable,
  getWorstMatchups,
} from '@lib/data/simulations';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Chromosome,
  OptimizerScoreBreakdown,
  Pokemon,
  RosterMovesetAssignment,
} from '../types';
import { generateMultipleTeams, generateTeam } from './algorithm';
import {
  calculateDiversity,
  cloneChromosome,
  getBestChromosome,
  hasConverged,
  initializePopulation,
  initializeAnchorFirstPopulation,
} from './chromosome';
import { evaluatePopulation } from './fitness';
import {
  buildGblLineupRecommendation,
  buildPlayPokemonRosterRecommendations,
  createDefaultLineupScoringContext,
  createLineupAwareFitnessContext,
  scoreOrderedLineup,
  scorePlayPokemonRoster,
} from './fitness';
import { rerankRosterFinalists } from './fitness/finalistReranking';
import { createNextGeneration, getAdaptiveMutationRate } from './operators';

vi.mock('@lib/data/rankings', () => ({
  getAutomaticCandidatePokemonNames: vi.fn(),
  getCandidateRankingBands: vi.fn(),
  getConsistencyRankings: vi.fn(),
  getOverallRankings: vi.fn(),
  getRankedPokemonNames: vi.fn(),
  getRoleBasedThreatSpeciesIds: vi.fn(),
  getSwitchesRankings: vi.fn(),
  speciesIdToRankingName: vi.fn((speciesId: string) => speciesId),
  MissingRankingDataError: class MissingRankingDataError extends Error {},
}));

vi.mock('@lib/data/candidateProfiles', () => ({
  buildCandidateProfiles: vi.fn(),
}));

vi.mock('@lib/data/pokemon', () => ({
  getPokemonBySpeciesId: vi.fn(),
  getRankedPokemonForFormat: vi.fn(),
}));

vi.mock('@lib/data/megaMasterRules', () => ({
  getMegaMasterTeamLegality: vi.fn(),
}));

vi.mock('@lib/data/simulations', () => ({
  ensureSimulationDataAvailable: vi.fn(),
  countersThreats: vi.fn(),
  getWorstMatchups: vi.fn(),
}));

vi.mock('./chromosome', () => ({
  initializePopulation: vi.fn(),
  initializeAnchorFirstPopulation: vi.fn(),
  getBestChromosome: vi.fn(),
  hasConverged: vi.fn(),
  calculateDiversity: vi.fn(),
  cloneChromosome: vi.fn(),
}));

vi.mock('./fitness', () => ({
  buildGblLineupRecommendation: vi.fn(),
  buildPlayPokemonRosterRecommendations: vi.fn(),
  bindRosterMovesetAssignment: vi.fn((context, movesetAssignment) => ({
    ...context,
    movesetAssignment,
  })),
  createDefaultLineupScoringContext: vi.fn(),
  createLineupAwareFitnessContext: vi.fn(),
  evaluatePopulation: vi.fn(),
  scoreOrderedLineup: vi.fn(),
  scorePlayPokemonRoster: vi.fn(),
}));

vi.mock('./fitness/finalistReranking', () => ({
  rerankRosterFinalists: vi.fn(),
}));

vi.mock('./operators', () => ({
  createNextGeneration: vi.fn(),
  getAdaptiveMutationRate: vi.fn(),
}));

function createPokemon(speciesId: string, speciesName: string): Pokemon {
  const dex = speciesId
    .split('')
    .reduce((total, character) => total + character.charCodeAt(0), 0);

  return {
    dex,
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

function createTestAssignment(
  team: readonly string[],
): RosterMovesetAssignment {
  return {
    formatId: 'great-league',
    policyIdentity: {
      source: 'ranked-default-fallback',
      schemaVersion: 0,
      policyVersion: 'ranked-default-v1',
    },
    variantsBySpeciesId: {},
    fingerprint: `assignment:${team.join(',')}`,
  };
}

function configurePlayPokemonPool(speciesIds: readonly string[]): void {
  vi.mocked(getAutomaticCandidatePokemonNames).mockReturnValue(
    new Set(speciesIds),
  );
  vi.mocked(getRankedPokemonForFormat).mockReturnValue(
    speciesIds.map((speciesId) => createPokemon(speciesId, speciesId)),
  );
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
      resolveMovesetAssignment: vi.fn(() => ({
        formatId: 'great-league',
        policyIdentity: {
          source: 'ranked-default-fallback',
          schemaVersion: 0,
          policyVersion: 'ranked-default-v1',
        },
        variantsBySpeciesId: {},
        fingerprint: 'test-assignment',
      })),
      scoreLineup: vi.fn(),
      scoreFastLineup: vi.fn(),
      cacheStats: {
        lineup: { hits: 0, misses: 0, size: 0 },
        fastLineup: { hits: 0, misses: 0, size: 0 },
      },
    } as never);
    vi.mocked(rerankRosterFinalists).mockImplementation((finalists) => {
      const finalist = finalists[0];
      const assignment = createTestAssignment(finalist.team);
      return {
        finalist,
        assignment,
        score: {
          roster: finalist.team,
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
        },
        stats: {
          finalistCount: finalists.length,
          assignmentEvaluationCount: finalists.length,
          fullScoreCount: finalists.length,
        },
      };
    });
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
    vi.mocked(countersThreats).mockReturnValue(0);
    vi.mocked(getWorstMatchups).mockReturnValue([]);
    vi.mocked(getRoleBasedThreatSpeciesIds).mockReturnValue([]);
    vi.mocked(getCandidateRankingBands).mockReturnValue({
      totalRanked: 0,
      candidateCount: 0,
      assignments: [],
      bands: {
        eliteAnchors: [],
        preferredAnchors: [],
        normalCompanions: [],
        flexibleCompanions: [],
        specialists: [],
      },
      summaries: [],
      scoreCutoffs: [],
    });
    vi.mocked(getOverallRankings).mockReturnValue([]);
    vi.mocked(getRankedPokemonNames).mockReturnValue(new Set());
    vi.mocked(getSwitchesRankings).mockReturnValue([]);
    vi.mocked(getConsistencyRankings).mockReturnValue([]);
    vi.mocked(getPokemonBySpeciesId).mockImplementation((speciesId) =>
      createPokemon(speciesId, speciesId),
    );
    vi.mocked(buildCandidateProfiles).mockReturnValue([]);
    vi.mocked(getMegaMasterTeamLegality).mockReturnValue({
      isLegal: true,
      megaCount: 0,
      violations: [],
    });
    const initialPopulation = [
      createChromosomeWithTeam(['mew', 'mewtwo', 'dragonite']),
    ];

    vi.mocked(initializePopulation).mockReturnValue(initialPopulation);
    vi.mocked(initializeAnchorFirstPopulation).mockReturnValue(
      initialPopulation,
    );
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
      formatId: 'battle-frontier-tsuki-cup',
      populationSize: 1,
      generations: 0,
    });

    expect(getAutomaticCandidatePokemonNames).toHaveBeenCalledWith(
      'battle-frontier-tsuki-cup',
    );
    expect(getRankedPokemonForFormat).toHaveBeenCalledWith(
      rankedNames,
      'battle-frontier-tsuki-cup',
    );
    expect(ensureSimulationDataAvailable).toHaveBeenCalledWith(
      'battle-frontier-tsuki-cup',
    );
    expect(createLineupAwareFitnessContext).toHaveBeenCalledWith(
      'battle-frontier-tsuki-cup',
      'team-aware',
    );
    expect(buildCandidateProfiles).toHaveBeenCalledWith(
      expect.objectContaining({
        rankingBands: expect.any(Object),
        speciesIdsByPokemon: expect.any(Map),
        safetyRankings: expect.any(Map),
        switchRankings: expect.any(Map),
        consistencyRankings: expect.any(Map),
        moveTypesByName: expect.any(Map),
        simulationCoverageByPokemon: expect.any(Map),
      }),
    );
    expect(initializeAnchorFirstPopulation).toHaveBeenCalledWith(
      1,
      ['mew'],
      3,
      expect.objectContaining({
        anchorPokemon: [],
        formatId: 'battle-frontier-tsuki-cup',
      }),
    );
    expect(evaluatePopulation).toHaveBeenCalledWith(
      expect.any(Array),
      'GBL',
      'battle-frontier-tsuki-cup',
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
    vi.mocked(initializeAnchorFirstPopulation).mockReturnValue([
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
    expect(initializeAnchorFirstPopulation).toHaveBeenCalledWith(
      1,
      ['elite_anchor', 'generalist'],
      3,
      expect.objectContaining({
        anchorPokemon: ['specialist_anchor'],
        formatId: 'great-league',
      }),
    );
    expect(createNextGeneration).not.toHaveBeenCalledWith(
      expect.any(Array),
      expect.arrayContaining(['low_ranked_specialist']),
      expect.any(String),
      expect.any(Object),
    );
  });

  it('builds candidate profiles for explicit anchors outside the automatic pool', async () => {
    const nonSpecialistNames = new Set<string>(['Elite Anchor', 'Generalist']);
    const profileNames = new Set<string>([
      'Elite Anchor',
      'Generalist',
      'Specialist Anchor',
    ]);

    vi.mocked(getAutomaticCandidatePokemonNames).mockReturnValue(
      nonSpecialistNames,
    );
    vi.mocked(speciesIdToRankingName).mockReturnValue('Specialist Anchor');
    vi.mocked(getRankedPokemonForFormat).mockImplementation(
      (requestedNames) => {
        if (requestedNames === nonSpecialistNames) {
          return [
            createPokemon('elite_anchor', 'Elite Anchor'),
            createPokemon('generalist', 'Generalist'),
          ];
        }

        expect(requestedNames).toEqual(profileNames);
        return [
          createPokemon('elite_anchor', 'Elite Anchor'),
          createPokemon('generalist', 'Generalist'),
          createPokemon('specialist_anchor', 'Specialist Anchor'),
        ];
      },
    );
    vi.mocked(getCandidateRankingBands).mockReturnValue({
      totalRanked: 3,
      candidateCount: 2,
      assignments: [
        {
          pokemon: 'Elite Anchor',
          ranking: {
            Pokemon: 'Elite Anchor',
            Score: 96,
            'Stat Product': 2000,
            Attack: 100,
            Defense: 120,
            Stamina: 140,
            'Type 1': 'Normal',
            'Type 2': '',
            'Fast Move': 'Tackle',
            'Charged Move 1': 'Body Slam',
            'Charged Move 2': '',
          } as never,
          rank: 1,
          rankPercentile: 1 / 3,
          score: 96,
          band: 'eliteAnchors',
        },
        {
          pokemon: 'Generalist',
          ranking: {
            Pokemon: 'Generalist',
            Score: 90,
            'Stat Product': 1900,
            Attack: 100,
            Defense: 110,
            Stamina: 130,
            'Type 1': 'Normal',
            'Type 2': '',
            'Fast Move': 'Tackle',
            'Charged Move 1': 'Body Slam',
            'Charged Move 2': '',
          } as never,
          rank: 2,
          rankPercentile: 2 / 3,
          score: 90,
          band: 'normalCompanions',
        },
      ],
      bands: {
        eliteAnchors: [],
        preferredAnchors: [],
        normalCompanions: [],
        flexibleCompanions: [],
        specialists: [],
      },
      summaries: [],
      scoreCutoffs: [],
    });
    vi.mocked(getOverallRankings).mockReturnValue([
      {
        Pokemon: 'Elite Anchor',
        Score: 96,
      },
      {
        Pokemon: 'Generalist',
        Score: 90,
      },
      {
        Pokemon: 'Specialist Anchor',
        Score: 72,
        'Stat Product': 1700,
        Attack: 100,
        Defense: 100,
        Stamina: 120,
        'Type 1': 'Water',
        'Type 2': '',
        'Fast Move': 'Water Gun',
        'Charged Move 1': 'Surf',
        'Charged Move 2': '',
      } as never,
    ] as never);
    vi.mocked(initializeAnchorFirstPopulation).mockReturnValue([
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

    expect(speciesIdToRankingName).toHaveBeenCalledWith('specialist_anchor');
    expect(getRankedPokemonForFormat).toHaveBeenCalledWith(
      nonSpecialistNames,
      'great-league',
    );
    expect(getRankedPokemonForFormat).toHaveBeenCalledWith(
      profileNames,
      'great-league',
    );
    expect(buildCandidateProfiles).toHaveBeenCalledWith(
      expect.objectContaining({
        rankingBands: expect.objectContaining({
          assignments: expect.arrayContaining([
            expect.objectContaining({
              pokemon: 'Specialist Anchor',
              band: 'specialists',
              rank: 3,
            }),
          ]),
        }),
        speciesIdsByPokemon: new Map([
          ['Elite Anchor', 'elite_anchor'],
          ['Generalist', 'generalist'],
          ['Specialist Anchor', 'specialist_anchor'],
        ]),
      }),
    );
    expect(initializeAnchorFirstPopulation).toHaveBeenCalledWith(
      1,
      ['elite_anchor', 'generalist'],
      3,
      expect.objectContaining({
        anchorPokemon: ['specialist_anchor'],
      }),
    );
  });

  it('builds anchor-first coverage profiles against meta threats outside the automatic pool', async () => {
    vi.mocked(getAutomaticCandidatePokemonNames).mockReturnValue(
      new Set<string>(['Elite Anchor', 'Generalist']),
    );
    vi.mocked(getRankedPokemonForFormat).mockReturnValue([
      createPokemon('elite_anchor', 'Elite Anchor'),
      createPokemon('generalist', 'Generalist'),
    ]);
    vi.mocked(getRoleBasedThreatSpeciesIds).mockReturnValue([
      'top_meta_threat',
      'meta_threat_2',
      'meta_threat_3',
      'meta_threat_4',
      'meta_threat_5',
      'generalist',
    ]);
    vi.mocked(countersThreats).mockImplementation((pokemon, threats) => {
      return pokemon === 'elite_anchor' && threats.includes('top_meta_threat')
        ? 1
        : 0;
    });
    vi.mocked(getWorstMatchups).mockImplementation((_pokemon, count) => {
      return [
        'outside_meta_1',
        'outside_meta_2',
        'outside_meta_3',
        'outside_meta_4',
        'outside_meta_5',
        'outside_meta_6',
        'outside_meta_7',
        'top_meta_threat',
        'generalist',
      ].slice(0, count);
    });

    await generateTeam({
      mode: 'GBL',
      formatId: 'great-league',
      populationSize: 1,
      generations: 0,
    });

    const profileOptions = vi.mocked(buildCandidateProfiles).mock.calls[0]?.[0];

    expect(profileOptions).toBeDefined();
    if (!profileOptions) {
      throw new Error('Expected candidate profile options to be built');
    }
    const simulationCoverageByPokemon =
      profileOptions.simulationCoverageByPokemon;

    expect(simulationCoverageByPokemon).toBeDefined();
    if (!simulationCoverageByPokemon) {
      throw new Error('Expected simulation coverage map to be built');
    }

    expect(getRoleBasedThreatSpeciesIds).toHaveBeenCalledWith(
      100,
      'great-league',
    );
    expect(simulationCoverageByPokemon.get('Elite Anchor')).toEqual({
      winsAgainst: ['top_meta_threat'],
      lossesAgainst: ['top_meta_threat', 'generalist'],
      checks: ['top_meta_threat'],
    });
    expect(initializeAnchorFirstPopulation).toHaveBeenCalledWith(
      1,
      ['elite_anchor', 'generalist'],
      3,
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

  it('expands PlayPokemon generation to the full ranked pool when bans leave automatic candidates unable to fill a legal team', async () => {
    const automaticNames = new Set<string>([
      'Kyogre',
      'Lugia',
      'Necrozma (Dusk Mane)',
      'Blastoise (Mega)',
      'Dragonite',
    ]);
    const fullRankedNames = new Set<string>([
      ...automaticNames,
      'Ho-Oh',
      'Zygarde (Complete)',
    ]);

    vi.mocked(getAutomaticCandidatePokemonNames).mockReturnValue(
      automaticNames,
    );
    vi.mocked(getRankedPokemonNames).mockReturnValue(fullRankedNames);
    vi.mocked(getRankedPokemonForFormat).mockImplementation(
      (requestedNames) => {
        if (requestedNames === automaticNames) {
          return [
            createPokemon('kyogre', 'Kyogre'),
            createPokemon('lugia', 'Lugia'),
            createPokemon('necrozma_dusk_mane', 'Necrozma (Dusk Mane)'),
            createPokemon('blastoise_mega', 'Blastoise (Mega)'),
            createPokemon('dragonite', 'Dragonite'),
          ];
        }

        return [
          createPokemon('kyogre', 'Kyogre'),
          createPokemon('lugia', 'Lugia'),
          createPokemon('necrozma_dusk_mane', 'Necrozma (Dusk Mane)'),
          createPokemon('blastoise_mega', 'Blastoise (Mega)'),
          createPokemon('dragonite', 'Dragonite'),
          createPokemon('ho_oh', 'Ho-Oh'),
          createPokemon('zygarde_complete', 'Zygarde (Complete)'),
        ];
      },
    );
    vi.mocked(initializeAnchorFirstPopulation).mockReturnValue([
      createChromosomeWithTeam([
        'kyogre',
        'lugia',
        'necrozma_dusk_mane',
        'blastoise_mega',
        'dragonite',
        'ho_oh',
      ]),
    ]);

    await generateTeam({
      mode: 'PlayPokemon',
      formatId: 'battle-frontier-coupe-du-sillage',
      excludedPokemon: ['giratina_altered', 'mewtwo_shadow', 'kyurem'],
      populationSize: 1,
      generations: 0,
    });

    expect(getRankedPokemonNames).toHaveBeenCalledWith(
      'battle-frontier-coupe-du-sillage',
    );
    expect(initializeAnchorFirstPopulation).toHaveBeenCalledWith(
      1,
      [
        'kyogre',
        'lugia',
        'necrozma_dusk_mane',
        'blastoise_mega',
        'dragonite',
        'ho_oh',
        'zygarde_complete',
      ],
      6,
      expect.objectContaining({
        formatId: 'battle-frontier-coupe-du-sillage',
      }),
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
      formatId: 'battle-frontier-coupe-du-sillage',
      populationSize: 1,
      generations: 1,
    });

    expect(createNextGeneration).toHaveBeenCalledWith(
      expect.any(Array),
      ['mew'],
      'GBL',
      expect.objectContaining({
        formatId: 'battle-frontier-coupe-du-sillage',
      }),
    );
  });

  it('rejects illegal final Battle Frontier Coupe du Sillage teams before returning', async () => {
    const illegalTeam = ['swampert_mega', 'gallade_mega', 'dragonite'];

    vi.mocked(getAutomaticCandidatePokemonNames).mockReturnValue(
      new Set<string>(['Swampert', 'Gallade', 'Dragonite']),
    );
    vi.mocked(getRankedPokemonForFormat).mockReturnValue([
      createPokemon('swampert_mega', 'Swampert (Mega)'),
      createPokemon('gallade_mega', 'Gallade (Mega)'),
      createPokemon('dragonite', 'Dragonite'),
    ]);
    vi.mocked(initializeAnchorFirstPopulation).mockReturnValue([
      createChromosomeWithTeam(illegalTeam),
    ]);
    vi.mocked(getBestChromosome).mockReturnValue(
      createChromosomeWithTeam(illegalTeam),
    );
    vi.mocked(getMegaMasterTeamLegality).mockReturnValue({
      isLegal: false,
      megaCount: 2,
      violations: ['mega-limit'],
    });

    await expect(
      generateTeam({
        mode: 'GBL',
        formatId: 'battle-frontier-coupe-du-sillage',
        populationSize: 1,
        generations: 0,
      }),
    ).rejects.toThrow(
      'Final one-Mega-limit team is illegal. This should never happen.',
    );

    expect(getMegaMasterTeamLegality).toHaveBeenCalledWith(illegalTeam);
  });

  it('retains one scored assignment for generated GBL teams', async () => {
    vi.mocked(getAutomaticCandidatePokemonNames).mockReturnValue(
      new Set<string>(['Mew']),
    );
    vi.mocked(getRankedPokemonForFormat).mockReturnValue([
      createPokemon('mew', 'Mew'),
    ]);

    const result = await generateTeam({
      mode: 'GBL',
      formatId: 'battle-frontier-tsuki-cup',
      populationSize: 1,
      generations: 0,
    });

    const fitnessContext = vi.mocked(createLineupAwareFitnessContext).mock
      .results[0]?.value;
    const movesetAssignment = vi.mocked(
      fitnessContext!.resolveMovesetAssignment,
    ).mock.results[0]?.value;

    expect(buildGblLineupRecommendation).toHaveBeenCalledWith(
      ['mew', 'mewtwo', 'dragonite'],
      { scoreLineup: expect.any(Function) },
    );
    const recommendationOptions = vi.mocked(buildGblLineupRecommendation).mock
      .calls[0]?.[1];
    const lineup = {
      lead: 'mew',
      switch: 'mewtwo',
      closer: 'dragonite',
    };
    recommendationOptions?.scoreLineup?.(lineup);

    expect(fitnessContext?.resolveMovesetAssignment).toHaveBeenCalledWith([
      'mew',
      'mewtwo',
      'dragonite',
    ]);
    expect(scoreOrderedLineup).toHaveBeenCalledWith(
      lineup,
      expect.objectContaining({ movesetAssignment }),
    );
    expect(vi.mocked(scoreOrderedLineup).mock.calls[0]).toHaveLength(2);
    expect(result.team).toEqual(['mew', 'mewtwo', 'dragonite']);
    expect(result.movesetAssignment).toBe(movesetAssignment);
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
    vi.mocked(initializeAnchorFirstPopulation).mockReturnValue([
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
      formatId: 'battle-frontier-tsuki-cup',
      populationSize: 1,
      generations: 0,
    });

    expect(createLineupAwareFitnessContext).toHaveBeenCalledWith(
      'battle-frontier-tsuki-cup',
      'ranked-default',
    );
    expect(evaluatePopulation).toHaveBeenCalledWith(
      expect.any(Array),
      'PlayPokemon',
      'battle-frontier-tsuki-cup',
      expect.objectContaining({
        scoringContext: { threats: ['azumarill'] },
      }),
    );
    expect(rerankRosterFinalists).toHaveBeenCalledWith(
      result.defaultScoredFinalists,
      expect.objectContaining({
        getAssignments: expect.any(Function),
        scoreAssignment: expect.any(Function),
      }),
    );
    expect(createLineupAwareFitnessContext).toHaveBeenCalledWith(
      'battle-frontier-tsuki-cup',
      'team-aware',
      { threatCount: 100 },
    );
    expect(scorePlayPokemonRoster).toHaveBeenCalledWith(
      result.team,
      expect.objectContaining({
        movesetAssignment: expect.objectContaining({
          fingerprint: `assignment:${result.team.join(',')}`,
        }),
      }),
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
    expect(result.movesetAssignment?.fingerprint).toBe(
      `assignment:${result.team.join(',')}`,
    );
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
    vi.mocked(initializeAnchorFirstPopulation).mockReturnValue([
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
      formatId: 'battle-frontier-tsuki-cup',
      populationSize: 1,
      generations: 0,
    });

    expect(result.fitness).toBe(0.91);
    expect(result.scoreBreakdown?.score).toBe(0.91);
    expect(result.fitness).toBe(result.scoreBreakdown?.score);
  });

  it('retains default-scored finalists across generations for final reranking', async () => {
    const initialBestTeam = ['f', 'e', 'd', 'c', 'b', 'a'];
    const reorderedInitialBest = ['a', 'b', 'c', 'd', 'e', 'f'];
    const initialRunnerUp = ['g', 'h', 'i', 'j', 'k', 'l'];
    const evolvedRunnerUp = ['m', 'n', 'o', 'p', 'q', 'r'];
    configurePlayPokemonPool([
      ...initialBestTeam,
      ...initialRunnerUp,
      ...evolvedRunnerUp,
    ]);
    vi.mocked(initializeAnchorFirstPopulation).mockReturnValue([
      createChromosomeWithTeam(initialBestTeam, 0.9),
      createChromosomeWithTeam(reorderedInitialBest, 0.88),
      createChromosomeWithTeam(initialRunnerUp, 0.8),
    ]);
    vi.mocked(createNextGeneration).mockReturnValue([
      createChromosomeWithTeam(evolvedRunnerUp, 0.85),
    ]);
    vi.mocked(getBestChromosome).mockImplementation(
      (population) =>
        [...population].sort(
          (first, second) => second.fitness - first.fitness,
        )[0],
    );

    const result = await generateTeam({
      mode: 'PlayPokemon',
      formatId: 'great-league',
      populationSize: 3,
      generations: 1,
    });

    expect(result.team).toEqual(reorderedInitialBest);
    expect(result.defaultScoredFinalists).toEqual([
      createChromosomeWithTeam(reorderedInitialBest, 0.9),
      createChromosomeWithTeam(evolvedRunnerUp, 0.85),
      createChromosomeWithTeam(initialRunnerUp, 0.8),
    ]);
    expect(scorePlayPokemonRoster).toHaveBeenCalledTimes(1);
  });

  it('uses bounded variant-aware reranking to select the final PlayPokemon roster', async () => {
    const higherDefault = ['a', 'b', 'c', 'd', 'e', 'f'];
    const lowerDefault = ['g', 'h', 'i', 'j', 'k', 'l'];
    configurePlayPokemonPool([...higherDefault, ...lowerDefault]);
    vi.mocked(initializeAnchorFirstPopulation).mockReturnValue([
      createChromosomeWithTeam(higherDefault, 0.9),
      createChromosomeWithTeam(lowerDefault, 0.8),
    ]);
    vi.mocked(getBestChromosome).mockImplementation(
      (population) => population[0],
    );
    const selectedAssignment = createTestAssignment(lowerDefault);
    vi.mocked(rerankRosterFinalists).mockImplementationOnce((finalists) => ({
      finalist: finalists.find(({ team }) => team[0] === 'g')!,
      assignment: selectedAssignment,
      score: {
        roster: lowerDefault,
        fitness: 0.95,
        scoreBreakdown: createScoreBreakdown(0.95),
        evaluatedLineupCount: 120,
        metrics: {
          viableLineupCount: 12,
          topLineupQuality: 0.95,
          topNLineupDepth: 0.9,
          dominatingMatchupRate: 0.3,
          overwhelmingLossRate: 0.02,
          singleAnswerRisks: [],
          viableLeadDiversity: 4,
          benchUtilitySummary: [],
        },
      },
      stats: {
        finalistCount: 2,
        assignmentEvaluationCount: 2,
        fullScoreCount: 2,
      },
    }));
    vi.mocked(scorePlayPokemonRoster).mockReturnValueOnce({
      roster: lowerDefault,
      fitness: 0.95,
      scoreBreakdown: createScoreBreakdown(0.95),
      evaluatedLineupCount: 120,
      metrics: {
        viableLineupCount: 12,
        topLineupQuality: 0.95,
        topNLineupDepth: 0.9,
        dominatingMatchupRate: 0.3,
        overwhelmingLossRate: 0.02,
        singleAnswerRisks: [],
        viableLeadDiversity: 4,
        benchUtilitySummary: [],
      },
      lineupScores: [],
    });

    const result = await generateTeam({
      mode: 'PlayPokemon',
      formatId: 'great-league',
      populationSize: 2,
      generations: 0,
    });

    expect(rerankRosterFinalists).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ team: [...higherDefault].sort() }),
        expect.objectContaining({ team: [...lowerDefault].sort() }),
      ]),
      expect.objectContaining({
        getAssignments: expect.any(Function),
        getMatchupRating: expect.any(Function),
        scoreAssignment: expect.any(Function),
      }),
    );
    expect(result.team).toEqual([...lowerDefault].sort());
    expect(result.movesetAssignment).toBe(selectedAssignment);
    expect(result.fitness).toBe(result.scoreBreakdown?.score);
  });

  it('preserves explicit anchor order while canonicalizing flexible finalists', async () => {
    const anchorPokemon = ['anchor_b', 'anchor_a'];
    const flexibleMembers = ['flex_d', 'flex_c', 'flex_b', 'flex_a'];
    configurePlayPokemonPool([...anchorPokemon, ...flexibleMembers]);
    vi.mocked(initializeAnchorFirstPopulation).mockReturnValue([
      createChromosomeWithTeam([...anchorPokemon, ...flexibleMembers], 0.9),
      createChromosomeWithTeam(
        [...anchorPokemon, ...[...flexibleMembers].reverse()],
        0.8,
      ),
    ]);
    vi.mocked(getBestChromosome).mockImplementation(
      (population) =>
        [...population].sort(
          (first, second) => second.fitness - first.fitness,
        )[0],
    );

    const result = await generateTeam({
      mode: 'PlayPokemon',
      formatId: 'great-league',
      anchorPokemon,
      populationSize: 2,
      generations: 0,
    });

    expect(result.defaultScoredFinalists).toEqual([
      createChromosomeWithTeam(
        [...anchorPokemon, ...[...flexibleMembers].sort()],
        0.9,
      ),
    ]);
  });

  it('caps finalists at ten in deterministic order for shuffled populations', async () => {
    const population = Array.from({ length: 12 }, (_, index) =>
      createChromosomeWithTeam(
        Array.from(
          { length: 6 },
          (_unused, memberIndex) => `team_${index}_member_${memberIndex}`,
        ),
        index === 10 ? 11 : index,
      ),
    );
    configurePlayPokemonPool(population.flatMap(({ team }) => team));
    vi.mocked(getBestChromosome).mockImplementation(
      (candidatePopulation) =>
        [...candidatePopulation].sort(
          (first, second) => second.fitness - first.fitness,
        )[0],
    );
    vi.mocked(initializeAnchorFirstPopulation)
      .mockReturnValueOnce(population)
      .mockReturnValueOnce([...population].reverse());

    const first = await generateTeam({
      mode: 'PlayPokemon',
      formatId: 'great-league',
      populationSize: 12,
      generations: 0,
    });
    const second = await generateTeam({
      mode: 'PlayPokemon',
      formatId: 'great-league',
      populationSize: 12,
      generations: 0,
    });

    expect(first.defaultScoredFinalists).toHaveLength(10);
    expect(first.defaultScoredFinalists?.map(({ fitness }) => fitness)).toEqual(
      [11, 11, 9, 8, 7, 6, 5, 4, 3, 2],
    );
    expect(
      first.defaultScoredFinalists?.slice(0, 2).map(({ team }) => team),
    ).toEqual([population[10].team, population[11].team]);
    expect(second.defaultScoredFinalists).toEqual(first.defaultScoredFinalists);
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
    vi.mocked(initializeAnchorFirstPopulation).mockReturnValue([
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
      formatId: 'battle-frontier-tsuki-cup',
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
    vi.mocked(initializeAnchorFirstPopulation)
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
        formatId: 'battle-frontier-tsuki-cup',
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
      formatId: 'battle-frontier-tsuki-cup',
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
      'battle-frontier-tsuki-cup',
      sharedContext,
    );
    expect(evaluatePopulation).toHaveBeenNthCalledWith(
      2,
      expect.any(Array),
      'GBL',
      'battle-frontier-tsuki-cup',
      sharedContext,
    );
    expect(evaluatePopulation).toHaveBeenNthCalledWith(
      3,
      expect.any(Array),
      'GBL',
      'battle-frontier-tsuki-cup',
      sharedContext,
    );
  });
});
