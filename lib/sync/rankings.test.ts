import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { RankingCategory } from './adapter';
import {
  aggregateRankingMoveEvidence,
  normalizeRankingSourceEntries,
  parseMovesetOverrides,
  parseRankingSourceEntries,
  type RankingCategoryEvidence,
  type RankingSourceEntry,
  scrapeRankings,
} from './rankings';

function createRankingSourceEntry(
  speciesId: string,
  fastMoves: Array<{ moveId: string; uses: number | null }>,
  chargedMoves: Array<{ moveId: string; uses: number | null }>,
  moveset: string[] = ['FAST_A', 'CHARGED_A', 'CHARGED_B'],
): RankingSourceEntry {
  return {
    speciesId,
    speciesName: speciesId,
    score: 90,
    moveset,
    moves: { fastMoves, chargedMoves },
  };
}

function createCategoryEvidence(
  category: RankingCategory,
  entries: RankingSourceEntry[],
  formatId: RankingCategoryEvidence['formatId'] = 'great-league',
): RankingCategoryEvidence {
  return {
    formatId,
    cup: 'all',
    cp: formatId === 'ultra-league' ? 2500 : 1500,
    category,
    entries: normalizeRankingSourceEntries(entries),
  };
}

describe('ranking move evidence aggregation', () => {
  it('normalizes each entry before applying category weights', () => {
    const usesByCategory: Record<
      RankingCategory,
      Array<{ moveId: string; uses: number | null }>
    > = {
      overall: [
        { moveId: 'FAST_A', uses: 900 },
        { moveId: 'FAST_B', uses: 100 },
      ],
      leads: [
        { moveId: 'FAST_A', uses: 9 },
        { moveId: 'FAST_B', uses: 1 },
      ],
      switches: [
        { moveId: 'FAST_A', uses: null },
        { moveId: 'FAST_B', uses: 10 },
      ],
      closers: [
        { moveId: 'FAST_A', uses: 0 },
        { moveId: 'FAST_B', uses: 0 },
      ],
      chargers: [
        { moveId: 'FAST_A', uses: 3 },
        { moveId: 'FAST_B', uses: 1 },
      ],
      attackers: [
        { moveId: 'FAST_A', uses: 2 },
        { moveId: 'FAST_B', uses: 2 },
      ],
      consistency: [
        { moveId: 'FAST_A', uses: 1 },
        { moveId: 'FAST_B', uses: 3 },
      ],
    };
    const categoryEvidence = Object.entries(usesByCategory).map(
      ([category, fastMoves]) => {
        return createCategoryEvidence(category as RankingCategory, [
          createRankingSourceEntry('bulbasaur', fastMoves, [
            { moveId: 'CHARGED_A', uses: 1 },
          ]),
        ]);
      },
    );

    const [evidence] = aggregateRankingMoveEvidence(categoryEvidence, []);

    expect(evidence.fastMoves).toEqual([
      {
        moveId: 'FAST_A',
        categoryOccurrenceCount: 5,
        weightedNormalizedUse: 6,
        overallUse: 900,
        evidencePriority: 1,
      },
      {
        moveId: 'FAST_B',
        categoryOccurrenceCount: 6,
        weightedNormalizedUse: 4,
        overallUse: 100,
        evidencePriority: 1,
      },
    ]);
    expect(evidence.chargedMoves).toEqual([
      {
        moveId: 'CHARGED_A',
        categoryOccurrenceCount: 7,
        weightedNormalizedUse: 12,
        overallUse: 1,
        evidencePriority: 1,
      },
    ]);
  });

  it('normalizes species independently of category size and entry order', () => {
    const largeScale = createRankingSourceEntry(
      'bulbasaur',
      [
        { moveId: 'FAST_A', uses: 900 },
        { moveId: 'FAST_B', uses: 100 },
      ],
      [{ moveId: 'CHARGED_A', uses: 1 }],
    );
    const smallScale = createRankingSourceEntry(
      'ivysaur',
      [
        { moveId: 'FAST_A', uses: 9 },
        { moveId: 'FAST_B', uses: 1 },
      ],
      [{ moveId: 'CHARGED_A', uses: 1 }],
    );

    const overallEvidence = createCategoryEvidence('overall', [
      largeScale,
      smallScale,
    ]);
    const ordered = aggregateRankingMoveEvidence([overallEvidence], []);
    const shuffled = aggregateRankingMoveEvidence(
      [
        {
          ...overallEvidence,
          entries: [...overallEvidence.entries].reverse(),
        },
      ],
      [],
    );

    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(ordered));
    expect(
      ordered.map(({ speciesId, fastMoves }) => ({
        speciesId,
        weightedUses: fastMoves.map(
          ({ weightedNormalizedUse }) => weightedNormalizedUse,
        ),
      })),
    ).toEqual([
      { speciesId: 'bulbasaur', weightedUses: [2.7, 0.3] },
      { speciesId: 'ivysaur', weightedUses: [2.7, 0.3] },
    ]);
  });

  it('uses exact Overall use and lexical IDs as deterministic tie-breakers', () => {
    const [evidence] = aggregateRankingMoveEvidence(
      [
        createCategoryEvidence('overall', [
          createRankingSourceEntry(
            'bulbasaur',
            [
              { moveId: 'FAST_HIGH_OVERALL', uses: 6 },
              { moveId: 'FAST_LOW_OVERALL', uses: 4 },
            ],
            [
              { moveId: 'CHARGED_WINNER', uses: 1 },
              { moveId: 'CHARGED_ZERO', uses: 0 },
              { moveId: 'CHARGED_UNKNOWN', uses: null },
            ],
          ),
        ]),
        createCategoryEvidence('leads', [
          createRankingSourceEntry(
            'bulbasaur',
            [
              { moveId: 'FAST_HIGH_OVERALL', uses: 35 },
              { moveId: 'FAST_LOW_OVERALL', uses: 65 },
            ],
            [
              { moveId: 'CHARGED_ZERO', uses: 1 },
              { moveId: 'CHARGED_UNKNOWN', uses: 1 },
            ],
          ),
        ]),
      ],
      [],
    );

    expect(evidence.fastMoves.map(({ moveId }) => moveId)).toEqual([
      'FAST_HIGH_OVERALL',
      'FAST_LOW_OVERALL',
    ]);
    expect(
      evidence.chargedMoves.map(({ moveId, overallUse }) => ({
        moveId,
        overallUse,
      })),
    ).toEqual([
      { moveId: 'CHARGED_WINNER', overallUse: 1 },
      { moveId: 'CHARGED_ZERO', overallUse: 0 },
      { moveId: 'CHARGED_UNKNOWN', overallUse: null },
    ]);
  });

  it('keeps observed movesets and overrides ahead of usage-only evidence', () => {
    const observed = createRankingSourceEntry(
      'golisopodsh',
      [{ moveId: 'SHADOW_CLAW', uses: 10 }],
      [
        { moveId: 'X_SCISSOR', uses: 7 },
        { moveId: 'AQUA_JET', uses: 3 },
      ],
      ['SHADOW_CLAW', 'X_SCISSOR', 'AQUA_JET'],
    );

    const [evidence] = aggregateRankingMoveEvidence(
      [createCategoryEvidence('overall', [observed])],
      [
        {
          formatId: 'great-league',
          cup: 'all',
          cp: 1500,
          entries: [
            {
              speciesId: 'golisopodsh',
              fastMove: 'FURY_CUTTER',
              chargedMoves: ['AQUA_JET', 'X_SCISSOR'],
            },
          ],
        },
      ],
    );

    expect(evidence.speciesId).toBe('golisopod');
    expect(evidence.movesetEvidence).toEqual([
      {
        source: 'override',
        evidencePriority: 0,
        sourceSpeciesId: 'golisopodsh',
        fastMove: 'FURY_CUTTER',
        chargedMoves: ['AQUA_JET', 'X_SCISSOR'],
        weight: null,
      },
      {
        source: 'observed',
        evidencePriority: 0,
        category: 'overall',
        categoryWeight: 3,
        sourceSpeciesId: 'golisopodsh',
        speciesAliasKind: 'moveset-variant',
        moveset: ['SHADOW_CLAW', 'X_SCISSOR', 'AQUA_JET'],
      },
    ]);
    expect(
      evidence.movesetEvidence.every(
        ({ evidencePriority }) =>
          evidencePriority < evidence.fastMoves[0].evidencePriority,
      ),
    ).toBe(true);
  });

  it('produces byte-identical format-scoped evidence for shuffled inputs', () => {
    const greatOverall = createCategoryEvidence('overall', [
      createRankingSourceEntry(
        'bulbasaur',
        [
          { moveId: 'FAST_B', uses: 1 },
          { moveId: 'FAST_A', uses: 1 },
        ],
        [
          { moveId: 'CHARGED_B', uses: 1 },
          { moveId: 'CHARGED_A', uses: 1 },
        ],
      ),
    ]);
    const greatLeads = createCategoryEvidence('leads', [
      createRankingSourceEntry(
        'bulbasaur',
        [
          { moveId: 'FAST_A', uses: 1 },
          { moveId: 'FAST_B', uses: 1 },
        ],
        [
          { moveId: 'CHARGED_A', uses: 1 },
          { moveId: 'CHARGED_B', uses: 1 },
        ],
      ),
    ]);
    const ultraOverall = createCategoryEvidence(
      'overall',
      [
        createRankingSourceEntry(
          'bulbasaur',
          [{ moveId: 'FAST_A', uses: 1 }],
          [{ moveId: 'CHARGED_A', uses: 1 }],
        ),
      ],
      'ultra-league',
    );
    const overrides = [
      {
        formatId: 'great-league' as const,
        cup: 'all' as const,
        cp: 1500,
        entries: [
          { speciesId: 'bulbasaur', fastMove: 'FAST_B' },
          { speciesId: 'bulbasaur', fastMove: 'FAST_A' },
        ],
      },
    ];

    const ordered = aggregateRankingMoveEvidence(
      [greatOverall, greatLeads, ultraOverall],
      overrides,
    );
    const shuffled = aggregateRankingMoveEvidence(
      [ultraOverall, greatLeads, greatOverall],
      [{ ...overrides[0], entries: [...overrides[0].entries].reverse() }],
    );

    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(ordered));
    expect(ordered.map(({ formatId }) => formatId)).toEqual([
      'great-league',
      'ultra-league',
    ]);
  });
});

