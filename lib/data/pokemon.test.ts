import { describe, expect, it } from 'vitest';
import {
  getRankedPokemonForFormat,
  isBattleFrontierBannedSpeciesId,
  speciesNameToId,
  validateTeamUniqueness,
} from './pokemon';

describe('speciesNameToId', () => {
  it('resolves duplicate species names to the first occurrence', () => {
    expect(speciesNameToId('Cradily')).toBe('cradily');
  });

  it('resolves non-duplicate species names normally', () => {
    expect(speciesNameToId('Cradily (Shadow)')).toBe('cradily_shadow');
  });
});

describe('validateTeamUniqueness', () => {
  it('rejects mixed variants of the same species', () => {
    expect(
      validateTeamUniqueness(['marowak', 'marowak_alolan', 'azumarill']),
    ).toBe(false);
  });

  it('accepts teams with unique species', () => {
    expect(validateTeamUniqueness(['marowak', 'azumarill', 'registeel'])).toBe(
      true,
    );
  });
});

describe('Battle Frontier bans', () => {
  it('flags the configured banned Battle Frontier species ids', () => {
    expect(isBattleFrontierBannedSpeciesId('groudon_primal')).toBe(true);
    expect(isBattleFrontierBannedSpeciesId('garchomp_mega')).toBe(true);
    expect(isBattleFrontierBannedSpeciesId('hydreigon')).toBe(false);
  });

  it('filters banned species from ranked Battle Frontier Pokemon pools', () => {
    const rankedPokemon = getRankedPokemonForFormat(
      new Set(['Garchomp (Mega)', 'Hydreigon']),
      'battle-frontier-master',
    );

    expect(rankedPokemon.map((pokemon) => pokemon.speciesName)).toEqual([
      'Hydreigon',
    ]);
  });
});
