import { describe, expect, it } from 'vitest';
import {
  buildMovesetVariantManifest,
  createMovesetVariantSourceDigest,
  selectActiveMovesetVariants,
  serializeBuiltMovesetVariantManifest,
  type MovesetVariantSimulationEvidence,
} from './movesetVariantManifest';
import {
  MAX_ACTIVE_MOVESET_VARIANTS,
  MAX_MOVESET_CANDIDATES,
  type MovesetVariantManifestSpecies,
} from '@/lib/data/movesetVariantManifest';
import type { ShieldScenarioKey } from '@/lib/types';

function createSpecies(
  speciesId: string,
  fastMove: string,
): MovesetVariantManifestSpecies {
  const variantId = `${fastMove.toLowerCase()}--x_scissor--aqua_jet` as const;
  return {
    speciesId,
    defaultVariantId: variantId,
    evidence: {
      pvpokeScorePrior: 90,
      retainedFastMoves: [fastMove],
      retainedChargedMoves: ['X_SCISSOR', 'AQUA_JET'],
      rejections: [],
    },
    candidates: [
      {
        id: variantId,
        fastMove,
        chargedMove1: 'X_SCISSOR',
        chargedMove2: 'AQUA_JET',
        isDefault: true,
        evidence: {
          kind: 'preferred',
          sourceCategories: ['overall'],
          sourceVariantIds: [variantId],
        },
        acquisitionRequirements: {
          fastMove: { kind: 'regular' },
          chargedMove1: { kind: 'regular' },
          chargedMove2: { kind: 'regular' },
        },
        storageKeys: {
          '0-0': `${speciesId}_0-0.csv`,
          '1-1': `${speciesId}_1-1.csv`,
          '2-2': `${speciesId}_2-2.csv`,
        },
        completeness: { '0-0': true, '1-1': true, '2-2': true },
        evaluationCounts: { '0-0': 100, '1-1': 100, '2-2': 100 },
        active: true,
      },
    ],
  };
}

function addAlternateCandidate(
  species: MovesetVariantManifestSpecies,
): MovesetVariantManifestSpecies {
  const defaultCandidate = species.candidates[0]!;
  const id = 'shadow_claw--x_scissor--aqua_jet';
  return {
    ...species,
    candidates: [
      defaultCandidate,
      {
        ...defaultCandidate,
        id,
        fastMove: 'SHADOW_CLAW',
        isDefault: false,
        evidence: {
          kind: 'substitution',
          sourceCategories: ['switches', 'overall'],
          sourceVariantIds: [id, defaultCandidate.id],
        },
        storageKeys: {
          '0-0': `${species.speciesId}--${id}_0-0.csv`,
          '1-1': `${species.speciesId}--${id}_1-1.csv`,
          '2-2': `${species.speciesId}--${id}_2-2.csv`,
        },
        active: false,
      },
    ],
  };
}

function addOrderedRejections(
  species: MovesetVariantManifestSpecies,
  reverse: boolean,
): MovesetVariantManifestSpecies {
  const rejections = [
    {
      sourceMoveset: {
        fastMove: 'WATERFALL',
        chargedMove1: 'AQUA_JET',
        chargedMove2: 'X_SCISSOR',
      },
      excludedMove: 'ACID',
      reason: 'Excluded legacy move.',
    },
    {
      sourceMoveset: {
        fastMove: 'WATERFALL',
        chargedMove1: 'X_SCISSOR',
        chargedMove2: 'AQUA_JET',
      },
      excludedMove: 'ACID',
      reason: 'Excluded legacy move.',
    },
  ];
  return {
    ...species,
    evidence: {
      ...species.evidence,
      rejections: reverse ? rejections.reverse() : rejections,
    },
  };
}

const derivationSettings = {
  maxCandidatesPerSpecies: MAX_MOVESET_CANDIDATES,
  maxActiveVariantsPerSpecies: MAX_ACTIVE_MOVESET_VARIANTS,
  maxExpansionFastMoves: 2,
  maxExpansionChargedMoves: 4,
  requiredScenarios: ['0-0', '1-1', '2-2'],
  categoryWeights: {
    overall: 3,
    leads: 2,
    switches: 2,
    closers: 2,
    chargers: 1,
    attackers: 1,
    consistency: 1,
  },
} as const;

