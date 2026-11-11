import { describe, expect, it } from 'vitest';
import { isTeamLegalForFormat } from './teamLegality';

describe('format team legality', () => {
  it('allows one Mega without historical Battle Frontier Master point limits', () => {
    expect(
      isTeamLegalForFormat(
        ['palkia_origin', 'eternatus', 'swampert_mega'],
        'battle-frontier-master',
      ),
    ).toBe(true);
    expect(
      isTeamLegalForFormat(
        ['ampharos_mega', 'chandelure_mega', 'mewtwo'],
        'battle-frontier-master',
      ),
    ).toBe(false);
  });

  it('enforces one Mega for Mega-enabled cup formats', () => {
    const team = ['swampert_mega', 'gallade_mega', 'mewtwo'];

    expect(isTeamLegalForFormat(team, 'laic-2027-cup')).toBe(false);
    expect(isTeamLegalForFormat(team, 'cauldron-cup')).toBe(false);
  });
});
