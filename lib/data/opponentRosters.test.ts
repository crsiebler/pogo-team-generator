import { describe, expect, it } from 'vitest';
import {
  loadOpponentRosters,
  validateCuratedOpponentRosters,
} from './opponentRosters';
import { getPokemonBySpeciesId } from './pokemon';
import { getRankedSpeciesIds } from './rankings';
import { ensureSimulationDataAvailable } from './simulations';
import { isTeamLegalForFormat } from '@/lib/genetic/teamLegality';

describe('opponent roster corpus', () => {
  it('rejects stale, illegal, malformed and cross-partition curated evidence', () => {
    ensureSimulationDataAvailable('play-pokemon');
    const dataset = loadOpponentRosters('play-pokemon');
    const [a, b] = dataset.rosters;
    const record = {
      ...a,
      source: 'curated',
      provenance: 'https://example.org/verified-roster',
      context: 'Controlled validation fixture, not real usage',
      verifiedOn: '2026-10-21',
    };
    const input = {
      schemaVersion: 1,
      formatId: dataset.formatId,
      snapshotFingerprint: dataset.fingerprint,
      rosters: [record],
    };
    expect(validateCuratedOpponentRosters(input, dataset).rosters).toHaveLength(
      1,
    );
    expect(
      validateCuratedOpponentRosters(
        { ...input, snapshotFingerprint: 'old' },
        dataset,
      ).excluded[0],
    ).toMatch(/stale/);
    expect(() =>
      validateCuratedOpponentRosters(
        { ...input, formatId: 'ultra-league' },
        dataset,
      ),
    ).toThrow(/format/);
    expect(() =>
      validateCuratedOpponentRosters(
        { ...input, rosters: [{ ...record, verifiedOn: null }] },
        dataset,
      ),
    ).toThrow(/verification date/);
    expect(
      validateCuratedOpponentRosters(
        {
          ...input,
          rosters: [
            { ...record, species: [...a.species.slice(0, 5), 'not_a_species'] },
          ],
        },
        dataset,
      ).excluded,
    ).toHaveLength(1);
    expect(() =>
      validateCuratedOpponentRosters(
        {
          ...input,
          rosters: [
            record,
            {
              ...record,
              id: 'second',
              species: b.species,
              partition: 'held-out',
              assignment: b.assignment,
            },
          ],
        },
        dataset,
      ),
    ).toThrow(/cannot cross/);
    expect(
      validateCuratedOpponentRosters(
        { ...input, rosters: [record, { ...record, id: 'duplicate' }] },
        dataset,
      ).excluded[0],
    ).toMatch(/duplicate/);
  });
  it('freezes reproducible format-legal synthetic scenarios with isolated families', () => {
    ensureSimulationDataAvailable('play-pokemon');
    const first = loadOpponentRosters('play-pokemon');
    const second = loadOpponentRosters('play-pokemon');
    expect(second).toEqual(first);
    expect(first.rosters.length).toBeGreaterThanOrEqual(24);
    const ranked = getRankedSpeciesIds('play-pokemon');
    // Lower-ranked legal specialists must be represented, not just the leaders
    // that the search is most likely to stack together.
    const leaders = new Set([...ranked].slice(0, 60));
    expect(
      first.rosters.some(
        (r) =>
          r.partition === 'selection' &&
          r.species.some((id) => !leaders.has(id)),
      ),
    ).toBe(true);
    for (const roster of first.rosters) {
      expect(roster.source).toBe('synthetic');
      expect(roster.species).toHaveLength(6);
      expect(
        new Set(roster.species.map((id) => getPokemonBySpeciesId(id)!.dex))
          .size,
      ).toBe(6);
      expect(roster.species.every((id) => ranked.has(id))).toBe(true);
      expect(isTeamLegalForFormat(roster.species, 'play-pokemon')).toBe(true);
      expect(Object.keys(roster.assignment.variantsBySpeciesId).sort()).toEqual(
        [...roster.species].sort(),
      );
      for (const other of first.rosters)
        if (roster.id !== other.id) {
          expect(
            roster.species.filter((id) => other.species.includes(id)).length,
          ).toBeLessThan(5);
        }
    }
    expect(new Set(first.rosters.map((r) => r.id)).size).toBe(
      first.rosters.length,
    );
    expect(
      new Set(
        first.rosters
          .filter((r) => r.partition === 'held-out')
          .map((r) => r.family),
      ).intersection(
        new Set(
          first.rosters
            .filter((r) => r.partition === 'selection')
            .map((r) => r.family),
        ),
      ).size,
    ).toBe(0);
  });
});