function createSimulationEvidence(
  id: `${string}--${string}--${string}`,
  isDefault: boolean,
  ratings: Readonly<Record<string, number>>,
  omittedScenario?: ShieldScenarioKey,
): MovesetVariantSimulationEvidence {
  return {
    id,
    isDefault,
    scenarios: {
      '0-0':
        omittedScenario === '0-0'
          ? null
          : Object.entries(ratings).map(([opponentId, rating]) => ({
              opponentId,
              rating,
            })),
      '1-1':
        omittedScenario === '1-1'
          ? null
          : Object.entries(ratings).map(([opponentId, rating]) => ({
              opponentId,
              rating,
            })),
      '2-2':
        omittedScenario === '2-2'
          ? null
          : Object.entries(ratings).map(([opponentId, rating]) => ({
              opponentId,
              rating,
            })),
    },
  };
}

describe('active moveset variant selection', () => {
  const defaultId = 'vine_whip--power_whip--sludge_bomb' as const;
  const primaryId = 'tackle--power_whip--sludge_bomb' as const;
  const secondaryId = 'razor_leaf--power_whip--sludge_bomb' as const;
  const topMetaOpponentIds = ['azumarill'];
  const fullMetaOpponentIds = ['azumarill', 'lanturn'];

  it('preserves the default for ties and incomplete alternatives', () => {
    const tied = createSimulationEvidence(primaryId, false, {
      azumarill: 500,
      lanturn: 500,
    });
    const incomplete = createSimulationEvidence(
      secondaryId,
      false,
      { azumarill: 700, lanturn: 700 },
      '2-2',
    );

    const result = selectActiveMovesetVariants({
      candidates: [
        createSimulationEvidence(defaultId, true, {
          azumarill: 500,
          lanturn: 500,
        }),
        tied,
        incomplete,
      ],
      topMetaOpponentIds,
      fullMetaOpponentIds,
    });

    expect(result.activeVariantIds).toEqual([defaultId]);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        id: defaultId,
        active: true,
        completeness: { '0-0': true, '1-1': true, '2-2': true },
        evaluationCounts: { '0-0': 2, '1-1': 2, '2-2': 2 },
      }),
      expect.objectContaining({ id: primaryId, active: false }),
      expect.objectContaining({
        id: secondaryId,
        active: false,
        completeness: { '0-0': true, '1-1': true, '2-2': false },
      }),
    ]);
  });

  it('weights continuous top-meta improvement above full-meta regression', () => {
    const result = selectActiveMovesetVariants({
      candidates: [
        createSimulationEvidence(defaultId, true, {
          azumarill: 500,
          lanturn: 500,
        }),
        createSimulationEvidence(primaryId, false, {
          azumarill: 520,
          lanturn: 480,
        }),
      ],
      topMetaOpponentIds,
      fullMetaOpponentIds,
    });

    expect(result.activeVariantIds).toEqual([defaultId, primaryId]);
    expect(result.candidates[1]?.active).toBe(true);
    expect(result.candidates[1]?.weightedImprovement).toBeCloseTo(0.07);
  });

  it('preserves the default for offsetting weighted improvements', () => {
    const result = selectActiveMovesetVariants({
      candidates: [
        createSimulationEvidence(defaultId, true, {
          azumarill: 500,
          lanturn: 500,
        }),
        createSimulationEvidence(primaryId, false, {
          azumarill: 503,
          lanturn: 483,
        }),
      ],
      topMetaOpponentIds,
      fullMetaOpponentIds,
    });

    expect(result.activeVariantIds).toEqual([defaultId]);
    expect(result.candidates[1]?.weightedImprovement).toBeCloseTo(0);
  });

  it('rejects sparse and non-finite alternatives', () => {
    const result = selectActiveMovesetVariants({
      candidates: [
        createSimulationEvidence(defaultId, true, {
          azumarill: 500,
          lanturn: 500,
        }),
        createSimulationEvidence(primaryId, false, {
          azumarill: 600,
        }),
        createSimulationEvidence(secondaryId, false, {
          azumarill: 600,
          lanturn: Number.NaN,
        }),
      ],
      topMetaOpponentIds,
      fullMetaOpponentIds,
    });

    expect(result.activeVariantIds).toEqual([defaultId]);
    expect(result.candidates.slice(1)).toEqual([
      expect.objectContaining({ active: false, eligible: false }),
      expect.objectContaining({ active: false, eligible: false }),
    ]);
  });

  it('activates a second alternate only for positive marginal coverage', () => {
    const duplicatePrimary = createSimulationEvidence(
      'quick_attack--power_whip--sludge_bomb',
      false,
      { azumarill: 520, lanturn: 500 },
    );
    const result = selectActiveMovesetVariants({
      candidates: [
        createSimulationEvidence(defaultId, true, {
          azumarill: 500,
          lanturn: 500,
        }),
        createSimulationEvidence(primaryId, false, {
          azumarill: 540,
          lanturn: 500,
        }),
        duplicatePrimary,
        createSimulationEvidence(secondaryId, false, {
          azumarill: 100,
          lanturn: 560,
        }),
      ],
      topMetaOpponentIds,
      fullMetaOpponentIds,
    });

    expect(result.activeVariantIds).toEqual([
      defaultId,
      primaryId,
      secondaryId,
    ]);
    expect(
      result.candidates.find(({ id }) => id === duplicatePrimary.id),
    ).toMatchObject({ active: false, marginalImprovement: 0 });
    expect(
      result.candidates.find(({ id }) => id === secondaryId),
    ).toMatchObject({ active: true });
    expect(
      result.candidates.find(({ id }) => id === secondaryId)
        ?.weightedImprovement,
    ).toBeLessThan(0);
    expect(
      result.candidates.find(({ id }) => id === secondaryId)
        ?.marginalImprovement,
    ).toBeCloseTo(0.045);
  });

  it('uses canonical ids as the final stable tie-breaker', () => {
    const alphabeticId = 'razor_leaf--power_whip--sludge_bomb' as const;
    const laterId = 'tackle--power_whip--sludge_bomb' as const;
    const candidates = [
      createSimulationEvidence(defaultId, true, {
        azumarill: 500,
        lanturn: 500,
      }),
      createSimulationEvidence(laterId, false, {
        azumarill: 520,
        lanturn: 520,
      }),
      createSimulationEvidence(alphabeticId, false, {
        azumarill: 520,
        lanturn: 520,
      }),
    ];

    const ordered = selectActiveMovesetVariants({
      candidates,
      topMetaOpponentIds,
      fullMetaOpponentIds,
    });
    const shuffled = selectActiveMovesetVariants({
      candidates: [...candidates].reverse(),
      topMetaOpponentIds: [...topMetaOpponentIds].reverse(),
      fullMetaOpponentIds: [...fullMetaOpponentIds].reverse(),
    });

    expect(ordered.activeVariantIds).toEqual([defaultId, alphabeticId]);
    expect(shuffled.activeVariantIds).toEqual(ordered.activeVariantIds);
  });

  it('ranks primary epsilon chains independently of candidate order', () => {
    const alphabeticId = 'quick_attack--power_whip--sludge_bomb' as const;
    const middleId = 'razor_leaf--power_whip--sludge_bomb' as const;
    const highestId = 'tackle--power_whip--sludge_bomb' as const;
    const defaultCandidate = createSimulationEvidence(defaultId, true, {
      azumarill: 500,
      lanturn: 500,
    });
    const epsilonChain = [
      createSimulationEvidence(alphabeticId, false, {
        azumarill: 520,
        lanturn: 520,
      }),
      createSimulationEvidence(middleId, false, {
        azumarill: 520 + 1.5e-10,
        lanturn: 520 + 1.5e-10,
      }),
      createSimulationEvidence(highestId, false, {
        azumarill: 520 + 3e-10,
        lanturn: 520 + 3e-10,
      }),
    ];
    const candidateOrders = [
      epsilonChain,
      [epsilonChain[0]!, epsilonChain[2]!, epsilonChain[1]!],
      [epsilonChain[1]!, epsilonChain[0]!, epsilonChain[2]!],
      [epsilonChain[1]!, epsilonChain[2]!, epsilonChain[0]!],
      [epsilonChain[2]!, epsilonChain[0]!, epsilonChain[1]!],
      [...epsilonChain].reverse(),
    ];

    const selections = candidateOrders.map((candidates) =>
      selectActiveMovesetVariants({
        candidates: [defaultCandidate, ...candidates],
        topMetaOpponentIds,
        fullMetaOpponentIds,
      }),
    );

    expect(
      selections.map(({ activeVariantIds }) => activeVariantIds[1]),
    ).toEqual(Array.from({ length: candidateOrders.length }, () => highestId));
  });

  it('ranks secondary epsilon chains independently of candidate order', () => {
    const alphabeticId = 'quick_attack--power_whip--sludge_bomb' as const;
    const middleId = 'razor_leaf--power_whip--sludge_bomb' as const;
    const laterId = 'wing_attack--power_whip--sludge_bomb' as const;
    const defaultCandidate = createSimulationEvidence(defaultId, true, {
      azumarill: 500,
      lanturn: 500,
    });
    const primaryCandidate = createSimulationEvidence(primaryId, false, {
      azumarill: 500,
      lanturn: 700,
    });
    const epsilonChain = [
      createSimulationEvidence(alphabeticId, false, {
        azumarill: 510,
        lanturn: 100,
      }),
      createSimulationEvidence(middleId, false, {
        azumarill: 510 + 1.5e-10,
        lanturn: 100,
      }),
      createSimulationEvidence(laterId, false, {
        azumarill: 510 + 3e-10,
        lanturn: 100,
      }),
    ];
    const candidateOrders = [
      epsilonChain,
      [epsilonChain[0]!, epsilonChain[2]!, epsilonChain[1]!],
      [epsilonChain[1]!, epsilonChain[0]!, epsilonChain[2]!],
      [epsilonChain[1]!, epsilonChain[2]!, epsilonChain[0]!],
      [epsilonChain[2]!, epsilonChain[0]!, epsilonChain[1]!],
      [...epsilonChain].reverse(),
    ];

    const selections = candidateOrders.map((candidates) =>
      selectActiveMovesetVariants({
        candidates: [defaultCandidate, primaryCandidate, ...candidates],
        topMetaOpponentIds,
        fullMetaOpponentIds,
      }),
    );

    expect(
      selections.map(({ activeVariantIds }) => activeVariantIds[2]),
    ).toEqual(Array.from({ length: candidateOrders.length }, () => laterId));
  });
});

