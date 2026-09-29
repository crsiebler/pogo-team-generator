import { describe, expect, it } from 'vitest';
import { isTeamLegalForFormat } from './teamLegality';

describe('format team legality', () => {
  it('rejects Battle Frontier Master until current rules are verified', () => {
    expect(() =>
      isTeamLegalForFormat(
        ['palkia_origin', 'eternatus', 'swampert_mega'],
        'battle-frontier-master',
      ),
    ).toThrow(/current cycle rules/);
    expect(() =>
      isTeamLegalForFormat(
        ['palkia_origin', 'mewtwo', 'gallade_mega'],
        'battle-frontier-master',
      ),
    ).toThrow(/current cycle rules/);
  });

  it('enforces one Mega for Mega-enabled cup formats', () => {
    const team = ['swampert_mega', 'gallade_mega', 'mewtwo'];

    expect(isTeamLegalForFormat(team, 'laic-2027-cup')).toBe(false);
    expect(isTeamLegalForFormat(team, 'cauldron-cup')).toBe(false);
  });
});
