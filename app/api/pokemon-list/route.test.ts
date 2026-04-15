import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import {
  DEFAULT_BATTLE_FORMAT_ID,
  isBattleFrontierFormatId,
} from '@/lib/data/battleFormats';
import { getBattleFrontierMasterPointsForSpecies } from '@/lib/data/battleFrontierMasterRules';
import {
  isBattleFrontierBannedSpeciesId,
  speciesNameToChoosableId,
} from '@/lib/data/pokemon';
import { getRankedPokemonNames } from '@/lib/data/rankings';

vi.mock('@/lib/data/battleFormats', async () => {
  const actual = await vi.importActual('@/lib/data/battleFormats');

  return {
    ...actual,
    isBattleFrontierFormatId: vi.fn(),
  };
});

vi.mock('@/lib/data/rankings', async () => {
  const actual = await vi.importActual('@/lib/data/rankings');

  return {
    ...actual,
    getRankedPokemonNames: vi.fn(),
  };
});

vi.mock('@/lib/data/pokemon', async () => {
  const actual = await vi.importActual('@/lib/data/pokemon');

  return {
    ...actual,
    isBattleFrontierBannedSpeciesId: vi.fn(),
    speciesNameToChoosableId: vi.fn(),
  };
});

vi.mock('@/lib/data/battleFrontierMasterRules', () => ({
  getBattleFrontierMasterPointsForSpecies: vi.fn(),
}));

describe('GET /api/pokemon-list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.mocked(getRankedPokemonNames).mockReturnValue(new Set(['Azumarill']));
    vi.mocked(isBattleFrontierFormatId).mockReturnValue(false);
    vi.mocked(isBattleFrontierBannedSpeciesId).mockReturnValue(false);
    vi.mocked(speciesNameToChoosableId).mockImplementation((name: string) =>
      name.toLowerCase().replace(/\s+/g, '_'),
    );
    vi.mocked(getBattleFrontierMasterPointsForSpecies).mockReturnValue(0);
  });

  it('defaults formatId to the default battle format when omitted', async () => {
    const request = new Request('http://localhost/api/pokemon-list');

    const response = await GET(request as NextRequest);
    const payload = (await response.json()) as {
      pokemon: string[];
      count: number;
    };

    expect(response.status).toBe(200);
    expect(getRankedPokemonNames).toHaveBeenCalledWith(
      DEFAULT_BATTLE_FORMAT_ID,
    );
    expect(payload).toEqual({
      pokemon: ['Azumarill'],
      count: 1,
    });
  });

  it('includes Battle Frontier Master point values for eligible Pokemon', async () => {
    vi.mocked(isBattleFrontierFormatId).mockReturnValue(true);
    vi.mocked(getRankedPokemonNames).mockReturnValue(
      new Set(['Palkia (Origin)', 'Palkia (Shadow)', 'Hydreigon']),
    );
    vi.mocked(speciesNameToChoosableId).mockImplementation((name: string) => {
      if (name === 'Palkia (Origin)') {
        return 'palkia_origin';
      }

      if (name === 'Palkia (Shadow)') {
        return 'palkia_shadow';
      }

      return 'hydreigon';
    });
    vi.mocked(getBattleFrontierMasterPointsForSpecies)
      .mockReturnValueOnce(5)
      .mockReturnValueOnce(2)
      .mockReturnValueOnce(0);

    const request = new Request(
      'http://localhost/api/pokemon-list?formatId=battle-frontier-master',
    );

    const response = await GET(request as NextRequest);
    const payload = (await response.json()) as {
      pokemon: string[];
      count: number;
      battleFrontierMasterPointsByPokemonName?: Record<string, number>;
    };

    expect(response.status).toBe(200);
    expect(payload.battleFrontierMasterPointsByPokemonName).toEqual({
      Hydreigon: 0,
      'Palkia (Origin)': 5,
      'Palkia (Shadow)': 2,
    });
  });

  it('filters Battle Frontier banned Pokemon from the response', async () => {
    vi.mocked(isBattleFrontierFormatId).mockReturnValue(true);
    vi.mocked(getRankedPokemonNames).mockReturnValue(
      new Set(['Groudon (Primal)', 'Hydreigon']),
    );
    vi.mocked(speciesNameToChoosableId).mockImplementation((name: string) => {
      if (name === 'Groudon (Primal)') {
        return 'groudon_primal';
      }

      return 'hydreigon';
    });
    vi.mocked(isBattleFrontierBannedSpeciesId).mockImplementation(
      (speciesId: string) => speciesId === 'groudon_primal',
    );

    const request = new Request(
      'http://localhost/api/pokemon-list?formatId=battle-frontier-master',
    );

    const response = await GET(request as NextRequest);
    const payload = (await response.json()) as {
      pokemon: string[];
      count: number;
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      pokemon: ['Hydreigon'],
      count: 1,
    });
  });
});
