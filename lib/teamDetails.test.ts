import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTeamDetails, TeamDetailsProjectionError } from './teamDetails';
import type { RosterMovesetAssignment } from './types';
import { getPokemonBySpeciesId } from '@/lib/data/pokemon';
import { getAssignedMovesetDetails } from '@/lib/genetic/moveset';

vi.mock('@/lib/data/pokemon', () => ({
  getPokemonBySpeciesId: vi.fn(),
}));

vi.mock('@/lib/genetic/moveset', () => ({
  getAssignedMovesetDetails: vi.fn(),
}));

const assignment: RosterMovesetAssignment = {
  formatId: 'great-league',
  authorityBySpeciesId: {
    alpha: {
      source: 'manifest',
      schemaVersion: 1,
      policyVersion: 'ranking-evidence-v1',
    },
    beta: {
      source: 'ranked-default-fallback',
      schemaVersion: 0,
      policyVersion: 'ranked-default-v1',
    },
  },
  variantsBySpeciesId: {
    alpha: {
      id: 'tackle--body_slam--earthquake',
      fastMove: 'TACKLE',
      chargedMove1: 'BODY_SLAM',
      chargedMove2: 'EARTHQUAKE',
      isDefault: false,
      additionalChargedMove: 'MEGA_MOVE',
      megaLevel: 4,
    },
    beta: {
      id: 'tackle--body_slam--earthquake',
      fastMove: 'TACKLE',
      chargedMove1: 'BODY_SLAM',
      chargedMove2: 'EARTHQUAKE',
      isDefault: true,
    },
  },
  fingerprint: 'fixture',
};

describe('getTeamDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPokemonBySpeciesId).mockImplementation((speciesId) => ({
      speciesId,
      speciesName: speciesId.toUpperCase(),
      dex: 1,
      baseStats: { atk: 1, def: 1, hp: 1 },
      types: ['normal'],
      fastMoves: ['TACKLE'],
      chargedMoves: ['BODY_SLAM', 'EARTHQUAKE'],
      tags: [],
      defaultIVs: {},
      buddyDistance: 3,
      thirdMoveCost: 10000,
      released: true,
    }));
    vi.mocked(getAssignedMovesetDetails).mockImplementation(
      (scoredAssignment, speciesId) => ({
        ...scoredAssignment.variantsBySpeciesId[speciesId]!,
        authority: scoredAssignment.authorityBySpeciesId[speciesId]!,
        acquisitionRequirements: {
          fastMove: { kind: 'regular' },
          chargedMove1: { kind: 'elite' },
          chargedMove2: { kind: 'regular' },
        },
      }),
    );
  });

  it('preserves team order and exact assigned move, variant, and authority data', () => {
    const result = getTeamDetails(['beta', 'alpha'], assignment);

    expect(result.map(({ speciesId }) => speciesId)).toEqual(['beta', 'alpha']);
    expect(result[0]?.recommendedMoveset).toMatchObject({
      fastMove: 'TACKLE',
      chargedMove1: 'BODY_SLAM',
      chargedMove2: 'EARTHQUAKE',
      isDefault: true,
      authority: assignment.authorityBySpeciesId.beta,
      acquisitionRequirements: {
        fastMove: { kind: 'regular' },
        chargedMove1: { kind: 'elite' },
        chargedMove2: { kind: 'regular' },
      },
    });
    expect(result[1]?.recommendedMoveset).toMatchObject({
      isDefault: false,
      additionalChargedMove: 'MEGA_MOVE',
      megaLevel: 4,
      authority: assignment.authorityBySpeciesId.alpha,
    });
    expect(getAssignedMovesetDetails).toHaveBeenCalledTimes(2);
  });

  it('rejects an incomplete projection instead of returning a partial team', () => {
    vi.mocked(getPokemonBySpeciesId).mockImplementation((speciesId) =>
      speciesId === 'beta'
        ? undefined
        : {
            speciesId,
            speciesName: speciesId,
            dex: 1,
            baseStats: { atk: 1, def: 1, hp: 1 },
            types: ['normal'],
            fastMoves: ['TACKLE'],
            chargedMoves: ['BODY_SLAM', 'EARTHQUAKE'],
            tags: [],
            defaultIVs: {},
            buddyDistance: 3,
            thirdMoveCost: 10000,
            released: true,
          },
    );

    expect(() => getTeamDetails(['beta', 'alpha'], assignment)).toThrow(
      TeamDetailsProjectionError,
    );
    expect(getAssignedMovesetDetails).not.toHaveBeenCalled();
  });

  it('rejects duplicate, missing, or additional assignment members', () => {
    expect(() => getTeamDetails(['alpha', 'alpha'], assignment)).toThrow(
      TeamDetailsProjectionError,
    );
    expect(() => getTeamDetails(['alpha'], assignment)).toThrow(
      TeamDetailsProjectionError,
    );
    expect(() =>
      getTeamDetails(['alpha', 'beta', 'gamma'], assignment),
    ).toThrow(TeamDetailsProjectionError);
  });
});
