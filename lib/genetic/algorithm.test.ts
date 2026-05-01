import { DEFAULT_BATTLE_FORMAT_ID } from '@lib/data/battleFormats';
import { getBattleFrontierMasterTeamLegality } from '@lib/data/battleFrontierMasterRules';
import { getRankedPokemonForFormat } from '@lib/data/pokemon';
import { getTopRankedPokemonNames } from '@lib/data/rankings';
import { ensureSimulationDataAvailable } from '@lib/data/simulations';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chromosome, Pokemon } from '../types';
import { generateTeam } from './algorithm';
import {
  calculateDiversity,
  cloneChromosome,
  getBestChromosome,
  hasConverged,
  initializePopulation,
} from './chromosome';
import { evaluatePopulation } from './fitness';
import { createNextGeneration, getAdaptiveMutationRate } from './operators';

vi.mock('@lib/data/rankings', () => ({
  getTopRankedPokemonNames: vi.fn(),
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
  evaluatePopulation: vi.fn(),
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

function createChromosomeWithTeam(team: string[]): Chromosome {
  return {
    team,
    anchors: [],
    fitness: 1,
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

    vi.mocked(getTopRankedPokemonNames).mockReturnValue(rankedNames);
    vi.mocked(getRankedPokemonForFormat).mockReturnValue([
      createPokemon('mew', 'Mew'),
    ]);

    await generateTeam({
      mode: 'GBL',
      formatId: 'jungle-cup',
      populationSize: 1,
      generations: 0,
    });

    expect(getTopRankedPokemonNames).toHaveBeenCalledWith(
      80,
      150,
      'jungle-cup',
    );
    expect(getRankedPokemonForFormat).toHaveBeenCalledWith(
      rankedNames,
      'jungle-cup',
    );
    expect(ensureSimulationDataAvailable).toHaveBeenCalledWith('jungle-cup');
    expect(initializePopulation).toHaveBeenCalledWith(
      1,
      ['mew'],
      3,
      [],
      'jungle-cup',
    );
    expect(evaluatePopulation).toHaveBeenCalledWith(
      expect.any(Array),
      'GBL',
      'individual',
      'jungle-cup',
    );
  });

  it('defaults pool selection to Great League format when omitted', async () => {
    vi.mocked(getTopRankedPokemonNames).mockReturnValue(
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

    expect(getTopRankedPokemonNames).toHaveBeenCalledWith(
      80,
      150,
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
    vi.mocked(getTopRankedPokemonNames).mockReturnValue(
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

    vi.mocked(getTopRankedPokemonNames).mockReturnValue(
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
});
