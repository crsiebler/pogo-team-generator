import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildMovesetVariantManifest,
  createMovesetVariantSourceDigest,
  prepareMovesetVariantManifests,
  publishSimulationGeneration,
  publishMovesetVariantManifests,
  selectActiveMovesetVariants,
  serializeBuiltMovesetVariantManifest,
  type MovesetVariantSimulationEvidence,
} from './movesetVariantManifest';
import {
  getBattleFormatById,
  getBattleFormats,
  type BattleFormatId,
} from '@/lib/data/battleFormats';
import {
  MAX_ACTIVE_MOVESET_VARIANTS,
  MAX_MOVESET_CANDIDATES,
  parseMovesetVariantManifestJson,
  type MovesetVariantManifestSpecies,
} from '@/lib/data/movesetVariantManifest';
import {
  RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
  createRuntimeSimulationSnapshotActiveRatingsDigest,
  parseRuntimeSimulationSnapshotJson,
  serializeRuntimeSimulationSnapshot,
} from '@/lib/data/runtimeSimulationSnapshot';
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

describe('moveset variant manifest publication', () => {
  const runtimeAssetIndexContents = '{"schemaVersion":1,"assets":[]}\n';

  function createPublicationBundle(formatId: BattleFormatId): {
    readonly manifest: {
      readonly formatId: BattleFormatId;
      readonly targetPath: string;
      readonly contents: string;
    };
    readonly snapshot: {
      readonly formatId: BattleFormatId;
      readonly targetPath: string;
      readonly contents: string;
    };
  } {
    const format = getBattleFormatById(formatId)!;
    const manifestValue = buildMovesetVariantManifest({
      format,
      policyVersion: 'ranking-evidence-v1',
      sourceDigests: [
        createMovesetVariantSourceDigest('fixture', 'fixture bytes'),
      ],
      derivationSettings,
      species: [createSpecies('bulbasaur', 'VINE_WHIP')],
    });
    const manifestContents =
      serializeBuiltMovesetVariantManifest(manifestValue);
    const dictionaries = {
      species: ['bulbasaur'],
      opponents: ['ivysaur'],
      moves: ['AQUA_JET', 'VINE_WHIP', 'X_SCISSOR'],
      variantIds: ['vine_whip--x_scissor--aqua_jet'] as const,
    };
    const variants = [[0, 0, 1, 2, 0]] as const;
    const snapshotFormat = { id: format.id, cup: format.cup, cp: format.cp };
    const snapshotManifest = {
      schemaVersion: manifestValue.metadata.schemaVersion,
      megaLevel: manifestValue.metadata.megaLevel,
      policyVersion: manifestValue.metadata.policyVersion,
      digest: createMovesetVariantSourceDigest('manifest', manifestContents)
        .digest,
      sourceDigests: manifestValue.metadata.sourceDigests,
    };
    const defaultVariantBySpecies = [0] as const;
    const additionalChargedMoveBySpecies = [null] as const;
    const opponentIterationOrderBySpecies = [[0]] as const;
    const encoding = {
      kind: 'uint16-le-base64',
      widthBytes: 2,
      byteOrder: 'little-endian',
      minimum: 0,
      maximum: 1000,
      missing: 65535,
      scenarios: ['0-0', '1-1', '2-2'],
      layout: 'variant-opponent-scenario',
    } as const;
    const shape = [1, 1, 3] as const;
    const ratings = Buffer.from(
      new Uint16Array([400, 500, 600]).buffer,
    ).toString('base64');
    return {
      manifest: {
        formatId,
        targetPath: `data/simulations/cp${format.cp}/${format.cup}/moveset-variants.json`,
        contents: manifestContents,
      },
      snapshot: {
        formatId,
        targetPath: `data/simulations/cp${format.cp}/${format.cup}/runtime-snapshot.json`,
        contents: serializeRuntimeSimulationSnapshot({
          schemaVersion: RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
          format: snapshotFormat,
          manifest: snapshotManifest,
          activeRatingsDigest:
            createRuntimeSimulationSnapshotActiveRatingsDigest({
              schemaVersion: RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
              format: snapshotFormat,
              manifest: snapshotManifest,
              encoding,
              dictionaries,
              variants,
              defaultVariantBySpecies,
              additionalChargedMoveBySpecies,
              opponentIterationOrderBySpecies,
              shape,
              ratings,
            }),
          encoding,
          dictionaries,
          variants,
          defaultVariantBySpecies,
          additionalChargedMoveBySpecies,
          opponentIterationOrderBySpecies,
          shape,
          ratings,
        }),
      },
    };
  }
  const defaultId = 'vine_whip--sludge_bomb--power_whip' as const;
  const alternateId = 'tackle--sludge_bomb--power_whip' as const;
  const candidateSet = {
    formatId: 'great-league' as const,
    cup: 'all' as const,
    cp: 1500,
    speciesId: 'bulbasaur',
    pvpokeScorePrior: 90,
    additionalChargedMove: 'FRENZY_PLANT_PLUS',
    retainedFastMoves: ['VINE_WHIP', 'TACKLE'],
    retainedChargedMoves: ['POWER_WHIP', 'SLUDGE_BOMB'],
    rejections: [],
    candidates: [
      {
        id: defaultId,
        fastMove: 'VINE_WHIP',
        chargedMove1: 'POWER_WHIP',
        chargedMove2: 'SLUDGE_BOMB',
        isDefault: true,
        evidence: {
          kind: 'preferred' as const,
          sourceCategories: ['overall' as const],
          sourceVariantIds: [defaultId],
        },
      },
      {
        id: alternateId,
        fastMove: 'TACKLE',
        chargedMove1: 'POWER_WHIP',
        chargedMove2: 'SLUDGE_BOMB',
        isDefault: false,
        evidence: {
          kind: 'substitution' as const,
          sourceCategories: ['overall' as const],
          sourceVariantIds: [defaultId],
        },
      },
    ],
  };
  const variantSelection = {
    formatId: 'great-league' as const,
    speciesId: 'bulbasaur',
    activeVariantIds: [defaultId],
    candidates: [
      {
        id: defaultId,
        isDefault: true,
        completeness: { '0-0': true, '1-1': true, '2-2': true },
        evaluationCounts: { '0-0': 100, '1-1': 100, '2-2': 100 },
        eligible: true,
        weightedImprovement: null,
        topMetaImprovement: null,
        fullMetaImprovement: null,
        marginalImprovement: null,
        active: true,
      },
      {
        id: alternateId,
        isDefault: false,
        completeness: { '0-0': true, '1-1': false, '2-2': true },
        evaluationCounts: { '0-0': 100, '1-1': 0, '2-2': 100 },
        eligible: false,
        weightedImprovement: null,
        topMetaImprovement: null,
        fullMetaImprovement: null,
        marginalImprovement: null,
        active: false,
      },
    ],
  };

  it('prepares one deterministic manifest for every supported format', () => {
    const input = {
      pokemonSource: 'pokemon bytes',
      movesSource: 'move bytes',
      candidateSets: [candidateSet],
      variantSelections: [variantSelection],
      getMoveAvailability: () => ({ kind: 'regular' as const }),
    };

    const ordered = prepareMovesetVariantManifests(input);
    const shuffled = prepareMovesetVariantManifests({
      ...input,
      candidateSets: [
        {
          ...candidateSet,
          candidates: [...candidateSet.candidates].reverse(),
        },
      ],
      variantSelections: [
        {
          ...variantSelection,
          activeVariantIds: [...variantSelection.activeVariantIds].reverse(),
          candidates: [...variantSelection.candidates].reverse(),
        },
      ],
    });

    expect(ordered).toHaveLength(getBattleFormats().length);
    expect(shuffled).toEqual(ordered);
    expect(ordered.map(({ formatId }) => formatId)).toEqual(
      getBattleFormats().map(({ id }) => id),
    );

    const prepared = ordered.find(
      ({ formatId }) => formatId === 'great-league',
    );
    expect(prepared?.targetPath).toBe(
      'data/simulations/cp1500/all/moveset-variants.json',
    );
    const manifest = parseMovesetVariantManifestJson(prepared?.contents ?? '');
    expect(manifest.species).toEqual([
      expect.objectContaining({
        speciesId: 'bulbasaur',
        additionalChargedMove: 'FRENZY_PLANT_PLUS',
        defaultVariantId: defaultId,
        candidates: [
          expect.objectContaining({
            id: defaultId,
            completeness: { '0-0': true, '1-1': true, '2-2': true },
            active: true,
          }),
          expect.objectContaining({
            id: alternateId,
            completeness: { '0-0': true, '1-1': false, '2-2': true },
            active: false,
          }),
        ],
      }),
    ]);
  });

  it('writes a same-directory temporary file before atomic replacement', async () => {
    const targetPath = 'data/simulations/cp1500/all/moveset-variants.json';
    const temporaryPath = `${targetPath}.tmp-test`;
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const rename = vi.fn().mockResolvedValue(undefined);
    const unlink = vi.fn().mockResolvedValue(undefined);

    await publishMovesetVariantManifests(
      [{ formatId: 'great-league', targetPath, contents: '{}\n' }],
      {
        mkdir,
        writeFile,
        rename,
        unlink,
        createTemporaryPath: () => temporaryPath,
      },
    );

    expect(mkdir).toHaveBeenCalledWith(path.dirname(targetPath));
    expect(writeFile).toHaveBeenCalledWith(temporaryPath, '{}\n');
    expect(rename).toHaveBeenCalledWith(temporaryPath, targetPath);
    expect(writeFile).not.toHaveBeenCalledWith(targetPath, expect.anything());
    expect(unlink).not.toHaveBeenCalled();
    expect(writeFile.mock.invocationCallOrder[0]).toBeLessThan(
      rename.mock.invocationCallOrder[0]!,
    );
  });

  it('leaves the prior target untouched and cleans up after rename failure', async () => {
    const targetPath = 'data/simulations/cp1500/all/moveset-variants.json';
    const temporaryPath = `${targetPath}.tmp-test`;
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const rename = vi.fn().mockRejectedValue(new Error('rename failed'));
    const unlink = vi.fn().mockResolvedValue(undefined);

    await expect(
      publishMovesetVariantManifests(
        [{ formatId: 'great-league', targetPath, contents: '{}\n' }],
        {
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile,
          rename,
          unlink,
          createTemporaryPath: () => temporaryPath,
        },
      ),
    ).rejects.toThrow('rename failed');

    expect(writeFile).not.toHaveBeenCalledWith(targetPath, expect.anything());
    expect(unlink).toHaveBeenCalledWith(temporaryPath);
    expect(unlink).not.toHaveBeenCalledWith(targetPath);
  });

  it('cleans up a partially written temporary file after write failure', async () => {
    const targetPath = 'data/simulations/cp1500/all/moveset-variants.json';
    const temporaryPath = `${targetPath}.tmp-test`;
    const unlink = vi.fn().mockResolvedValue(undefined);

    await expect(
      publishMovesetVariantManifests(
        [{ formatId: 'great-league', targetPath, contents: '{}\n' }],
        {
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile: vi.fn().mockRejectedValue(new Error('write failed')),
          rename: vi.fn().mockResolvedValue(undefined),
          unlink,
          createTemporaryPath: () => temporaryPath,
        },
      ),
    ).rejects.toThrow('write failed');

    expect(unlink).toHaveBeenCalledWith(temporaryPath);
    expect(unlink).not.toHaveBeenCalledWith(targetPath);
  });

  it('rejects publication targets outside the canonical format path', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);

    await expect(
      publishMovesetVariantManifests(
        [
          {
            formatId: 'great-league',
            targetPath: '../moveset-variants.json',
            contents: '{}\n',
          },
        ],
        {
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile,
          rename: vi.fn().mockResolvedValue(undefined),
          unlink: vi.fn().mockResolvedValue(undefined),
          createTemporaryPath: (targetPath) => `${targetPath}.tmp-test`,
        },
      ),
    ).rejects.toThrow('Manifest target must match great-league');

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('restores prior CSVs and manifests after a late publication failure', async () => {
    const csvPath = 'data/simulations/cp1500/all/bulbasaur_1-1.csv';
    const bundle = createPublicationBundle('great-league');
    const manifestPath = bundle.manifest.targetPath;
    const files = new Map<string, string>([
      [csvPath, 'prior simulation bytes'],
      [manifestPath, 'prior manifest bytes'],
    ]);
    const writeFile = vi.fn(async (filePath: string, contents: string) => {
      if (files.has(filePath)) {
        throw new Error(`duplicate file: ${filePath}`);
      }
      files.set(filePath, contents);
    });
    const rename = vi.fn(async (sourcePath: string, targetPath: string) => {
      if (sourcePath === `${manifestPath}.tmp-test`) {
        throw new Error('manifest rename failed');
      }
      const contents = files.get(sourcePath);
      if (contents === undefined) {
        throw new Error(`missing source: ${sourcePath}`);
      }
      files.set(targetPath, contents);
      files.delete(sourcePath);
    });
    const unlink = vi.fn(async (filePath: string) => {
      files.delete(filePath);
    });

    await expect(
      publishSimulationGeneration(
        [
          {
            formatId: 'great-league',
            targetPath: csvPath,
            contents: 'new simulation bytes',
          },
        ],
        [bundle.manifest],
        [bundle.snapshot],
        {
          targetPath: 'data/simulations/runtime-asset-index.json',
          contents: runtimeAssetIndexContents,
        },
        {
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile,
          rename,
          unlink,
          fileExists: async (filePath) => files.has(filePath),
          createTemporaryPath: (targetPath) => `${targetPath}.tmp-test`,
          createBackupPath: (targetPath) => `${targetPath}.backup-test`,
        },
      ),
    ).rejects.toThrow('manifest rename failed');

    expect(files.get(csvPath)).toBe('prior simulation bytes');
    expect(files.get(manifestPath)).toBe('prior manifest bytes');
    expect([...files.keys()]).toEqual([csvPath, manifestPath]);
  });

  it('rejects prepared simulation CSVs not declared by their manifest', async () => {
    const bundle = createPublicationBundle('great-league');
    const writeFile = vi.fn();

    await expect(
      publishSimulationGeneration(
        [
          {
            formatId: 'great-league',
            targetPath:
              'data/simulations/cp1500/all/bulbasaur--tackle--x_scissor--aqua_jet_1-1.csv',
            contents: 'alternate simulation bytes',
          },
        ],
        [bundle.manifest],
        [bundle.snapshot],
        {
          targetPath: 'data/simulations/runtime-asset-index.json',
          contents: runtimeAssetIndexContents,
        },
        {
          writeFile,
        },
      ),
    ).rejects.toThrow(/simulation target is not declared/i);

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('does not replace prior targets when staging a later CSV fails', async () => {
    const firstCsvPath = 'data/simulations/cp1500/all/bulbasaur_0-0.csv';
    const secondCsvPath = 'data/simulations/cp1500/all/bulbasaur_1-1.csv';
    const bundle = createPublicationBundle('great-league');
    const files = new Map<string, string>([
      [firstCsvPath, 'prior zero-shield bytes'],
      [secondCsvPath, 'prior one-shield bytes'],
    ]);
    const writeFile = vi.fn(async (filePath: string, contents: string) => {
      if (filePath === `${secondCsvPath}.tmp-test`) {
        throw new Error('second CSV staging failed');
      }
      files.set(filePath, contents);
    });

    await expect(
      publishSimulationGeneration(
        [
          {
            formatId: 'great-league',
            targetPath: firstCsvPath,
            contents: 'new zero-shield bytes',
          },
          {
            formatId: 'great-league',
            targetPath: secondCsvPath,
            contents: 'new one-shield bytes',
          },
        ],
        [bundle.manifest],
        [bundle.snapshot],
        {
          targetPath: 'data/simulations/runtime-asset-index.json',
          contents: runtimeAssetIndexContents,
        },
        {
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile,
          rename: vi.fn().mockResolvedValue(undefined),
          unlink: vi.fn(async (filePath: string) => {
            files.delete(filePath);
          }),
          fileExists: async (filePath: string) => files.has(filePath),
          createTemporaryPath: (targetPath: string) => `${targetPath}.tmp-test`,
          createBackupPath: (targetPath: string) => `${targetPath}.backup-test`,
        },
      ),
    ).rejects.toThrow('second CSV staging failed');

    expect(files).toEqual(
      new Map([
        [firstCsvPath, 'prior zero-shield bytes'],
        [secondCsvPath, 'prior one-shield bytes'],
      ]),
    );
  });

  it('installs the runtime asset index after every manifest', async () => {
    const csvPath = 'data/simulations/cp1500/all/bulbasaur_0-0.csv';
    const firstBundle = createPublicationBundle('great-league');
    const secondBundle = createPublicationBundle('ultra-league');
    const manifestPath = firstBundle.manifest.targetPath;
    const secondManifestPath = secondBundle.manifest.targetPath;
    const indexPath = 'data/simulations/runtime-asset-index.json';
    const rename = vi.fn().mockResolvedValue(undefined);

    await publishSimulationGeneration(
      [
        {
          formatId: 'great-league',
          targetPath: csvPath,
          contents: 'simulation bytes',
        },
      ],
      [firstBundle.manifest, secondBundle.manifest],
      [firstBundle.snapshot, secondBundle.snapshot],
      { targetPath: indexPath, contents: runtimeAssetIndexContents },
      {
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
        rename,
        unlink: vi.fn().mockResolvedValue(undefined),
        fileExists: vi.fn().mockResolvedValue(false),
        createTemporaryPath: (targetPath) => `${targetPath}.tmp-test`,
        createBackupPath: (targetPath) => `${targetPath}.backup-test`,
      },
    );

    const installs = rename.mock.calls.filter(([sourcePath]) =>
      String(sourcePath).endsWith('.tmp-test'),
    );
    expect(installs).toEqual([
      [`${csvPath}.tmp-test`, csvPath],
      [`${manifestPath}.tmp-test`, manifestPath],
      [`${secondManifestPath}.tmp-test`, secondManifestPath],
      [
        'data/simulations/cp1500/all/runtime-snapshot.json.tmp-test',
        'data/simulations/cp1500/all/runtime-snapshot.json',
      ],
      [
        'data/simulations/cp2500/all/runtime-snapshot.json.tmp-test',
        'data/simulations/cp2500/all/runtime-snapshot.json',
      ],
      [`${indexPath}.tmp-test`, indexPath],
    ]);
  });

  it('restores prior manifests and index when index installation fails', async () => {
    const csvPath = 'data/simulations/cp1500/all/bulbasaur_0-0.csv';
    const firstBundle = createPublicationBundle('great-league');
    const secondBundle = createPublicationBundle('ultra-league');
    const manifestPath = firstBundle.manifest.targetPath;
    const secondManifestPath = secondBundle.manifest.targetPath;
    const indexPath = 'data/simulations/runtime-asset-index.json';
    const snapshotPath = firstBundle.snapshot.targetPath;
    const secondSnapshotPath = secondBundle.snapshot.targetPath;
    const files = new Map<string, string>([
      [csvPath, 'prior simulation bytes'],
      [manifestPath, 'prior manifest bytes'],
      [secondManifestPath, 'prior second manifest bytes'],
      [snapshotPath, 'prior snapshot bytes'],
      [secondSnapshotPath, 'prior second snapshot bytes'],
      [indexPath, 'prior index bytes'],
    ]);
    const restoredTargets: string[] = [];

    await expect(
      publishSimulationGeneration(
        [
          {
            formatId: 'great-league',
            targetPath: csvPath,
            contents: 'new simulation bytes',
          },
        ],
        [firstBundle.manifest, secondBundle.manifest],
        [firstBundle.snapshot, secondBundle.snapshot],
        { targetPath: indexPath, contents: runtimeAssetIndexContents },
        {
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile: async (filePath, contents) => {
            files.set(filePath, contents);
          },
          rename: async (sourcePath, targetPath) => {
            if (sourcePath === `${indexPath}.tmp-test`) {
              throw new Error('index rename failed');
            }
            const contents = files.get(sourcePath);
            if (contents === undefined) {
              throw new Error(`missing source: ${sourcePath}`);
            }
            files.set(targetPath, contents);
            files.delete(sourcePath);
            if (sourcePath.endsWith('.backup-test')) {
              restoredTargets.push(targetPath);
            }
          },
          unlink: async (filePath) => {
            files.delete(filePath);
          },
          fileExists: async (filePath) => files.has(filePath),
          createTemporaryPath: (targetPath) => `${targetPath}.tmp-test`,
          createBackupPath: (targetPath) => `${targetPath}.backup-test`,
        },
      ),
    ).rejects.toThrow('index rename failed');

    expect(files).toEqual(
      new Map([
        [csvPath, 'prior simulation bytes'],
        [manifestPath, 'prior manifest bytes'],
        [secondManifestPath, 'prior second manifest bytes'],
        [snapshotPath, 'prior snapshot bytes'],
        [secondSnapshotPath, 'prior second snapshot bytes'],
        [indexPath, 'prior index bytes'],
      ]),
    );
    expect(restoredTargets).toEqual([
      csvPath,
      manifestPath,
      secondManifestPath,
      snapshotPath,
      secondSnapshotPath,
      indexPath,
    ]);
  });

  it('does not restore from a backup that was never created', async () => {
    const bundle = createPublicationBundle('great-league');
    const manifestPath = bundle.manifest.targetPath;
    const indexPath = 'data/simulations/runtime-asset-index.json';
    const backupPath = `${manifestPath}.backup-test`;
    const rename = vi.fn(async (sourcePath: string, targetPath: string) => {
      if (sourcePath === manifestPath && targetPath === backupPath) {
        throw new Error('backup rename failed');
      }
    });

    await expect(
      publishSimulationGeneration(
        [],
        [bundle.manifest],
        [bundle.snapshot],
        { targetPath: indexPath, contents: runtimeAssetIndexContents },
        {
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile: vi.fn().mockResolvedValue(undefined),
          rename,
          unlink: vi.fn().mockResolvedValue(undefined),
          fileExists: async (filePath) => filePath === manifestPath,
          createTemporaryPath: (targetPath) => `${targetPath}.tmp-test`,
          createBackupPath: (targetPath) => `${targetPath}.backup-test`,
        },
      ),
    ).rejects.toThrow('backup rename failed');

    expect(rename).toHaveBeenCalledWith(manifestPath, backupPath);
    expect(rename).not.toHaveBeenCalledWith(backupPath, manifestPath);
  });

  it('rejects a snapshot whose identity does not match its manifest', async () => {
    const bundle = createPublicationBundle('great-league');
    const snapshot = parseRuntimeSimulationSnapshotJson(
      bundle.snapshot.contents,
    );
    const changedSnapshot = {
      ...snapshot,
      manifest: {
        ...snapshot.manifest,
        digest:
          'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      },
    };
    const changedContents = serializeRuntimeSimulationSnapshot({
      ...changedSnapshot,
      activeRatingsDigest:
        createRuntimeSimulationSnapshotActiveRatingsDigest(changedSnapshot),
    });

    await expect(
      publishSimulationGeneration(
        [],
        [bundle.manifest],
        [{ ...bundle.snapshot, contents: changedContents }],
        {
          targetPath: 'data/simulations/runtime-asset-index.json',
          contents: runtimeAssetIndexContents,
        },
      ),
    ).rejects.toThrow(/snapshot.*manifest identity/i);
  });
});
