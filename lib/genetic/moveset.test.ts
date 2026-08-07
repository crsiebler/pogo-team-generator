import { describe, expect, it } from 'vitest';
import {
  createRosterMovesetAssignment,
  enumerateRosterMovesetAssignments,
  getAssignedMovesetVariantId,
  getRecommendedMovesetForPokemon,
  getSimulationBackedMovesetForTeam,
  resolveRankedDefaultRosterMovesetAssignment,
  resolveRosterMovesetAssignment,
} from './moveset';
import { MovesetVariantSimulationDataError } from '@/lib/data/movesetVariantSimulations';
import type { MovesetVariantSimulationDataErrorCode } from '@/lib/data/movesetVariantSimulations';
import { getPokemonBySpeciesId } from '@/lib/data/pokemon';
import { ensureSimulationDataAvailable } from '@/lib/data/simulations';
import type {
  MovesetAssignmentPolicyIdentity,
  MovesetVariant,
  Pokemon,
} from '@/lib/types';

const simulationVariants: readonly MovesetVariant[] = [
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
];

describe('getRecommendedMovesetForPokemon', () => {
  it('uses format-specific ranking movesets', () => {
    const decidueye = getPokemonBySpeciesId('decidueye');

    expect(decidueye).toBeDefined();

    expect(
      getRecommendedMovesetForPokemon(decidueye!, 'great-league').fastMove,
    ).toBe('LEAFAGE');
    expect(
      getRecommendedMovesetForPokemon(decidueye!, 'battle-frontier-liga-ultra')
        .fastMove,
    ).toBe('ASTONISH');
  });
});

describe('getSimulationBackedMovesetForTeam', () => {
  it('keeps the ranked default until a format manifest is published', () => {
    const golisopod = getPokemonBySpeciesId('golisopod');
    expect(golisopod).toBeDefined();
    ensureSimulationDataAvailable('great-league');

    expect(
      getSimulationBackedMovesetForTeam(
        golisopod!,
        ['golisopod', 'milotic', 'goodra'],
        'great-league',
      ),
    ).toEqual(getRecommendedMovesetForPokemon(golisopod!, 'great-league'));
  });

  it('propagates malformed manifest data instead of choosing a moveset', () => {
    const golisopod = getPokemonBySpeciesId('golisopod');
    expect(golisopod).toBeDefined();

    expect(() =>
      getSimulationBackedMovesetForTeam(
        golisopod!,
        ['golisopod', 'milotic', 'goodra'],
        'great-league',
        {
          getVariants: () => {
            throw new MovesetVariantSimulationDataError(
              'manifest-malformed',
              'great-league',
              'data/simulations/cp1500/all/moveset-variants.json',
            );
          },
          getThreats: () => [],
          getDefaultMatchupRating: () => null,
          getVariantMatchupRating: () => null,
        },
      ),
    ).toThrowError(expect.objectContaining({ code: 'manifest-malformed' }));
  });

  it('uses the manifest default when no threat comparison is needed', () => {
    const golisopod = getPokemonBySpeciesId('golisopod');
    expect(golisopod).toBeDefined();
    const manifestVariants: readonly MovesetVariant[] = [
      {
        ...simulationVariants[0],
        id: 'waterfall--x_scissor--aqua_jet',
        fastMove: 'WATERFALL',
      },
      simulationVariants[1],
    ];

    expect(
      getSimulationBackedMovesetForTeam(
        golisopod!,
        ['golisopod', 'milotic', 'goodra'],
        'great-league',
        {
          getVariants: () => manifestVariants,
          getThreats: () => [],
          getDefaultMatchupRating: () => null,
          getVariantMatchupRating: () => null,
        },
      ).fastMove,
    ).toBe('WATERFALL');
  });

  it('selects an alternate that improves an unresolved simulated threat', () => {
    const golisopod = getPokemonBySpeciesId('golisopod');
    expect(golisopod).toBeDefined();

    const moveset = getSimulationBackedMovesetForTeam(
      golisopod!,
      ['golisopod', 'milotic', 'goodra'],
      'battle-frontier-coupe-du-sillage',
      {
        getVariants: () => simulationVariants,
        getThreats: () => ['mewtwo'],
        getDefaultMatchupRating: (speciesId) =>
          speciesId === 'golisopod' ? 400 : 300,
        getVariantMatchupRating: () => 600,
      },
    );

    expect(moveset.fastMove).toBe('SHADOW_CLAW');
  });

  it('keeps the default when teammates already cover the threat', () => {
    const golisopod = getPokemonBySpeciesId('golisopod');
    expect(golisopod).toBeDefined();

    const moveset = getSimulationBackedMovesetForTeam(
      golisopod!,
      ['golisopod', 'milotic', 'goodra'],
      'battle-frontier-coupe-du-sillage',
      {
        getVariants: () => simulationVariants,
        getThreats: () => ['mewtwo'],
        getDefaultMatchupRating: (speciesId) =>
          speciesId === 'milotic' ? 600 : 400,
        getVariantMatchupRating: () => 700,
      },
    );

    expect(moveset.fastMove).toBe('FURY_CUTTER');
  });
});

