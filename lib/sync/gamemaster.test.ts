import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { syncConfig } from './config';
import { fetchMovesData, fetchPokemonData } from './gamemaster';
import { validateMovesJson, validatePokemonJson } from './validation';
import movesData from '@/data/moves.json';
import pokemonData from '@/data/pokemon.json';

const validPokemonData = {
  dex: 1,
  speciesName: 'Bulbasaur',
  speciesId: 'bulbasaur',
  baseStats: { atk: 118, def: 111, hp: 128 },
  types: ['Grass', 'Poison'],
  fastMoves: ['VINE_WHIP'],
  chargedMoves: ['POWER_WHIP'],
  defaultIVs: { cp500: [0], cp1500: [0], cp2500: [0] },
  level25CP: 700,
  buddyDistance: 3,
  thirdMoveCost: 50000,
  released: true,
  family: { id: 'BULBASAUR' },
};

describe('gamemaster local sync', () => {
  it('syncs pokemon JSON from local source path', async () => {
    const sourcePath = '/source/pvpoke';
    const readPokemonJson = vi.fn().mockResolvedValue([
      {
        ...validPokemonData,
        eliteMoves: ['FRENZY_PLANT'],
        legacyMoves: ['TACKLE'],
      },
    ]);
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);

    const data = await fetchPokemonData(sourcePath, {
      createAdapter: () => ({
        readPokemonJson,
        readMovesJson: vi.fn(),
      }),
      mkdir,
      writeFile,
    });

    expect(readPokemonJson).toHaveBeenCalledTimes(1);
    expect(mkdir).toHaveBeenCalledWith(syncConfig.outputDir);
    expect(writeFile).toHaveBeenCalledWith(
      path.join(syncConfig.outputDir, 'pokemon.json'),
      expect.stringContaining('"speciesName": "Bulbasaur"'),
    );
    expect(data).toHaveLength(1);
  });

  it('rejects malformed optional move availability lists', () => {
    expect(
      validatePokemonJson([
        {
          ...validPokemonData,
          eliteMoves: ['FRENZY_PLANT', 1],
          legacyMoves: 'TACKLE',
          extraChargedMoves: ['MEGA_CRUNCH', 1],
        },
      ]),
    ).toEqual({
      valid: false,
      errors: [
        'Pokemon 0: eliteMoves must contain strings',
        'Pokemon 0: legacyMoves must be array if present',
        'Pokemon 0: extraChargedMoves must contain strings',
      ],
    });
  });

  it('accepts optional additional charged moves when they are strings', () => {
    expect(
      validatePokemonJson([
        { ...validPokemonData },
        { ...validPokemonData, extraChargedMoves: ['MEGA_CRUNCH'] },
      ]),
    ).toEqual({ valid: true, errors: [] });
  });

  it('rejects malformed additional charged move lists', () => {
    expect(
      validatePokemonJson([
        { ...validPokemonData, extraChargedMoves: null },
        { ...validPokemonData, extraChargedMoves: 'MEGA_CRUNCH' },
      ]),
    ).toEqual({
      valid: false,
      errors: [
        'Pokemon 0: extraChargedMoves must be array if present',
        'Pokemon 1: extraChargedMoves must be array if present',
      ],
    });
  });

  it('syncs moves JSON from local source path', async () => {
    const readMovesJson = vi.fn().mockResolvedValue([
      {
        moveId: 'VINE_WHIP',
        name: 'Vine Whip',
        abbreviation: 'VW',
        type: 'Grass',
        power: 5,
        energy: 0,
        energyGain: 8,
        cooldown: 500,
        archetype: 'Fast',
        turns: 2,
      },
    ]);
    const writeFile = vi.fn().mockResolvedValue(undefined);

    const data = await fetchMovesData('/source/pvpoke', {
      createAdapter: () => ({
        readPokemonJson: vi.fn(),
        readMovesJson,
      }),
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile,
    });

    expect(readMovesJson).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(
      path.join(syncConfig.outputDir, 'moves.json'),
      expect.stringContaining('"moveId": "VINE_WHIP"'),
    );
    expect(data).toHaveLength(1);
  });

  it('accepts typed self, opponent, and dual-target status effects', () => {
    expect(
      validateMovesJson([
        {
          moveId: 'OBSTRUCT',
          name: 'Obstruct',
          type: 'dark',
          power: 15,
          energy: 40,
          energyGain: 0,
          cooldown: 500,
          archetype: 'Boost Spam',
          turns: 1,
          buffs: [0, 1],
          buffsSelf: [0, 1],
          buffsOpponent: [0, -1],
          buffTarget: 'both',
          buffApplyChance: '1',
        },
      ]),
    ).toEqual({ valid: true, errors: [] });
  });

  it('accepts optional Mega move flags when they are booleans', () => {
    const move = {
      moveId: 'VINE_WHIP',
      name: 'Vine Whip',
      type: 'Grass',
      power: 5,
      energy: 0,
      energyGain: 8,
      cooldown: 500,
      archetype: 'Fast',
      turns: 2,
    };

    expect(
      validateMovesJson([
        move,
        { ...move, isMegaMove: true },
        { ...move, isMegaMove: false },
      ]),
    ).toEqual({ valid: true, errors: [] });
  });

  it('rejects malformed Mega move flags', () => {
    const move = {
      moveId: 'VINE_WHIP',
      name: 'Vine Whip',
      type: 'Grass',
      power: 5,
      energy: 0,
      energyGain: 8,
      cooldown: 500,
      archetype: 'Fast',
      turns: 2,
    };

    expect(
      validateMovesJson([
        { ...move, isMegaMove: null },
        { ...move, isMegaMove: 'true' },
      ]),
    ).toEqual({
      valid: false,
      errors: [
        'Move 0: isMegaMove must be boolean if present',
        'Move 1: isMegaMove must be boolean if present',
      ],
    });
  });

  it('validates every checked-in move status shape', () => {
    expect(validateMovesJson(movesData)).toEqual({ valid: true, errors: [] });
  });

  it('validates every checked-in Pokemon shape', () => {
    expect(validatePokemonJson(pokemonData)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('rejects malformed status-effect fields', () => {
    expect(
      validateMovesJson([
        {
          moveId: 'INVALID_STATUS',
          name: 'Invalid Status',
          type: 'normal',
          power: 20,
          energy: 35,
          energyGain: 0,
          cooldown: 500,
          archetype: 'Spam',
          turns: 1,
          buffs: [1],
          buffsSelf: [0, Number.NaN],
          buffsOpponent: 'none',
          buffTarget: 'team',
          buffApplyChance: '2',
        },
      ]),
    ).toEqual({
      valid: false,
      errors: [
        'Move 0: buffs must contain exactly two finite numbers if present',
        'Move 0: buffsSelf must contain exactly two finite numbers if present',
        'Move 0: buffsOpponent must contain exactly two finite numbers if present',
        'Move 0: buffTarget must be self, opponent, or both if present',
        'Move 0: buffApplyChance must be a numeric string from 0 to 1 if present',
      ],
    });
  });

  it('rejects status fields that contradict their declared target', () => {
    const baseMove = {
      moveId: 'INVALID_STATUS',
      name: 'Invalid Status',
      type: 'normal',
      power: 20,
      energy: 35,
      energyGain: 0,
      cooldown: 500,
      archetype: 'Spam',
      turns: 1,
      buffApplyChance: '1',
    };

    expect(
      validateMovesJson([
        {
          ...baseMove,
          buffsSelf: [1, 0],
          buffTarget: 'opponent',
        },
        {
          ...baseMove,
          buffs: [0, 1],
          buffsSelf: [0, 1],
          buffTarget: 'both',
        },
        {
          ...baseMove,
          buffs: [1, 0],
        },
      ]),
    ).toEqual({
      valid: false,
      errors: [
        'Move 0: self/opponent targets require buffs and forbid split status fields',
        'Move 1: both target requires buffsSelf and buffsOpponent',
        'Move 2: status fields require buffTarget',
      ],
    });
  });

  it('throws when pokemon JSON fails validation', async () => {
    const readPokemonJson = vi.fn().mockResolvedValue([{ bad: 'shape' }]);

    await expect(
      fetchPokemonData('/source/pvpoke', {
        createAdapter: () => ({
          readPokemonJson,
          readMovesJson: vi.fn(),
        }),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrowError(/Pokemon JSON validation failed/);
  });

  it('throws when moves JSON fails validation', async () => {
    const readMovesJson = vi.fn().mockResolvedValue([{ bad: 'shape' }]);

    await expect(
      fetchMovesData('/source/pvpoke', {
        createAdapter: () => ({
          readPokemonJson: vi.fn(),
          readMovesJson,
        }),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrowError(/Moves JSON validation failed/);
  });
});
