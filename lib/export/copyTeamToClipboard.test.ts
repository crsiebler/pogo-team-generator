import { describe, it, expect, vi, beforeEach } from 'vitest';
import { copyTeamToClipboard } from './copyTeamToClipboard';

describe('copyTeamToClipboard', () => {
  const mockWriteText = vi.fn();

  beforeEach(() => {
    // Mock navigator.clipboard.writeText
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: mockWriteText,
      },
      writable: true,
    });
    mockWriteText.mockResolvedValue(undefined);
  });

  it('should copy team export to clipboard', async () => {
    const team = ['altaria'];
    const movesets = {
      altaria: {
        fastMove: 'DRAGON_BREATH',
        chargedMove1: 'SKY_ATTACK',
        chargedMove2: 'FLAMETHROWER',
      },
    };

    await copyTeamToClipboard(team, movesets);

    expect(mockWriteText).toHaveBeenCalledWith(
      'altaria,DRAGON_BREATH,SKY_ATTACK,FLAMETHROWER',
    );
  });

  it('should handle multiple team members', async () => {
    const team = ['altaria', 'scizor_shadow'];
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
    };

    await copyTeamToClipboard(team, movesets);

    expect(mockWriteText).toHaveBeenCalledWith(
      'altaria,DRAGON_BREATH,SKY_ATTACK,FLAMETHROWER\nscizor_shadow-shadow,BULLET_PUNCH,NIGHT_SLASH,TRAILBLAZE',
    );
  });

  it('should handle empty team', async () => {
    await copyTeamToClipboard([], {});

    expect(mockWriteText).toHaveBeenCalledWith('');
  });

  it('should throw if clipboard is not available', async () => {
    // Remove clipboard from navigator
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
    });

    const team = ['altaria'];
    const movesets = {
      altaria: {
        fastMove: 'DRAGON_BREATH',
        chargedMove1: 'SKY_ATTACK',
        chargedMove2: 'FLAMETHROWER',
      },
    };

    await expect(copyTeamToClipboard(team, movesets)).rejects.toThrow();
  });

  it('should propagate clipboard write errors', async () => {
    const error = new Error('Clipboard write failed');
    mockWriteText.mockRejectedValue(error);

    const team = ['altaria'];
    const movesets = {
      altaria: {
        fastMove: 'DRAGON_BREATH',
        chargedMove1: 'SKY_ATTACK',
        chargedMove2: 'FLAMETHROWER',
      },
    };

    await expect(copyTeamToClipboard(team, movesets)).rejects.toThrow(
      'Clipboard write failed',
    );
  });
});
