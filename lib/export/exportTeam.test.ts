import { describe, it, expect } from 'vitest';
import { exportTeam } from './exportTeam';

describe('exportTeam', () => {
  it('should export team with movesets in correct format', () => {
    const team = ['altaria', 'scizor_shadow', 'sandslash_alolan'];
    const movesets = {
      altaria: {
        fastMove: 'DRAGON_BREATH',
        chargedMove1: 'SKY_ATTACK',
        chargedMove2: 'FLAMETHROWER',
      },
      scizor_shadow: {
        fastMove: 'BULLET_PUNCH',
        chargedMove1: 'NIGHT_SLASH',
        chargedMove2: 'TRAILBLAZE',
      },
      sandslash_alolan: {
        fastMove: 'POWDER_SNOW',
        chargedMove1: 'ICE_PUNCH',
        chargedMove2: 'DRILL_RUN',
      },
    };

    const result = exportTeam(team, movesets);
    const lines = result.split('\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('altaria,DRAGON_BREATH,SKY_ATTACK,FLAMETHROWER');
    expect(lines[1]).toBe(
      'scizor_shadow-shadow,BULLET_PUNCH,NIGHT_SLASH,TRAILBLAZE',
    );
    expect(lines[2]).toBe('sandslash_alolan,POWDER_SNOW,ICE_PUNCH,DRILL_RUN');
  });

  it('should handle missing moves with empty strings', () => {
    const team = ['altaria'];
    const movesets = {
      altaria: {
        fastMove: null,
        chargedMove1: null,
        chargedMove2: null,
      },
    };

    const result = exportTeam(team, movesets);
    expect(result).toBe('altaria,,,');
  });

  it('should handle partial moves', () => {
    const team = ['scizor'];
    const movesets = {
      scizor: {
        fastMove: 'BULLET_PUNCH',
        chargedMove1: null,
        chargedMove2: 'TRAILBLAZE',
      },
    };

    const result = exportTeam(team, movesets);
    expect(result).toBe('scizor,BULLET_PUNCH,,TRAILBLAZE');
  });

  it('should return empty string for empty team', () => {
    const result = exportTeam([], {});
    expect(result).toBe('');
  });
});
