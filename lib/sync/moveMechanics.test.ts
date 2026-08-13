import { describe, expect, it } from 'vitest';
import { rankViableMoves } from './moveMechanics';
import type { Move } from '@/lib/types';

const createMove = (move: Partial<Move> & Pick<Move, 'moveId'>): Move => {
  const { moveId, name, ...overrides } = move;
  return {
    moveId,
    name: name ?? moveId,
    type: 'water',
    power: 0,
    energy: 0,
    energyGain: 0,
    cooldown: 500,
    archetype: 'General',
    turns: 1,
    ...overrides,
  };
};

describe('move mechanics ranking', () => {
  it('rejects strictly dominated speculative moves', () => {
    const result = rankViableMoves({
      pokemonTypes: ['water'],
      moves: [
        createMove({
          moveId: 'WEAK_FAST',
          power: 4,
          energyGain: 6,
          turns: 2,
        }),
        createMove({
          moveId: 'STRONG_FAST',
          power: 6,
          energyGain: 8,
          turns: 2,
        }),
        createMove({ moveId: 'WEAK_CHARGED', power: 60, energy: 50 }),
        createMove({ moveId: 'STRONG_CHARGED', power: 80, energy: 45 }),
      ],
      fastMoveCandidates: [
        { moveId: 'WEAK_FAST', source: 'usage' },
        { moveId: 'STRONG_FAST', source: 'usage' },
      ],
      chargedMoveCandidates: [
        { moveId: 'WEAK_CHARGED', source: 'usage' },
        { moveId: 'STRONG_CHARGED', source: 'usage' },
      ],
    });

    expect(result.fastMoves.map(({ moveId }) => moveId)).toEqual([
      'STRONG_FAST',
    ]);
    expect(result.chargedMoves.map(({ moveId }) => moveId)).toEqual([
      'STRONG_CHARGED',
    ]);
    expect(result.rejectedMoves).toEqual([
      {
        moveId: 'WEAK_FAST',
        slot: 'fast',
        dominatedByMoveId: 'STRONG_FAST',
      },
      {
        moveId: 'WEAK_CHARGED',
        slot: 'charged',
        dominatedByMoveId: 'STRONG_CHARGED',
      },
    ]);
  });

  it('reports fast and charged mechanics from checked-in battle rules', () => {
    const result = rankViableMoves({
      pokemonTypes: ['grass', 'poison'],
      moves: [
        createMove({
          moveId: 'VINE_WHIP',
          type: 'grass',
          power: 5,
          energyGain: 8,
          turns: 2,
        }),
        createMove({
          moveId: 'SLUDGE_BOMB',
          type: 'poison',
          power: 80,
          energy: 50,
        }),
      ],
      fastMoveCandidates: [{ moveId: 'VINE_WHIP', source: 'observed' }],
      chargedMoveCandidates: [{ moveId: 'SLUDGE_BOMB', source: 'observed' }],
    });

    expect(result.fastMoves[0]).toMatchObject({
      moveId: 'VINE_WHIP',
      type: 'grass',
      dpt: 2.5,
      ept: 4,
      turns: 2,
      hasStab: true,
    });
    expect(result.fastMoves[0]?.superEffectiveAgainst).toEqual([
      'ground',
      'rock',
      'water',
    ]);
    expect(result.chargedMoves[0]).toMatchObject({
      moveId: 'SLUDGE_BOMB',
      type: 'poison',
      power: 80,
      dpe: 1.6,
      energy: 50,
      hasStab: true,
      firstChargePacing: [{ fastMoveId: 'VINE_WHIP', moveCount: 7, turns: 14 }],
      expectedStatusEffects: [],
    });
  });

  it('retains a higher-power nuke when an efficient move has better DPE', () => {
    const result = rankViableMoves({
      pokemonTypes: ['water'],
      moves: [
        createMove({
          moveId: 'WATER_FAST',
          power: 5,
          energyGain: 8,
          turns: 2,
        }),
        createMove({ moveId: 'EFFICIENT', power: 70, energy: 40 }),
        createMove({ moveId: 'NUKE', power: 130, energy: 75 }),
      ],
      fastMoveCandidates: [{ moveId: 'WATER_FAST', source: 'usage' }],
      chargedMoveCandidates: [
        { moveId: 'EFFICIENT', source: 'usage' },
        { moveId: 'NUKE', source: 'usage' },
      ],
    });

    expect(result.chargedMoves.map(({ moveId }) => moveId)).toEqual([
      'EFFICIENT',
      'NUKE',
    ]);
  });

  it('retains bait, status, distinct coverage, and observed moves', () => {
    const result = rankViableMoves({
      pokemonTypes: ['water'],
      moves: [
        createMove({
          moveId: 'WATER_FAST',
          power: 5,
          energyGain: 8,
          turns: 2,
        }),
        createMove({ moveId: 'BASELINE', power: 100, energy: 50 }),
        createMove({ moveId: 'BAIT', power: 35, energy: 35 }),
        createMove({
          moveId: 'BUFF',
          power: 40,
          energy: 50,
          buffs: [1, 0],
          buffTarget: 'self',
          buffApplyChance: '.5',
        }),
        createMove({
          moveId: 'DEBUFF',
          power: 40,
          energy: 50,
          buffs: [0, -2],
          buffTarget: 'opponent',
          buffApplyChance: '.5',
        }),
        createMove({
          moveId: 'COVERAGE',
          type: 'grass',
          power: 40,
          energy: 50,
        }),
        createMove({ moveId: 'OBSERVED_WEAK', power: 40, energy: 50 }),
      ],
      fastMoveCandidates: [{ moveId: 'WATER_FAST', source: 'usage' }],
      chargedMoveCandidates: [
        { moveId: 'BASELINE', source: 'usage' },
        { moveId: 'BAIT', source: 'usage' },
        { moveId: 'BUFF', source: 'usage' },
        { moveId: 'DEBUFF', source: 'usage' },
        { moveId: 'COVERAGE', source: 'usage' },
        { moveId: 'OBSERVED_WEAK', source: 'observed' },
      ],
    });

    expect(result.chargedMoves.map(({ moveId }) => moveId)).toEqual([
      'BASELINE',
      'BAIT',
      'BUFF',
      'DEBUFF',
      'COVERAGE',
      'OBSERVED_WEAK',
    ]);
    expect(
      result.chargedMoves.find(({ moveId }) => moveId === 'BUFF')
        ?.expectedStatusEffects,
    ).toEqual([
      {
        target: 'self',
        chance: 0.5,
        attackStageDelta: 1,
        defenseStageDelta: 0,
        expectedAttackStageDelta: 0.5,
        expectedDefenseStageDelta: 0,
      },
    ]);
    expect(
      result.chargedMoves.find(({ moveId }) => moveId === 'DEBUFF')
        ?.expectedStatusEffects,
    ).toEqual([
      {
        target: 'opponent',
        chance: 0.5,
        attackStageDelta: 0,
        defenseStageDelta: -2,
        expectedAttackStageDelta: 0,
        expectedDefenseStageDelta: -1,
      },
    ]);
  });

  it('represents effects that target both battlers separately', () => {
    const result = rankViableMoves({
      pokemonTypes: ['dark'],
      moves: [
        createMove({
          moveId: 'COUNTER',
          type: 'fighting',
          power: 8,
          energyGain: 7,
          turns: 2,
        }),
        createMove({
          moveId: 'OBSTRUCT',
          type: 'dark',
          power: 15,
          energy: 40,
          buffs: [0, 1],
          buffsSelf: [0, 1],
          buffsOpponent: [0, -1],
          buffTarget: 'both',
          buffApplyChance: '1',
        }),
      ],
      fastMoveCandidates: [{ moveId: 'COUNTER', source: 'observed' }],
      chargedMoveCandidates: [{ moveId: 'OBSTRUCT', source: 'observed' }],
    });

    expect(result.chargedMoves[0]?.expectedStatusEffects).toEqual([
      expect.objectContaining({ target: 'self', defenseStageDelta: 1 }),
      expect.objectContaining({ target: 'opponent', defenseStageDelta: -1 }),
    ]);
  });

  it.each(['observed', 'override'] as const)(
    'retains dominated %s evidence in both move slots',
    (source) => {
      const result = rankViableMoves({
        pokemonTypes: ['water'],
        moves: [
          createMove({
            moveId: 'STRONG_FAST',
            power: 6,
            energyGain: 8,
            turns: 2,
          }),
          createMove({
            moveId: 'PROTECTED_FAST',
            power: 4,
            energyGain: 6,
            turns: 2,
          }),
          createMove({
            moveId: 'STRONG_CHARGED',
            power: 80,
            energy: 45,
          }),
          createMove({
            moveId: 'PROTECTED_CHARGED',
            power: 60,
            energy: 50,
          }),
        ],
        fastMoveCandidates: [
          { moveId: 'STRONG_FAST', source: 'usage' },
          { moveId: 'PROTECTED_FAST', source },
        ],
        chargedMoveCandidates: [
          { moveId: 'STRONG_CHARGED', source: 'usage' },
          { moveId: 'PROTECTED_CHARGED', source },
        ],
      });

      expect(result.fastMoves.map(({ moveId }) => moveId)).toContain(
        'PROTECTED_FAST',
      );
      expect(result.chargedMoves.map(({ moveId }) => moveId)).toContain(
        'PROTECTED_CHARGED',
      );
    },
  );

  it('rejects contradictory status-effect targets', () => {
    expect(() =>
      rankViableMoves({
        pokemonTypes: ['water'],
        moves: [
          createMove({
            moveId: 'WATER_FAST',
            power: 5,
            energyGain: 8,
            turns: 2,
          }),
          createMove({
            moveId: 'INVALID_BUFF',
            power: 40,
            energy: 50,
            buffsSelf: [1, 0],
            buffTarget: 'opponent',
            buffApplyChance: '1',
          }),
        ],
        fastMoveCandidates: [{ moveId: 'WATER_FAST', source: 'usage' }],
        chargedMoveCandidates: [{ moveId: 'INVALID_BUFF', source: 'usage' }],
      }),
    ).toThrowError(/contradictory status fields/);
  });
});
