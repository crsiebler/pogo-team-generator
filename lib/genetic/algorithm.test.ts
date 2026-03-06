import { DEFAULT_BATTLE_FORMAT_ID } from '@lib/data/battleFormats';
import { getRankedPokemonForFormat } from '@lib/data/pokemon';
import { getTopRankedPokemonNames } from '@lib/data/rankings';
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
      formatId: 'kanto-cup',
      populationSize: 1,
      generations: 0,
    });

    expect(getTopRankedPokemonNames).toHaveBeenCalledWith(80, 150, 'kanto-cup');
    expect(getRankedPokemonForFormat).toHaveBeenCalledWith(
      rankedNames,
      'kanto-cup',
    );
    expect(initializePopulation).toHaveBeenCalledWith(1, ['mew'], 3, []);
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
  });
});
