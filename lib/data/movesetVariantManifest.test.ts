import { describe, expect, it } from 'vitest';
import {
  MAX_ACTIVE_MOVESET_VARIANTS,
  MAX_MOVESET_CANDIDATES,
  MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
  MovesetVariantManifestValidationError,
  getMovesetVariantManifestPath,
  parseMovesetVariantManifest,
  parseMovesetVariantManifestJson,
  serializeMovesetVariantManifest,
  type MovesetVariantManifest,
  type MovesetVariantManifestCandidate,
} from './movesetVariantManifest';

const scenarios = ['0-0', '1-1', '2-2'] as const;

type Mutable<Value> = Value extends readonly (infer Entry)[]
  ? Mutable<Entry>[]
  : Value extends object
    ? { -readonly [Key in keyof Value]: Mutable<Value[Key]> }
    : Value;

function createCandidate(
  overrides: Partial<MovesetVariantManifestCandidate> = {},
): MovesetVariantManifestCandidate {
  const candidate: MovesetVariantManifestCandidate = {
    id: 'waterfall--x_scissor--aqua_jet',
    fastMove: 'WATERFALL',
    chargedMove1: 'AQUA_JET',
    chargedMove2: 'X_SCISSOR',
    isDefault: true,
    evidence: {
      kind: 'preferred',
      sourceCategories: ['overall'],
      sourceVariantIds: ['waterfall--x_scissor--aqua_jet'],
    },
    acquisitionRequirements: {
      fastMove: { kind: 'regular' },
      chargedMove1: { kind: 'regular' },
      chargedMove2: { kind: 'regular' },
    },
    storageKeys: {
      '0-0': 'golisopod_0-0.csv',
      '1-1': 'golisopod_1-1.csv',
      '2-2': 'golisopod_2-2.csv',
    },
    completeness: { '0-0': true, '1-1': true, '2-2': true },
    evaluationCounts: { '0-0': 100, '1-1': 100, '2-2': 100 },
    active: true,
    ...overrides,
  };
  const storagePrefix = candidate.isDefault
    ? 'golisopod'
    : `golisopod--${candidate.id}`;
  return {
    ...candidate,
    storageKeys: overrides.storageKeys ?? {
      '0-0': `${storagePrefix}_0-0.csv`,
      '1-1': `${storagePrefix}_1-1.csv`,
      '2-2': `${storagePrefix}_2-2.csv`,
    },
  };
}

function createMutableCandidate(
  overrides: Partial<MovesetVariantManifestCandidate> = {},
): Mutable<MovesetVariantManifestCandidate> {
  return structuredClone(
    createCandidate(overrides),
  ) as Mutable<MovesetVariantManifestCandidate>;
}

