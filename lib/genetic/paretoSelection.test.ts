import { describe, expect, it } from 'vitest';
import { cloneChromosome } from './chromosome';
import { selectElites, tournamentSelection } from './operators';
import {
  compareTournamentFinalists,
  selectParetoPopulation,
} from './paretoSelection';
import type { Chromosome, TournamentObjectives } from '@/lib/types';

function candidate(id: string, values: number[], fitness = 0): Chromosome {
  const [typical, lowerTail, flexibility, independence] = values;
  const objectives: TournamentObjectives = {
    typical,
    lowerTail,
    flexibility,
    independence,
    coverage: 0.5,
    redundancy: 0.5,
  };
  return {
    team: [id],
    fitness,
    tournamentSelection: {
      policyVersion: 'test',
      datasetFingerprint: 'shared',
      stage: 'search',
      source: 'synthetic',
      objectives,
      evaluatedRosters: 8,
      missingCells: 0,
      status: 'complete',
      limitations: [],
    },
  };
}

describe('tournament selection', () => {
  it('prefers repaired coverage and backup answers before sampled flexibility', () => {
    const fragile = candidate('fragile', [0.9, 0.9, 1, 1]);
    const repaired = candidate('repaired', [0.7, 0.7, 0.4, 0.4]);
    Object.assign(fragile.tournamentSelection!.objectives, {
      coverage: 0.7,
      redundancy: 0.4,
    });
    Object.assign(repaired.tournamentSelection!.objectives, {
      coverage: 0.8,
      redundancy: 0.6,
    });
    expect(compareTournamentFinalists(repaired, fragile)).toBeLessThan(0);
    fragile.tournamentSelection!.objectives.coverage = 0.8;
    expect(compareTournamentFinalists(repaired, fragile)).toBeLessThan(0);
  });
  it('clones objective metadata and uses it for elites and parent tournaments', () => {
    const winner = candidate('winner', [0.9, 0.9, 0.9, 0.9], 0);
    const loser = candidate('loser', [0.5, 0.5, 0.5, 0.5], 1);
    const copied = cloneChromosome(winner);
    copied.tournamentSelection!.objectives.typical = 0.1;
    expect(winner.tournamentSelection!.objectives.typical).toBe(0.9);
    expect(selectElites([loser, winner], 1, 'PlayPokemon')[0].team).toEqual(
      winner.team,
    );
    expect(tournamentSelection([winner], 3, compareTournamentFinalists)).toBe(
      winner,
    );
    expect(selectElites([loser, winner], 1, 'GBL')[0].team).toEqual(loser.team);
  });
  it('cannot let scalar fitness override dominance', () => {
    const better = candidate('better', [0.8, 0.7, 0.6, 0.5], 0);
    const worse = candidate('worse', [0.7, 0.6, 0.5, 0.4], 1);
    expect(selectParetoPopulation([worse, better], 1)).toEqual([better]);
  });

  it('preserves extremes of a tradeoff and is invariant to input order', () => {
    const a = candidate('a', [1, 1, 0, 0]);
    const b = candidate('b', [0, 0, 1, 1]);
    const middle = candidate('middle', [0.5, 0.5, 0.5, 0.5], 1);
    expect(selectParetoPopulation([middle, a, b], 2)).toEqual([a, b]);
    expect(selectParetoPopulation([b, middle, a], 2)).toEqual([a, b]);
  });

  it('handles constants, duplicates, invalid and absent evidence explicitly', () => {
    const a = candidate('a', [0.5, 0.5, 0.5, 0.5]);
    const b = candidate('b', [0.5, 0.5, 0.5, 0.5]);
    const missing: Chromosome = { team: ['missing'], fitness: 1 };
    const invalid = candidate('nan', [NaN, 1, 1, 1], 1);
    expect(
      selectParetoPopulation([b, a, a, missing, invalid], 3).map(
        (x) => x.team[0],
      ),
    ).toEqual(['a', 'b', 'missing']);
  });

  it('uses transitive robustness bands before flexibility, independent of scalar fitness', () => {
    const robust = candidate('robust', [0.6, 0.7, 0.3, 0.4], 0);
    const fragile = candidate('fragile', [0.9, 0.6, 1, 1], 1);
    const flexible = candidate('flexible', [0.6, 0.701, 0.8, 0.4]);
    expect(
      [fragile, robust, flexible].sort(compareTournamentFinalists),
    ).toEqual([flexible, robust, fragile]);
  });

  it('rejects comparisons across scenario identities', () => {
    const a = candidate('a', [1, 1, 1, 1]);
    const b = candidate('b', [1, 1, 1, 1]);
    b.tournamentSelection = {
      ...b.tournamentSelection!,
      datasetFingerprint: 'other',
    };
    expect(() => selectParetoPopulation([a, b], 1)).toThrow(
      /scenario|evidence/i,
    );
  });
});