describe('roster moveset assignments', () => {
  const manifestPolicy: MovesetAssignmentPolicyIdentity = {
    source: 'manifest',
    schemaVersion: 1,
    policyVersion: 'ranking-evidence-v1',
  };
  const defaultVariant: MovesetVariant = simulationVariants[0];
  const alternateVariant: MovesetVariant = simulationVariants[1];

  it('creates a deeply immutable assignment with stable canonical identity', () => {
    const first = createRosterMovesetAssignment({
      formatId: 'great-league',
      authorityBySpeciesId: {
        milotic: manifestPolicy,
        golisopod: manifestPolicy,
      },
      variantsBySpeciesId: {
        milotic: defaultVariant,
        golisopod: alternateVariant,
      },
    });
    const reordered = createRosterMovesetAssignment({
      formatId: 'great-league',
      authorityBySpeciesId: {
        golisopod: manifestPolicy,
        milotic: manifestPolicy,
      },
      variantsBySpeciesId: {
        golisopod: alternateVariant,
        milotic: defaultVariant,
      },
    });

    expect(first.fingerprint).toBe(reordered.fingerprint);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.authorityBySpeciesId)).toBe(true);
    expect(Object.isFrozen(first.authorityBySpeciesId.golisopod)).toBe(true);
    expect(Object.isFrozen(first.variantsBySpeciesId)).toBe(true);
    expect(Object.isFrozen(first.variantsBySpeciesId.golisopod)).toBe(true);
  });

  it('includes format, manifest policy, and variant identity in fingerprints', () => {
    const createFingerprint = (
      formatId: 'great-league' | 'ultra-league',
      policyVersion: string,
      variant: MovesetVariant,
    ): string =>
      createRosterMovesetAssignment({
        formatId,
        authorityBySpeciesId: {
          golisopod: { ...manifestPolicy, policyVersion },
        },
        variantsBySpeciesId: { golisopod: variant },
      }).fingerprint;
    const baseline = createFingerprint(
      'great-league',
      'ranking-evidence-v1',
      defaultVariant,
    );

    expect(
      createFingerprint('ultra-league', 'ranking-evidence-v1', defaultVariant),
    ).not.toBe(baseline);
    expect(
      createFingerprint('great-league', 'ranking-evidence-v2', defaultVariant),
    ).not.toBe(baseline);
    expect(
      createFingerprint(
        'great-league',
        'ranking-evidence-v1',
        alternateVariant,
      ),
    ).not.toBe(baseline);
    expect(
      createFingerprint('great-league', 'ranking-evidence-v1', {
        ...defaultVariant,
        isDefault: false,
      }),
    ).not.toBe(baseline);
  });

  it('includes each species authority in mixed-assignment fingerprints', () => {
    const fallbackPolicy: MovesetAssignmentPolicyIdentity = {
      source: 'ranked-default-fallback',
      schemaVersion: 0,
      policyVersion: 'ranked-default-v1',
    };
    const createMixedAssignment = (
      golisopodAuthority: MovesetAssignmentPolicyIdentity,
    ) =>
      createRosterMovesetAssignment({
        formatId: 'great-league',
        authorityBySpeciesId: {
          milotic: fallbackPolicy,
          golisopod: golisopodAuthority,
        },
        variantsBySpeciesId: {
          golisopod: defaultVariant,
          milotic: defaultVariant,
        },
      });

    const mixed = createMixedAssignment(manifestPolicy);
    const allFallback = createMixedAssignment(fallbackPolicy);

    expect(mixed.fingerprint).not.toBe(allFallback.fingerprint);
    expect(getAssignedMovesetVariantId(mixed, 'golisopod')).toBe(
      defaultVariant.id,
    );
    expect(getAssignedMovesetVariantId(mixed, 'milotic')).toBeUndefined();
  });

  it('rejects authority keys that do not exactly match assigned variants', () => {
    expect(() =>
      createRosterMovesetAssignment({
        formatId: 'great-league',
        authorityBySpeciesId: { golisopod: manifestPolicy },
        variantsBySpeciesId: {
          golisopod: defaultVariant,
          milotic: defaultVariant,
        },
      }),
    ).toThrow('authority species do not match assigned variants');
  });

  it('does not require a ranked fallback when manifest variants are available', () => {
    const golisopod = getPokemonBySpeciesId('golisopod');
    expect(golisopod).toBeDefined();

    expect(
      getSimulationBackedMovesetForTeam(
        golisopod!,
        ['golisopod', 'milotic'],
        'great-league',
        {
          getVariants: () => [defaultVariant],
          getThreats: () => [],
          getDefaultMatchupRating: () => null,
          getVariantMatchupRating: () => null,
          getRankedDefault: () => {
            throw new Error('ranked fallback must remain lazy');
          },
        },
      ),
    ).toEqual({
      fastMove: defaultVariant.fastMove,
      chargedMove1: defaultVariant.chargedMove1,
      chargedMove2: defaultVariant.chargedMove2,
    });
  });

  it('uses the injected ranked default only when the species has no active variants', () => {
    const golisopod = getPokemonBySpeciesId('golisopod');
    expect(golisopod).toBeDefined();
    const fallbackMoveset = {
      fastMove: 'WATERFALL',
      chargedMove1: 'X_SCISSOR',
      chargedMove2: 'AQUA_JET',
    };

    expect(
      getSimulationBackedMovesetForTeam(
        golisopod!,
        ['golisopod', 'milotic'],
        'great-league',
        {
          getVariants: () => {
            throw new MovesetVariantSimulationDataError(
              'variant-unavailable',
              'great-league',
              'runtime-snapshot.json',
              'golisopod',
            );
          },
          getThreats: () => [],
          getDefaultMatchupRating: () => null,
          getVariantMatchupRating: () => null,
          getRankedDefault: () => fallbackMoveset,
        },
      ),
    ).toEqual(fallbackMoveset);
  });

  it('resolves every roster species once against the complete roster', () => {
    const roster = ['golisopod', 'milotic'];
    const requestedRosters: string[][] = [];
    const pokemonById = new Map(
      roster.map((speciesId) => [
        speciesId,
        { speciesId, speciesName: speciesId } as Pokemon,
      ]),
    );

    const assignment = resolveRosterMovesetAssignment(roster, 'great-league', {
      getPokemon: (speciesId) => pokemonById.get(speciesId),
      getManifestPolicyIdentity: () => ({
        schemaVersion: 1,
        policyVersion: 'ranking-evidence-v1',
      }),
      getMovesetVariantForTeam: (_pokemon, team) => {
        requestedRosters.push([...team]);
        return defaultVariant;
      },
      getRankedDefault: () => {
        throw new Error('ranked fallback must remain lazy');
      },
    });

    expect(requestedRosters).toEqual([roster, roster]);
    expect(Object.keys(assignment.variantsBySpeciesId)).toEqual([
      'golisopod',
      'milotic',
    ]);
  });

  it('enumerates at most three active variants per roster member deterministically', () => {
    const roster = ['a', 'b', 'c', 'd', 'e', 'f'];
    const variants = [
      defaultVariant,
      alternateVariant,
      {
        ...alternateVariant,
        id: 'waterfall--x_scissor--aqua_jet' as const,
        fastMove: 'WATERFALL',
      },
    ];
    const pokemonById = new Map(
      roster.map((speciesId) => [
        speciesId,
        { speciesId, speciesName: speciesId } as Pokemon,
      ]),
    );
    const dependencies = {
      getPokemon: (speciesId: string) => pokemonById.get(speciesId),
      getManifestPolicyIdentity: () => ({
        schemaVersion: 1,
        policyVersion: 'ranking-evidence-v1',
      }),
      getActiveVariants: () => [...variants].reverse(),
      getRankedDefault: () => {
        throw new Error('ranked fallback must remain lazy');
      },
    };

    const first = enumerateRosterMovesetAssignments(
      roster,
      'great-league',
      dependencies,
    );
    const second = enumerateRosterMovesetAssignments(roster, 'great-league', {
      ...dependencies,
      getActiveVariants: () => variants,
    });

    expect(first).toHaveLength(729);
    expect(new Set(first.map(({ fingerprint }) => fingerprint))).toHaveLength(
      729,
    );
    expect(first.map(({ fingerprint }) => fingerprint)).toEqual(
      second.map(({ fingerprint }) => fingerprint),
    );
  });

  it('resolves unsupported species through ranked defaults without changing supported teammates', () => {
    const roster = ['golisopod', 'milotic'];
    const pokemonById = new Map(
      roster.map((speciesId) => [
        speciesId,
        { speciesId, speciesName: speciesId } as Pokemon,
      ]),
    );
    const requestedSpeciesIds: string[] = [];

    const assignment = resolveRosterMovesetAssignment(roster, 'great-league', {
      getPokemon: (speciesId) => pokemonById.get(speciesId),
      getManifestPolicyIdentity: () => ({
        schemaVersion: 1,
        policyVersion: 'ranking-evidence-v1',
      }),
      getMovesetVariantForTeam: (pokemon) => {
        if (pokemon.speciesId === 'golisopod') {
          throw new MovesetVariantSimulationDataError(
            'variant-unavailable',
            'great-league',
            'runtime-snapshot.json',
            'golisopod',
          );
        }
        return alternateVariant;
      },
      getRankedDefault: (pokemon) => {
        requestedSpeciesIds.push(pokemon.speciesId);
        return {
          fastMove:
            pokemon.speciesId === 'golisopod' ? 'WATERFALL' : 'DRAGON_TAIL',
          chargedMove1: 'SURF',
          chargedMove2: 'BLIZZARD',
        };
      },
    });

    expect(requestedSpeciesIds).toEqual(['golisopod']);
    expect(assignment.authorityBySpeciesId.golisopod.source).toBe(
      'ranked-default-fallback',
    );
    expect(assignment.authorityBySpeciesId.milotic).toEqual(manifestPolicy);
    expect(assignment.variantsBySpeciesId.golisopod.fastMove).toBe('WATERFALL');
    expect(assignment.variantsBySpeciesId.milotic).toEqual(alternateVariant);
    expect(
      getAssignedMovesetVariantId(assignment, 'golisopod'),
    ).toBeUndefined();
    expect(getAssignedMovesetVariantId(assignment, 'milotic')).toBe(
      alternateVariant.id,
    );
  });

  it('enumerates deterministic mixed-authority assignments for unsupported species', () => {
    const roster = ['anchor', 'a', 'b', 'c', 'd', 'e'];
    const pokemonById = new Map(
      roster.map((speciesId) => [
        speciesId,
        { speciesId, speciesName: speciesId } as Pokemon,
      ]),
    );
    const variants = [
      defaultVariant,
      alternateVariant,
      {
        ...alternateVariant,
        id: 'waterfall--x_scissor--aqua_jet' as const,
        fastMove: 'WATERFALL',
      },
    ];
    const getActiveVariants = (
      speciesId: string,
    ): readonly MovesetVariant[] => {
      if (speciesId === 'anchor') {
        throw new MovesetVariantSimulationDataError(
          'variant-unavailable',
          'great-league',
          'runtime-snapshot.json',
          'anchor',
        );
      }
      return [...variants].reverse();
    };
    const dependencies = {
      getPokemon: (speciesId: string) => pokemonById.get(speciesId),
      getManifestPolicyIdentity: () => ({
        schemaVersion: 1,
        policyVersion: 'ranking-evidence-v1',
      }),
      getActiveVariants,
      getRankedDefault: () => ({
        fastMove: 'WATERFALL',
        chargedMove1: 'SURF',
        chargedMove2: 'BLIZZARD',
      }),
    };

    const first = enumerateRosterMovesetAssignments(
      roster,
      'great-league',
      dependencies,
    );
    const second = enumerateRosterMovesetAssignments(roster, 'great-league', {
      ...dependencies,
      getActiveVariants: (speciesId) =>
        speciesId === 'anchor' ? getActiveVariants(speciesId) : [...variants],
    });

    expect(first).toHaveLength(3 ** 5);
    expect(first.map(({ fingerprint }) => fingerprint)).toEqual(
      second.map(({ fingerprint }) => fingerprint),
    );
    expect(
      first.every(
        (assignment) =>
          assignment.authorityBySpeciesId.anchor.source ===
            'ranked-default-fallback' &&
          getAssignedMovesetVariantId(assignment, 'anchor') === undefined &&
          roster
            .slice(1)
            .every(
              (speciesId) =>
                assignment.authorityBySpeciesId[speciesId]?.source ===
                  'manifest' &&
                getAssignedMovesetVariantId(assignment, speciesId) !==
                  undefined,
            ),
      ),
    ).toBe(true);
  });

  it('resolves a deterministic ranked-default assignment without manifest access', () => {
    const roster = ['golisopod', 'milotic'];
    const pokemonById = new Map(
      roster.map((speciesId) => [
        speciesId,
        { speciesId, speciesName: speciesId } as Pokemon,
      ]),
    );
    const requestedSpeciesIds: string[] = [];

    const assignment = resolveRankedDefaultRosterMovesetAssignment(
      roster,
      'great-league',
      {
        getPokemon: (speciesId) => pokemonById.get(speciesId),
        getRankedDefault: (pokemon) => {
          requestedSpeciesIds.push(pokemon.speciesId);
          return {
            fastMove: 'WATERFALL',
            chargedMove1: 'SURF',
            chargedMove2: 'BLIZZARD',
          };
        },
      },
    );

    expect(requestedSpeciesIds).toEqual(roster);
    expect(assignment.authorityBySpeciesId.golisopod.source).toBe(
      'ranked-default-fallback',
    );
    expect(assignment.authorityBySpeciesId.milotic.source).toBe(
      'ranked-default-fallback',
    );
    expect(Object.values(assignment.variantsBySpeciesId)).toEqual([
      expect.objectContaining({ isDefault: true }),
      expect.objectContaining({ isDefault: true }),
    ]);
    expect(Object.isFrozen(assignment)).toBe(true);
    expect(Object.isFrozen(assignment.variantsBySpeciesId)).toBe(true);
  });

  it.each<MovesetVariantSimulationDataErrorCode>([
    'manifest-missing',
    'manifest-malformed',
    'manifest-incompatible',
    'manifest-incomplete',
    'snapshot-not-prepared',
  ])('propagates %s policy failures without ranked fallback', (code) => {
    let fallbackCallCount = 0;

    expect(() =>
      resolveRosterMovesetAssignment(['golisopod'], 'great-league', {
        getPokemon: getPokemonBySpeciesId,
        getManifestPolicyIdentity: () => {
          throw new MovesetVariantSimulationDataError(
            code,
            'great-league',
            'moveset-variants.json',
          );
        },
        getMovesetVariantForTeam: () => defaultVariant,
        getRankedDefault: () => {
          fallbackCallCount++;
          return defaultVariant;
        },
      }),
    ).toThrowError(expect.objectContaining({ code }));
    expect(fallbackCallCount).toBe(0);
  });

  it.each<MovesetVariantSimulationDataErrorCode>([
    'manifest-missing',
    'manifest-malformed',
    'manifest-incompatible',
    'manifest-incomplete',
    'snapshot-not-prepared',
  ])('propagates %s species-resolution failures without fallback', (code) => {
    let fallbackCallCount = 0;

    expect(() =>
      resolveRosterMovesetAssignment(['golisopod'], 'great-league', {
        getPokemon: getPokemonBySpeciesId,
        getManifestPolicyIdentity: () => ({
          schemaVersion: 1,
          policyVersion: 'ranking-evidence-v1',
        }),
        getMovesetVariantForTeam: () => {
          throw new MovesetVariantSimulationDataError(
            code,
            'great-league',
            'runtime-snapshot.json',
            'golisopod',
          );
        },
        getRankedDefault: () => {
          fallbackCallCount++;
          return defaultVariant;
        },
      }),
    ).toThrowError(expect.objectContaining({ code }));
    expect(fallbackCallCount).toBe(0);
  });

  it.each<MovesetVariantSimulationDataErrorCode>([
    'manifest-missing',
    'manifest-malformed',
    'manifest-incompatible',
    'manifest-incomplete',
    'snapshot-not-prepared',
  ])('propagates %s active-variant failures without fallback', (code) => {
    let fallbackCallCount = 0;

    expect(() =>
      enumerateRosterMovesetAssignments(['golisopod'], 'great-league', {
        getPokemon: getPokemonBySpeciesId,
        getManifestPolicyIdentity: () => ({
          schemaVersion: 1,
          policyVersion: 'ranking-evidence-v1',
        }),
        getActiveVariants: () => {
          throw new MovesetVariantSimulationDataError(
            code,
            'great-league',
            'runtime-snapshot.json',
            'golisopod',
          );
        },
        getRankedDefault: () => {
          fallbackCallCount++;
          return defaultVariant;
        },
      }),
    ).toThrowError(expect.objectContaining({ code }));
    expect(fallbackCallCount).toBe(0);
  });

  it.each([
    { formatId: 'ultra-league' as const, speciesId: 'golisopod' },
    { formatId: 'great-league' as const, speciesId: 'milotic' },
    {
      formatId: 'great-league' as const,
      speciesId: 'golisopod',
      variantId: defaultVariant.id,
    },
  ])(
    'propagates mismatched unavailable variant errors without ranked fallback',
    ({ formatId, speciesId, variantId }) => {
      let fallbackCallCount = 0;

      expect(() =>
        resolveRosterMovesetAssignment(['golisopod'], 'great-league', {
          getPokemon: getPokemonBySpeciesId,
          getManifestPolicyIdentity: () => ({
            schemaVersion: 1,
            policyVersion: 'ranking-evidence-v1',
          }),
          getMovesetVariantForTeam: () => {
            throw new MovesetVariantSimulationDataError(
              'variant-unavailable',
              formatId,
              'runtime-snapshot.json',
              speciesId,
              variantId,
            );
          },
          getRankedDefault: () => {
            fallbackCallCount++;
            return defaultVariant;
          },
        }),
      ).toThrowError(expect.objectContaining({ code: 'variant-unavailable' }));
      expect(fallbackCallCount).toBe(0);
    },
  );

  it.each([
    { formatId: 'ultra-league' as const, speciesId: 'golisopod' },
    { formatId: 'great-league' as const, speciesId: 'milotic' },
    {
      formatId: 'great-league' as const,
      speciesId: 'golisopod',
      variantId: defaultVariant.id,
    },
  ])(
    'propagates mismatched unavailable active variants without ranked fallback',
    ({ formatId, speciesId, variantId }) => {
      let fallbackCallCount = 0;

      expect(() =>
        enumerateRosterMovesetAssignments(['golisopod'], 'great-league', {
          getPokemon: getPokemonBySpeciesId,
          getManifestPolicyIdentity: () => ({
            schemaVersion: 1,
            policyVersion: 'ranking-evidence-v1',
          }),
          getActiveVariants: () => {
            throw new MovesetVariantSimulationDataError(
              'variant-unavailable',
              formatId,
              'runtime-snapshot.json',
              speciesId,
              variantId,
            );
          },
          getRankedDefault: () => {
            fallbackCallCount++;
            return defaultVariant;
          },
        }),
      ).toThrowError(expect.objectContaining({ code: 'variant-unavailable' }));
      expect(fallbackCallCount).toBe(0);
    },
  );
});
