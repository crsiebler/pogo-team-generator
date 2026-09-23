import { describe, expect, it } from 'vitest';
import { isTeamLegalForFormat } from './teamLegality';

describe('format team legality', () => {
  it('enforces Battle Frontier Master point and Mega limits', () => {
    expect(
      isTeamLegalForFormat(
        ['palkia_origin', 'eternatus', 'swampert_mega'],
        'battle-frontier-master',
      ),
    ).toBe(false);
    expect(
      isTeamLegalForFormat(
        ['palkia_origin', 'mewtwo', 'gallade_mega'],
        'battle-frontier-master',
      ),
    ).toBe(true);
  });

  it('enforces one Mega for Mega-enabled cup formats', () => {
    const team = ['swampert_mega', 'gallade_mega', 'mewtwo'];

    expect(isTeamLegalForFormat(team, 'laic-2027-cup')).toBe(false);
    expect(isTeamLegalForFormat(team, 'cauldron-cup')).toBe(false);
  });
});
