import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { DEFAULT_BATTLE_FORMAT_ID } from '@/lib/data/battleFormats';
import { getMovesetAvailability } from '@/lib/data/moveAvailability';
import { getMovesetVariantId } from '@/lib/data/movesetVariants';
import { MovesetVariantSimulationDataError } from '@/lib/data/movesetVariantSimulations';
import { getPokemonBySpeciesId } from '@/lib/data/pokemon';
import {
  createRosterMovesetAssignment,
  getSimulationBackedMovesetForTeam,
  validateRosterMovesetAssignmentAuthority,
} from '@/lib/genetic/moveset';
import type {
  MoveAvailability,
  Moveset,
  RosterMovesetAssignment,
} from '@/lib/types';

vi.mock('@/lib/data/pokemon', () => ({
  getPokemonBySpeciesId: vi.fn(),
}));

vi.mock('@/lib/data/moveAvailability', async () => {
  const actual = await vi.importActual('@/lib/data/moveAvailability');

  return {
    ...actual,
    getMovesetAvailability: vi.fn(),
  };
});

vi.mock('@/lib/genetic/moveset', async () => {
  const actual = await vi.importActual('@/lib/genetic/moveset');

  return {
    ...actual,
    getSimulationBackedMovesetForTeam: vi.fn(),
    validateRosterMovesetAssignmentAuthority: vi.fn(),
  };
});

function createAssignment(
  formatId: RosterMovesetAssignment['formatId'] = DEFAULT_BATTLE_FORMAT_ID,
  authorityMode: 'manifest' | 'ranked-default-fallback' | 'mixed' = 'mixed',
): RosterMovesetAssignment {
  const mewtwoMoveset: Moveset = {
    fastMove: 'COUNTER',
    chargedMove1: 'PSYSTRIKE',
    chargedMove2: 'PSYCHIC',
  };
  const sableyeMoveset: Moveset = {
    fastMove: 'SHADOW_CLAW',
    chargedMove1: 'FOUL_PLAY',
    chargedMove2: 'RETURN',
  };

  return createRosterMovesetAssignment({
    formatId,
    authorityBySpeciesId: {
      mewtwo:
        authorityMode === 'ranked-default-fallback'
          ? {
              source: 'ranked-default-fallback',
              schemaVersion: 0,
              policyVersion: 'ranked-default-v1',
            }
          : {
              source: 'manifest',
              schemaVersion: 1,
              policyVersion: 'ranking-evidence-v1',
            },
      sableye:
        authorityMode === 'manifest'
          ? {
              source: 'manifest',
              schemaVersion: 1,
              policyVersion: 'ranking-evidence-v1',
            }
          : {
              source: 'ranked-default-fallback',
              schemaVersion: 0,
              policyVersion: 'ranked-default-v1',
            },
    },
    variantsBySpeciesId: {
      mewtwo: {
        ...mewtwoMoveset,
        id: getMovesetVariantId(mewtwoMoveset),
        isDefault: authorityMode === 'ranked-default-fallback',
      },
      sableye: {
        ...sableyeMoveset,
        id: getMovesetVariantId(sableyeMoveset),
        isDefault: true,
      },
    },
  });
}

