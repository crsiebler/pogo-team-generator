import { describe, expect, it, vi } from 'vitest';
import { createLineupAwareFitnessContext } from './fitness';
import { mutate } from './operators';
import { targetRosterMutation } from './targetedRosterMutation';
import type { Chromosome } from '@/lib/types';

const team = [
  'mimikyu',
  'carbink',
  'clodsire',
  'corviknight',
  'medicham',
  'umbreon',
];

describe('targeted roster mutation anchor preservation', () => {
  it('preserves a fully anchored roster without evaluating replacements', () => {
    const chromosome: Chromosome = {
      team: [...team],
      anchors: [0, 1, 2, 3, 4, 5],
      fitness: 0.5,
    };
    const context = createLineupAwareFitnessContext('play-pokemon');
    const evaluate = vi.spyOn(context, 'evaluateTournament');
    const targeted = targetRosterMutation(
      chromosome,
      ['araquanid'],
      context,
      'play-pokemon',
    );
    const random = mutate(
      chromosome,
      ['araquanid'],
      1,
      'PlayPokemon',
      'play-pokemon',
    );
    for (const result of [targeted, random]) {
      expect(result).toEqual(chromosome);
      expect(result).not.toBe(chromosome);
      expect(result.team).not.toBe(chromosome.team);
    }
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('retains all anchors when the only replacement is already on the roster', () => {
    const chromosome: Chromosome = {
      team: [...team],
      anchors: [0, 1, 2, 3, 4],
      fitness: 0.5,
    };
    const context = createLineupAwareFitnessContext('play-pokemon');
    const result = targetRosterMutation(
      chromosome,
      ['mimikyu'],
      context,
      'play-pokemon',
    );
    expect(result).toEqual(chromosome);
    expect(result).not.toBe(chromosome);
  });

  it('scores a legal replacement only in the unanchored slot', () => {
    const chromosome: Chromosome = {
      team: [...team],
      anchors: [0, 1, 2, 3, 4],
      fitness: 0.5,
    };
    const context = createLineupAwareFitnessContext('play-pokemon');
    const result = targetRosterMutation(
      chromosome,
      ['araquanid'],
      context,
      'play-pokemon',
    );
    expect(result.team).toEqual([...team.slice(0, 5), 'araquanid']);
    expect(result.anchors).toEqual(chromosome.anchors);
    expect(chromosome.team).toEqual(team);
    expect(result.tournamentSelection?.stage).toBeDefined();
    expect(result.fitness).toBe(result.tournamentSelection?.objectives.typical);
  });
});
