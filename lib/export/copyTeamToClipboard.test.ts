import { describe, it, expect, vi, beforeEach } from 'vitest';
import { copyTeamToClipboard } from './copyTeamToClipboard';
import type {
  MovesetAcquisitionRequirements,
  RosterMovesetAssignment,
} from '@/lib/types';

const assignment: RosterMovesetAssignment = {
  formatId: 'great-league',
  authorityBySpeciesId: Object.fromEntries(
    ['altaria', 'scizor_shadow'].map((speciesId) => [
      speciesId,
      {
        source: 'manifest' as const,
        schemaVersion: 1,
        policyVersion: 'ranking-evidence-v1',
      },
    ]),
  ),
  variantsBySpeciesId: {
    altaria: {
      id: 'dragon_breath--moonblast--sky_attack',
      fastMove: 'DRAGON_BREATH',
      chargedMove1: 'SKY_ATTACK',
      chargedMove2: 'MOONBLAST',
      isDefault: false,
    },
    scizor_shadow: {
      id: 'bullet_punch--trailblaze--night_slash',
      fastMove: 'BULLET_PUNCH',
      chargedMove1: 'NIGHT_SLASH',
      chargedMove2: 'TRAILBLAZE',
      isDefault: true,
    },
  },
  fingerprint: 'clipboard-assignment',
};

const megaAssignment: RosterMovesetAssignment = {
  ...assignment,
  variantsBySpeciesId: {
    ...assignment.variantsBySpeciesId,
    scizor_shadow: {
      ...assignment.variantsBySpeciesId.scizor_shadow!,
      additionalChargedMove: 'VOLT_TACKLE_PLUS',
      megaLevel: 4,
    },
  },
};

const regularRequirements: MovesetAcquisitionRequirements = {
  fastMove: { kind: 'regular' },
  chargedMove1: { kind: 'regular' },
  chargedMove2: { kind: 'regular' },
};

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

  it('copies assigned moves and acquisition requirements', async () => {
    await copyTeamToClipboard(['altaria'], assignment, {
      altaria: {
        fastMove: { kind: 'regular' },
        chargedMove1: { kind: 'eventExclusive' },
        chargedMove2: { kind: 'elite' },
      },
    });

    expect(mockWriteText).toHaveBeenCalledWith(
      [
        'altaria,DRAGON_BREATH,SKY_ATTACK,MOONBLAST',
        '# Acquisition requirements',
        '# altaria: SKY_ATTACK (event-exclusive); MOONBLAST (Elite Charged TM)',
      ].join('\n'),
    );
  });

  it('copies multiple regular assigned movesets without extra text', async () => {
    await copyTeamToClipboard(['altaria', 'scizor_shadow'], assignment, {
      altaria: regularRequirements,
      scizor_shadow: regularRequirements,
    });

    expect(mockWriteText).toHaveBeenCalledWith(
      'altaria,DRAGON_BREATH,SKY_ATTACK,MOONBLAST\nscizor_shadow-shadow,BULLET_PUNCH,NIGHT_SLASH,TRAILBLAZE',
    );
  });

  it('copies the complete eligible Mega configuration', async () => {
    await copyTeamToClipboard(['scizor_shadow'], megaAssignment, {
      scizor_shadow: regularRequirements,
    });

    expect(mockWriteText).toHaveBeenCalledWith(
      [
        'scizor_shadow-shadow,BULLET_PUNCH,NIGHT_SLASH,TRAILBLAZE,VOLT_TACKLE_PLUS',
        '# Battle configuration',
        '# scizor_shadow-shadow: Fixed additional Charged Attack VOLT_TACKLE_PLUS; Mega Level 4',
      ].join('\n'),
    );
  });

  it('copies an empty team', async () => {
    await copyTeamToClipboard([], assignment, {});

    expect(mockWriteText).toHaveBeenCalledWith('');
  });

  it('throws if clipboard is not available', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
    });

    await expect(
      copyTeamToClipboard(['altaria'], assignment, {
        altaria: {
          fastMove: { kind: 'regular' },
          chargedMove1: { kind: 'regular' },
          chargedMove2: { kind: 'regular' },
        },
      }),
    ).rejects.toThrow();
  });

  it('propagates clipboard write errors', async () => {
    const error = new Error('Clipboard write failed');
    mockWriteText.mockRejectedValue(error);

    await expect(
      copyTeamToClipboard(['altaria'], assignment, {
        altaria: regularRequirements,
      }),
    ).rejects.toThrow('Clipboard write failed');
  });
});
