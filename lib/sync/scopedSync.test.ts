import * as fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncConfig } from './config';
import * as gamemaster from './gamemaster';
import * as rankings from './rankings';
import { generateSimulations } from './simulations';
import * as source from './source';
import type { PokemonData } from './types';
import { runSync } from './index';

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
}));

vi.mock('./simulations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./simulations')>()),
  generateSimulations: vi.fn(),
}));

const scrapeRankings = rankings.scrapeRankings;
const formatId = 'laic-2027-gbl-cup' as const;
const overallPath = path.join(
  syncConfig.outputDir,
  'rankings',
  'cp1500',
  'laic2027gbl',
  'overall_rankings.csv',
);

function createSourceEntry(
  speciesId: string,
  fastMove: string = 'VINE_WHIP',
): rankings.RankingSourceEntry {
  return {
    speciesId,
    speciesName: speciesId,
    score: 90,
    moveset: [fastMove, 'POWER_WHIP', 'SLUDGE_BOMB'],
    moves: { fastMoves: [], chargedMoves: [] },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(generateSimulations).mockReset();
});

describe('scoped resume ranking invalidation', () => {
  it.each([
    { change: 'moveset', resume: true, forceRegenerate: true },
    { change: 'opponent pool', resume: true, forceRegenerate: true },
    { change: 'missing prior CSV', resume: true, forceRegenerate: true },
    { change: 'unchanged', resume: true, forceRegenerate: false },
    { change: 'moveset', resume: false, forceRegenerate: false },
  ])(
    '$change (resume: $resume) sets format regeneration to $forceRegenerate',
    async ({ change, resume, forceRegenerate }) => {
      const files = new Map<string, string>();
      let entries = [createSourceEntry('bulbasaur')];
      const dependencies: NonNullable<Parameters<typeof scrapeRankings>[1]> = {
        createAdapter: () => ({
          readRankingJson: vi.fn(async () => entries),
          readMovesetOverridesJson: vi.fn(async () => []),
        }),
        readFile: async (filePath) => fs.readFileSync(filePath, 'utf8'),
        mkdir: async () => {},
        writeFile: async (filePath, contents) => {
          files.set(filePath, contents);
        },
      };
      const options = {
        formatIds: [formatId],
        sourcePath: '/source/pvpoke',
        resume,
      };

      // Seed the old CSV through the same real serializer used by the sync.
      await scrapeRankings({ ...options, quiet: true }, dependencies);
      const previousOverall = files.get(overallPath)!;
      if (change === 'moveset') {
        entries = [createSourceEntry('bulbasaur', 'TACKLE')];
      } else if (change === 'opponent pool') {
        entries = [...entries, createSourceEntry('ivysaur')];
      } else if (change === 'missing prior CSV') {
        files.delete(overallPath);
      }

      const readFileSync = fs.readFileSync;
      const existsSync = fs.existsSync;
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath, options) => {
        if (filePath === overallPath) {
          const contents = files.get(overallPath);
          if (contents === undefined) {
            throw new Error('Missing prior Overall CSV');
          }
          return contents;
        }
        return readFileSync(filePath, options);
      });
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath) =>
        filePath === overallPath
          ? files.has(overallPath)
          : existsSync(filePath),
      );
      vi.spyOn(source, 'validatePhase1SourceFiles').mockReturnValue(undefined);
      const pokemonData = JSON.parse(
        readFileSync(path.join(syncConfig.outputDir, 'pokemon.json'), 'utf8'),
      ) as PokemonData[];
      vi.spyOn(gamemaster, 'fetchPokemonData').mockResolvedValue(pokemonData);
      vi.spyOn(gamemaster, 'fetchMovesData').mockResolvedValue([]);
      vi.spyOn(rankings, 'scrapeRankings').mockImplementation((options) =>
        scrapeRankings({ ...options, quiet: true }, dependencies),
      );
      const simulationBoundary = new Error('Simulation boundary reached');
      vi.mocked(generateSimulations).mockRejectedValue(simulationBoundary);

      await expect(runSync(options)).rejects.toThrow(simulationBoundary);

      expect(generateSimulations).toHaveBeenCalledWith(
        expect.objectContaining({
          formatIds: [formatId],
          resume,
          forceRegenerateFormatIds: new Set(forceRegenerate ? [formatId] : []),
        }),
      );
      if (change === 'moveset' || change === 'opponent pool') {
        expect(files.get(overallPath)).not.toBe(previousOverall);
      } else {
        expect(files.get(overallPath)).toBe(previousOverall);
      }
    },
  );
});
