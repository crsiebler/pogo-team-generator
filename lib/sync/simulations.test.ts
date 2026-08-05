import path from 'path';
import vm from 'vm';
import { describe, expect, it, vi } from 'vitest';
import {
  generateScenarioCsvFromEngine,
  generateSimulations,
} from './simulations';

const VALID_SIMULATION_CSV =
  'Pokemon,Battle Rating,Energy Remaining,HP Remaining\nIvysaur,500,0,0\n';

function isOverallRankingPath(filePath: string): boolean {
  return filePath.endsWith(path.join('overall_rankings.csv'));
}

describe('generateSimulations', () => {
  it('forces the selected Pokemon onto the format-specific recommended moveset', () => {
    const context = vm.createContext({
      __flushPvpokeAjax: () => undefined,
      GameMaster: {
        getInstance: () => ({
          rankings: {
            ligaultraoverall2500: [
              {
                speciesId: 'decidueye',
                moveset: ['ASTONISH', 'FRENZY_PLANT', 'SPIRIT_SHACKLE'],
              },
            ],
          },
          loadRankingData: () => undefined,
          getCupById: (cup: string) => ({ name: cup }),
          generateFilteredPokemonList: () => [],
        }),
      },
      Battle: function Battle(this: Record<string, unknown>) {
        this.setCP = () => undefined;
        this.setCup = () => undefined;
        this.setCustomCup = () => undefined;
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
        id: 'battle-frontier-liga-ultra',
        label: 'Battle Frontier (Liga Ultra)',
        cup: 'ligaultra',
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

  it('initializes the selected Pokemon after setting the battle CP', () => {
    let selectedBattleCpDuringInitialize: unknown;

    const context = vm.createContext({
      __flushPvpokeAjax: () => undefined,
      GameMaster: {
        getInstance: () => ({
          rankings: {
            alloverall10000: [
              {
                speciesId: 'kyogre_primal',
                moveset: ['WATERFALL', 'ORIGIN_PULSE', 'THUNDER'],
              },
            ],
          },
          loadRankingData: () => undefined,
          getCupById: (cup: string) => ({ name: cup }),
          generateFilteredPokemonList: () => [],
        }),
      },
      Battle: function Battle(this: Record<string, unknown>) {
        let cp = 1500;

        this.setCP = (newCp: number) => {
          cp = newCp;
        };
        this.getCP = () => cp;
        this.setCup = () => undefined;
        this.setCustomCup = () => undefined;
        return this;
      },
      RankerMaster: {
        getInstance: () => ({
          applySettings: () => undefined,
          setShieldMode: () => undefined,
          setTargets: () => undefined,
          setRecommendMoveUsage: () => undefined,
          rank: () => ({
            csv: 'Pokemon,Battle Rating,Energy Remaining,HP Remaining\nKyogre (Primal),500,0,0\n',
          }),
        }),
      },
      getDefaultMultiBattleSettings: () => ({ shields: 0 }),
      Pokemon: function Pokemon(
        this: Record<string, unknown>,
        speciesId: string,
        index: number,
        battle: { getCP: () => number },
      ) {
        void speciesId;
        void index;
        this.initialize = () => {
          selectedBattleCpDuringInitialize = battle.getCP();
        };
        this.selectRecommendedMoveset = () => undefined;
        this.selectMove = () => undefined;
        this.resetMoves = () => undefined;
      },
    });

    generateScenarioCsvFromEngine(
      { context },
      {
        id: 'master-league',
        label: 'Master League',
        cup: 'all',
        cp: 10000,
      },
      'kyogre_primal',
      1,
      {
        fastMove: 'WATERFALL',
        chargedMove1: 'ORIGIN_PULSE',
        chargedMove2: 'THUNDER',
      },
    );

    expect(selectedBattleCpDuringInitialize).toBe(10000);
  });

  it('resolves ranking move names against each canonical starting form', async () => {
    const recommendedMovesBySpecies = new Map<
      string,
      {
        fastMove: string;
        chargedMove1: string;
        chargedMove2: string | null;
      }
    >();

    await generateSimulations(
      { sourcePath: '/source/pvpoke' },
      {
        getRuntime: () => ({ context: {} as never }),
        fileExists: isOverallRankingPath,
        readFile: async (filePath: string) => {
          if (isOverallRankingPath(filePath)) {
            return [
              'Pokemon,Fast Move,Charged Move 1,Charged Move 2',
              "Tapu Fini,Water Gun,Surf,Nature's Madness",
              'Morpeko (Full Belly),Thunder Shock,Aura Wheel,Psychic Fangs',
              'Aegislash (Shield),Psycho Cut,Shadow Ball,Gyro Ball',
              'Noctowl,Wing Attack,Sky Attack,Return',
            ].join('\n');
          }

          if (filePath.endsWith(path.join('data', 'pokemon.json'))) {
            return JSON.stringify([
              {
                speciesId: 'tapu_fini',
                speciesName: 'Tapu Fini',
                fastMoves: ['WATER_GUN'],
                chargedMoves: ['SURF', 'NATURES_MADNESS'],
                released: true,
              },
              {
                speciesId: 'morpeko_full_belly',
                speciesName: 'Morpeko (Full Belly)',
                fastMoves: ['THUNDER_SHOCK'],
                chargedMoves: ['AURA_WHEEL_ELECTRIC', 'PSYCHIC_FANGS'],
                released: true,
              },
              {
                speciesId: 'morpeko_hangry',
                speciesName: 'Morpeko (Hangry)',
                fastMoves: ['THUNDER_SHOCK'],
                chargedMoves: ['AURA_WHEEL_DARK', 'PSYCHIC_FANGS'],
                released: true,
              },
              {
                speciesId: 'aegislash_shield',
                speciesName: 'Aegislash (Shield)',
                fastMoves: ['AEGISLASH_CHARGE_PSYCHO_CUT'],
                chargedMoves: ['SHADOW_BALL', 'GYRO_BALL'],
                released: true,
              },
              {
                speciesId: 'noctowl',
                speciesName: 'Noctowl',
                fastMoves: ['WING_ATTACK'],
                chargedMoves: ['SKY_ATTACK'],
                released: true,
              },
            ]);
          }

          if (filePath.endsWith(path.join('data', 'moves.json'))) {
            return JSON.stringify([
              { moveId: 'WATER_GUN', name: 'Water Gun', energyGain: 6 },
              { moveId: 'SURF', name: 'Surf', energyGain: 0 },
              {
                moveId: 'NATURES_MADNESS',
                name: "Nature's Madness",
                energyGain: 0,
              },
              {
                moveId: 'THUNDER_SHOCK',
                name: 'Thunder Shock',
                energyGain: 9,
              },
              {
                moveId: 'AURA_WHEEL_ELECTRIC',
                name: 'Aura Wheel',
                energyGain: 0,
              },
              {
                moveId: 'AURA_WHEEL_DARK',
                name: 'Aura Wheel',
                energyGain: 0,
              },
              {
                moveId: 'PSYCHIC_FANGS',
                name: 'Psychic Fangs',
                energyGain: 0,
              },
              {
                moveId: 'AEGISLASH_CHARGE_PSYCHO_CUT',
                name: 'Psycho Cut',
                energyGain: 6,
              },
              {
                moveId: 'SHADOW_BALL',
                name: 'Shadow Ball',
                energyGain: 0,
              },
              { moveId: 'GYRO_BALL', name: 'Gyro Ball', energyGain: 0 },
              { moveId: 'WING_ATTACK', name: 'Wing Attack', energyGain: 8 },
              { moveId: 'SKY_ATTACK', name: 'Sky Attack', energyGain: 0 },
              { moveId: 'RETURN', name: 'Return', energyGain: 0 },
            ]);
          }

          throw new Error(`unexpected file read: ${filePath}`);
        },
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
        generateScenarioCsv: (
          runtime,
          format,
          speciesId,
          shields,
          recommendedMoves,
        ): string => {
          void runtime;
          void format;
          void shields;
          if (recommendedMoves && !recommendedMovesBySpecies.has(speciesId)) {
            recommendedMovesBySpecies.set(speciesId, recommendedMoves);
          }
          return VALID_SIMULATION_CSV;
        },
      },
    );

    expect(recommendedMovesBySpecies.get('tapu_fini')).toEqual({
      fastMove: 'WATER_GUN',
      chargedMove1: 'SURF',
      chargedMove2: 'NATURES_MADNESS',
    });
    expect(recommendedMovesBySpecies.get('morpeko_full_belly')).toEqual({
      fastMove: 'THUNDER_SHOCK',
      chargedMove1: 'AURA_WHEEL_ELECTRIC',
      chargedMove2: 'PSYCHIC_FANGS',
    });
    expect(recommendedMovesBySpecies.get('aegislash_shield')).toEqual({
      fastMove: 'AEGISLASH_CHARGE_PSYCHO_CUT',
      chargedMove1: 'SHADOW_BALL',
      chargedMove2: 'GYRO_BALL',
    });
    expect(recommendedMovesBySpecies.get('noctowl')).toEqual({
      fastMove: 'WING_ATTACK',
      chargedMove1: 'SKY_ATTACK',
      chargedMove2: 'RETURN',
    });
  });

  it('generates simulations for every supported format and scenario', async () => {
    const generatedCalls: Array<{
      cup:
        | 'all'
        | 'weather'
        | 'copadiluvio'
        | 'tsuki'
        | 'ligaultra'
        | 'coupedusillage';
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

          if (filePath.endsWith(path.join('data', 'moves.json'))) {
            return '[]';
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

    expect(generatedCalls).toHaveLength(24);
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
      cup: 'weather',
      cp: 1500,
      speciesId: 'bulbasaur',
      shields: 1,
    });
    expect(generatedCalls).toContainEqual({
      cup: 'copadiluvio',
      cp: 1500,
      speciesId: 'bulbasaur',
      shields: 0,
    });
    expect(generatedCalls).toContainEqual({
      cup: 'tsuki',
      cp: 1500,
      speciesId: 'bulbasaur',
      shields: 1,
    });
    expect(generatedCalls).toContainEqual({
      cup: 'ligaultra',
      cp: 2500,
      speciesId: 'bulbasaur',
      shields: 2,
    });
    expect(generatedCalls).toContainEqual({
      cup: 'coupedusillage',
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
      path.join(
        'data',
        'simulations',
        'cp1500',
        'weather',
        'bulbasaur_1-1.csv',
      ),
      VALID_SIMULATION_CSV,
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join(
        'data',
        'simulations',
        'cp1500',
        'copadiluvio',
        'bulbasaur_0-0.csv',
      ),
      VALID_SIMULATION_CSV,
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'simulations', 'cp1500', 'tsuki', 'bulbasaur_1-1.csv'),
      VALID_SIMULATION_CSV,
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join(
        'data',
        'simulations',
        'cp2500',
        'ligaultra',
        'bulbasaur_2-2.csv',
      ),
      VALID_SIMULATION_CSV,
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join(
        'data',
        'simulations',
        'cp10000',
        'coupedusillage',
        'bulbasaur_1-1.csv',
      ),
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

      if (filePath.endsWith(path.join('data', 'moves.json'))) {
        return '[]';
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
          if (isOverallRankingPath(filePath)) {
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
