import path from 'path';
import vm from 'vm';
import { describe, expect, it, vi } from 'vitest';
import {
  generateScenarioCsvFromEngine,
  generateSimulations,
  selectSimulationTargetSpeciesIds,
} from './simulations';

const VALID_SIMULATION_CSV =
  'Pokemon,Battle Rating,Energy Remaining,HP Remaining\nIvysaur,500,0,0\n';

const RANKING_CATEGORIES = ['overall', 'leads', 'switches', 'closers'] as const;

function isRankingsPath(
  filePath: string,
  category?: (typeof RANKING_CATEGORIES)[number],
): boolean {
  if (category) {
    return filePath.endsWith(path.join(`${category}_rankings.csv`));
  }

  return RANKING_CATEGORIES.some((rankingCategory) => {
    return filePath.endsWith(path.join(`${rankingCategory}_rankings.csv`));
  });
}

function toRankingsCsv(pokemonNames: string[]): string {
  const rows = pokemonNames.map((name) => `${name},100`);
  return ['Pokemon,Score', ...rows].join('\n');
}

function toSpeciesId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

describe('selectSimulationTargetSpeciesIds', () => {
  it('includes role-specific targets outside overall top 200', () => {
    const overallNames = Array.from(
      { length: 200 },
      (_, i) => `Overall ${i + 1}`,
    );
    const roleOnlyLead = 'Role Lead Specialist';
    const leadNames = [roleOnlyLead];

    const allNames = [...overallNames, ...leadNames];
    const pokemonData = allNames.map((name) => ({
      speciesId: toSpeciesId(name),
      speciesName: name,
      released: true,
    }));

    const result = selectSimulationTargetSpeciesIds({
      overallCsvText: toRankingsCsv(overallNames),
      leadsCsvText: toRankingsCsv(leadNames),
      switchesCsvText: toRankingsCsv([]),
      closersCsvText: toRankingsCsv([]),
      pokemonData,
    });

    expect(result.speciesIds).toContain(toSpeciesId(roleOnlyLead));
  });

  it('deduplicates targets after canonical form normalization', () => {
    const pokemonData = [
      {
        speciesId: 'morpeko_hangry',
        speciesName: 'Morpeko (Hangry)',
        released: true,
      },
      {
        speciesId: 'morpeko_full_belly',
        speciesName: 'Morpeko (Full Belly)',
        released: true,
      },
    ];

    const result = selectSimulationTargetSpeciesIds({
      overallCsvText: toRankingsCsv(['Morpeko (Hangry)']),
      leadsCsvText: toRankingsCsv(['Morpeko (Full Belly)']),
      switchesCsvText: toRankingsCsv([]),
      closersCsvText: toRankingsCsv([]),
      pokemonData,
    });

    expect(result.speciesIds).toEqual(['morpeko_full_belly']);
    expect(result.counts.speciesUnion).toBe(1);
  });

  it('applies per-role limits before building the union', () => {
    const overallNames = Array.from(
      { length: 250 },
      (_, i) => `Overall ${i + 1}`,
    );
    const leadNames = Array.from({ length: 120 }, (_, i) => `Lead ${i + 1}`);
    const switchNames = Array.from(
      { length: 120 },
      (_, i) => `Switch ${i + 1}`,
    );
    const closerNames = Array.from(
      { length: 120 },
      (_, i) => `Closer ${i + 1}`,
    );

    const allNames = [
      ...overallNames,
      ...leadNames,
      ...switchNames,
      ...closerNames,
    ];
    const pokemonData = allNames.map((name) => ({
      speciesId: toSpeciesId(name),
      speciesName: name,
      released: true,
    }));

    const result = selectSimulationTargetSpeciesIds({
      overallCsvText: toRankingsCsv(overallNames),
      leadsCsvText: toRankingsCsv(leadNames),
      switchesCsvText: toRankingsCsv(switchNames),
      closersCsvText: toRankingsCsv(closerNames),
      pokemonData,
    });

    expect(result.counts.overall).toBe(200);
    expect(result.counts.leads).toBe(100);
    expect(result.counts.switches).toBe(100);
    expect(result.counts.closers).toBe(100);

    expect(result.speciesIds).not.toContain(toSpeciesId('Overall 250'));
    expect(result.speciesIds).not.toContain(toSpeciesId('Lead 120'));
    expect(result.speciesIds).not.toContain(toSpeciesId('Switch 120'));
    expect(result.speciesIds).not.toContain(toSpeciesId('Closer 120'));
  });
});

