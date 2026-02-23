import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { RankingCategory } from './adapter';
import { scrapeRankings } from './rankings';

describe('rankings local sync', () => {
  it('converts local ranking JSON into validated CSV outputs', async () => {
    const categories: RankingCategory[] = [
      'overall',
      'leads',
      'switches',
      'closers',
    ];

    const readRankingJson = vi
      .fn<
        (
          category: RankingCategory,
          leagueCp: number,
        ) => Promise<
          Array<{
            speciesId: string;
            speciesName: string;
            score: number;
            moveset: string[];
            stats: { atk: number; def: number; hp: number };
          }>
        >
      >()
      .mockImplementation(async (category, leagueCp) => {
        expect(leagueCp).toBe(1500);
        expect(categories).toContain(category);

        return [
          {
            speciesId: 'bulbasaur',
            speciesName: 'Bulbasaur',
            score: 90.5,
            moveset: ['VINE_WHIP', 'POWER_WHIP', 'SLUDGE_BOMB'],
            stats: { atk: 102.1, def: 99.5, hp: 122 },
          },
        ];
      });

    const writeFile = vi.fn().mockResolvedValue(undefined);

    const rankings = await scrapeRankings(
      { sourcePath: '/source/pvpoke' },
      {
        createAdapter: () => ({
          readRankingJson,
        }),
        readFile: async (filePath: string) => {
          if (filePath.endsWith(path.join('data', 'pokemon.json'))) {
            return JSON.stringify([
              {
                dex: 1,
                speciesName: 'Bulbasaur',
                speciesId: 'bulbasaur',
                baseStats: { atk: 118, def: 111, hp: 128 },
                types: ['grass', 'poison'],
                fastMoves: ['VINE_WHIP'],
                chargedMoves: ['POWER_WHIP', 'SLUDGE_BOMB'],
                defaultIVs: {
                  cp500: [17.5, 3, 14, 12],
                  cp1500: [50, 15, 15, 15],
                },
                buddyDistance: 3,
                thirdMoveCost: 10000,
                released: true,
                family: { id: 'FAMILY_BULBASAUR' },
              },
            ]);
          }

          if (filePath.endsWith(path.join('data', 'moves.json'))) {
            return JSON.stringify([
              {
                moveId: 'VINE_WHIP',
                name: 'Vine Whip',
                abbreviation: 'VW',
                type: 'grass',
                power: 5,
                energy: 0,
                energyGain: 8,
                cooldown: 500,
                archetype: 'Fast',
                turns: 2,
              },
              {
                moveId: 'POWER_WHIP',
                name: 'Power Whip',
                abbreviation: 'PW',
                type: 'grass',
                power: 90,
                energy: 50,
                energyGain: 0,
                cooldown: 0,
                archetype: 'Charged',
                turns: 0,
              },
              {
                moveId: 'SLUDGE_BOMB',
                name: 'Sludge Bomb',
                abbreviation: 'SB',
                type: 'poison',
                power: 80,
                energy: 50,
                energyGain: 0,
                cooldown: 0,
                archetype: 'Charged',
                turns: 0,
              },
            ]);
          }

          throw new Error(`unexpected file read: ${filePath}`);
        },
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile,
      },
    );

    expect(readRankingJson).toHaveBeenCalledTimes(4);
    expect(rankings).toHaveLength(4);
    expect(rankings[0]).toMatchObject({
      Pokemon: 'Bulbasaur',
      Score: 90.5,
      Dex: 1,
      'Type 1': 'grass',
      'Type 2': 'poison',
      'Fast Move': 'Vine Whip',
      'Charged Move 1': 'Power Whip',
      'Charged Move 2': 'Sludge Bomb',
      'Charged Move 1 Count': 7,
      'Charged Move 2 Count': 7,
      'Buddy Distance': 3,
      'Charged Move Cost': 10000,
    });

    expect(writeFile).toHaveBeenCalledTimes(4);
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'cp1500_all_overall_rankings.csv'),
      expect.stringContaining('Pokemon,Score,Dex,Type 1,Type 2'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'cp1500_all_leads_rankings.csv'),
      expect.stringContaining('Bulbasaur'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'cp1500_all_switches_rankings.csv'),
      expect.stringContaining('Bulbasaur'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'cp1500_all_closers_rankings.csv'),
      expect.stringContaining('Bulbasaur'),
    );
  });

  it('throws when ranking references a move missing from moves data', async () => {
    await expect(
      scrapeRankings(
        { sourcePath: '/source/pvpoke' },
        {
          createAdapter: () => ({
            readRankingJson: async () => [
              {
                speciesId: 'bulbasaur',
                speciesName: 'Bulbasaur',
                score: 90.5,
                moveset: ['VINE_WHIP', 'POWER_WHIP', 'SLUDGE_BOMB'],
                stats: { atk: 102.1, def: 99.5, hp: 122 },
              },
            ],
          }),
          readFile: async (filePath: string) => {
            if (filePath.endsWith(path.join('data', 'pokemon.json'))) {
              return JSON.stringify([
                {
                  dex: 1,
                  speciesName: 'Bulbasaur',
                  speciesId: 'bulbasaur',
                  baseStats: { atk: 118, def: 111, hp: 128 },
                  types: ['grass', 'poison'],
                  fastMoves: ['VINE_WHIP'],
                  chargedMoves: ['POWER_WHIP', 'SLUDGE_BOMB'],
                  defaultIVs: {
                    cp500: [17.5, 3, 14, 12],
                    cp1500: [50, 15, 15, 15],
                  },
                  buddyDistance: 3,
                  thirdMoveCost: 10000,
                  released: true,
                  family: { id: 'FAMILY_BULBASAUR' },
                },
              ]);
            }

            if (filePath.endsWith(path.join('data', 'moves.json'))) {
              return JSON.stringify([
                {
                  moveId: 'VINE_WHIP',
                  name: 'Vine Whip',
                  abbreviation: 'VW',
                  type: 'grass',
                  power: 5,
                  energy: 0,
                  energyGain: 8,
                  cooldown: 500,
                  archetype: 'Fast',
                  turns: 2,
                },
                {
                  moveId: 'POWER_WHIP',
                  name: 'Power Whip',
                  abbreviation: 'PW',
                  type: 'grass',
                  power: 90,
                  energy: 50,
                  energyGain: 0,
                  cooldown: 0,
                  archetype: 'Charged',
                  turns: 0,
                },
              ]);
            }

            throw new Error(`unexpected file read: ${filePath}`);
          },
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile: vi.fn().mockResolvedValue(undefined),
        },
      ),
    ).rejects.toThrowError(/Missing move 'SLUDGE_BOMB'/);
  });

  it('normalizes non-choosable battle forms to choosable forms', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);

    const rankings = await scrapeRankings(
      { sourcePath: '/source/pvpoke' },
      {
        createAdapter: () => ({
          readRankingJson: async () => [
            {
              speciesId: 'morpeko_hangry',
              speciesName: 'Morpeko (Hangry)',
              score: 88.1,
              moveset: ['BITE', 'AURA_WHEEL_DARK', 'OUTRAGE'],
              stats: { atk: 100, def: 100, hp: 100 },
            },
            {
              speciesId: 'aegislash_blade',
              speciesName: 'Aegislash (Blade)',
              score: 87.2,
              moveset: ['PSYCHO_CUT', 'SHADOW_BALL', 'GYRO_BALL'],
              stats: { atk: 100, def: 100, hp: 100 },
            },
          ],
        }),
        readFile: async (filePath: string) => {
          if (filePath.endsWith(path.join('data', 'pokemon.json'))) {
            return JSON.stringify([
              {
                dex: 877,
                speciesName: 'Morpeko (Full Belly)',
                speciesId: 'morpeko_full_belly',
                baseStats: { atk: 192, def: 121, hp: 151 },
                types: ['electric', 'dark'],
                fastMoves: ['BITE'],
                chargedMoves: ['AURA_WHEEL_ELECTRIC', 'OUTRAGE'],
                defaultIVs: {
                  cp500: [9.5, 7, 15, 12],
                  cp1500: [28.5, 5, 14, 15],
                  cp2500: [50, 15, 15, 15],
                },
                buddyDistance: 3,
                thirdMoveCost: 50000,
                released: true,
                family: { id: 'FAMILY_MORPEKO' },
              },
              {
                dex: 681,
                speciesName: 'Aegislash (Shield)',
                speciesId: 'aegislash_shield',
                baseStats: { atk: 97, def: 272, hp: 155 },
                types: ['steel', 'ghost'],
                fastMoves: ['PSYCHO_CUT'],
                chargedMoves: ['SHADOW_BALL', 'GYRO_BALL'],
                defaultIVs: {
                  cp500: [12.5, 4, 15, 15],
                  cp1500: [46, 4, 14, 15],
                  cp2500: [50, 15, 15, 15],
                },
                buddyDistance: 5,
                thirdMoveCost: 75000,
                released: true,
                family: { id: 'FAMILY_HONEDGE' },
              },
            ]);
          }

          if (filePath.endsWith(path.join('data', 'moves.json'))) {
            return JSON.stringify([
              {
                moveId: 'BITE',
                name: 'Bite',
                abbreviation: 'Bi',
                type: 'dark',
                power: 4,
                energy: 0,
                energyGain: 2,
                cooldown: 500,
                archetype: 'Fast',
                turns: 1,
              },
              {
                moveId: 'AURA_WHEEL_DARK',
                name: 'Aura Wheel',
                abbreviation: 'AuW',
                type: 'dark',
                power: 100,
                energy: 45,
                energyGain: 0,
                cooldown: 0,
                archetype: 'Charged',
                turns: 0,
              },
              {
                moveId: 'OUTRAGE',
                name: 'Outrage',
                abbreviation: 'O',
                type: 'dragon',
                power: 110,
                energy: 60,
                energyGain: 0,
                cooldown: 0,
                archetype: 'Charged',
                turns: 0,
              },
              {
                moveId: 'PSYCHO_CUT',
                name: 'Psycho Cut',
                abbreviation: 'PsC',
                type: 'psychic',
                power: 3,
                energy: 0,
                energyGain: 9,
                cooldown: 500,
                archetype: 'Fast',
                turns: 1,
              },
              {
                moveId: 'SHADOW_BALL',
                name: 'Shadow Ball',
                abbreviation: 'SB',
                type: 'ghost',
                power: 100,
                energy: 55,
                energyGain: 0,
                cooldown: 0,
                archetype: 'Charged',
                turns: 0,
              },
              {
                moveId: 'GYRO_BALL',
                name: 'Gyro Ball',
                abbreviation: 'GB',
                type: 'steel',
                power: 80,
                energy: 60,
                energyGain: 0,
                cooldown: 0,
                archetype: 'Charged',
                turns: 0,
              },
            ]);
          }

          throw new Error(`unexpected file read: ${filePath}`);
        },
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile,
      },
    );

    expect(rankings.some((entry) => entry.Pokemon === 'Morpeko (Hangry)')).toBe(
      false,
    );
    expect(
      rankings.some((entry) => entry.Pokemon === 'Aegislash (Blade)'),
    ).toBe(false);
    expect(
      rankings.some((entry) => entry.Pokemon === 'Morpeko (Full Belly)'),
    ).toBe(true);
    expect(
      rankings.some((entry) => entry.Pokemon === 'Aegislash (Shield)'),
    ).toBe(true);

    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'cp1500_all_overall_rankings.csv'),
      expect.stringContaining('Morpeko (Full Belly)'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'cp1500_all_overall_rankings.csv'),
      expect.not.stringContaining('Morpeko (Hangry)'),
    );
  });
});
