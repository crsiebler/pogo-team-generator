import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { syncConfig } from './config';
import { fetchMovesData, fetchPokemonData } from './gamemaster';

describe('gamemaster local sync', () => {
  it('syncs pokemon JSON from local source path', async () => {
    const sourcePath = '/source/pvpoke';
    const readPokemonJson = vi.fn().mockResolvedValue([
      {
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
