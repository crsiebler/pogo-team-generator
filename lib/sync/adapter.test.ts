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