function createManifest(): MovesetVariantManifest {
  return {
    metadata: {
      schemaVersion: MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
      policyVersion: 'ranking-evidence-v1',
      formatId: 'great-league',
      cup: 'all',
      cp: 1500,
      sourceDigests: [
        {
          key: 'rankings/overall',
          algorithm: 'sha256',
          digest:
            '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        },
      ],
      derivationSettings: {
        maxCandidatesPerSpecies: MAX_MOVESET_CANDIDATES,
        maxActiveVariantsPerSpecies: MAX_ACTIVE_MOVESET_VARIANTS,
        maxExpansionFastMoves: 2,
        maxExpansionChargedMoves: 4,
        requiredScenarios: [...scenarios],
        categoryWeights: {
          overall: 3,
          leads: 2,
          switches: 2,
          closers: 2,
          chargers: 1,
          attackers: 1,
          consistency: 1,
        },
      },
    },
    species: [
      {
        speciesId: 'golisopod',
        defaultVariantId: 'waterfall--x_scissor--aqua_jet',
        evidence: {
          pvpokeScorePrior: 91.2,
          retainedFastMoves: ['WATERFALL', 'SHADOW_CLAW'],
          retainedChargedMoves: ['AQUA_JET', 'X_SCISSOR'],
          rejections: [],
        },
        candidates: [createCandidate()],
      },
    ],
  };
}

function createMutableManifest(): Mutable<MovesetVariantManifest> {
  return structuredClone(createManifest()) as Mutable<MovesetVariantManifest>;
}

describe('moveset variant manifest validation', () => {
  it('defines the format-scoped repository manifest path', () => {
    expect(
      getMovesetVariantManifestPath({
        id: 'great-league',
        label: 'Great League',
        cup: 'all',
        cp: 1500,
      }),
    ).toBe('data/simulations/cp1500/all/moveset-variants.json');
  });

  it('round trips a valid versioned manifest with preferred move order', () => {
    const manifest = createManifest();

    const parsed = parseMovesetVariantManifestJson(
      serializeMovesetVariantManifest(manifest),
    );

    expect(parsed).toEqual(manifest);
    expect(parsed.species[0]?.candidates[0]).toMatchObject({
      chargedMove1: 'AQUA_JET',
      chargedMove2: 'X_SCISSOR',
      id: 'waterfall--x_scissor--aqua_jet',
    });
  });

  it('round trips Elite, event-exclusive, and purified requirements', () => {
    const manifest = createMutableManifest();
    const requirements =
      manifest.species[0]!.candidates[0]!.acquisitionRequirements;
    requirements.fastMove = { kind: 'elite' };
    requirements.chargedMove1 = { kind: 'eventExclusive' };
    requirements.chargedMove2 = { kind: 'purified' };

    const parsed = parseMovesetVariantManifest(manifest);

    expect(parsed.species[0]?.candidates[0]?.acquisitionRequirements).toEqual(
      requirements,
    );
  });

  it('rejects duplicate candidate ids within one species', () => {
    const manifest = createMutableManifest();
    manifest.species[0]?.candidates.push(
      createMutableCandidate({ isDefault: false, active: false }),
    );

    expect(() => parseMovesetVariantManifest(manifest)).toThrowError(
      /duplicate candidate id/i,
    );
  });

  it('rejects species with more than eight candidates', () => {
    const manifest = createMutableManifest();
    manifest.species[0]!.candidates = Array.from(
      { length: MAX_MOVESET_CANDIDATES + 1 },
      (_, index) =>
        createMutableCandidate({
          id: `fast_${index}--x_scissor--aqua_jet`,
          fastMove: `FAST_${index}`,
          isDefault: index === 0,
          active: index < MAX_ACTIVE_MOVESET_VARIANTS,
        }),
    );
    manifest.species[0]!.defaultVariantId = 'fast_0--x_scissor--aqua_jet';

    expect(() => parseMovesetVariantManifest(manifest)).toThrowError(
      /at most 8 candidates/i,
    );
  });

  it('rejects species with more than three active variants', () => {
    const manifest = createMutableManifest();
    manifest.species[0]!.candidates = Array.from({ length: 4 }, (_, index) =>
      createMutableCandidate({
        id: `fast_${index}--x_scissor--aqua_jet`,
        fastMove: `FAST_${index}`,
        isDefault: index === 0,
        active: true,
      }),
    );
    manifest.species[0]!.defaultVariantId = 'fast_0--x_scissor--aqua_jet';

    expect(() => parseMovesetVariantManifest(manifest)).toThrowError(
      /at most 3 active variants/i,
    );
  });

  it('rejects species records that exceed their declared derivation caps', () => {
    const manifest = createMutableManifest();
    manifest.metadata.derivationSettings.maxCandidatesPerSpecies = 1;
    manifest.metadata.derivationSettings.maxActiveVariantsPerSpecies = 1;
    manifest.species[0]!.candidates.push(
      createMutableCandidate({
        id: 'shadow_claw--x_scissor--aqua_jet',
        fastMove: 'SHADOW_CLAW',
        isDefault: false,
        active: false,
      }),
    );

    expect(() => parseMovesetVariantManifest(manifest)).toThrowError(
      /declared candidate cap of 1/i,
    );
  });

  it('rejects unsafe logical source keys', () => {
    const manifest = createMutableManifest();
    manifest.metadata.sourceDigests[0]!.key = '../pokemon';

    expect(() => parseMovesetVariantManifest(manifest)).toThrowError(
      /safe repository-relative logical key/i,
    );
  });

  it('rejects duplicate species ids and format metadata mismatches', () => {
    const duplicateSpecies = createMutableManifest();
    duplicateSpecies.species.push(
      structuredClone(duplicateSpecies.species[0]!),
    );
    const wrongFormat = createMutableManifest();
    wrongFormat.metadata.cp = 2500;

    expect(() => parseMovesetVariantManifest(duplicateSpecies)).toThrowError(
      /duplicate species id/i,
    );
    expect(() => parseMovesetVariantManifest(wrongFormat)).toThrowError(
      /must match great-league CP 1500/i,
    );
  });

  it('rejects known species aliases as parallel manifest identities', () => {
    const manifest = createMutableManifest();
    manifest.species[0]!.speciesId = 'golisopodsh';
    manifest.species[0]!.candidates[0]!.storageKeys = {
      '0-0': 'golisopodsh_0-0.csv',
      '1-1': 'golisopodsh_1-1.csv',
      '2-2': 'golisopodsh_2-2.csv',
    };

    expect(() => parseMovesetVariantManifest(manifest)).toThrowError(
      /choosable species id/i,
    );
  });

  it.each([
    {
      name: 'candidate moveset',
      error: /canonical move id/i,
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        const candidate = manifest.species[0]!.candidates[0]!;
        candidate.chargedMove1 = 'SUPERPOWER';
        candidate.id = 'waterfall--x_scissor--superpower';
        candidate.evidence.sourceVariantIds = [candidate.id];
        manifest.species[0]!.defaultVariantId = candidate.id;
      },
    },
    {
      name: 'lowercase candidate moveset',
      error: /canonical move id/i,
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        manifest.species[0]!.candidates[0]!.fastMove = 'waterfall';
      },
    },
    {
      name: 'mixed-case candidate moveset',
      error: /canonical move id/i,
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        manifest.species[0]!.candidates[0]!.fastMove = 'Waterfall';
      },
    },
    {
      name: 'source variant evidence',
      error: /canonical variant ids/i,
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        manifest.species[0]!.candidates[0]!.evidence.sourceVariantIds = [
          'waterfall--x_scissor--superpower',
        ];
      },
    },
    {
      name: 'retained move evidence',
      error: /canonical move id/i,
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        manifest.species[0]!.evidence.retainedChargedMoves = ['SUPERPOWER'];
      },
    },
    {
      name: 'malformed retained move evidence',
      error: /canonical move id/i,
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        manifest.species[0]!.evidence.retainedChargedMoves = ['NOT/A_MOVE'];
      },
    },
    {
      name: 'rejection evidence',
      error: /canonical move id/i,
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        manifest.species[0]!.evidence.rejections = [
          {
            sourceMoveset: {
              fastMove: 'WATERFALL',
              chargedMove1: 'SUPERPOWER',
              chargedMove2: 'X_SCISSOR',
            },
            excludedMove: 'SUPER_POWER',
            reason: 'Excluded source alias.',
          },
        ];
      },
    },
    {
      name: 'excluded move rejection evidence',
      error: /canonical move id/i,
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        manifest.species[0]!.evidence.rejections = [
          {
            sourceMoveset: {
              fastMove: 'WATERFALL',
              chargedMove1: 'AQUA_JET',
              chargedMove2: 'X_SCISSOR',
            },
            excludedMove: 'SUPERPOWER',
            reason: 'Excluded source alias.',
          },
        ];
      },
    },
  ])('rejects known move spelling aliases in $name', ({ error, mutate }) => {
    const manifest = createMutableManifest();
    mutate(manifest);

    expect(() => parseMovesetVariantManifest(manifest)).toThrowError(error);
  });

  it.each([
    {
      name: 'unsupported schema version',
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        (
          manifest.metadata as unknown as { schemaVersion: number }
        ).schemaVersion = 2;
      },
    },
    {
      name: 'empty policy version',
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        manifest.metadata.policyVersion = '';
      },
    },
    {
      name: 'unsupported format id',
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        manifest.metadata.formatId = 'unknown-format' as never;
      },
    },
    {
      name: 'mismatched cup',
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        manifest.metadata.cup = 'weather';
      },
    },
    {
      name: 'missing source digests',
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        manifest.metadata.sourceDigests = [];
      },
    },
    {
      name: 'missing derivation settings',
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        delete (
          manifest.metadata as Partial<
            Mutable<MovesetVariantManifest['metadata']>
          >
        ).derivationSettings;
      },
    },
  ])('rejects required metadata errors: $name', ({ mutate }) => {
    const manifest = createMutableManifest();
    mutate(manifest);

    expect(() => parseMovesetVariantManifest(manifest)).toThrowError(
      MovesetVariantManifestValidationError,
    );
  });

  it.each([
    {
      name: 'missing default flag',
      error: /exactly one default candidate/i,
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        manifest.species[0]!.candidates[0] = createMutableCandidate({
          isDefault: false,
        });
      },
    },
    {
      name: 'mismatched default id',
      error: /must identify the candidate marked as default/i,
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        manifest.species[0]!.defaultVariantId =
          'shadow_claw--x_scissor--aqua_jet';
      },
    },
    {
      name: 'multiple default candidates',
      error: /exactly one default candidate/i,
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        manifest.species[0]!.candidates.push(
          createMutableCandidate({
            id: 'shadow_claw--x_scissor--aqua_jet',
            fastMove: 'SHADOW_CLAW',
            active: false,
          }),
        );
      },
    },
    {
      name: 'inactive default candidate',
      error: /default candidate must be active/i,
      mutate: (manifest: Mutable<MovesetVariantManifest>) => {
        manifest.species[0]!.candidates[0]!.active = false;
      },
    },
  ])('rejects an inconsistent default: $name', ({ error, mutate }) => {
    const manifest = createMutableManifest();
    mutate(manifest);

    expect(() => parseMovesetVariantManifest(manifest)).toThrowError(error);
  });

  it('rejects candidates above the declared active cap', () => {
    const manifest = createMutableManifest();
    manifest.metadata.derivationSettings.maxActiveVariantsPerSpecies = 1;
    manifest.species[0]!.candidates.push(
      createMutableCandidate({
        id: 'shadow_claw--x_scissor--aqua_jet',
        fastMove: 'SHADOW_CLAW',
        isDefault: false,
        active: true,
      }),
    );

    expect(() => parseMovesetVariantManifest(manifest)).toThrowError(
      /declared active variant cap of 1/i,
    );
  });

  it('rejects duplicate canonical charged moves', () => {
    const manifest = createMutableManifest();
    const candidate = manifest.species[0]!.candidates[0]!;
    candidate.chargedMove2 = 'AQUA_JET';
    candidate.id = 'waterfall--aqua_jet--aqua_jet';
    manifest.species[0]!.defaultVariantId = candidate.id;

    expect(() => parseMovesetVariantManifest(manifest)).toThrowError(
      /distinct charged moves/i,
    );
  });

  it.each(['waterfall--aqua_jet--x_scissor', 'waterfall--aqua_jet--aqua_jet'])(
    'rejects noncanonical evidence variant id %s',
    (sourceVariantId) => {
      const manifest = createMutableManifest();
      manifest.species[0]!.candidates[0]!.evidence.sourceVariantIds = [
        sourceVariantId as `${string}--${string}--${string}`,
      ];

      expect(() => parseMovesetVariantManifest(manifest)).toThrowError(
        /canonical variant ids/i,
      );
    },
  );

  it('rejects malformed acquisition, digest, scenario, and evaluation data', () => {
    const invalidManifests: Mutable<MovesetVariantManifest>[] = [
      createMutableManifest(),
      createMutableManifest(),
      createMutableManifest(),
      createMutableManifest(),
    ];
    invalidManifests[0]!.metadata.sourceDigests[0]!.digest = 'not-a-digest';
    invalidManifests[1]!.species[0]!.candidates[0]!.acquisitionRequirements.fastMove =
      { kind: 'excluded', reason: 'illegal' } as never;
    delete (
      invalidManifests[2]!.species[0]!.candidates[0]!.completeness as Record<
        string,
        boolean
      >
    )['2-2'];
    invalidManifests[3]!.species[0]!.candidates[0]!.evaluationCounts['1-1'] =
      -1;

    for (const manifest of invalidManifests) {
      expect(() => parseMovesetVariantManifest(manifest)).toThrowError(
        MovesetVariantManifestValidationError,
      );
    }
  });
});
