import { describe, expect, it } from 'vitest';
import {
  getRecommendedMovesetForPokemon,
  getSimulationBackedMovesetForTeam,
} from './moveset';
import { getPokemonBySpeciesId } from '@/lib/data/pokemon';

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
  it('selects an alternate that improves an unresolved simulated threat', () => {
    const golisopod = getPokemonBySpeciesId('golisopod');
    expect(golisopod).toBeDefined();

    const moveset = getSimulationBackedMovesetForTeam(
      golisopod!,
      ['golisopod', 'milotic', 'goodra'],
      'battle-frontier-coupe-du-sillage',
      {
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
        getThreats: () => ['mewtwo'],
        getDefaultMatchupRating: (speciesId) =>
          speciesId === 'milotic' ? 600 : 400,
        getVariantMatchupRating: () => 700,
      },
    );

    expect(moveset.fastMove).toBe('FURY_CUTTER');
  });
});
