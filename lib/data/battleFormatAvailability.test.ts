import { describe, expect, it } from 'vitest';
import { getSelectableBattleFormats } from './battleFormats';
import { generateTeam } from '@/lib/genetic/algorithm';
import { isTeamLegalForFormat } from '@/lib/genetic/teamLegality';

describe('unverified Battle Frontier Master rules', () => {
  it('excludes Master from the selector until current rules are verified', () => {
    expect(getSelectableBattleFormats().map(({ id }) => id)).not.toContain(
      'battle-frontier-master',
    );
  });

  it('rejects legality checks instead of using historical point values', () => {
    expect(() =>
      isTeamLegalForFormat(
        ['palkia_origin', 'mewtwo'],
        'battle-frontier-master',
      ),
    ).toThrow(/current.*rules/i);
  });

  it('rejects direct generation before loading simulation data', async () => {
    await expect(
      generateTeam({ mode: 'PlayPokemon', formatId: 'battle-frontier-master' }),
    ).rejects.toThrow(/current.*rules/i);
  });
});