describe('POST /api/team-details format-aware movesets', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getPokemonBySpeciesId).mockImplementation((speciesId) => ({
      speciesId,
      speciesName: speciesId === 'mewtwo' ? 'Mewtwo' : 'Sableye',
      dex: speciesId === 'mewtwo' ? 150 : 302,
      baseStats: { atk: 1, def: 1, hp: 1 },
      types: ['psychic'],
      fastMoves: ['COUNTER', 'SHADOW_CLAW'],
      chargedMoves: ['PSYSTRIKE', 'PSYCHIC', 'FOUL_PLAY', 'RETURN'],
      tags: [],
      defaultIVs: {},
      buddyDistance: 3,
      thirdMoveCost: 10000,
      released: true,
    }));

    vi.mocked(getSimulationBackedMovesetForTeam).mockReturnValue({
      fastMove: 'ASTONISH',
      chargedMove1: 'FRENZY_PLANT',
      chargedMove2: 'SPIRIT_SHACKLE',
    });
    vi.mocked(validateRosterMovesetAssignmentAuthority).mockImplementation(
      (assignment) => assignment,
    );

    vi.mocked(getMovesetAvailability).mockImplementation(
      (_speciesId, moveset) => {
        const availabilityByMoveId: Record<string, MoveAvailability> = {
          COUNTER: { kind: 'eventExclusive' },
          PSYSTRIKE: { kind: 'elite' },
          PSYCHIC: { kind: 'regular' },
          SHADOW_CLAW: { kind: 'regular' },
          FOUL_PLAY: { kind: 'regular' },
          RETURN: { kind: 'purified' },
        };

        return {
          fastMove: availabilityByMoveId[moveset.fastMove]!,
          chargedMove1: availabilityByMoveId[moveset.chargedMove1]!,
          chargedMove2: availabilityByMoveId[moveset.chargedMove2]!,
        };
      },
    );
  });

  it('returns the exact assigned moves with structured acquisition metadata', async () => {
    const movesetAssignment = createAssignment();
    const request = new Request('http://localhost/api/team-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team: ['mewtwo', 'sableye'],
        formatId: 'great-league',
        movesetAssignment,
      }),
    });

    const response = await POST(request as NextRequest);
    const payload = (await response.json()) as {
      pokemon: Array<{
        speciesId: string;
        recommendedMoveset: unknown;
      }>;
    };

    expect(response.status).toBe(200);
    expect(payload.pokemon.map(({ speciesId }) => speciesId)).toEqual([
      'mewtwo',
      'sableye',
    ]);
    expect(payload.pokemon[0]?.recommendedMoveset).toEqual({
      id: getMovesetVariantId({
        fastMove: 'COUNTER',
        chargedMove1: 'PSYSTRIKE',
        chargedMove2: 'PSYCHIC',
      }),
      fastMove: 'COUNTER',
      chargedMove1: 'PSYSTRIKE',
      chargedMove2: 'PSYCHIC',
      isDefault: false,
      authority: movesetAssignment.authorityBySpeciesId.mewtwo,
      acquisitionRequirements: {
        fastMove: { kind: 'eventExclusive' },
        chargedMove1: { kind: 'elite' },
        chargedMove2: { kind: 'regular' },
      },
    });
    expect(payload.pokemon[1]?.recommendedMoveset).toEqual({
      id: getMovesetVariantId({
        fastMove: 'SHADOW_CLAW',
        chargedMove1: 'FOUL_PLAY',
        chargedMove2: 'RETURN',
      }),
      fastMove: 'SHADOW_CLAW',
      chargedMove1: 'FOUL_PLAY',
      chargedMove2: 'RETURN',
      isDefault: true,
      authority: movesetAssignment.authorityBySpeciesId.sableye,
      acquisitionRequirements: {
        fastMove: { kind: 'regular' },
        chargedMove1: { kind: 'regular' },
        chargedMove2: { kind: 'purified' },
      },
    });
    expect(getSimulationBackedMovesetForTeam).not.toHaveBeenCalled();
    expect(validateRosterMovesetAssignmentAuthority).toHaveBeenCalledWith(
      movesetAssignment,
    );
  });

  it.each(['manifest', 'ranked-default-fallback', 'mixed'] as const)(
    'accepts a current %s assignment',
    async (authorityMode) => {
      const movesetAssignment = createAssignment(undefined, authorityMode);
      const actualMovesetModule = await vi.importActual<
        typeof import('@/lib/genetic/moveset')
      >('@/lib/genetic/moveset');
      vi.mocked(validateRosterMovesetAssignmentAuthority).mockImplementation(
        (assignment) =>
          actualMovesetModule.validateRosterMovesetAssignmentAuthority(
            assignment,
            {
              ensureSimulationData: () => undefined,
              getManifestPolicyIdentity: () => ({
                schemaVersion: 1,
                policyVersion: 'ranking-evidence-v1',
              }),
              getActiveVariants: (speciesId) => [
                movesetAssignment.variantsBySpeciesId[speciesId]!,
              ],
              getPokemon: getPokemonBySpeciesId,
              getRankedDefault: (pokemon) =>
                movesetAssignment.variantsBySpeciesId[pokemon.speciesId],
            },
          ),
      );
      const request = new Request('http://localhost/api/team-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team: ['mewtwo', 'sableye'],
          formatId: 'great-league',
          movesetAssignment,
        }),
      });

      const response = await POST(request as NextRequest);

      expect(response.status).toBe(200);
      expect(validateRosterMovesetAssignmentAuthority).toHaveBeenCalledWith(
        movesetAssignment,
      );
    },
  );

  it.each([
    'a legal inactive manifest variant',
    'a modified ranked default',
    'a stale manifest policy',
    'a false manifest authority label',
  ])('rejects %s as invalid authority', async (tampering) => {
    const currentAssignment = createAssignment();
    const mewtwoVariant = currentAssignment.variantsBySpeciesId.mewtwo!;
    const sableyeVariant = currentAssignment.variantsBySpeciesId.sableye!;
    const movesetAssignment = createRosterMovesetAssignment({
      formatId: 'great-league',
      authorityBySpeciesId: {
        mewtwo:
          tampering === 'a stale manifest policy'
            ? {
                ...currentAssignment.authorityBySpeciesId.mewtwo!,
                policyVersion: 'ranking-evidence-v0',
              }
            : currentAssignment.authorityBySpeciesId.mewtwo!,
        sableye:
          tampering === 'a false manifest authority label'
            ? {
                source: 'manifest',
                schemaVersion: 1,
                policyVersion: 'ranking-evidence-v1',
              }
            : currentAssignment.authorityBySpeciesId.sableye!,
      },
      variantsBySpeciesId: {
        mewtwo:
          tampering === 'a legal inactive manifest variant'
            ? {
                fastMove: 'COUNTER',
                chargedMove1: 'PSYSTRIKE',
                chargedMove2: 'SHADOW_BALL',
                id: getMovesetVariantId({
                  fastMove: 'COUNTER',
                  chargedMove1: 'PSYSTRIKE',
                  chargedMove2: 'SHADOW_BALL',
                }),
                isDefault: false,
              }
            : mewtwoVariant,
        sableye:
          tampering === 'a modified ranked default'
            ? {
                fastMove: 'SHADOW_CLAW',
                chargedMove1: 'FOUL_PLAY',
                chargedMove2: 'POWER_GEM',
                id: getMovesetVariantId({
                  fastMove: 'SHADOW_CLAW',
                  chargedMove1: 'FOUL_PLAY',
                  chargedMove2: 'POWER_GEM',
                }),
                isDefault: true,
              }
            : sableyeVariant,
      },
    });
    const actualMovesetModule = await vi.importActual<
      typeof import('@/lib/genetic/moveset')
    >('@/lib/genetic/moveset');
    vi.mocked(validateRosterMovesetAssignmentAuthority).mockImplementation(
      (assignment) =>
        actualMovesetModule.validateRosterMovesetAssignmentAuthority(
          assignment,
          {
            ensureSimulationData: () => undefined,
            getManifestPolicyIdentity: () => ({
              schemaVersion: 1,
              policyVersion: 'ranking-evidence-v1',
            }),
            getActiveVariants: (speciesId) => {
              if (speciesId === 'sableye') {
                throw new MovesetVariantSimulationDataError(
                  'variant-unavailable',
                  'great-league',
                  'runtime-snapshot.json',
                  speciesId,
                );
              }
              return [mewtwoVariant];
            },
            getPokemon: getPokemonBySpeciesId,
            getRankedDefault: (pokemon) =>
              currentAssignment.variantsBySpeciesId[pokemon.speciesId],
          },
        ),
    );
    const request = new Request('http://localhost/api/team-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team: ['mewtwo', 'sableye'],
        formatId: 'great-league',
        movesetAssignment,
      }),
    });

    const response = await POST(request as NextRequest);

    expect(response.status).toBe(400);
    expect(getMovesetAvailability).not.toHaveBeenCalled();
  });

  it('defaults missing formatId to Great League', async () => {
    const movesetAssignment = createAssignment();
    const request = new Request('http://localhost/api/team-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team: ['mewtwo', 'sableye'],
        movesetAssignment,
      }),
    });

    const response = await POST(request as NextRequest);

    expect(response.status).toBe(200);
    expect(getMovesetAvailability).toHaveBeenCalledWith(
      'mewtwo',
      expect.objectContaining({ fastMove: 'COUNTER' }),
      DEFAULT_BATTLE_FORMAT_ID,
    );
  });

  it('rejects requests without the scored roster assignment', async () => {
    const request = new Request('http://localhost/api/team-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team: ['mewtwo'], formatId: 'great-league' }),
    });

    const response = await POST(request as NextRequest);

    expect(response.status).toBe(400);
    expect(getSimulationBackedMovesetForTeam).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a different format',
      ['mewtwo', 'sableye'],
      createAssignment('ultra-league'),
    ],
    ['different roster species', ['mewtwo'], createAssignment()],
    [
      'a modified variant fingerprint',
      ['mewtwo', 'sableye'],
      {
        ...createAssignment(),
        fingerprint: 'stale-fingerprint',
      },
    ],
  ] as const)(
    'rejects an assignment with %s',
    async (_label, team, assignment) => {
      const request = new Request('http://localhost/api/team-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team,
          formatId: 'great-league',
          movesetAssignment: assignment,
        }),
      });

      const response = await POST(request as NextRequest);

      expect(response.status).toBe(400);
      expect(getSimulationBackedMovesetForTeam).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'noncanonical move IDs',
      {
        fastMove: 'counter',
        chargedMove1: 'PSYSTRIKE',
        chargedMove2: 'PSYCHIC',
      },
    ],
    [
      'duplicate charged moves',
      {
        fastMove: 'COUNTER',
        chargedMove1: 'PSYSTRIKE',
        chargedMove2: 'PSYSTRIKE',
      },
    ],
    [
      'moves in the wrong slots',
      {
        fastMove: 'PSYCHIC',
        chargedMove1: 'COUNTER',
        chargedMove2: 'PSYSTRIKE',
      },
    ],
  ] as const)('rejects %s', async (_label, moveset) => {
    const baseAssignment = createAssignment();
    const movesetAssignment = createRosterMovesetAssignment({
      formatId: 'great-league',
      authorityBySpeciesId: baseAssignment.authorityBySpeciesId,
      variantsBySpeciesId: {
        ...baseAssignment.variantsBySpeciesId,
        mewtwo: {
          ...moveset,
          id: getMovesetVariantId(moveset),
          isDefault: false,
        },
      },
    });
    const request = new Request('http://localhost/api/team-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team: ['mewtwo', 'sableye'],
        formatId: 'great-league',
        movesetAssignment,
      }),
    });

    const response = await POST(request as NextRequest);

    expect(response.status).toBe(400);
  });

  it('rejects assignments with authority keys that differ from the roster', async () => {
    const assignment = createAssignment();
    const request = new Request('http://localhost/api/team-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team: ['mewtwo', 'sableye'],
        formatId: 'great-league',
        movesetAssignment: {
          ...assignment,
          authorityBySpeciesId: {
            mewtwo: assignment.authorityBySpeciesId.mewtwo,
          },
        },
      }),
    });

    const response = await POST(request as NextRequest);

    expect(response.status).toBe(400);
  });

  it('rejects oversized assignment requests before parsing their bodies', async () => {
    const request = new Request('http://localhost/api/team-details', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': '20000',
      },
      body: JSON.stringify({
        team: ['mewtwo', 'sableye'],
        movesetAssignment: createAssignment(),
      }),
    });

    const response = await POST(request as NextRequest);

    expect(response.status).toBe(413);
  });

  it.each([
    ['an omitted content length', {}],
    ['an underreported content length', { 'Content-Length': '1' }],
  ])('rejects an oversized request with %s', async (_label, headers) => {
    const request = new Request('http://localhost/api/team-details', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        team: ['mewtwo', 'sableye'],
        movesetAssignment: createAssignment(),
        padding: 'x'.repeat(16_384),
      }),
    });

    const response = await POST(request as NextRequest);

    expect(response.status).toBe(413);
    expect(getPokemonBySpeciesId).not.toHaveBeenCalled();
  });

  it.each(['invalid', '-1', '1.5'])(
    'rejects an invalid declared content length of %s',
    async (contentLength) => {
      const request = new Request('http://localhost/api/team-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': contentLength,
        },
        body: JSON.stringify({
          team: ['mewtwo', 'sableye'],
          movesetAssignment: createAssignment(),
        }),
      });

      const response = await POST(request as NextRequest);

      expect(response.status).toBe(400);
      expect(getPokemonBySpeciesId).not.toHaveBeenCalled();
    },
  );

  it('rejects rosters larger than the generated team maximum', async () => {
    const request = new Request('http://localhost/api/team-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team: [
          'mewtwo',
          'sableye',
          'azumarill',
          'lanturn',
          'dewgong',
          'annihilape',
          'umbreon',
        ],
        movesetAssignment: createAssignment(),
      }),
    });

    const response = await POST(request as NextRequest);
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/at most 6/i);
  });
});
