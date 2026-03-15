import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { DEFAULT_BATTLE_FORMAT_ID } from '@/lib/data/battleFormats';
import { getPokemonBySpeciesId } from '@/lib/data/pokemon';
import { getRecommendedMovesetForPokemon } from '@/lib/genetic/moveset';

vi.mock('@/lib/data/pokemon', () => ({
  getPokemonBySpeciesId: vi.fn(),
}));

vi.mock('@/lib/genetic/moveset', () => ({
  getRecommendedMovesetForPokemon: vi.fn(),
}));

describe('POST /api/team-details format-aware movesets', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getPokemonBySpeciesId).mockReturnValue({
      speciesId: 'decidueye',
      speciesName: 'Decidueye',
      dex: 724,
      baseStats: { atk: 1, def: 1, hp: 1 },
      types: ['grass', 'ghost'],
      fastMoves: ['LEAFAGE', 'ASTONISH'],
      chargedMoves: ['FRENZY_PLANT', 'SPIRIT_SHACKLE'],
      tags: [],
      defaultIVs: {},
      buddyDistance: 3,
      thirdMoveCost: 10000,
      released: true,
    });

    vi.mocked(getRecommendedMovesetForPokemon).mockReturnValue({
      fastMove: 'ASTONISH',
      chargedMove1: 'FRENZY_PLANT',
      chargedMove2: 'SPIRIT_SHACKLE',
    });
  });

  it('passes the selected formatId to moveset lookup', async () => {
    const request = new Request('http://localhost/api/team-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team: ['decidueye'],
        formatId: 'battle-frontier-ul-retro',
      }),
    });

    const response = await POST(request as NextRequest);

    expect(response.status).toBe(200);
    expect(getRecommendedMovesetForPokemon).toHaveBeenCalledWith(
      expect.objectContaining({ speciesId: 'decidueye' }),
      'battle-frontier-ul-retro',
    );
  });

  it('defaults missing formatId to Great League', async () => {
    const request = new Request('http://localhost/api/team-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team: ['decidueye'] }),
    });

    const response = await POST(request as NextRequest);

    expect(response.status).toBe(200);
    expect(getRecommendedMovesetForPokemon).toHaveBeenCalledWith(
      expect.objectContaining({ speciesId: 'decidueye' }),
      DEFAULT_BATTLE_FORMAT_ID,
    );
  });
});
