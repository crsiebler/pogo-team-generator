import { describe, expect, it } from 'vitest';
import {
  getMovesetVariants,
  selectBestMovesetVariant,
} from './movesetVariants';

describe('getMovesetVariants', () => {
  it('keeps the ranked Golisopod moveset as default and exposes Shadow Claw as an alternate', () => {
    expect(
      getMovesetVariants('golisopod', {
        fastMove: 'FURY_CUTTER',
        chargedMove1: 'X_SCISSOR',
        chargedMove2: 'AQUA_JET',
      }),
    ).toEqual([
      {
        id: 'fury_cutter--x_scissor--aqua_jet',
        fastMove: 'FURY_CUTTER',
        chargedMove1: 'X_SCISSOR',
        chargedMove2: 'AQUA_JET',
        isDefault: true,
      },
      {
        id: 'shadow_claw--x_scissor--aqua_jet',
        fastMove: 'SHADOW_CLAW',
        chargedMove1: 'X_SCISSOR',
        chargedMove2: 'AQUA_JET',
        isDefault: false,
      },
    ]);
  });
});

describe('selectBestMovesetVariant', () => {
  const variants = getMovesetVariants('golisopod', {
    fastMove: 'FURY_CUTTER',
    chargedMove1: 'X_SCISSOR',
    chargedMove2: 'AQUA_JET',
  });

  it('selects an alternate when its evaluated matchup score is higher', () => {
    const selected = selectBestMovesetVariant(
      variants,
      ['mewtwo', 'lugia'],
      (variant, opponent) =>
        variant.fastMove === 'SHADOW_CLAW' && opponent === 'mewtwo' ? 700 : 400,
    );

    expect(selected.fastMove).toBe('SHADOW_CLAW');
  });

  it('keeps the ranked default when evaluated matchup scores tie', () => {
    const selected = selectBestMovesetVariant(variants, ['mewtwo'], () => 500);

    expect(selected.fastMove).toBe('FURY_CUTTER');
  });

  it('ignores variants without simulation data', () => {
    const selected = selectBestMovesetVariant(
      variants,
      ['mewtwo'],
      (variant) => (variant.isDefault ? 500 : null),
    );

    expect(selected.fastMove).toBe('FURY_CUTTER');
  });
});
