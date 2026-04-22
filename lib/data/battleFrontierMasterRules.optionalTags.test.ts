import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Battle Frontier Master Mega detection', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock('@/lib/data/pokemon');
    vi.unmock('@/lib/data/rankings');
  });

  it('treats Pokemon without tags as non-Mega species', async () => {
    vi.doMock('@/lib/data/pokemon', () => ({
      getPokemonBySpeciesId: vi.fn(() => ({
        speciesId: 'charizard_mega_y',
      })),
      isShadow: vi.fn(() => false),
      normalizeToChoosableSpeciesId: vi.fn((speciesId: string) => speciesId),
    }));

    vi.doMock('@/lib/data/rankings', () => ({
      getRankedSpeciesIds: vi.fn(() => new Set<string>()),
    }));

    const { isBattleFrontierMasterMegaSpecies } =
      await import('@/lib/data/battleFrontierMasterRules');

    expect(isBattleFrontierMasterMegaSpecies('charizard_mega_y')).toBe(false);
  });
});
