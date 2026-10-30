import { describe, expect, it } from 'vitest';
import type { TournamentPlan } from './opponentRosterEvaluation';
import { evaluateRosterFlexibility } from './rosterFlexibility';

function plan(
  lead: string,
  pivot: string,
  closer: string,
  qualities = [0.7],
): TournamentPlan {
  return {
    lineup: { lead, switch: pivot, closer },
    trioId: [lead, pivot, closer].sort().join('|'),
    typical: 0.7,
    lowerTail: 0.7,
    qualityByRoster: qualities,
  };
}

describe('practical roster flexibility', () => {
  it('does not credit identical vulnerable pivots as independent', () => {
    const roster = ['a', 'b', 'c', 'd', 'e', 'f'];
    const plans = [plan('a', 'b', 'c'), plan('a', 'd', 'e')];
    const profiles = roster.map(() => [1, 1, 1, 1, 1, 1]);
    profiles[1] = [0, 1, 1, 1, 1, 1];
    profiles[3] = [0, 1, 1, 1, 1, 1];

    const result = evaluateRosterFlexibility(roster, plans, [0.7], profiles);
    expect(result.independentPivotCount).toBe(1);
    expect(result.independence).toBe(0);
  });

  it('values pivots with different counters above two copies of the same vulnerability', () => {
    const roster = ['a', 'b', 'c', 'd', 'e', 'f'];
    const plans = [plan('a', 'b', 'c'), plan('a', 'd', 'e')];
    const shared = roster.map(() => [1, 1, 1, 1, 1, 1]);
    shared[1] = [0, 0, 1, 1, 1, 1];
    shared[3] = [0, 0, 1, 1, 1, 1];
    const independent = shared.map((row) => [...row]);
    independent[3] = [1, 1, 0, 0, 1, 1];
    expect(
      evaluateRosterFlexibility(roster, plans, [0.7], independent).independence,
    ).toBeCloseTo(4 / 6);
    expect(
      evaluateRosterFlexibility(roster, plans, [0.7], shared).independence,
    ).toBe(0);
  });
  it('cannot protect a core with answers from different unavailable third members', () => {
    const roster = ['a', 'b', 'c', 'd', 'e', 'f'];
    const profiles = [
      [0, 0, 1, 1, 1, 1],
      [0, 0, 1, 1, 1, 1],
      [1, 0, 1, 1, 1, 1],
      [0, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
    ];
    const result = evaluateRosterFlexibility(
      roster,
      [plan('a', 'b', 'c'), plan('a', 'b', 'd')],
      [0.7],
      profiles,
    );
    expect(result.protectedCoreCount).toBe(0);
    expect(result.independence).toBe(0);
  });
  it('permutations cannot create marginal value or additional independent pivots', () => {
    const roster = ['a', 'b', 'c', 'd', 'e', 'f'];
    const first = plan('a', 'b', 'c');
    const profiles = roster.map(() => [1, 1, 1, 1, 1, 1]);
    expect(
      evaluateRosterFlexibility(roster, [first, first, first], [0.7], profiles),
    ).toEqual(evaluateRosterFlexibility(roster, [first], [0.7], profiles));
  });
});
