import { describe, it, expect } from 'vitest';
import { exportTeam } from './exportTeam';
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
  fingerprint: 'export-assignment',
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

const nonEligibleMegaAssignment: RosterMovesetAssignment = {
  ...assignment,
  authorityBySpeciesId: {
    ...assignment.authorityBySpeciesId,
    blastoise_mega: assignment.authorityBySpeciesId.altaria!,
  },
  variantsBySpeciesId: {
    ...assignment.variantsBySpeciesId,
    blastoise_mega: {
      id: 'water_gun--hydro_cannon--ice_beam',
      fastMove: 'WATER_GUN',
      chargedMove1: 'HYDRO_CANNON',
      chargedMove2: 'ICE_BEAM',
      isDefault: true,
    },
  },
};

const regularRequirements: MovesetAcquisitionRequirements = {
  fastMove: { kind: 'regular' },
  chargedMove1: { kind: 'regular' },
  chargedMove2: { kind: 'regular' },
};

describe('exportTeam', () => {
  it('exports exact assigned move order without regular acquisition text', () => {
    const result = exportTeam(['altaria', 'scizor_shadow'], assignment, {
      altaria: regularRequirements,
      scizor_shadow: regularRequirements,
    });

    expect(result).toBe(
      'altaria,DRAGON_BREATH,SKY_ATTACK,MOONBLAST\nscizor_shadow-shadow,BULLET_PUNCH,NIGHT_SLASH,TRAILBLAZE',
    );
  });

  it('appends concise special acquisition requirements', () => {
    const result = exportTeam(['altaria', 'scizor_shadow'], assignment, {
      altaria: {
        fastMove: { kind: 'elite' },
        chargedMove1: { kind: 'eventExclusive' },
        chargedMove2: { kind: 'purified' },
      },
      scizor_shadow: {
        fastMove: { kind: 'regular' },
        chargedMove1: { kind: 'elite' },
        chargedMove2: { kind: 'regular' },
      },
    });

    expect(result).toBe(
      [
        'altaria,DRAGON_BREATH,SKY_ATTACK,MOONBLAST',
        'scizor_shadow-shadow,BULLET_PUNCH,NIGHT_SLASH,TRAILBLAZE',
        '# Acquisition requirements',
        '# altaria: DRAGON_BREATH (Elite Fast TM); SKY_ATTACK (event-exclusive); MOONBLAST (purified Pokemon required)',
        '# scizor_shadow-shadow: NIGHT_SLASH (Elite Charged TM)',
      ].join('\n'),
    );
  });

  it('exports a fixed additional move and Mega level annotation', () => {
    const result = exportTeam(['scizor_shadow'], megaAssignment, {
      scizor_shadow: regularRequirements,
    });

    expect(result).toBe(
      [
        'scizor_shadow-shadow,BULLET_PUNCH,NIGHT_SLASH,TRAILBLAZE,VOLT_TACKLE_PLUS',
        '# Battle configuration',
        '# scizor_shadow-shadow: Fixed additional Charged Attack VOLT_TACKLE_PLUS; Mega Level 4',
      ].join('\n'),
    );
  });

  it('leaves noneligible Mega rows in the standard four-field format', () => {
    const result = exportTeam(['blastoise_mega'], nonEligibleMegaAssignment, {
      blastoise_mega: regularRequirements,
    });

    expect(result).toBe('blastoise_mega,WATER_GUN,HYDRO_CANNON,ICE_BEAM');
    expect(result).not.toContain('# Battle configuration');
  });

  it('keeps non-Mega rows unchanged beside an eligible Mega row', () => {
    const result = exportTeam(['altaria', 'scizor_shadow'], megaAssignment, {
      altaria: regularRequirements,
      scizor_shadow: regularRequirements,
    });

    expect(result).toContain('altaria,DRAGON_BREATH,SKY_ATTACK,MOONBLAST');
    expect(result).not.toContain('altaria,DRAGON_BREATH,SKY_ATTACK,MOONBLAST,');
  });

  it('rejects a roster member missing from the scored assignment', () => {
    expect(() =>
      exportTeam(['sandslash_alolan'], assignment, {
        sandslash_alolan: regularRequirements,
      }),
    ).toThrow('Missing assigned moveset for sandslash_alolan.');
  });

  it('rejects missing acquisition metadata', () => {
    expect(() => exportTeam(['altaria'], assignment, {})).toThrow(
      'Missing acquisition requirements for altaria.',
    );
  });

  it('returns an empty string for an empty team', () => {
    const result = exportTeam([], assignment, {});
    expect(result).toBe('');
  });
});
