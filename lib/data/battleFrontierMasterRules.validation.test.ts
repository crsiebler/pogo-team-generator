import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Battle Frontier Master rules table validation', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock('fs');
    vi.unmock('csv-parse/sync');
    vi.unmock('@/lib/data/pokemon');
    vi.unmock('@/lib/data/rankings');
  });

  it('throws when the points table contains duplicate species ids', async () => {
    vi.doMock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      const readFileSync = vi.fn(() => 'speciesId,points');

      return {
        ...actual,
        default: {
          ...actual,
          readFileSync,
        },
        readFileSync,
      };
    });
    vi.doMock('csv-parse/sync', () => ({
      parse: vi.fn(() => [
        { speciesId: 'mewtwo', points: '2' },
        { speciesId: 'mewtwo', points: '3' },
      ]),
    }));
    vi.doMock('@/lib/data/pokemon', () => ({
      getPokemonBySpeciesId: vi.fn(() => undefined),
      isShadow: vi.fn(() => false),
      normalizeToChoosableSpeciesId: vi.fn((speciesId: string) => speciesId),
    }));
    vi.doMock('@/lib/data/rankings', () => ({
      getRankedSpeciesIds: vi.fn(() => new Set<string>()),
    }));

    const { getBattleFrontierMasterPointsForSpecies } =
      await import('@/lib/data/battleFrontierMasterRules');

    expect(() => getBattleFrontierMasterPointsForSpecies('mewtwo')).toThrow(
      /duplicate speciesId "mewtwo"/i,
    );
  });

  it('throws when the points table contains invalid point values', async () => {
    vi.doMock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      const readFileSync = vi.fn(() => 'speciesId,points');

      return {
        ...actual,
        default: {
          ...actual,
          readFileSync,
        },
        readFileSync,
      };
    });
    vi.doMock('csv-parse/sync', () => ({
      parse: vi.fn(() => [{ speciesId: 'mewtwo', points: 'NaN' }]),
    }));
    vi.doMock('@/lib/data/pokemon', () => ({
      getPokemonBySpeciesId: vi.fn(() => undefined),
      isShadow: vi.fn(() => false),
      normalizeToChoosableSpeciesId: vi.fn((speciesId: string) => speciesId),
    }));
    vi.doMock('@/lib/data/rankings', () => ({
      getRankedSpeciesIds: vi.fn(() => new Set<string>()),
    }));

    const { getBattleFrontierMasterPointsForSpecies } =
      await import('@/lib/data/battleFrontierMasterRules');

    expect(() => getBattleFrontierMasterPointsForSpecies('mewtwo')).toThrow(
      /invalid points "NaN"/i,
    );
  });
});
