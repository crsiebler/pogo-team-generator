import path from 'path';
import { describe, expect, it } from 'vitest';
import { createPvpokeAdapter } from './adapter';

describe('createPvpokeAdapter', () => {
  it('resolves gamemaster and rankings file paths', () => {
    const adapter = createPvpokeAdapter({ sourcePath: '/source/pvpoke' });

    expect(adapter.getRequiredGamemasterRelativePaths()).toEqual([
      'src/data/gamemaster/pokemon.json',
      'src/data/gamemaster/moves.json',
    ]);

    expect(adapter.getGamemasterRelativePaths()).toEqual({
      pokemon: 'src/data/gamemaster/pokemon.json',
      moves: 'src/data/gamemaster/moves.json',
    });

    expect(adapter.getGamemasterFilePaths()).toEqual({
      pokemon: '/source/pvpoke/src/data/gamemaster/pokemon.json',
      moves: '/source/pvpoke/src/data/gamemaster/moves.json',
    });

    expect(adapter.getRankingFilePath('overall', 1500)).toBe(
      '/source/pvpoke/src/data/rankings/all/overall/rankings-1500.json',
    );
    expect(adapter.getRankingFilePath('overall', 1500, 'scroll')).toBe(
      '/source/pvpoke/src/data/rankings/scroll/overall/rankings-1500.json',
    );
    expect(adapter.getRankingFilePath('overall', 1500, 'copadiluvio')).toBe(
      '/source/pvpoke/src/data/rankings/copadiluvio/overall/rankings-1500.json',
    );
    expect(adapter.getRankingFilePath('overall', 1500, 'tsuki')).toBe(
      '/source/pvpoke/src/data/rankings/tsuki/overall/rankings-1500.json',
    );
    expect(adapter.getRankingFilePath('overall', 2500, 'ligaultra')).toBe(
      '/source/pvpoke/src/data/rankings/ligaultra/overall/rankings-2500.json',
    );
    expect(adapter.getRankingFilePath('overall', 10000, 'coupedusillage')).toBe(
      '/source/pvpoke/src/data/rankings/coupedusillage/overall/rankings-10000.json',
    );
    expect(adapter.getRankingFilePath('chargers', 1500)).toBe(
      '/source/pvpoke/src/data/rankings/all/chargers/rankings-1500.json',
    );
    expect(adapter.getRankingFilePath('attackers', 1500)).toBe(
      '/source/pvpoke/src/data/rankings/all/attackers/rankings-1500.json',
    );
    expect(adapter.getRankingFilePath('consistency', 1500)).toBe(
      '/source/pvpoke/src/data/rankings/all/consistency/rankings-1500.json',
    );
    expect(adapter.getMovesetOverridesFilePath(1500)).toBe(
      '/source/pvpoke/src/data/overrides/all/1500.json',
    );
    expect(adapter.getMovesetOverridesFilePath(1500, 'scroll')).toBe(
      '/source/pvpoke/src/data/overrides/scroll/1500.json',
    );
  });

  it('reads and parses JSON through the adapter boundary', async () => {
    const sourcePath = '/source/pvpoke';
    const rankingRelativePath =
      'src/data/rankings/all/overall/rankings-1500.json';
    const rankingAbsolutePath = path.join(sourcePath, rankingRelativePath);
    const adapter = createPvpokeAdapter({
      sourcePath,
      pathExists: (filePath: string) => filePath === rankingAbsolutePath,
      readFile: async (filePath: string) => {
        if (filePath !== rankingAbsolutePath) {
          throw new Error('unexpected path read');
        }

        return '[{"speciesName":"Azumarill"}]';
      },
    });

    const rankings = await adapter.readRankingJson<
      Array<{ speciesName: string }>
    >('overall', 1500);
    expect(rankings).toEqual([{ speciesName: 'Azumarill' }]);
  });

  it('accepts JSON files with a leading UTF-8 BOM', async () => {
    const adapter = createPvpokeAdapter({
      sourcePath: '/source/pvpoke',
      pathExists: () => true,
      readFile: async () => '\uFEFF[{"speciesName":"Azumarill"}]',
    });

    await expect(
      adapter.readJsonFile<Array<{ speciesName: string }>>(
        'src/data/rankings/scroll/overall/rankings-1500.json',
      ),
    ).resolves.toEqual([{ speciesName: 'Azumarill' }]);
  });

  it('reads cup-specific rankings JSON files', async () => {
    const sourcePath = '/source/pvpoke';
    const rankingRelativePath =
      'src/data/rankings/tsuki/overall/rankings-1500.json';
    const rankingAbsolutePath = path.join(sourcePath, rankingRelativePath);
    const adapter = createPvpokeAdapter({
      sourcePath,
      pathExists: (filePath: string) => filePath === rankingAbsolutePath,
      readFile: async (filePath: string) => {
        if (filePath !== rankingAbsolutePath) {
          throw new Error('unexpected path read');
        }

        return '[{"speciesName":"Wigglytuff"}]';
      },
    });

    const rankings = await adapter.readRankingJson<
      Array<{ speciesName: string }>
    >('overall', 1500, 'tsuki');

    expect(rankings).toEqual([{ speciesName: 'Wigglytuff' }]);
  });

  it('reads explicit moveset overrides when present', async () => {
    const sourcePath = '/source/pvpoke';
    const overrideRelativePath = 'src/data/overrides/scroll/1500.json';
    const overrideAbsolutePath = path.join(sourcePath, overrideRelativePath);
    const adapter = createPvpokeAdapter({
      sourcePath,
      pathExists: (filePath: string) => filePath === overrideAbsolutePath,
      readFile: async (filePath: string) => {
        if (filePath !== overrideAbsolutePath) {
          throw new Error('unexpected path read');
        }

        return '[{"speciesId":"abomasnow","fastMove":"POWDER_SNOW"}]';
      },
    });

    const overrides = await adapter.readMovesetOverridesJson<{
      speciesId: string;
      fastMove: string;
    }>(1500, 'scroll');

    expect(overrides).toEqual([
      { speciesId: 'abomasnow', fastMove: 'POWDER_SNOW' },
    ]);
  });

  it('returns no explicit moveset overrides when the optional file is absent', async () => {
    const adapter = createPvpokeAdapter({
      sourcePath: '/source/pvpoke',
      pathExists: () => false,
      readFile: async () => {
        throw new Error('missing optional overrides must not be read');
      },
    });

    await expect(
      adapter.readMovesetOverridesJson<unknown>(1500, 'tsuki'),
    ).resolves.toEqual([]);
  });

  it('rejects malformed explicit moveset override JSON', async () => {
    const adapter = createPvpokeAdapter({
      sourcePath: '/source/pvpoke',
      pathExists: () => true,
      readFile: async () => '{not-json}',
    });

    await expect(
      adapter.readMovesetOverridesJson<unknown>(1500),
    ).rejects.toThrowError(
      /\[pvpoke-adapter\] Invalid JSON in src\/data\/overrides\/all\/1500\.json:/,
    );
  });

  it('rejects removed cup-specific ranking paths', () => {
    const adapter = createPvpokeAdapter({ sourcePath: '/source/pvpoke' });

    expect(() =>
      adapter.getRankingFilePath('overall', 1500, 'kanto' as never),
    ).toThrow('[pvpoke-adapter] Unsupported ranking cup: kanto');
    expect(() =>
      adapter.getRankingFilePath('overall', 1500, 'spring' as never),
    ).toThrow('[pvpoke-adapter] Unsupported ranking cup: spring');
    expect(() =>
      adapter.getRankingFilePath('overall', 1500, 'jungle' as never),
    ).toThrow('[pvpoke-adapter] Unsupported ranking cup: jungle');
    expect(() =>
      adapter.getRankingFilePath('overall', 1500, 'retro' as never),
    ).toThrow('[pvpoke-adapter] Unsupported ranking cup: retro');
    expect(() =>
      adapter.getRankingFilePath('overall', 10000, 'premier' as never),
    ).toThrow('[pvpoke-adapter] Unsupported ranking cup: premier');
    expect(() =>
      adapter.getRankingFilePath('overall', 10000, 'mega' as never),
    ).toThrow('[pvpoke-adapter] Unsupported ranking cup: mega');
    expect(() =>
      adapter.getRankingFilePath('overall', 2500, 'fantasy' as never),
    ).toThrow('[pvpoke-adapter] Unsupported ranking cup: fantasy');
    expect(() =>
      adapter.getRankingFilePath('overall', 1500, 'summer' as never),
    ).toThrow('[pvpoke-adapter] Unsupported ranking cup: summer');
    expect(() =>
      adapter.getRankingFilePath('overall', 1500, 'naic2026' as never),
    ).toThrow('[pvpoke-adapter] Unsupported ranking cup: naic2026');
    expect(() =>
      adapter.getRankingFilePath('overall', 1500, 'bayou' as never),
    ).toThrow('[pvpoke-adapter] Unsupported ranking cup: bayou');
    expect(() =>
      adapter.getRankingFilePath('overall', 1500, 'spellcraft' as never),
    ).toThrow('[pvpoke-adapter] Unsupported ranking cup: spellcraft');
    expect(() =>
      adapter.getRankingFilePath('overall', 2500, 'bfretro' as never),
    ).toThrow('[pvpoke-adapter] Unsupported ranking cup: bfretro');
    expect(() =>
      adapter.getRankingFilePath(
        'overall',
        10000,
        'battlefrontiermaster' as never,
      ),
    ).toThrow('[pvpoke-adapter] Unsupported ranking cup: battlefrontiermaster');
  });

  it('reads Scroll Cup rankings JSON files', async () => {
    const sourcePath = '/source/pvpoke';
    const rankingRelativePath =
      'src/data/rankings/scroll/overall/rankings-1500.json';
    const rankingAbsolutePath = path.join(sourcePath, rankingRelativePath);
    const adapter = createPvpokeAdapter({
      sourcePath,
      pathExists: (filePath: string) => filePath === rankingAbsolutePath,
      readFile: async (filePath: string) => {
        if (filePath !== rankingAbsolutePath) {
          throw new Error('unexpected path read');
        }

        return '[{"speciesName":"Feraligatr"}]';
      },
    });

    const rankings = await adapter.readRankingJson<
      Array<{ speciesName: string }>
    >('overall', 1500, 'scroll');

    expect(rankings).toEqual([{ speciesName: 'Feraligatr' }]);
  });

  it('reads Scroll Cup rankings JSON files again', async () => {
    const sourcePath = '/source/pvpoke';
    const rankingRelativePath =
      'src/data/rankings/scroll/overall/rankings-1500.json';
    const rankingAbsolutePath = path.join(sourcePath, rankingRelativePath);
    const adapter = createPvpokeAdapter({
      sourcePath,
      pathExists: (filePath: string) => filePath === rankingAbsolutePath,
      readFile: async (filePath: string) => {
        if (filePath !== rankingAbsolutePath) {
          throw new Error('unexpected path read');
        }

        return '[{"speciesName":"Dragonair"}]';
      },
    });

    const rankings = await adapter.readRankingJson<
      Array<{ speciesName: string }>
    >('overall', 1500, 'scroll');

    expect(rankings).toEqual([{ speciesName: 'Dragonair' }]);
  });

  it('reads new Battle Frontier rankings JSON files', async () => {
    const sourcePath = '/source/pvpoke';
    const rankingRelativePath =
      'src/data/rankings/copadiluvio/overall/rankings-1500.json';
    const rankingAbsolutePath = path.join(sourcePath, rankingRelativePath);
    const adapter = createPvpokeAdapter({
      sourcePath,
      pathExists: (filePath: string) => filePath === rankingAbsolutePath,
      readFile: async (filePath: string) => {
        if (filePath !== rankingAbsolutePath) {
          throw new Error('unexpected path read');
        }

        return '[{"speciesName":"Mantine"}]';
      },
    });

    const rankings = await adapter.readRankingJson<
      Array<{ speciesName: string }>
    >('overall', 1500, 'copadiluvio');

    expect(rankings).toEqual([{ speciesName: 'Mantine' }]);
  });

  it('reads gamemaster JSON via stable adapter methods', async () => {
    const sourcePath = '/source/pvpoke';
    const pokemonRelativePath = 'src/data/gamemaster/pokemon.json';
    const movesRelativePath = 'src/data/gamemaster/moves.json';
    const pokemonAbsolutePath = path.join(sourcePath, pokemonRelativePath);
    const movesAbsolutePath = path.join(sourcePath, movesRelativePath);
    const adapter = createPvpokeAdapter({
      sourcePath,
      pathExists: (filePath: string) => {
        return (
          filePath === pokemonAbsolutePath || filePath === movesAbsolutePath
        );
      },
      readFile: async (filePath: string) => {
        if (filePath === pokemonAbsolutePath) {
          return '[{"speciesName":"Azumarill"}]';
        }

        if (filePath === movesAbsolutePath) {
          return '[{"moveId":"ICE_BEAM"}]';
        }

        throw new Error('unexpected path read');
      },
    });

    const pokemon =
      await adapter.readPokemonJson<Array<{ speciesName: string }>>();
    const moves = await adapter.readMovesJson<Array<{ moveId: string }>>();

    expect(pokemon).toEqual([{ speciesName: 'Azumarill' }]);
    expect(moves).toEqual([{ moveId: 'ICE_BEAM' }]);
  });

  it('throws clear errors for missing and invalid JSON files', async () => {
    const missingAdapter = createPvpokeAdapter({
      sourcePath: '/source/pvpoke',
      pathExists: () => false,
      readFile: async () => '[]',
    });

    await expect(
      missingAdapter.readJsonFile('src/data/gamemaster/pokemon.json'),
    ).rejects.toThrowError(
      /\[pvpoke-adapter\] Missing source file: src\/data\/gamemaster\/pokemon\.json/,
    );

    const invalidAdapter = createPvpokeAdapter({
      sourcePath: '/source/pvpoke',
      pathExists: () => true,
      readFile: async () => '{not-json}',
    });

    await expect(
      invalidAdapter.readJsonFile('src/data/gamemaster/moves.json'),
    ).rejects.toThrowError(
      /\[pvpoke-adapter\] Invalid JSON in src\/data\/gamemaster\/moves\.json:/,
    );
  });
});
