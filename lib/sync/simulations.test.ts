import path from 'path';
import vm from 'vm';
import { describe, expect, it, vi } from 'vitest';
import {
  generateScenarioCsvFromEngine,
  generateSimulations,
  type SimulationSyncOptions,
} from './simulations';
import { extractSpeciesNameFromSimulationCell } from '@/lib/data/simulations';

const VALID_SIMULATION_CSV =
  'Pokemon,Battle Rating,Energy Remaining,HP Remaining\nIvysaur,500,0,0\n';

describe('simulation evidence species cells', () => {
  it.each([
    ['Castform H+WBR/EB', 'Castform'],
    ['Sealeo (Shadow) PS+S/BS', 'Sealeo (Shadow)'],
    ['Malamar (Mega) Psy+FoP/SP/Psb+', 'Malamar (Mega)'],
  ])('extracts the species name from %s', (cell, expected) => {
    expect(extractSpeciesNameFromSimulationCell(cell)).toBe(expected);
  });
});

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
                moveset: [
                  'ASTONISH',
                  'FRENZY_PLANT',
                  'SPIRIT_SHACKLE',
                  'SPIRIT_SHACKLE_PLUS',
                ],
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
              csv: `Pokemon,Battle Rating,Energy Remaining,HP Remaining\nDecidueye ${selectedPokemon.fastMove.moveId}/${selectedPokemon.chargedMoves[0].moveId}/${selectedPokemon.chargedMoves[1].moveId}/${selectedPokemon.chargedMoves[2].moveId},500,0,0\n`,
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
          moveType: 'fast' | 'charged' | 'extra-charged',
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
      {
        decidueye: {
          fastMove: 'ASTONISH',
          chargedMove1: 'FRENZY_PLANT',
          chargedMove2: 'SPIRIT_SHACKLE',
        },
      },
    );

    expect(csvText).toContain(
      'Decidueye ASTONISH/FRENZY_PLANT/SPIRIT_SHACKLE/SPIRIT_SHACKLE_PLUS',
    );
  });

  it('forces sanitized defaults onto every ranked opponent', () => {
    const rankings = [
      {
        speciesId: 'decidueye',
        moveset: ['LEAFAGE', 'FRENZY_PLANT', 'SPIRIT_SHACKLE'],
      },
      {
        speciesId: 'muk',
        moveset: ['ACID', 'THUNDER_PUNCH', 'DARK_PULSE'],
      },
      {
        speciesId: 'golisopodsh',
        moveset: ['SHADOW_CLAW', 'X_SCISSOR', 'AQUA_JET'],
      },
      {
        speciesId: 'golisopod',
        moveset: ['FURY_CUTTER', 'X_SCISSOR', 'AQUA_JET'],
      },
      {
        speciesId: 'unown',
        moveset: ['HIDDEN_POWER_PSYCHIC', 'STRUGGLE'],
      },
      {
        speciesId: 'camerupt_mega',
        moveset: ['EMBER', 'EARTH_POWER', 'OVERHEAT'],
      },
    ];
    const gameMaster = {
      rankings: { alloverall1500: rankings },
      loadRankingData: () => undefined,
      getCupById: (cup: string) => ({ name: cup }),
      generateFilteredPokemonList: () =>
        rankings
          .filter(({ speciesId }) => speciesId !== 'camerupt_mega')
          .map((ranking) => ({
            speciesId: ranking.speciesId,
            moveset: [...ranking.moveset],
            initialize: () => undefined,
            selectRecommendedMoveset: () => undefined,
            selectMove(
              moveType: 'fast' | 'charged',
              moveId: string,
              index = 0,
            ): void {
              this.moveset[moveType === 'fast' ? 0 : index + 1] = moveId;
            },
            resetMoves: () => undefined,
          })),
    };
    let targets: Array<{ speciesId: string; moveset: string[] }> = [];
    const context = vm.createContext({
      __flushPvpokeAjax: () => undefined,
      GameMaster: {
        getInstance: () => gameMaster,
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
          setTargets: (
            nextTargets: Array<{ speciesId: string; moveset: string[] }>,
          ) => {
            targets = nextTargets;
          },
          setRecommendMoveUsage: () => undefined,
          rank: () => ({
            csv: `Pokemon,Battle Rating,Energy Remaining,HP Remaining\n${targets.map((target) => `${target.speciesId} ${target.moveset.join('/')},500,0,0`).join('\n')}\n`,
          }),
        }),
      },
      getDefaultMultiBattleSettings: () => ({ shields: 0 }),
      Pokemon: function Pokemon(
        this: Record<string, unknown>,
        speciesId: string,
      ) {
        this.speciesId = speciesId;
        this.moveset = [undefined, undefined, undefined];
        this.initialize = () => undefined;
        this.selectRecommendedMoveset = () => undefined;
        this.selectMove = (
          moveType: 'fast' | 'charged',
          moveId: string,
          index = 0,
        ) => {
          (this.moveset as Array<string | undefined>)[
            moveType === 'fast' ? 0 : index + 1
          ] = moveId;
        };
        this.resetMoves = () => undefined;
      },
    });

    const csvText = generateScenarioCsvFromEngine(
      { context },
      {
        id: 'great-league',
        label: 'Great League',
        cup: 'all',
        cp: 1500,
      },
      'decidueye',
      1,
      undefined,
      {
        decidueye: {
          fastMove: 'LEAFAGE',
          chargedMove1: 'FRENZY_PLANT',
          chargedMove2: 'SPIRIT_SHACKLE',
        },
        muk: {
          fastMove: 'POISON_JAB',
          chargedMove1: 'THUNDER_PUNCH',
          chargedMove2: 'DARK_PULSE',
        },
        golisopod: {
          fastMove: 'FURY_CUTTER',
          chargedMove1: 'X_SCISSOR',
          chargedMove2: 'AQUA_JET',
        },
        camerupt_mega: {
          fastMove: 'EMBER',
          chargedMove1: 'EARTH_POWER',
          chargedMove2: 'OVERHEAT',
        },
      },
    );

    expect(csvText).toContain('muk POISON_JAB/THUNDER_PUNCH/DARK_PULSE');
    expect(csvText).toContain('golisopod FURY_CUTTER/X_SCISSOR/AQUA_JET');
    expect(csvText).toContain('camerupt_mega EMBER/EARTH_POWER/OVERHEAT');
    expect(csvText).not.toContain('golisopodsh');
    expect(csvText).not.toContain('unown');
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
        | 'scroll'
        | 'copadiluvio'
        | 'tsuki'
        | 'ligaultra'
        | 'coupedusillage'
        | 'mega';
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

    expect(generatedCalls).toHaveLength(33);
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
      cup: 'mega',
      cp: 1500,
      speciesId: 'bulbasaur',
      shields: 0,
    });
    expect(generatedCalls).toContainEqual({
      cup: 'mega',
      cp: 2500,
      speciesId: 'bulbasaur',
      shields: 1,
    });
    expect(generatedCalls).toContainEqual({
      cup: 'mega',
      cp: 10000,
      speciesId: 'bulbasaur',
      shields: 2,
    });
    expect(generatedCalls).toContainEqual({
      cup: 'scroll',
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
      path.join('data', 'simulations', 'cp1500', 'scroll', 'bulbasaur_1-1.csv'),
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

  it('generates ranking-derived alternate movesets under format-scoped canonical paths', async () => {
    const defaultSimulationCsv =
      'Pokemon,Battle Rating,Energy Remaining,HP Remaining\nFeraligatr SC+HC/IB,500,0,0\n';
    const alternateSimulationCsv =
      'Pokemon,Battle Rating,Energy Remaining,HP Remaining\nFeraligatr SC+HC/IB,520,0,0\n';
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const generatedMovesets: Array<{
      speciesId: string;
      recommendedMoves:
        | {
            fastMove: string;
            chargedMove1: string;
            chargedMove2: string | null;
          }
        | undefined;
    }> = [];
    const options: SimulationSyncOptions = {
      sourcePath: '/source/pvpoke',
      includeMovesetVariants: true,
      candidateSets: [
        {
          formatId: 'great-league',
          cup: 'all',
          cp: 1500,
          speciesId: 'feraligatr',
          pvpokeScorePrior: 90,
          retainedFastMoves: ['SHADOW_CLAW', 'WATER_GUN'],
          retainedChargedMoves: ['HYDRO_CANNON', 'ICE_BEAM'],
          rejections: [],
          candidates: [
            {
              id: 'shadow_claw--ice_beam--hydro_cannon',
              fastMove: 'SHADOW_CLAW',
              chargedMove1: 'HYDRO_CANNON',
              chargedMove2: 'ICE_BEAM',
              isDefault: true,
            },
            {
              id: 'water_gun--ice_beam--hydro_cannon',
              fastMove: 'WATER_GUN',
              chargedMove1: 'HYDRO_CANNON',
              chargedMove2: 'ICE_BEAM',
              isDefault: false,
            },
          ],
        },
      ],
      simulationSpeciesIdsByFormatId: new Map([
        ['great-league', ['feraligatr']],
      ]),
    };
    const readSourceFile = async (filePath: string): Promise<string> => {
      if (isOverallRankingPath(filePath)) {
        return [
          'Pokemon,Fast Move,Charged Move 1,Charged Move 2',
          'Feraligatr,Shadow Claw,Hydro Cannon,Ice Beam',
          '',
        ].join('\n');
      }

      if (filePath.endsWith(path.join('data', 'pokemon.json'))) {
        return JSON.stringify([
          {
            speciesId: 'feraligatr',
            speciesName: 'Feraligatr',
            fastMoves: ['SHADOW_CLAW', 'WATER_GUN'],
            chargedMoves: ['HYDRO_CANNON', 'ICE_BEAM'],
            released: true,
          },
        ]);
      }

      if (filePath.endsWith(path.join('data', 'moves.json'))) {
        return JSON.stringify([
          {
            moveId: 'SHADOW_CLAW',
            name: 'Shadow Claw',
            energyGain: 8,
          },
          {
            moveId: 'WATER_GUN',
            name: 'Water Gun',
            energyGain: 6,
          },
          {
            moveId: 'HYDRO_CANNON',
            name: 'Hydro Cannon',
            energyGain: 0,
          },
          { moveId: 'ICE_BEAM', name: 'Ice Beam', energyGain: 0 },
        ]);
      }

      throw new Error(`unexpected file read: ${filePath}`);
    };

    const generatedResult = await generateSimulations(options, {
      getRuntime: () => ({ context: {} as never }),
      fileExists: (filePath: string) => isOverallRankingPath(filePath),
      readFile: readSourceFile,
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile,
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
        generatedMovesets.push({ speciesId, recommendedMoves });
        return recommendedMoves?.fastMove === 'WATER_GUN'
          ? alternateSimulationCsv
          : defaultSimulationCsv;
      },
    });

    expect(generatedResult.variantSelections).toEqual([
      expect.objectContaining({
        formatId: 'great-league',
        speciesId: 'feraligatr',
        activeVariantIds: [
          'shadow_claw--ice_beam--hydro_cannon',
          'water_gun--ice_beam--hydro_cannon',
        ],
      }),
    ]);

    expect(generatedMovesets).toContainEqual({
      speciesId: 'feraligatr',
      recommendedMoves: {
        fastMove: 'WATER_GUN',
        chargedMove1: 'HYDRO_CANNON',
        chargedMove2: 'ICE_BEAM',
      },
    });
    expect(writeFile).toHaveBeenCalledWith(
      path.join(
        'data',
        'simulations',
        'cp1500',
        'all',
        'feraligatr--water_gun--ice_beam--hydro_cannon_1-1.csv',
      ),
      alternateSimulationCsv,
    );
    expect(
      generatedMovesets.filter(
        ({ recommendedMoves }) => recommendedMoves?.fastMove === 'WATER_GUN',
      ),
    ).toHaveLength(3);
    for (const scenario of ['0-0', '1-1', '2-2']) {
      expect(writeFile).toHaveBeenCalledWith(
        path.join(
          'data',
          'simulations',
          'cp1500',
          'all',
          `feraligatr--water_gun--ice_beam--hydro_cannon_${scenario}.csv`,
        ),
        alternateSimulationCsv,
      );
    }
    expect(writeFile).not.toHaveBeenCalledWith(
      expect.stringContaining(
        path.join(
          'cp2500',
          'all',
          'feraligatr--water_gun--ice_beam--hydro_cannon',
        ),
      ),
      expect.anything(),
    );

    const defaultOnlyGenerateScenarioCsv = vi.fn(
      (runtime, format, speciesId, shields, recommendedMoves) => {
        void runtime;
        void format;
        void speciesId;
        void shields;
        return recommendedMoves?.fastMove === 'WATER_GUN'
          ? alternateSimulationCsv
          : defaultSimulationCsv;
      },
    );
    const defaultOnlyResult = await generateSimulations(
      { ...options, includeMovesetVariants: false },
      {
        getRuntime: () => ({ context: {} as never }),
        fileExists: (filePath: string) => isOverallRankingPath(filePath),
        readFile: readSourceFile,
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
        generateScenarioCsv: defaultOnlyGenerateScenarioCsv,
      },
    );

    const defaultOnlyGreatLeagueCalls =
      defaultOnlyGenerateScenarioCsv.mock.calls.filter(
        ([, format, speciesId]) =>
          format.id === 'great-league' && speciesId === 'feraligatr',
      );
    expect(defaultOnlyGreatLeagueCalls).toHaveLength(3);
    expect(defaultOnlyGenerateScenarioCsv).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'feraligatr',
      expect.anything(),
      expect.objectContaining({ fastMove: 'WATER_GUN' }),
      expect.anything(),
    );
    const defaultOnlyGreatLeagueFiles =
      defaultOnlyResult.preparedCsvFiles.filter(
        ({ formatId }) => formatId === 'great-league',
      );
    expect(defaultOnlyGreatLeagueFiles).toHaveLength(3);
    expect(
      defaultOnlyGreatLeagueFiles.map(({ targetPath }) => targetPath),
    ).toEqual([
      path.join('data', 'simulations', 'cp1500', 'all', 'feraligatr_0-0.csv'),
      path.join('data', 'simulations', 'cp1500', 'all', 'feraligatr_1-1.csv'),
      path.join('data', 'simulations', 'cp1500', 'all', 'feraligatr_2-2.csv'),
    ]);
    expect(defaultOnlyResult.variantSelections).toEqual([
      expect.objectContaining({
        formatId: 'great-league',
        speciesId: 'feraligatr',
        activeVariantIds: ['shadow_claw--ice_beam--hydro_cannon'],
        candidates: [
          expect.objectContaining({
            id: 'shadow_claw--ice_beam--hydro_cannon',
            isDefault: true,
            active: true,
            completeness: { '0-0': true, '1-1': true, '2-2': true },
          }),
        ],
      }),
    ]);

    const reusablePath = path.join(
      'data',
      'simulations',
      'cp1500',
      'all',
      'feraligatr--water_gun--ice_beam--hydro_cannon_1-1.csv',
    );
    const malformedPath = path.join(
      'data',
      'simulations',
      'cp1500',
      'all',
      'feraligatr--water_gun--ice_beam--hydro_cannon_0-0.csv',
    );
    const mismatchedOpponentPath = path.join(
      'data',
      'simulations',
      'cp1500',
      'all',
      'feraligatr--water_gun--ice_beam--hydro_cannon_2-2.csv',
    );
    const resumeReadFile = vi.fn(async (filePath: string): Promise<string> => {
      if (filePath === reusablePath) {
        return alternateSimulationCsv;
      }
      if (filePath === malformedPath) {
        return 'malformed';
      }
      if (filePath === mismatchedOpponentPath) {
        return 'Pokemon,Battle Rating,Energy Remaining,HP Remaining\nVenusaur,500,0,0\n';
      }
      return readSourceFile(filePath);
    });
    const resumeGenerateScenarioCsv = vi.fn(
      (runtime, format, speciesId, shields, recommendedMoves) => {
        void runtime;
        void format;
        void speciesId;
        void shields;
        return recommendedMoves?.fastMove === 'WATER_GUN'
          ? alternateSimulationCsv
          : defaultSimulationCsv;
      },
    );
    const resumeWriteFile = vi.fn().mockResolvedValue(undefined);

    const resumedResult = await generateSimulations(
      { ...options, resume: true },
      {
        getRuntime: () => ({ context: {} as never }),
        fileExists: (filePath: string) =>
          isOverallRankingPath(filePath) ||
          filePath === reusablePath ||
          filePath === malformedPath ||
          filePath === mismatchedOpponentPath,
        readFile: resumeReadFile,
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: resumeWriteFile,
        generateScenarioCsv: resumeGenerateScenarioCsv,
      },
    );

    expect(resumeReadFile).toHaveBeenCalledWith(reusablePath);
    expect(resumeReadFile).toHaveBeenCalledWith(malformedPath);
    expect(resumeReadFile).toHaveBeenCalledWith(mismatchedOpponentPath);
    expect(resumeGenerateScenarioCsv).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'great-league' }),
      'feraligatr',
      1,
      expect.objectContaining({ fastMove: 'WATER_GUN' }),
      expect.anything(),
    );
    for (const shields of [0, 2]) {
      expect(resumeGenerateScenarioCsv).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'great-league' }),
        'feraligatr',
        shields,
        expect.objectContaining({ fastMove: 'WATER_GUN' }),
        expect.anything(),
      );
    }
    expect(resumeWriteFile).not.toHaveBeenCalledWith(
      reusablePath,
      expect.anything(),
    );
    expect(resumedResult.variantSelections).toEqual(
      generatedResult.variantSelections,
    );

    const generatedMismatchWriteFile = vi.fn().mockResolvedValue(undefined);
    await expect(
      generateSimulations(options, {
        getRuntime: () => ({ context: {} as never }),
        fileExists: (filePath: string) => isOverallRankingPath(filePath),
        readFile: readSourceFile,
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: generatedMismatchWriteFile,
        generateScenarioCsv: (
          runtime,
          format,
          speciesId,
          shields,
          recommendedMoves,
        ): string => {
          void runtime;
          void format;
          void speciesId;
          void shields;
          return recommendedMoves?.fastMove === 'WATER_GUN'
            ? 'Pokemon,Battle Rating,Energy Remaining,HP Remaining\nVenusaur,500,0,0\n'
            : VALID_SIMULATION_CSV;
        },
      }),
    ).rejects.toThrow(
      'Feraligatr water_gun--ice_beam--hydro_cannon 0-0 Great League opponent set does not match the default matrix',
    );
    expect(generatedMismatchWriteFile).not.toHaveBeenCalledWith(
      expect.stringContaining(
        'feraligatr--water_gun--ice_beam--hydro_cannon_0-0.csv',
      ),
      expect.anything(),
    );
    expect(generatedMismatchWriteFile).not.toHaveBeenCalled();
  });

  it('rejects duplicate canonical identities before simulating candidates', async () => {
    const generateScenarioCsv = vi.fn(() => VALID_SIMULATION_CSV);

    await expect(
      generateSimulations(
        {
          sourcePath: '/source/pvpoke',
          includeMovesetVariants: true,
          candidateSets: [
            {
              formatId: 'great-league',
              cup: 'all',
              cp: 1500,
              speciesId: 'bulbasaur',
              pvpokeScorePrior: 90,
              retainedFastMoves: ['VINE_WHIP'],
              retainedChargedMoves: ['POWER_WHIP', 'SLUDGE_BOMB'],
              rejections: [],
              candidates: [
                {
                  id: 'vine_whip--sludge_bomb--power_whip',
                  fastMove: 'VINE_WHIP',
                  chargedMove1: 'POWER_WHIP',
                  chargedMove2: 'SLUDGE_BOMB',
                  isDefault: true,
                },
                {
                  id: 'vine_whip--sludge_bomb--power_whip',
                  fastMove: 'VINE_WHIP',
                  chargedMove1: 'POWER_WHIP',
                  chargedMove2: 'SLUDGE_BOMB',
                  isDefault: false,
                },
              ],
            },
          ],
          simulationSpeciesIdsByFormatId: new Map([
            ['great-league', ['bulbasaur']],
          ]),
        },
        {
          getRuntime: () => ({ context: {} as never }),
          fileExists: isOverallRankingPath,
          readFile: async (filePath: string) => {
            if (isOverallRankingPath(filePath)) {
              return [
                'Pokemon,Fast Move,Charged Move 1,Charged Move 2',
                'Bulbasaur,Vine Whip,Power Whip,Sludge Bomb',
              ].join('\n');
            }
            if (filePath.endsWith(path.join('data', 'pokemon.json'))) {
              return JSON.stringify([
                {
                  speciesId: 'bulbasaur',
                  speciesName: 'Bulbasaur',
                  fastMoves: ['VINE_WHIP'],
                  chargedMoves: ['POWER_WHIP', 'SLUDGE_BOMB'],
                  released: true,
                },
              ]);
            }
            if (filePath.endsWith(path.join('data', 'moves.json'))) {
              return JSON.stringify([
                { moveId: 'VINE_WHIP', name: 'Vine Whip', energyGain: 8 },
                {
                  moveId: 'POWER_WHIP',
                  name: 'Power Whip',
                  energyGain: 0,
                },
                {
                  moveId: 'SLUDGE_BOMB',
                  name: 'Sludge Bomb',
                  energyGain: 0,
                },
              ]);
            }
            throw new Error(`unexpected file read: ${filePath}`);
          },
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile: vi.fn().mockResolvedValue(undefined),
          generateScenarioCsv,
        },
      ),
    ).rejects.toThrow(
      "Duplicate candidate variant 'vine_whip--sludge_bomb--power_whip' for great-league/bulbasaur",
    );
    expect(generateScenarioCsv).not.toHaveBeenCalled();
  });

  it('rejects path-unsafe candidate move ids before filesystem access', async () => {
    const generateScenarioCsv = vi.fn(() => VALID_SIMULATION_CSV);
    const unsafeMoveId = '../../../ESCAPE';

    await expect(
      generateSimulations(
        {
          sourcePath: '/source/pvpoke',
          includeMovesetVariants: true,
          candidateSets: [
            {
              formatId: 'great-league',
              cup: 'all',
              cp: 1500,
              speciesId: 'bulbasaur',
              pvpokeScorePrior: 90,
              retainedFastMoves: ['VINE_WHIP', unsafeMoveId],
              retainedChargedMoves: ['POWER_WHIP', 'SLUDGE_BOMB'],
              rejections: [],
              candidates: [
                {
                  id: 'vine_whip--sludge_bomb--power_whip',
                  fastMove: 'VINE_WHIP',
                  chargedMove1: 'POWER_WHIP',
                  chargedMove2: 'SLUDGE_BOMB',
                  isDefault: true,
                },
                {
                  id: '../../../escape--sludge_bomb--power_whip',
                  fastMove: unsafeMoveId,
                  chargedMove1: 'POWER_WHIP',
                  chargedMove2: 'SLUDGE_BOMB',
                  isDefault: false,
                },
              ],
            },
          ],
          simulationSpeciesIdsByFormatId: new Map([
            ['great-league', ['bulbasaur']],
          ]),
        },
        {
          getRuntime: () => ({ context: {} as never }),
          fileExists: isOverallRankingPath,
          readFile: async (filePath: string) => {
            if (isOverallRankingPath(filePath)) {
              return [
                'Pokemon,Fast Move,Charged Move 1,Charged Move 2',
                'Bulbasaur,Vine Whip,Power Whip,Sludge Bomb',
              ].join('\n');
            }
            if (filePath.endsWith(path.join('data', 'pokemon.json'))) {
              return JSON.stringify([
                {
                  speciesId: 'bulbasaur',
                  speciesName: 'Bulbasaur',
                  fastMoves: ['VINE_WHIP', unsafeMoveId],
                  chargedMoves: ['POWER_WHIP', 'SLUDGE_BOMB'],
                  released: true,
                },
              ]);
            }
            if (filePath.endsWith(path.join('data', 'moves.json'))) {
              return JSON.stringify([
                { moveId: 'VINE_WHIP', name: 'Vine Whip', energyGain: 8 },
                { moveId: unsafeMoveId, name: 'Escape', energyGain: 8 },
                {
                  moveId: 'POWER_WHIP',
                  name: 'Power Whip',
                  energyGain: 0,
                },
                {
                  moveId: 'SLUDGE_BOMB',
                  name: 'Sludge Bomb',
                  energyGain: 0,
                },
              ]);
            }
            throw new Error(`unexpected file read: ${filePath}`);
          },
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile: vi.fn().mockResolvedValue(undefined),
          generateScenarioCsv,
        },
      ),
    ).rejects.toThrow(
      "Candidate '../../../escape--sludge_bomb--power_whip' has path-unsafe move '../../../ESCAPE'",
    );
    expect(generateScenarioCsv).not.toHaveBeenCalled();
  });

  it('preserves manifests while reusing only valid unchanged files', async () => {
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
        return VALID_SIMULATION_CSV;
      }

      throw new Error(`unexpected file read: ${filePath}`);
    });

    const generateScenarioCsv = vi.fn(() => VALID_SIMULATION_CSV);
    const removeDirectory = vi.fn().mockResolvedValue(undefined);

    await generateSimulations(
      {
        sourcePath: '/source/pvpoke',
        resume: true,
        forceRegenerateFormatIds: new Set(['great-league']),
      },
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
        removeDirectory,
        writeFile: vi.fn().mockResolvedValue(undefined),
        generateScenarioCsv,
      },
    );

    expect(readFile).not.toHaveBeenCalledWith(
      path.join('data', 'simulations', 'cp1500', 'all', 'bulbasaur_1-1.csv'),
    );
    expect(removeDirectory).not.toHaveBeenCalled();
    expect(readFile).toHaveBeenCalledWith(
      path.join('data', 'simulations', 'cp2500', 'all', 'bulbasaur_1-1.csv'),
    );

    expect(generateScenarioCsv).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cp: 1500, cup: 'all' }),
      'bulbasaur',
      1,
      undefined,
      expect.anything(),
    );
    expect(generateScenarioCsv).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cp: 2500, cup: 'all' }),
      'bulbasaur',
      1,
      undefined,
      expect.anything(),
    );
  });
});
