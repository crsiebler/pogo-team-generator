import { describe, expect, it } from 'vitest';
import { deriveMovesetCandidates } from './movesetCandidates';
import type {
  AggregatedMoveUsageEvidence,
  AggregatedRankingMoveEvidence,
  ObservedRankingMovesetEvidence,
  OverrideRankingMovesetEvidence,
} from './rankings';
import { getMovesetVariantId } from '@/lib/data/movesetVariants';
import type { Move, MoveAvailability } from '@/lib/types';

const createMove = (
  moveId: string,
  slot: 'fast' | 'charged',
  type = 'water',
): Move => {
  return {
    moveId,
    name: moveId,
    type,
    power: slot === 'fast' ? 5 : 80,
    energy: slot === 'fast' ? 0 : 50,
    energyGain: slot === 'fast' ? 8 : 0,
    cooldown: 500,
    archetype: slot === 'fast' ? 'Fast' : 'Charged',
    turns: slot === 'fast' ? 2 : 0,
  };
};

const createUsage = (
  moveId: string,
  weightedNormalizedUse: number,
): AggregatedMoveUsageEvidence => {
  return {
    moveId,
    categoryOccurrenceCount: 1,
    weightedNormalizedUse,
    overallUse: weightedNormalizedUse,
    evidencePriority: 1,
  };
};

const createObserved = (
  category: ObservedRankingMovesetEvidence['category'],
  moveset: readonly string[],
  isPreferred = false,
  sourceSpeciesId = 'testmon',
): ObservedRankingMovesetEvidence => {
  return {
    source: 'observed',
    evidencePriority: 0,
    category,
    categoryWeight: category === 'overall' ? 3 : 2,
    sourceSpeciesId,
    speciesAliasKind: null,
    isPreferred,
    moveset,
  };
};

const createOverride = (
  fastMove: string,
  chargedMoves: readonly string[],
): OverrideRankingMovesetEvidence => {
  return {
    source: 'override',
    evidencePriority: 0,
    sourceSpeciesId: 'testmon',
    fastMove,
    chargedMoves,
    weight: null,
  };
};

const createEvidence = (
  movesetEvidence: AggregatedRankingMoveEvidence['movesetEvidence'],
  fastMoves: readonly AggregatedMoveUsageEvidence[],
  chargedMoves: readonly AggregatedMoveUsageEvidence[],
  speciesId = 'testmon',
): AggregatedRankingMoveEvidence => {
  return {
    formatId: 'great-league',
    cup: 'all',
    cp: 1500,
    speciesId,
    pvpokeScorePrior: 90,
    movesetEvidence,
    fastMoves,
    chargedMoves,
  };
};

const allowAvailableMoves = (
  _speciesId: string,
  moveId: string,
): MoveAvailability => {
  return moveId === 'FRUSTRATION' || moveId === 'UNAVAILABLE'
    ? { kind: 'excluded', reason: `${moveId} is excluded.` }
    : { kind: 'regular' };
};

const allMoves = [
  createMove('FAST_A', 'fast'),
  createMove('FAST_B', 'fast'),
  createMove('FAST_C', 'fast'),
  createMove('FAST_UNUSED', 'fast'),
  createMove('ACID', 'fast', 'poison'),
  createMove('POISON_JAB', 'fast', 'poison'),
  createMove('PSYWAVE', 'fast', 'psychic'),
  createMove('QUICK_ATTACK', 'fast', 'normal'),
  createMove('CHARGED_A', 'charged'),
  createMove('CHARGED_B', 'charged'),
  createMove('CHARGED_C', 'charged', 'grass'),
  createMove('CHARGED_D', 'charged', 'flying'),
  createMove('CHARGED_E', 'charged', 'rock'),
  createMove('CHARGED_F', 'charged', 'electric'),
  createMove('FRUSTRATION', 'charged'),
  createMove('UNAVAILABLE', 'charged'),
];

