import { describe, expect, it } from 'vitest';
import {
  createRosterMovesetAssignment,
  enumerateRosterMovesetAssignments,
  getRecommendedMovesetForPokemon,
  getSimulationBackedMovesetForTeam,
  getSimulationBackedMovesetVariantForTeam,
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
      policyIdentity: manifestPolicy,
      variantsBySpeciesId: {
        milotic: defaultVariant,
        golisopod: alternateVariant,
      },
    });
    const reordered = createRosterMovesetAssignment({
      formatId: 'great-league',
      policyIdentity: manifestPolicy,
      variantsBySpeciesId: {
        golisopod: alternateVariant,
        milotic: defaultVariant,
      },
    });

    expect(first.fingerprint).toBe(reordered.fingerprint);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.policyIdentity)).toBe(true);
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
        policyIdentity: { ...manifestPolicy, policyVersion },
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

  it('does not require a ranked fallback when manifest variants are available', () => {
    const golisopod = getPokemonBySpeciesId('golisopod');
    expect(golisopod).toBeDefined();

    expect(
      getSimulationBackedMovesetVariantForTeam(
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
    ).toEqual(defaultVariant);
  });

  it('uses the injected ranked default only when the manifest is missing', () => {
    const golisopod = getPokemonBySpeciesId('golisopod');
    expect(golisopod).toBeDefined();
    const fallbackMoveset = {
      fastMove: 'WATERFALL',
      chargedMove1: 'X_SCISSOR',
      chargedMove2: 'AQUA_JET',
    };

    expect(
      getSimulationBackedMovesetVariantForTeam(
        golisopod!,
        ['golisopod', 'milotic'],
        'great-league',
        {
          getVariants: () => {
            throw new MovesetVariantSimulationDataError(
              'manifest-missing',
              'great-league',
              'moveset-variants.json',
            );
          },
          getThreats: () => [],
          getDefaultMatchupRating: () => null,
          getVariantMatchupRating: () => null,
          getRankedDefault: () => fallbackMoveset,
        },
      ),
    ).toEqual({
      ...fallbackMoveset,
      id: 'waterfall--x_scissor--aqua_jet',
      isDefault: true,
    });
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

  it('uses the injected ranked default for every species only when policy authority is missing', () => {
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
      getManifestPolicyIdentity: () => {
        throw new MovesetVariantSimulationDataError(
          'manifest-missing',
          'great-league',
          'moveset-variants.json',
        );
      },
      getMovesetVariantForTeam: () => {
        throw new Error('manifest selection must not run during fallback');
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

    expect(requestedSpeciesIds).toEqual(roster);
    expect(assignment.policyIdentity.source).toBe('ranked-default-fallback');
    expect(assignment.variantsBySpeciesId.golisopod.fastMove).toBe('WATERFALL');
    expect(assignment.variantsBySpeciesId.milotic.fastMove).toBe('DRAGON_TAIL');
  });

  it.each<MovesetVariantSimulationDataErrorCode>([
    'manifest-malformed',
    'manifest-incompatible',
    'manifest-incomplete',
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

  it('propagates unavailable manifest variants without ranked fallback', () => {
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
            'great-league',
            'moveset-variants.json',
            'golisopod',
          );
        },
        getRankedDefault: () => {
          fallbackCallCount++;
          return defaultVariant;
        },
      }),
    ).toThrowError(expect.objectContaining({ code: 'variant-unavailable' }));
    expect(fallbackCallCount).toBe(0);
  });
});
