import { describe, expect, it } from 'vitest';
import {
  getRecommendedMovesetForPokemon,
  getSimulationBackedMovesetForTeam,
} from './moveset';
import { MovesetVariantSimulationDataError } from '@/lib/data/movesetVariantSimulations';
import { getPokemonBySpeciesId } from '@/lib/data/pokemon';
import type { MovesetVariant } from '@/lib/types';

const simulationVariants: readonly MovesetVariant[] = [
  {
    id: 'fury_cutter--x_scissor--aqua_jet',
    fastMove: 'FURY_CUTTER',
    chargedMove1: 'X_SCISSOR',
    chargedMove2: 'AQUA_JET',
    isDefault: true,
  },
  {
    id: 'shadow_claw--x_scissor--aqua_jet',
    fastMove: 'SHADOW_CLAW',
    chargedMove1: 'X_SCISSOR',
    chargedMove2: 'AQUA_JET',
    isDefault: false,
  },
];

describe('getRecommendedMovesetForPokemon', () => {
  it('uses format-specific ranking movesets', () => {
    const decidueye = getPokemonBySpeciesId('decidueye');

    expect(decidueye).toBeDefined();

    expect(
      getRecommendedMovesetForPokemon(decidueye!, 'great-league').fastMove,
    ).toBe('LEAFAGE');
    expect(
      getRecommendedMovesetForPokemon(decidueye!, 'battle-frontier-liga-ultra')
        .fastMove,
    ).toBe('ASTONISH');
  });
});

describe('getSimulationBackedMovesetForTeam', () => {
  it('keeps the ranked default until a format manifest is published', () => {
    const golisopod = getPokemonBySpeciesId('golisopod');
    expect(golisopod).toBeDefined();

    expect(
      getSimulationBackedMovesetForTeam(
        golisopod!,
        ['golisopod', 'milotic', 'goodra'],
        'great-league',
      ),
    ).toEqual(getRecommendedMovesetForPokemon(golisopod!, 'great-league'));
  });

  it('propagates malformed manifest data instead of choosing a moveset', () => {
    const golisopod = getPokemonBySpeciesId('golisopod');
    expect(golisopod).toBeDefined();

    expect(() =>
      getSimulationBackedMovesetForTeam(
        golisopod!,
        ['golisopod', 'milotic', 'goodra'],
        'great-league',
        {
          getVariants: () => {
            throw new MovesetVariantSimulationDataError(
              'manifest-malformed',
              'great-league',
              'data/simulations/cp1500/all/moveset-variants.json',
            );
          },
          getThreats: () => [],
          getDefaultMatchupRating: () => null,
          getVariantMatchupRating: () => null,
        },
      ),
    ).toThrowError(expect.objectContaining({ code: 'manifest-malformed' }));
  });

  it('uses the manifest default when no threat comparison is needed', () => {
    const golisopod = getPokemonBySpeciesId('golisopod');
    expect(golisopod).toBeDefined();
    const manifestVariants: readonly MovesetVariant[] = [
      {
        ...simulationVariants[0],
        id: 'waterfall--x_scissor--aqua_jet',
        fastMove: 'WATERFALL',
      },
      simulationVariants[1],
    ];

    expect(
      getSimulationBackedMovesetForTeam(
        golisopod!,
        ['golisopod', 'milotic', 'goodra'],
        'great-league',
        {
          getVariants: () => manifestVariants,
          getThreats: () => [],
          getDefaultMatchupRating: () => null,
          getVariantMatchupRating: () => null,
        },
      ).fastMove,
    ).toBe('WATERFALL');
  });

  it('selects an alternate that improves an unresolved simulated threat', () => {
    const golisopod = getPokemonBySpeciesId('golisopod');
    expect(golisopod).toBeDefined();

    const moveset = getSimulationBackedMovesetForTeam(
      golisopod!,
      ['golisopod', 'milotic', 'goodra'],
      'battle-frontier-coupe-du-sillage',
      {
        getVariants: () => simulationVariants,
        getThreats: () => ['mewtwo'],
        getDefaultMatchupRating: (speciesId) =>
          speciesId === 'golisopod' ? 400 : 300,
        getVariantMatchupRating: () => 600,
      },
    );

    expect(moveset.fastMove).toBe('SHADOW_CLAW');
  });

  it('keeps the default when teammates already cover the threat', () => {
    const golisopod = getPokemonBySpeciesId('golisopod');
    expect(golisopod).toBeDefined();

    const moveset = getSimulationBackedMovesetForTeam(
      golisopod!,
      ['golisopod', 'milotic', 'goodra'],
      'battle-frontier-coupe-du-sillage',
      {
        getVariants: () => simulationVariants,
        getThreats: () => ['mewtwo'],
        getDefaultMatchupRating: (speciesId) =>
          speciesId === 'milotic' ? 600 : 400,
        getVariantMatchupRating: () => 700,
      },
    );

    expect(moveset.fastMove).toBe('FURY_CUTTER');
  });
});
