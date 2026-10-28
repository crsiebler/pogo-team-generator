import { describe, expect, it } from 'vitest';
import {
  assertBattleFormatAvailable,
  getSelectableBattleFormats,
} from './battleFormats';
import { OpponentRosterDataError } from './opponentRosters';
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
      'kyurem_black',
      'giratina_altered',
      'ampharos_mega',
      'blastoise_mega',
      'mewtwo',
      'zekrom',
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

  it('reports legal anchors with missing simulations as unavailable evidence', async () => {
    const anchors = [
      'palkia_origin',
      'eternatus',
      'swampert_mega',
      'aggron_mega',
      'xerneas',
      'reshiram',
    ];
    expect(isTeamLegalForFormat(anchors, 'battle-frontier-master')).toBe(true);
    await expect(
      generateTeam({
        mode: 'PlayPokemon',
        formatId: 'battle-frontier-master',
        anchorPokemon: anchors,
        populationSize: 2,
        generations: 1,
      }),
    ).rejects.toBeInstanceOf(OpponentRosterDataError);
  });
});