describe('deriveMovesetCandidates', () => {
  it('seeds the eligible Overall default, role sets, and overrides', () => {
    const evidence = createEvidence(
      [
        createObserved('overall', ['FAST_A', 'CHARGED_A', 'CHARGED_B'], true),
        createObserved('leads', ['FAST_B', 'CHARGED_A', 'CHARGED_C']),
        createOverride('FAST_C', ['CHARGED_D', 'CHARGED_B']),
      ],
      [createUsage('FAST_A', 3), createUsage('FAST_B', 2)],
      [
        createUsage('CHARGED_A', 3),
        createUsage('CHARGED_B', 2),
        createUsage('CHARGED_C', 1),
        createUsage('CHARGED_D', 0.5),
      ],
    );

    const result = deriveMovesetCandidates({
      evidence,
      pokemonTypes: ['water'],
      moves: allMoves,
      getMoveAvailability: allowAvailableMoves,
    });

    expect(result.candidates[0]).toEqual({
      id: getMovesetVariantId({
        fastMove: 'FAST_A',
        chargedMove1: 'CHARGED_A',
        chargedMove2: 'CHARGED_B',
      }),
      isDefault: true,
      fastMove: 'FAST_A',
      chargedMove1: 'CHARGED_A',
      chargedMove2: 'CHARGED_B',
      evidence: {
        kind: 'preferred',
        sourceCategories: ['overall'],
        sourceVariantIds: [
          getMovesetVariantId({
            fastMove: 'FAST_A',
            chargedMove1: 'CHARGED_A',
            chargedMove2: 'CHARGED_B',
          }),
        ],
      },
    });
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fastMove: 'FAST_B',
          chargedMove1: 'CHARGED_A',
          chargedMove2: 'CHARGED_C',
          evidence: expect.objectContaining({
            kind: 'observed',
            sourceCategories: ['leads'],
          }),
        }),
        expect.objectContaining({
          fastMove: 'FAST_C',
          chargedMove1: 'CHARGED_D',
          chargedMove2: 'CHARGED_B',
          evidence: expect.objectContaining({
            kind: 'override',
            sourceCategories: [],
          }),
        }),
      ]),
    );
    expect(result.retainedFastMoves).toHaveLength(2);
    expect(result.retainedChargedMoves).toHaveLength(4);
    expect(result.candidates).toHaveLength(8);
  });

  it('expands observed sets by one evidence-backed move without a Cartesian product', () => {
    const evidence = createEvidence(
      [createObserved('overall', ['FAST_A', 'CHARGED_A', 'CHARGED_B'], true)],
      [createUsage('FAST_A', 3), createUsage('FAST_B', 2)],
      [
        createUsage('CHARGED_A', 3),
        createUsage('CHARGED_B', 2),
        createUsage('CHARGED_C', 1),
      ],
    );

    const result = deriveMovesetCandidates({
      evidence,
      pokemonTypes: ['water'],
      moves: allMoves,
      getMoveAvailability: allowAvailableMoves,
    });

    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fastMove: 'FAST_B',
          chargedMove1: 'CHARGED_A',
          chargedMove2: 'CHARGED_B',
        }),
        expect.objectContaining({
          fastMove: 'FAST_A',
          chargedMove1: 'CHARGED_C',
          chargedMove2: 'CHARGED_B',
        }),
        expect.objectContaining({
          fastMove: 'FAST_A',
          chargedMove1: 'CHARGED_A',
          chargedMove2: 'CHARGED_C',
        }),
      ]),
    );
    expect(
      result.candidates.some(
        ({ fastMove, chargedMove1, chargedMove2 }) =>
          fastMove === 'FAST_B' &&
          (chargedMove1 === 'CHARGED_C' || chargedMove2 === 'CHARGED_C'),
      ),
    ).toBe(false);
    expect(
      result.candidates.some(({ fastMove }) => fastMove === 'FAST_UNUSED'),
    ).toBe(false);
  });

  it('caps candidates and expansion move pools deterministically', () => {
    const roleMovesets = [
      ['FAST_B', 'CHARGED_A', 'CHARGED_B'],
      ['FAST_C', 'CHARGED_A', 'CHARGED_B'],
      ['FAST_B', 'CHARGED_A', 'CHARGED_C'],
      ['FAST_B', 'CHARGED_C', 'CHARGED_A'],
      ['FAST_C', 'CHARGED_A', 'CHARGED_C'],
      ['FAST_B', 'CHARGED_A', 'CHARGED_D'],
      ['FAST_C', 'CHARGED_A', 'CHARGED_D'],
      ['FAST_B', 'CHARGED_A', 'CHARGED_E'],
      ['FAST_C', 'CHARGED_A', 'CHARGED_E'],
      ['FAST_B', 'CHARGED_A', 'CHARGED_F'],
    ];
    const movesetEvidence = [
      createObserved('overall', ['FAST_A', 'CHARGED_A', 'CHARGED_B'], true),
      ...roleMovesets.map((moveset) => createObserved('leads', moveset)),
    ];
    const fastMoves = [
      createUsage('FAST_C', 1),
      createUsage('FAST_B', 2),
      createUsage('FAST_A', 3),
    ];
    const chargedMoves = [
      createUsage('CHARGED_F', 0.25),
      createUsage('CHARGED_E', 0.5),
      createUsage('CHARGED_D', 1),
      createUsage('CHARGED_C', 2),
      createUsage('CHARGED_B', 3),
      createUsage('CHARGED_A', 4),
    ];
    const evidence = createEvidence(movesetEvidence, fastMoves, chargedMoves);

    const result = deriveMovesetCandidates({
      evidence,
      pokemonTypes: ['water'],
      moves: allMoves,
      getMoveAvailability: allowAvailableMoves,
    });

    expect(result.retainedFastMoves).toEqual(['FAST_A', 'FAST_B']);
    expect(result.retainedChargedMoves).toEqual([
      'CHARGED_A',
      'CHARGED_B',
      'CHARGED_C',
      'CHARGED_D',
    ]);
    expect(result.candidates).toHaveLength(8);
    expect(new Set(result.candidates.map(({ id }) => id)).size).toBe(8);
    expect(result.candidates.filter(({ isDefault }) => isDefault)).toHaveLength(
      1,
    );
    const expectedRoleIds = Array.from(
      new Set(
        roleMovesets.map(([fastMove, chargedMove1, chargedMove2]) =>
          getMovesetVariantId({ fastMove, chargedMove1, chargedMove2 }),
        ),
      ),
    )
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 7);
    expect(result.candidates.map(({ id }) => id)).toEqual([
      getMovesetVariantId({
        fastMove: 'FAST_A',
        chargedMove1: 'CHARGED_A',
        chargedMove2: 'CHARGED_B',
      }),
      ...expectedRoleIds,
    ]);

    const shuffled = deriveMovesetCandidates({
      evidence: createEvidence(
        [...movesetEvidence].reverse(),
        [...fastMoves].reverse(),
        [...chargedMoves].reverse(),
      ),
      pokemonTypes: ['water'],
      moves: [...allMoves].reverse(),
      getMoveAvailability: allowAvailableMoves,
    });
    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(result));
  });

  it('applies partial overrides only to the preferred Overall baseline', () => {
    const evidence = createEvidence(
      [
        createObserved('overall', ['FAST_A', 'CHARGED_A', 'CHARGED_B'], true),
        {
          source: 'override',
          evidencePriority: 0,
          sourceSpeciesId: 'testmon',
          fastMove: 'FAST_B',
          weight: null,
        },
        {
          source: 'override',
          evidencePriority: 0,
          sourceSpeciesId: 'testmon',
          chargedMoves: ['CHARGED_C', 'CHARGED_D'],
          weight: null,
        },
        createOverride('FAST_C', ['CHARGED_A', 'CHARGED_C']),
      ],
      [createUsage('FAST_A', 3), createUsage('FAST_B', 2)],
      [
        createUsage('CHARGED_A', 3),
        createUsage('CHARGED_B', 2),
        createUsage('CHARGED_C', 1),
        createUsage('CHARGED_D', 0.5),
      ],
    );

    const result = deriveMovesetCandidates({
      evidence,
      pokemonTypes: ['water'],
      moves: allMoves,
      getMoveAvailability: allowAvailableMoves,
    });

    expect(result.candidates.slice(0, 4).map(({ id }) => id)).toEqual([
      getMovesetVariantId({
        fastMove: 'FAST_A',
        chargedMove1: 'CHARGED_A',
        chargedMove2: 'CHARGED_B',
      }),
      getMovesetVariantId({
        fastMove: 'FAST_A',
        chargedMove1: 'CHARGED_C',
        chargedMove2: 'CHARGED_D',
      }),
      getMovesetVariantId({
        fastMove: 'FAST_B',
        chargedMove1: 'CHARGED_A',
        chargedMove2: 'CHARGED_B',
      }),
      getMovesetVariantId({
        fastMove: 'FAST_C',
        chargedMove1: 'CHARGED_A',
        chargedMove2: 'CHARGED_C',
      }),
    ]);
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fastMove: 'FAST_B',
          chargedMove1: 'CHARGED_A',
          chargedMove2: 'CHARGED_B',
        }),
        expect.objectContaining({
          fastMove: 'FAST_A',
          chargedMove1: 'CHARGED_C',
          chargedMove2: 'CHARGED_D',
        }),
      ]),
    );

    const withoutBaseline = deriveMovesetCandidates({
      evidence: createEvidence(
        [
          {
            source: 'override',
            evidencePriority: 0,
            sourceSpeciesId: 'testmon',
            fastMove: 'FAST_B',
            weight: null,
          },
        ],
        [createUsage('FAST_B', 1)],
        [],
      ),
      pokemonTypes: ['water'],
      moves: allMoves,
      getMoveAvailability: allowAvailableMoves,
    });
    expect(withoutBaseline.candidates).toEqual([]);
  });

  it('rejects unavailable exact and speculative moves', () => {
    const evidence = createEvidence(
      [
        createObserved('overall', ['FAST_A', 'CHARGED_A', 'CHARGED_B'], true),
        createObserved('leads', ['FAST_A', 'CHARGED_A', 'FRUSTRATION']),
        createOverride('FAST_B', ['CHARGED_A', 'UNAVAILABLE']),
      ],
      [createUsage('FAST_A', 3), createUsage('FAST_B', 2)],
      [
        createUsage('CHARGED_A', 3),
        createUsage('CHARGED_B', 2),
        createUsage('FRUSTRATION', 1),
        createUsage('UNAVAILABLE', 0.5),
      ],
    );

    const result = deriveMovesetCandidates({
      evidence,
      pokemonTypes: ['water'],
      moves: allMoves,
      getMoveAvailability: allowAvailableMoves,
    });

    expect(result.retainedChargedMoves).not.toContain('FRUSTRATION');
    expect(result.retainedChargedMoves).not.toContain('UNAVAILABLE');
    for (const candidate of result.candidates) {
      expect([candidate.chargedMove1, candidate.chargedMove2]).not.toContain(
        'FRUSTRATION',
      );
      expect([candidate.chargedMove1, candidate.chargedMove2]).not.toContain(
        'UNAVAILABLE',
      );
    }
  });

  it('records and replaces Muk ranked Acid without changing its score prior', () => {
    const evidence = createEvidence(
      [
        createObserved('overall', ['ACID', 'CHARGED_A', 'CHARGED_B'], true),
        createObserved('leads', ['POISON_JAB', 'CHARGED_A', 'CHARGED_B']),
      ],
      [createUsage('ACID', 3), createUsage('POISON_JAB', 2)],
      [createUsage('CHARGED_A', 3), createUsage('CHARGED_B', 2)],
      'muk',
    );
    const result = deriveMovesetCandidates({
      evidence,
      pokemonTypes: ['poison'],
      moves: allMoves,
      getMoveAvailability: (speciesId, moveId) =>
        speciesId === 'muk' && moveId === 'ACID'
          ? {
              kind: 'excluded',
              reason: 'ACID does not have an approved legacy policy for muk.',
            }
          : { kind: 'regular' },
    });

    expect(result.pvpokeScorePrior).toBe(90);
    expect(result.rejections).toEqual([
      {
        sourceMoveset: {
          fastMove: 'ACID',
          chargedMove1: 'CHARGED_A',
          chargedMove2: 'CHARGED_B',
        },
        excludedMove: 'ACID',
        reason: 'ACID does not have an approved legacy policy for muk.',
      },
    ]);
    expect(result.candidates[0]).toMatchObject({
      fastMove: 'POISON_JAB',
      chargedMove1: 'CHARGED_A',
      chargedMove2: 'CHARGED_B',
      isDefault: true,
    });
    expect(result.candidates.filter(({ isDefault }) => isDefault)).toHaveLength(
      1,
    );
    expect(result.candidates.some(({ fastMove }) => fastMove === 'ACID')).toBe(
      false,
    );
  });

  it('repairs Starmie Quick Attack from deterministic usage evidence', () => {
    const evidence = createEvidence(
      [
        createObserved(
          'overall',
          ['QUICK_ATTACK', 'CHARGED_A', 'CHARGED_B'],
          true,
        ),
      ],
      [createUsage('QUICK_ATTACK', 3), createUsage('PSYWAVE', 2)],
      [createUsage('CHARGED_A', 3), createUsage('CHARGED_B', 2)],
      'starmie',
    );
    const getMoveAvailability = (
      speciesId: string,
      moveId: string,
    ): MoveAvailability =>
      speciesId === 'starmie' && moveId === 'QUICK_ATTACK'
        ? {
            kind: 'excluded',
            reason:
              'QUICK_ATTACK does not have an approved legacy policy for starmie.',
          }
        : { kind: 'regular' };

    const result = deriveMovesetCandidates({
      evidence,
      pokemonTypes: ['water', 'psychic'],
      moves: allMoves,
      getMoveAvailability,
    });
    const shuffled = deriveMovesetCandidates({
      evidence: {
        ...evidence,
        movesetEvidence: [...evidence.movesetEvidence].reverse(),
        fastMoves: [...evidence.fastMoves].reverse(),
        chargedMoves: [...evidence.chargedMoves].reverse(),
      },
      pokemonTypes: ['water', 'psychic'],
      moves: [...allMoves].reverse(),
      getMoveAvailability,
    });

    expect(result.rejections).toEqual([
      expect.objectContaining({
        excludedMove: 'QUICK_ATTACK',
        reason:
          'QUICK_ATTACK does not have an approved legacy policy for starmie.',
      }),
    ]);
    expect(result.candidates[0]).toMatchObject({
      fastMove: 'PSYWAVE',
      chargedMove1: 'CHARGED_A',
      chargedMove2: 'CHARGED_B',
      isDefault: true,
    });
    expect(
      result.candidates.some(({ fastMove }) => fastMove === 'QUICK_ATTACK'),
    ).toBe(false);
    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(result));
  });

  it('retains the Golisopod pseudo-form alternative as canonical evidence', () => {
    const evidence = createEvidence(
      [
        createObserved(
          'overall',
          ['FURY_CUTTER', 'X_SCISSOR', 'AQUA_JET'],
          true,
          'golisopod',
        ),
        {
          ...createObserved(
            'switches',
            ['SHADOW_CLAW', 'X_SCISSOR', 'AQUA_JET'],
            false,
            'golisopodsh',
          ),
          speciesAliasKind: 'moveset-variant',
        },
      ],
      [createUsage('FURY_CUTTER', 3), createUsage('SHADOW_CLAW', 2)],
      [createUsage('X_SCISSOR', 3), createUsage('AQUA_JET', 2)],
      'golisopod',
    );
    const moves = [
      createMove('FURY_CUTTER', 'fast', 'bug'),
      createMove('SHADOW_CLAW', 'fast', 'ghost'),
      createMove('X_SCISSOR', 'charged', 'bug'),
      createMove('AQUA_JET', 'charged', 'water'),
    ];

    const result = deriveMovesetCandidates({
      evidence,
      pokemonTypes: ['bug', 'water'],
      moves,
      getMoveAvailability: allowAvailableMoves,
    });

    expect(result.speciesId).toBe('golisopod');
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fastMove: 'FURY_CUTTER', isDefault: true }),
        expect.objectContaining({ fastMove: 'SHADOW_CLAW', isDefault: false }),
      ]),
    );
  });

  it('does not derive canonical candidates from battle-state movesets', () => {
    const battleStateMoveset = createObserved(
      'leads',
      ['FAST_B', 'CHARGED_C', 'CHARGED_D'],
      false,
      'testmon_battle_state',
    );
    const evidence = createEvidence(
      [
        createObserved('overall', ['FAST_A', 'CHARGED_A', 'CHARGED_B'], true),
        {
          ...battleStateMoveset,
          speciesAliasKind: 'battle-state',
        },
      ],
      [createUsage('FAST_A', 3), createUsage('FAST_B', 2)],
      [
        createUsage('CHARGED_A', 3),
        createUsage('CHARGED_B', 2),
        createUsage('CHARGED_C', 1),
        createUsage('CHARGED_D', 0.5),
      ],
    );

    const result = deriveMovesetCandidates({
      evidence,
      pokemonTypes: ['water'],
      moves: allMoves,
      getMoveAvailability: allowAvailableMoves,
    });

    expect(
      result.candidates.every(
        ({ fastMove, chargedMove1, chargedMove2 }) =>
          fastMove !== 'FAST_B' &&
          !['CHARGED_C', 'CHARGED_D'].includes(chargedMove1) &&
          !['CHARGED_C', 'CHARGED_D'].includes(chargedMove2),
      ),
    ).toBe(true);
  });

  it('produces byte-identical output for shuffled evidence and move data', () => {
    const movesetEvidence = [
      createObserved('overall', ['FAST_A', 'CHARGED_A', 'CHARGED_B'], true),
      createObserved('leads', ['FAST_B', 'CHARGED_A', 'CHARGED_C']),
      createOverride('FAST_C', ['CHARGED_D', 'CHARGED_B']),
    ];
    const fastMoves = [
      createUsage('FAST_A', 3),
      createUsage('FAST_B', 2),
      createUsage('FAST_C', 1),
    ];
    const chargedMoves = [
      createUsage('CHARGED_A', 3),
      createUsage('CHARGED_B', 2),
      createUsage('CHARGED_C', 1),
      createUsage('CHARGED_D', 0.5),
    ];
    const ordered = deriveMovesetCandidates({
      evidence: createEvidence(movesetEvidence, fastMoves, chargedMoves),
      pokemonTypes: ['water'],
      moves: allMoves,
      getMoveAvailability: allowAvailableMoves,
    });
    const shuffled = deriveMovesetCandidates({
      evidence: createEvidence(
        [...movesetEvidence].reverse(),
        [...fastMoves].reverse(),
        [...chargedMoves].reverse(),
      ),
      pokemonTypes: ['water'],
      moves: [...allMoves].reverse(),
      getMoveAvailability: allowAvailableMoves,
    });

    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(ordered));
  });
});
