import { describe, expect, it } from 'vitest';
import { getRecommendedMovesetForPokemon } from './moveset';
import { getPokemonBySpeciesId } from '@/lib/data/pokemon';

describe('getRecommendedMovesetForPokemon', () => {
  it('uses format-specific ranking movesets', () => {
    const decidueye = getPokemonBySpeciesId('decidueye');

    expect(decidueye).toBeDefined();

    expect(
      getRecommendedMovesetForPokemon(decidueye!, 'great-league').fastMove,
    ).toBe('LEAFAGE');
    expect(
      getRecommendedMovesetForPokemon(decidueye!, 'battle-frontier-ul-retro')
        .fastMove,
    ).toBe('ASTONISH');
  });
});