describe('moveset variant manifest construction', () => {
  it('builds byte-identical output from shuffled generated inputs', () => {
    const sources = [
      createMovesetVariantSourceDigest('pokemon', 'pokemon bytes'),
      createMovesetVariantSourceDigest('rankings/overall', 'ranking bytes'),
    ];
    const golisopod = addOrderedRejections(
      addAlternateCandidate(createSpecies('golisopod', 'WATERFALL')),
      false,
    );
    const species = [createSpecies('quagsire', 'MUD_SHOT'), golisopod];
    const shuffledGolisopod: MovesetVariantManifestSpecies = {
      ...addOrderedRejections(golisopod, true),
      candidates: [...golisopod.candidates].reverse().map((candidate) => ({
        ...candidate,
        evidence: {
          ...candidate.evidence,
          sourceCategories: [...candidate.evidence.sourceCategories].reverse(),
          sourceVariantIds: [...candidate.evidence.sourceVariantIds].reverse(),
        },
      })),
    };

    const ordered = serializeBuiltMovesetVariantManifest(
      buildMovesetVariantManifest({
        format: {
          id: 'great-league',
          label: 'Great League',
          cup: 'all',
          cp: 1500,
        },
        policyVersion: 'ranking-evidence-v1',
        sourceDigests: sources,
        derivationSettings,
        species,
      }),
    );
    const shuffled = serializeBuiltMovesetVariantManifest(
      buildMovesetVariantManifest({
        format: {
          id: 'great-league',
          label: 'Great League',
          cup: 'all',
          cp: 1500,
        },
        policyVersion: 'ranking-evidence-v1',
        sourceDigests: [...sources].reverse(),
        derivationSettings,
        species: [shuffledGolisopod, species[0]!],
      }),
    );

    expect(shuffled).toBe(ordered);
    expect(ordered.endsWith('\n')).toBe(true);
  });

  it('uses stable SHA-256 source digests and does not mutate inputs', () => {
    const species = createSpecies('golisopod', 'WATERFALL');
    const before = structuredClone(species);

    const digest = createMovesetVariantSourceDigest(
      'rankings/overall',
      'ranking bytes',
    );
    buildMovesetVariantManifest({
      format: {
        id: 'great-league',
        label: 'Great League',
        cup: 'all',
        cp: 1500,
      },
      policyVersion: 'ranking-evidence-v1',
      sourceDigests: [digest],
      derivationSettings,
      species: [species],
    });

    expect(digest).toEqual({
      key: 'rankings/overall',
      algorithm: 'sha256',
      digest:
        'acee1f69696bd1841fca07cdd839658651e5a6b616d69e099a949521af1d2d3e',
    });
    expect(species).toEqual(before);
  });
});