describe('generateSimulations', () => {
  it('forces the selected Pokemon onto the format-specific recommended moveset', () => {
    const context = vm.createContext({
      __flushPvpokeAjax: () => undefined,
      GameMaster: {
        getInstance: () => ({
          rankings: {
            bfretrooverall2500: [
              {
                speciesId: 'decidueye',
                moveset: ['ASTONISH', 'FRENZY_PLANT', 'SPIRIT_SHACKLE'],
              },
            ],
          },
          loadRankingData: () => undefined,
          getCupById: (cup: string) => ({ name: cup }),
        }),
      },
      Battle: function Battle(this: Record<string, unknown>) {
        return this;
      },
      RankerMaster: {
        getInstance: () => ({
          applySettings: () => undefined,
          setShieldMode: () => undefined,
          setTargets: () => undefined,
          setRecommendMoveUsage: () => undefined,
          rank: (team: Array<Record<string, unknown>>) => {
            const selectedPokemon = team[0] as {
              fastMove: { moveId: string };
              chargedMoves: Array<{ moveId: string }>;
            };

            return {
              csv: `Pokemon,Battle Rating,Energy Remaining,HP Remaining\nDecidueye ${selectedPokemon.fastMove.moveId}/${selectedPokemon.chargedMoves[0].moveId}/${selectedPokemon.chargedMoves[1].moveId},500,0,0\n`,
            };
          },
        }),
      },
      getDefaultMultiBattleSettings: () => ({ shields: 0 }),
      Pokemon: function Pokemon(
        this: Record<string, unknown>,
        speciesId: string,
      ) {
        this.speciesId = speciesId;
        this.fastMove = { moveId: 'LEAFAGE' };
        this.chargedMoves = [
          { moveId: 'FRENZY_PLANT' },
          { moveId: 'SPIRIT_SHACKLE' },
        ];
        this.initialize = () => undefined;
        this.selectRecommendedMoveset = () => undefined;
        this.selectMove = (
          moveType: 'fast' | 'charged',
          moveId: string,
          index?: number,
        ) => {
          if (moveType === 'fast') {
            this.fastMove = { moveId };
            return;
          }

          const chargedMoves = this.chargedMoves as Array<{ moveId: string }>;
          chargedMoves[index ?? 0] = { moveId };
        };
        this.resetMoves = () => undefined;
      },
    });

    const csvText = generateScenarioCsvFromEngine(
      { context },
      {
        id: 'battle-frontier-ul-retro',
        label: 'Battle Frontier (UL Retro)',
        cup: 'bfretro',
        cp: 2500,
      },
      'decidueye',
      0,
      {
        fastMove: 'ASTONISH',
        chargedMove1: 'FRENZY_PLANT',
        chargedMove2: 'SPIRIT_SHACKLE',
      },
    );

    expect(csvText).toContain('Decidueye ASTONISH/FRENZY_PLANT/SPIRIT_SHACKLE');
  });

  it('generates simulations for every supported format and scenario', async () => {
    const generatedCalls: Array<{
      cup:
        | 'all'
        | 'kanto'
        | 'spring'
        | 'bayou'
        | 'brujeria'
        | 'bfretro'
        | 'battlefrontiermaster';
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
            isRankingsPath(filePath) ||
            filePath.endsWith(path.join('data', 'pokemon.json'))
          );
        },
        readFile: async (filePath: string) => {
          if (isRankingsPath(filePath)) {
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

    expect(generatedCalls).toHaveLength(27);
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
    expect(generatedCalls).toContainEqual({
      cup: 'spring',
      cp: 1500,
      speciesId: 'bulbasaur',
      shields: 2,
    });
    expect(generatedCalls).toContainEqual({
      cup: 'bayou',
      cp: 1500,
      speciesId: 'bulbasaur',
      shields: 1,
    });
    expect(generatedCalls).toContainEqual({
      cup: 'brujeria',
      cp: 1500,
      speciesId: 'bulbasaur',
      shields: 0,
    });
    expect(generatedCalls).toContainEqual({
      cup: 'bfretro',
      cp: 2500,
      speciesId: 'bulbasaur',
      shields: 2,
    });
    expect(generatedCalls).toContainEqual({
      cup: 'battlefrontiermaster',
      cp: 10000,
      speciesId: 'bulbasaur',
      shields: 1,
    });

    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'simulations', 'cp1500', 'all', 'bulbasaur_1-1.csv'),
      VALID_SIMULATION_CSV,
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'simulations', 'cp2500', 'all', 'bulbasaur_2-2.csv'),
      VALID_SIMULATION_CSV,
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'simulations', 'cp10000', 'all', 'bulbasaur_0-0.csv'),
      VALID_SIMULATION_CSV,
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'simulations', 'cp1500', 'kanto', 'bulbasaur_1-1.csv'),
      VALID_SIMULATION_CSV,
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'simulations', 'cp1500', 'spring', 'bulbasaur_2-2.csv'),
      VALID_SIMULATION_CSV,
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'simulations', 'cp1500', 'bayou', 'bulbasaur_1-1.csv'),
      VALID_SIMULATION_CSV,
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join(
        'data',
        'simulations',
        'cp1500',
        'brujeria',
        'bulbasaur_0-0.csv',
      ),
      VALID_SIMULATION_CSV,
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join(
        'data',
        'simulations',
        'cp2500',
        'bfretro',
        'bulbasaur_2-2.csv',
      ),
      VALID_SIMULATION_CSV,
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join(
        'data',
        'simulations',
        'cp10000',
        'battlefrontiermaster',
        'bulbasaur_1-1.csv',
      ),
      VALID_SIMULATION_CSV,
    );
  });

  it('in resume mode reuses only valid format-specific files', async () => {
    const readFile = vi.fn(async (filePath: string) => {
      if (isRankingsPath(filePath)) {
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
          path.join(
            'data',
            'simulations',
            'cp1500',
            'all',
            'bulbasaur_1-1.csv',
          ),
        )
      ) {
        return VALID_SIMULATION_CSV;
      }

      if (
        filePath.endsWith(
          path.join(
            'data',
            'simulations',
            'cp2500',
            'all',
            'bulbasaur_1-1.csv',
          ),
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
          if (isRankingsPath(filePath)) {
            return true;
          }

          if (filePath.endsWith(path.join('data', 'pokemon.json'))) {
            return true;
          }

          if (
            filePath.endsWith(
              path.join(
                'data',
                'simulations',
                'cp1500',
                'all',
                'bulbasaur_1-1.csv',
              ),
            )
          ) {
            return true;
          }

          if (
            filePath.endsWith(
              path.join(
                'data',
                'simulations',
                'cp2500',
                'all',
                'bulbasaur_1-1.csv',
              ),
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
      path.join('data', 'simulations', 'cp1500', 'all', 'bulbasaur_1-1.csv'),
    );

    expect(generateScenarioCsv).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cp: 1500, cup: 'all' }),
      'bulbasaur',
      1,
      undefined,
    );
    expect(generateScenarioCsv).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cp: 2500, cup: 'all' }),
      'bulbasaur',
      1,
      undefined,
    );
  });
});
