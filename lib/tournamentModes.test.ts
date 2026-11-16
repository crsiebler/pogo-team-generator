import { describe, expect, it } from 'vitest';
import { BATTLE_FORMATS } from '@/lib/data/battleFormats';
import { getRequiredTournamentMode } from '@/lib/tournamentModes';

describe('required tournament modes', () => {
  it.each(
    BATTLE_FORMATS.filter(
      ({ id, label }) =>
        id === 'play-pokemon' ||
        label.startsWith('Battle Frontier') ||
        label.startsWith('Devon ') ||
        label.startsWith('Gymbreakers') ||
        label.includes('Championship Series'),
    ),
  )('requires Show 6 Pick 3 for $label', ({ id }) => {
    expect(getRequiredTournamentMode(id)).toBe('PlayPokemon');
  });

  it('requires Pick 3 for LAIC GBL', () => {
    expect(getRequiredTournamentMode('laic-2027-gbl-cup')).toBe('GBL');
  });

  it.each(['great-league', 'ultra-league', 'master-league'] as const)(
    'preserves the mode choice for %s',
    (formatId) => {
      expect(getRequiredTournamentMode(formatId)).toBeUndefined();
    },
  );
});