describe('rankings local sync', () => {
  it('deduplicates canonical aliases deterministically without losing sources', () => {
    const canonical = {
      speciesId: 'morpeko_full_belly',
      speciesName: 'Morpeko (Full Belly)',
      score: 90,
      moveset: ['THUNDER_SHOCK', 'AURA_WHEEL_ELECTRIC', 'PSYCHIC_FANGS'],
      moves: {
        fastMoves: [{ moveId: 'THUNDER_SHOCK', uses: 70 }],
        chargedMoves: [
          { moveId: 'AURA_WHEEL_ELECTRIC', uses: 60 },
          { moveId: 'PSYCHIC_FANGS', uses: 40 },
        ],
      },
    };
    const battleState = {
      speciesId: 'morpeko_hangry',
      speciesName: 'Morpeko (Hangry)',
      score: 90,
      moveset: ['THUNDER_SHOCK', 'AURA_WHEEL_DARK', 'PSYCHIC_FANGS'],
      moves: {
        fastMoves: [{ moveId: 'THUNDER_SHOCK', uses: 65 }],
        chargedMoves: [
          { moveId: 'AURA_WHEEL_DARK', uses: 55 },
          { moveId: 'PSYCHIC_FANGS', uses: null },
        ],
      },
    };
    const movesetVariant = {
      speciesId: 'golisopodsh',
      speciesName: 'Golisopod',
      score: 85,
      moveset: ['SHADOW_CLAW', 'X_SCISSOR', 'AQUA_JET'],
      moves: {
        fastMoves: [{ moveId: 'SHADOW_CLAW', uses: 50 }],
        chargedMoves: [
          { moveId: 'X_SCISSOR', uses: 35 },
          { moveId: 'AQUA_JET', uses: 15 },
        ],
      },
    };

    const canonicalFirst = normalizeRankingSourceEntries([
      canonical,
      battleState,
    ]);
    const battleStateFirst = normalizeRankingSourceEntries([
      battleState,
      canonical,
    ]);

    expect(canonicalFirst).toEqual(battleStateFirst);
    expect(canonicalFirst[0]).toMatchObject({
      speciesId: 'morpeko_full_belly',
      sourceSpeciesId: 'morpeko_full_belly',
      speciesAliasKind: null,
    });
    expect(canonicalFirst[0].sourceEntries).toMatchObject([
      {
        sourceSpeciesId: 'morpeko_full_belly',
        canonicalSpeciesId: 'morpeko_full_belly',
        speciesAliasKind: null,
        moves: canonical.moves,
      },
      {
        sourceSpeciesId: 'morpeko_hangry',
        canonicalSpeciesId: 'morpeko_full_belly',
        speciesAliasKind: 'battle-state',
        moves: battleState.moves,
      },
    ]);

    const normalizedMovesetVariant = normalizeRankingSourceEntries([
      movesetVariant,
    ])[0];
    expect(normalizedMovesetVariant).toMatchObject({
      speciesId: 'golisopod',
      sourceEntries: [
        {
          sourceSpeciesId: 'golisopodsh',
          canonicalSpeciesId: 'golisopod',
          speciesAliasKind: 'moveset-variant',
          moveset: ['SHADOW_CLAW', 'X_SCISSOR', 'AQUA_JET'],
          moves: movesetVariant.moves,
        },
      ],
    });
  });

  it('converts local ranking JSON into validated CSV outputs', async () => {
    const categories: RankingCategory[] = [
      'overall',
      'leads',
      'switches',
      'closers',
      'chargers',
      'attackers',
      'consistency',
    ];

    const readRankingJson = vi
      .fn<
        (
          category: RankingCategory,
          leagueCp: number,
          cup:
            | 'all'
            | 'weather'
            | 'copadiluvio'
            | 'tsuki'
            | 'ligaultra'
            | 'coupedusillage'
            | undefined,
        ) => Promise<
          Array<{
            speciesId: string;
            speciesName: string;
            score: number;
            moveset: string[];
            moves: {
              fastMoves: Array<{ moveId: string; uses: number }>;
              chargedMoves: Array<{ moveId: string; uses: number }>;
            };
            stats: { atk: number; def: number; hp: number };
          }>
        >
      >()
      .mockImplementation(async (category, leagueCp, cup) => {
        expect([1500, 2500, 10000]).toContain(leagueCp);
        expect(
          cup === 'all' ||
            cup === 'weather' ||
            cup === 'copadiluvio' ||
            cup === 'tsuki' ||
            cup === 'ligaultra' ||
            cup === 'coupedusillage',
        ).toBe(true);
        expect(categories).toContain(category);
        const cupIndex = [
          'all',
          'weather',
          'copadiluvio',
          'tsuki',
          'ligaultra',
          'coupedusillage',
        ].indexOf(cup ?? 'all');
        const usageSentinel =
          categories.indexOf(category) * 100_000 + leagueCp * 10 + cupIndex;

        return [
          {
            speciesId: 'bulbasaur',
            speciesName: 'Bulbasaur',
            score: 90.5,
            moveset: ['VINE_WHIP', 'POWER_WHIP', 'SLUDGE_BOMB'],
            moves: {
              fastMoves: [{ moveId: 'VINE_WHIP', uses: usageSentinel }],
              chargedMoves: [
                { moveId: 'POWER_WHIP', uses: 60 },
                { moveId: 'SLUDGE_BOMB', uses: 40 },
              ],
            },
            stats: { atk: 102.1, def: 99.5, hp: 122 },
          },
        ];
      });

    const writeFile = vi.fn().mockResolvedValue(undefined);
    const readMovesetOverridesJson = vi
      .fn()
      .mockImplementation(async (leagueCp: number, cup?: string) => {
        expect([1500, 2500, 10000]).toContain(leagueCp);
        return cup === 'weather'
          ? [
              {
                speciesId: 'bulbasaur',
                fastMove: 'VINE_WHIP',
                chargedMoves: ['POWER_WHIP', 'SLUDGE_BOMB'],
                weight: 2,
              },
            ]
          : [];
      });

    const result = await scrapeRankings(
      { sourcePath: '/source/pvpoke' },
      {
        createAdapter: () => ({
          readRankingJson,
          readMovesetOverridesJson,
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
                  cp2500: [50, 15, 15, 15],
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

    expect(readRankingJson).toHaveBeenCalledTimes(56);
    expect(readMovesetOverridesJson).toHaveBeenCalledTimes(8);
    expect(result.rankings).toHaveLength(56);
    expect(result.categoryEvidence).toHaveLength(56);
    expect(result.overrideEvidence).toHaveLength(8);
    expect(result.aggregatedEvidence).toHaveLength(8);
    expect(
      result.categoryEvidence
        .filter(({ formatId }) => formatId === 'great-league')
        .map(({ category }) => category),
    ).toEqual(categories);
    for (const evidence of result.categoryEvidence) {
      const cupIndex = [
        'all',
        'weather',
        'copadiluvio',
        'tsuki',
        'ligaultra',
        'coupedusillage',
      ].indexOf(evidence.cup);
      expect(evidence.entries[0].moves.fastMoves[0].uses).toBe(
        categories.indexOf(evidence.category) * 100_000 +
          evidence.cp * 10 +
          cupIndex,
      );
    }
    expect(result.rankings[0]).toMatchObject({
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
    expect(result.categoryEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          formatId: 'great-league',
          cp: 1500,
          cup: 'all',
          category: 'overall',
          entries: [
            expect.objectContaining({
              speciesId: 'bulbasaur',
              moveset: ['VINE_WHIP', 'POWER_WHIP', 'SLUDGE_BOMB'],
              moves: {
                fastMoves: [{ moveId: 'VINE_WHIP', uses: 15_000 }],
                chargedMoves: [
                  { moveId: 'POWER_WHIP', uses: 60 },
                  { moveId: 'SLUDGE_BOMB', uses: 40 },
                ],
              },
            }),
          ],
        }),
      ]),
    );
    expect(result.overrideEvidence).toContainEqual({
      formatId: 'weather-cup',
      cp: 1500,
      cup: 'weather',
      entries: [
        {
          speciesId: 'bulbasaur',
          fastMove: 'VINE_WHIP',
          chargedMoves: ['POWER_WHIP', 'SLUDGE_BOMB'],
          weight: 2,
        },
      ],
    });

    expect(writeFile).toHaveBeenCalledTimes(56);
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'rankings', 'cp1500', 'all', 'overall_rankings.csv'),
      expect.stringContaining('Pokemon,Score,Dex,Type 1,Type 2'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'rankings', 'cp2500', 'all', 'leads_rankings.csv'),
      expect.stringContaining('Bulbasaur'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'rankings', 'cp10000', 'all', 'switches_rankings.csv'),
      expect.stringContaining('Bulbasaur'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join(
        'data',
        'rankings',
        'cp1500',
        'weather',
        'overall_rankings.csv',
      ),
      expect.stringContaining('Bulbasaur'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join(
        'data',
        'rankings',
        'cp1500',
        'copadiluvio',
        'overall_rankings.csv',
      ),
      expect.stringContaining('Bulbasaur'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'rankings', 'cp1500', 'tsuki', 'leads_rankings.csv'),
      expect.stringContaining('Bulbasaur'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join(
        'data',
        'rankings',
        'cp2500',
        'ligaultra',
        'switches_rankings.csv',
      ),
      expect.stringContaining('Bulbasaur'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join(
        'data',
        'rankings',
        'cp10000',
        'coupedusillage',
        'closers_rankings.csv',
      ),
      expect.stringContaining('Bulbasaur'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'rankings', 'cp1500', 'all', 'chargers_rankings.csv'),
      expect.stringContaining('Bulbasaur'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'rankings', 'cp2500', 'all', 'attackers_rankings.csv'),
      expect.stringContaining('Bulbasaur'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join(
        'data',
        'rankings',
        'cp10000',
        'all',
        'consistency_rankings.csv',
      ),
      expect.stringContaining('Bulbasaur'),
    );
  });

  it('throws when ranking references a move missing from moves data', async () => {
    await expect(
      scrapeRankings(
        { sourcePath: '/source/pvpoke' },
        {
          createAdapter: () => ({
            readMovesetOverridesJson: async () => [],
            readRankingJson: async () => [
              {
                speciesId: 'bulbasaur',
                speciesName: 'Bulbasaur',
                score: 90.5,
                moveset: ['VINE_WHIP', 'POWER_WHIP', 'SLUDGE_BOMB'],
                moves: {
                  fastMoves: [{ moveId: 'VINE_WHIP', uses: 10 }],
                  chargedMoves: [
                    { moveId: 'POWER_WHIP', uses: 8 },
                    { moveId: 'SLUDGE_BOMB', uses: 2 },
                  ],
                },
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

  it('skips ranking entries missing from gamemaster pokemon data', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);

    const result = await scrapeRankings(
      { sourcePath: '/source/pvpoke' },
      {
        createAdapter: () => ({
          readMovesetOverridesJson: async () => [],
          readRankingJson: async () => [
            {
              speciesId: 'bulbasaur',
              speciesName: 'Bulbasaur',
              score: 90.5,
              moveset: ['VINE_WHIP', 'POWER_WHIP', 'SLUDGE_BOMB'],
              moves: {
                fastMoves: [{ moveId: 'VINE_WHIP', uses: 10 }],
                chargedMoves: [
                  { moveId: 'POWER_WHIP', uses: 8 },
                  { moveId: 'SLUDGE_BOMB', uses: 2 },
                ],
              },
              stats: { atk: 102.1, def: 99.5, hp: 122 },
            },
            {
              speciesId: 'kingler_shadow',
              speciesName: 'Kingler (Shadow)',
              score: 88.4,
              moveset: ['BUBBLE', 'CRABHAMMER', 'X_SCISSOR'],
              moves: {
                fastMoves: [{ moveId: 'BUBBLE', uses: 10 }],
                chargedMoves: [
                  { moveId: 'CRABHAMMER', uses: 7 },
                  { moveId: 'X_SCISSOR', uses: 3 },
                ],
              },
              stats: { atk: 100, def: 100, hp: 100 },
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
                  cp2500: [50, 15, 15, 15],
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

    expect(result.rankings).toHaveLength(56);
    expect(
      result.rankings.every((entry) => entry.Pokemon === 'Bulbasaur'),
    ).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'rankings', 'cp1500', 'tsuki', 'overall_rankings.csv'),
      expect.not.stringContaining('Kingler (Shadow)'),
    );
  });

  it('normalizes non-choosable battle forms to choosable forms', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);

    const result = await scrapeRankings(
      { sourcePath: '/source/pvpoke' },
      {
        createAdapter: () => ({
          readMovesetOverridesJson: async () => [],
          readRankingJson: async () => [
            {
              speciesId: 'morpeko_hangry',
              speciesName: 'Morpeko (Hangry)',
              score: 88.1,
              moveset: ['BITE', 'AURA_WHEEL_DARK', 'OUTRAGE'],
              moves: {
                fastMoves: [{ moveId: 'BITE', uses: 30 }],
                chargedMoves: [
                  { moveId: 'AURA_WHEEL_DARK', uses: 20 },
                  { moveId: 'OUTRAGE', uses: 10 },
                ],
              },
              stats: { atk: 100, def: 100, hp: 100 },
            },
            {
              speciesId: 'aegislash_blade',
              speciesName: 'Aegislash (Blade)',
              score: 87.2,
              moveset: ['PSYCHO_CUT', 'SHADOW_BALL', 'GYRO_BALL'],
              moves: {
                fastMoves: [{ moveId: 'PSYCHO_CUT', uses: 25 }],
                chargedMoves: [
                  { moveId: 'SHADOW_BALL', uses: 15 },
                  { moveId: 'GYRO_BALL', uses: 5 },
                ],
              },
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

    expect(
      result.rankings.some((entry) => entry.Pokemon === 'Morpeko (Hangry)'),
    ).toBe(false);
    expect(
      result.rankings.some((entry) => entry.Pokemon === 'Aegislash (Blade)'),
    ).toBe(false);
    expect(
      result.rankings.some((entry) => entry.Pokemon === 'Morpeko (Full Belly)'),
    ).toBe(true);
    expect(
      result.rankings.some((entry) => entry.Pokemon === 'Aegislash (Shield)'),
    ).toBe(true);
    expect(
      result.categoryEvidence.find(
        ({ formatId, category }) =>
          formatId === 'great-league' && category === 'overall',
      )?.entries,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          speciesId: 'morpeko_full_belly',
          sourceEntries: [
            expect.objectContaining({
              sourceSpeciesId: 'morpeko_hangry',
              canonicalSpeciesId: 'morpeko_full_belly',
              speciesAliasKind: 'battle-state',
              moveset: ['BITE', 'AURA_WHEEL_DARK', 'OUTRAGE'],
            }),
          ],
        }),
        expect.objectContaining({
          speciesId: 'aegislash_shield',
          sourceEntries: [
            expect.objectContaining({
              sourceSpeciesId: 'aegislash_blade',
              canonicalSpeciesId: 'aegislash_shield',
              speciesAliasKind: 'battle-state',
              moveset: ['PSYCHO_CUT', 'SHADOW_BALL', 'GYRO_BALL'],
            }),
          ],
        }),
      ]),
    );

    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'rankings', 'cp1500', 'all', 'overall_rankings.csv'),
      expect.stringContaining('Morpeko (Full Belly)'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      path.join('data', 'rankings', 'cp1500', 'all', 'overall_rankings.csv'),
      expect.not.stringContaining('Morpeko (Hangry)'),
    );
  });
});

describe('ranking source validation', () => {
  it('accepts nullable move usage from PvPoke source evidence', () => {
    expect(
      parseRankingSourceEntries(
        [
          {
            speciesId: 'aegislash_shield',
            speciesName: 'Aegislash (Shield)',
            score: 80,
            moveset: ['PSYCHO_CUT', 'SHADOW_BALL', 'GYRO_BALL'],
            moves: {
              fastMoves: [{ moveId: 'PSYCHO_CUT', uses: 10 }],
              chargedMoves: [{ moveId: 'SHADOW_BALL', uses: null }],
            },
          },
        ],
        'overall',
      )[0].moves.chargedMoves[0].uses,
    ).toBeNull();
  });

  it('rejects malformed ranking move evidence', () => {
    expect(() =>
      parseRankingSourceEntries(
        [
          {
            speciesId: 'bulbasaur',
            speciesName: 'Bulbasaur',
            score: 90,
            moveset: ['VINE_WHIP', 'POWER_WHIP', 'SLUDGE_BOMB'],
          },
        ],
        'overall',
      ),
    ).toThrowError(
      '[sync-rankings] Invalid overall ranking source entry 0: moves must be an object',
    );
    expect(() =>
      parseRankingSourceEntries(
        [
          {
            speciesId: 'bulbasaur',
            speciesName: 'Bulbasaur',
            score: 90,
            moveset: ['VINE_WHIP', 'POWER_WHIP', 'SLUDGE_BOMB'],
            moves: {
              fastMoves: [{ moveId: 'VINE_WHIP', uses: -1 }],
              chargedMoves: [],
            },
          },
        ],
        'overall',
      ),
    ).toThrowError(
      '[sync-rankings] Invalid overall ranking source entry 0: moves.fastMoves[0].uses must be a non-negative finite number or null',
    );
  });

  it('rejects malformed explicit moveset overrides', () => {
    expect(() => parseMovesetOverrides({}, 'cp1500 all')).toThrowError(
      '[sync-rankings] Invalid cp1500 all moveset overrides: expected an array',
    );
    expect(() =>
      parseMovesetOverrides(
        [{ speciesId: 'bulbasaur', chargedMoves: ['POWER_WHIP', 42] }],
        'cp1500 all',
      ),
    ).toThrowError(
      '[sync-rankings] Invalid cp1500 all moveset override 0: chargedMoves must contain strings',
    );
  });
});
