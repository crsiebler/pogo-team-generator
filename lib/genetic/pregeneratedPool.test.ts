import { describe, expect, it } from 'vitest';
import {
  parseRosterMovesetAssignment,
  validateRosterMovesetAssignmentAuthority,
} from './moveset';
import { selectPregeneratedTeam } from './pregeneratedPool';
import { getPregeneratedFingerprint } from './pregeneratedPool';
import {
  pregeneratedPools,
  pregeneratedSourceFingerprint,
} from './pregeneratedTeams';
import { isTeamLegalForFormat } from './teamLegality';
import { speciesNameToChoosableId } from '@/lib/data/pokemon';
import { getOverallRankings } from '@/lib/data/rankings';
import { getTeamPoolSourceFingerprint } from '@/lib/scripts/teamPoolSourceFingerprint';
import type { Chromosome } from '@/lib/types';

describe('pregenerated pool selection', () => {
  it('ships unconstrained and ranked-anchor pools for the supported combinations', () => {
    for (const [formatId, mode] of [
      ['play-pokemon', 'PlayPokemon'],
      ['great-league', 'PlayPokemon'],
      ['great-league', 'GBL'],
      ['ultra-league', 'PlayPokemon'],
      ['ultra-league', 'GBL'],
    ] as const) {
      const anchors = [
        ...new Set(
          getOverallRankings(formatId).flatMap(({ Pokemon }) => {
            const id = speciesNameToChoosableId(Pokemon);
            return id ? [id] : [];
          }),
        ),
      ].slice(0, 2);
      const relevant = pregeneratedPools.filter(
        (entry) => entry.formatId === formatId && entry.mode === mode,
      );
      expect(relevant.map(({ anchorSpeciesId }) => anchorSpeciesId)).toEqual([
        undefined,
        ...anchors,
      ]);
    }
  });
  it('matches the checked-in input and source fingerprints', () => {
    expect(pregeneratedSourceFingerprint).toBe(getTeamPoolSourceFingerprint());
    for (const entry of pregeneratedPools) {
      expect(entry.fingerprint).toBe(
        getPregeneratedFingerprint(entry.formatId),
      );
      expect(entry.teams.length).toBeGreaterThan(0);
      expect(entry.teams.length).toBeGreaterThan(1);
      const rosters = new Set<string>();
      for (const result of entry.teams) {
        expect(result.team).toHaveLength(entry.mode === 'GBL' ? 3 : 6);
        expect(isTeamLegalForFormat(result.team, entry.formatId)).toBe(true);
        expect(result.movesetAssignment?.formatId).toBe(entry.formatId);
        expect(() =>
          validateRosterMovesetAssignmentAuthority(
            parseRosterMovesetAssignment(
              result.movesetAssignment,
              result.team,
              entry.formatId,
            ),
          ),
        ).not.toThrow();
        expect(
          Object.keys(
            result.movesetAssignment?.variantsBySpeciesId ?? {},
          ).sort(),
        ).toEqual([...result.team].sort());
        if (entry.anchorSpeciesId)
          expect(result.team[0]).toBe(entry.anchorSpeciesId);
        if (entry.mode === 'PlayPokemon') {
          expect(result.tournamentSelection?.stage).toBe('selection');
          expect(result.scoreBreakdown?.score).toBe(result.fitness);
        }
        rosters.add([...result.team].sort().join('|'));
      }
      expect(rosters.size).toBe(entry.teams.length);
    }
  });
  const team = { team: ['a', 'b', 'c'], fitness: 1, anchors: [] } as Chromosome;
  const pool = {
    formatId: 'great-league' as const,
    mode: 'GBL' as const,
    fingerprint: 'current',
    teams: [team],
  };
  it('selects only a matching single-anchor pool', () => {
    const anchored = { ...pool, anchorSpeciesId: 'a' };
    expect(
      selectPregeneratedTeam(
        anchored,
        { formatId: 'great-league', mode: 'GBL', anchorPokemon: ['a'] },
        'current',
        0,
      ),
    ).toBe(team);
    expect(
      selectPregeneratedTeam(
        anchored,
        { formatId: 'great-league', mode: 'GBL', anchorPokemon: ['b'] },
        'current',
        0,
      ),
    ).toBeUndefined();
    expect(
      selectPregeneratedTeam(
        anchored,
        { formatId: 'great-league', mode: 'GBL' },
        'current',
        0,
      ),
    ).toBeUndefined();
    expect(
      selectPregeneratedTeam(
        anchored,
        { formatId: 'great-league', mode: 'GBL', anchorPokemon: ['a', 'b'] },
        'current',
        0,
      ),
    ).toBeUndefined();
  });
  it('uses matching unconstrained results and rejects stale or constrained requests', () => {
    expect(
      selectPregeneratedTeam(
        pool,
        { formatId: 'great-league', mode: 'GBL' },
        'current',
        0,
      ),
    ).toBe(team);
    expect(
      selectPregeneratedTeam(
        pool,
        { formatId: 'great-league', mode: 'GBL', anchorPokemon: ['a'] },
        'current',
        0,
      ),
    ).toBeUndefined();
    expect(
      selectPregeneratedTeam(
        pool,
        { formatId: 'great-league', mode: 'GBL', excludedPokemon: ['b'] },
        'current',
        0,
      ),
    ).toBeUndefined();
    expect(
      selectPregeneratedTeam(
        pool,
        {
          formatId: 'great-league',
          mode: 'GBL',
          simulateMovesetVariants: true,
        },
        'current',
        0,
      ),
    ).toBeUndefined();
    expect(
      selectPregeneratedTeam(
        pool,
        { formatId: 'great-league', mode: 'GBL' },
        'stale',
        0,
      ),
    ).toBeUndefined();
    expect(
      selectPregeneratedTeam(
        pool,
        { formatId: 'great-league', mode: 'PlayPokemon' },
        'current',
        0,
      ),
    ).toBeUndefined();
    expect(
      selectPregeneratedTeam(
        { ...pool, teams: [] },
        { formatId: 'great-league', mode: 'GBL' },
        'current',
        0,
      ),
    ).toBeUndefined();
    const other = { ...team, team: ['d', 'e', 'f'] };
    expect(
      selectPregeneratedTeam(
        { ...pool, teams: [team, other] },
        { formatId: 'great-league', mode: 'GBL' },
        'current',
        0.75,
      ),
    ).toBe(other);
  });
});
