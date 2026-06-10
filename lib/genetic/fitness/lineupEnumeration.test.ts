import { describe, expect, it } from 'vitest';
import {
  PlayPokemonRosterValidationError,
  enumeratePlayPokemonLineups,
  getPlayPokemonLineupKey,
} from './lineupEnumeration';

const roster = [
  'clodsire',
  'azumarill',
  'skarmory',
  'lanturn',
  'talonflame',
  'registeel',
];

describe('PlayPokemon lineup enumeration', () => {
  it('enumerates exactly 120 ordered pick-3 lineups for a six-Pokemon roster', () => {
    const lineups = enumeratePlayPokemonLineups(roster);

    expect(lineups).toHaveLength(120);
    expect(new Set(lineups.map(getPlayPokemonLineupKey))).toHaveLength(120);
  });

  it('uses each roster member as a lead with twenty ordered switch and closer assignments', () => {
    const lineups = enumeratePlayPokemonLineups(roster);

    for (const lead of roster) {
      const leadLineups = lineups.filter((lineup) => lineup.lead === lead);
      const backlineKeys = leadLineups.map((lineup) =>
        [lineup.switch, lineup.closer].join('|'),
      );

      expect(leadLineups).toHaveLength(20);
      expect(new Set(backlineKeys)).toHaveLength(20);
      expect(
        leadLineups.every((lineup) => lineup.switch !== lineup.closer),
      ).toBe(true);
    }
  });

  it('preserves roster input order for lead iteration', () => {
    const lineups = enumeratePlayPokemonLineups(roster);
    const orderedLeads = lineups.filter((_, index) => index % 20 === 0);

    expect(orderedLeads.map((lineup) => lineup.lead)).toEqual(roster);
  });

  it('treats swapped switch and closer assignments as distinct lineup identities', () => {
    const lineups = enumeratePlayPokemonLineups(roster);

    const switchFirst = lineups.find(
      (lineup) =>
        lineup.lead === 'clodsire' &&
        lineup.switch === 'azumarill' &&
        lineup.closer === 'skarmory',
    );
    const closerFirst = lineups.find(
      (lineup) =>
        lineup.lead === 'clodsire' &&
        lineup.switch === 'skarmory' &&
        lineup.closer === 'azumarill',
    );

    expect(switchFirst).toBeDefined();
    expect(closerFirst).toBeDefined();
    expect(getPlayPokemonLineupKey(switchFirst!)).not.toBe(
      getPlayPokemonLineupKey(closerFirst!),
    );
  });

  it('treats the same three Pokemon with a different lead as distinct lineup identities', () => {
    const lineups = enumeratePlayPokemonLineups(roster);

    const clodsireLead = lineups.find(
      (lineup) =>
        lineup.lead === 'clodsire' &&
        lineup.switch === 'azumarill' &&
        lineup.closer === 'skarmory',
    );
    const azumarillLead = lineups.find(
      (lineup) =>
        lineup.lead === 'azumarill' &&
        lineup.switch === 'clodsire' &&
        lineup.closer === 'skarmory',
    );

    expect(clodsireLead).toBeDefined();
    expect(azumarillLead).toBeDefined();
    expect(getPlayPokemonLineupKey(clodsireLead!)).not.toBe(
      getPlayPokemonLineupKey(azumarillLead!),
    );
  });

  it('throws a typed validation error for non-six or duplicate rosters', () => {
    expect(() => enumeratePlayPokemonLineups(roster.slice(0, 5))).toThrow(
      PlayPokemonRosterValidationError,
    );
    expect(() =>
      enumeratePlayPokemonLineups([...roster.slice(0, 5), roster[0]]),
    ).toThrow(PlayPokemonRosterValidationError);
  });

  it('throws a typed validation error for invalid species identifiers', () => {
    expect(() =>
      enumeratePlayPokemonLineups([...roster.slice(0, 5), 'invalid|key']),
    ).toThrow(PlayPokemonRosterValidationError);
    expect(() =>
      enumeratePlayPokemonLineups([...roster.slice(0, 5), '']),
    ).toThrow(PlayPokemonRosterValidationError);
  });
});
