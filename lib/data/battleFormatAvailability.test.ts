import { describe, expect, it } from 'vitest';
import {
  assertBattleFormatAvailable,
  getSelectableBattleFormats,
} from './battleFormats';
import { generateTeam } from '@/lib/genetic/algorithm';
import { isTeamLegalForFormat } from '@/lib/genetic/teamLegality';

describe('Battle Frontier Master without point tiers', () => {
  it('offers Master in the selector', () => {
    expect(getSelectableBattleFormats().map(({ id }) => id)).toContain(
      'battle-frontier-master',
    );
  });

  it('allows current-cycle rosters without historical point or Mega limits', () => {
    expect(() =>
      assertBattleFormatAvailable('battle-frontier-master'),
    ).not.toThrow();
    expect(
      isTeamLegalForFormat(
        ['palkia_origin', 'eternatus', 'swampert_mega', 'aggron_mega'],
        'battle-frontier-master',
      ),
    ).toBe(true);
  });

  it('generates a roster that exceeds the historical point and Mega limits', async () => {
    const anchors = [
      'palkia_origin',
      'eternatus',
      'swampert_mega',
      'aggron_mega',
      'xerneas',
      'reshiram',
    ];
    const result = await generateTeam({
      mode: 'PlayPokemon',
      formatId: 'battle-frontier-master',
      anchorPokemon: anchors,
      populationSize: 2,
      generations: 1,
    });

    expect(result.team).toEqual(anchors);
    expect(Number.isFinite(result.fitness)).toBe(true);
    expect(result.movesetAssignment?.formatId).toBe('battle-frontier-master');
  });
});
