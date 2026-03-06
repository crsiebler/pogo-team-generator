import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { generateSimulations } from './simulations';

const VALID_SIMULATION_CSV =
  'Pokemon,Battle Rating,Energy Remaining,HP Remaining\nIvysaur,500,0,0\n';

function isOverallRankingPath(filePath: string): boolean {
  return filePath.endsWith('_overall_rankings.csv');
}

describe('generateSimulations', () => {
  it('generates simulations for every supported format and scenario', async () => {
    const generatedCalls: Array<{
      cup: 'all' | 'kanto';
      cp: 1500 | 2500 | 10000;
      speciesId: string;
      shields: number;
    }> = [];

    const writeFile = vi.fn().mockResolvedValue(undefined);

    await generateSimulations(
      { sourcePath: '/source/pvpoke' },
      {
        getRuntime: () => ({ context: {} as never }),
        fileExists: (filePath: string) => {
          return (
            isOverallRankingPath(filePath) ||
            filePath.endsWith(path.join('data', 'pokemon.json'))
          );
        },
        readFile: async (filePath: string) => {
          if (isOverallRankingPath(filePath)) {
            return 'Pokemon\nBulbasaur\n';
          }

          if (filePath.endsWith(path.join('data', 'pokemon.json'))) {
            return JSON.stringify([
              {
                speciesId: 'bulbasaur',
                speciesName: 'Bulbasaur',
                released: true,
              },
            ]);
          }

          throw new Error(`unexpected file read: ${filePath}`);
        },
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile,
        generateScenarioCsv: (runtime, format, speciesId, shields): string => {
          void runtime;
          generatedCalls.push({
            cup: format.cup,
            cp: format.cp,
            speciesId,
            shields,
          });
          return VALID_SIMULATION_CSV;
        },
      },
    );

    expect(generatedCalls).toHaveLength(12);
    expect(generatedCalls).toContainEqual({
      cup: 'all',
      cp: 1500,
      speciesId: 'bulbasaur',
      shields: 1,
    });
    expect(generatedCalls).toContainEqual({
      cup: 'all',
      cp: 2500,
      speciesId: 'bulbasaur',
      shields: 0,
    });
    expect(generatedCalls).toContainEqual({
      cup: 'all',
      cp: 10000,
      speciesId: 'bulbasaur',
      shields: 2,
    });
    expect(generatedCalls).toContainEqual({
      cup: 'kanto',
      cp: 1500,
      speciesId: 'bulbasaur',
      shields: 1,
    });

    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'simulations', 'cp1500_all_bulbasaur_1-1.csv'),
      VALID_SIMULATION_CSV,
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'simulations', 'cp2500_all_bulbasaur_2-2.csv'),
      VALID_SIMULATION_CSV,
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'simulations', 'cp10000_all_bulbasaur_0-0.csv'),
      VALID_SIMULATION_CSV,
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'simulations', 'cp1500_kanto_bulbasaur_1-1.csv'),
      VALID_SIMULATION_CSV,
    );
  });

  it('in resume mode reuses only valid format-specific files', async () => {
    const readFile = vi.fn(async (filePath: string) => {
      if (isOverallRankingPath(filePath)) {
        return 'Pokemon\nBulbasaur\n';
      }

      if (filePath.endsWith(path.join('data', 'pokemon.json'))) {
        return JSON.stringify([
          {
            speciesId: 'bulbasaur',
            speciesName: 'Bulbasaur',
            released: true,
          },
        ]);
      }

      if (
        filePath.endsWith(
          path.join('data', 'simulations', 'cp1500_all_bulbasaur_1-1.csv'),
        )
      ) {
        return VALID_SIMULATION_CSV;
      }

      if (
        filePath.endsWith(
          path.join('data', 'simulations', 'cp2500_all_bulbasaur_1-1.csv'),
        )
      ) {
        return 'Pokemon,Battle Rating,Energy Remaining,HP Remaining\nBad,not-a-number,0,0\n';
      }

      throw new Error(`unexpected file read: ${filePath}`);
    });

    const generateScenarioCsv = vi.fn(() => VALID_SIMULATION_CSV);

    await generateSimulations(
      { sourcePath: '/source/pvpoke', resume: true },
      {
        getRuntime: () => ({ context: {} as never }),
        fileExists: (filePath: string) => {
          if (isOverallRankingPath(filePath)) {
            return true;
          }

          if (filePath.endsWith(path.join('data', 'pokemon.json'))) {
            return true;
          }

          if (
            filePath.endsWith(
              path.join('data', 'simulations', 'cp1500_all_bulbasaur_1-1.csv'),
            )
          ) {
            return true;
          }

          if (
            filePath.endsWith(
              path.join('data', 'simulations', 'cp2500_all_bulbasaur_1-1.csv'),
            )
          ) {
            return true;
          }

          if (
            filePath.endsWith(
              path.join('data', 'simulations', 'cp1500_bulbasaur_1-1.csv'),
            )
          ) {
            return true;
          }

          return false;
        },
        readFile,
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
        generateScenarioCsv,
      },
    );

    expect(readFile).toHaveBeenCalledWith(
      path.join('data', 'simulations', 'cp1500_all_bulbasaur_1-1.csv'),
    );
    expect(readFile).not.toHaveBeenCalledWith(
      path.join('data', 'simulations', 'cp1500_bulbasaur_1-1.csv'),
    );

    expect(generateScenarioCsv).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cp: 1500, cup: 'all' }),
      'bulbasaur',
      1,
    );
    expect(generateScenarioCsv).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cp: 2500, cup: 'all' }),
      'bulbasaur',
      1,
    );
  });
});
