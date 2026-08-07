import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_ACTIVE_MOVESET_VARIANTS,
  MAX_MOVESET_CANDIDATES,
  MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
  type MovesetVariantManifest,
  type MovesetVariantManifestCandidate,
} from './movesetVariantManifest';
import { createMovesetVariantSimulationLoader } from './movesetVariantSimulations';

const rootPath = '/repository';
const manifestPath = path.join(
  rootPath,
  'data/simulations/cp1500/all/moveset-variants.json',
);
const ultraManifestPath = path.join(
  rootPath,
  'data/simulations/cp2500/all/moveset-variants.json',
);
const defaultVariantId = 'waterfall--x_scissor--aqua_jet' as const;
const alternateVariantId = 'shadow_claw--x_scissor--aqua_jet' as const;
const inactiveVariantId = 'fury_cutter--x_scissor--aqua_jet' as const;

function createCandidate(
  overrides: Partial<MovesetVariantManifestCandidate> = {},
): MovesetVariantManifestCandidate {
  const candidate: MovesetVariantManifestCandidate = {
    id: defaultVariantId,
    fastMove: 'WATERFALL',
    chargedMove1: 'AQUA_JET',
    chargedMove2: 'X_SCISSOR',
    isDefault: true,
    evidence: {
      kind: 'preferred',
      sourceCategories: ['overall'],
      sourceVariantIds: [defaultVariantId],
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
    evaluationCounts: { '0-0': 1, '1-1': 1, '2-2': 1 },
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

function createManifest(
  candidates: readonly MovesetVariantManifestCandidate[] = [
    createCandidate(),
    createCandidate({
      id: alternateVariantId,
      fastMove: 'SHADOW_CLAW',
      isDefault: false,
      evidence: {
        kind: 'observed',
        sourceCategories: ['switches'],
        sourceVariantIds: [alternateVariantId],
      },
    }),
    createCandidate({
      id: inactiveVariantId,
      fastMove: 'FURY_CUTTER',
      isDefault: false,
      active: false,
      evidence: {
        kind: 'observed',
        sourceCategories: ['closers'],
        sourceVariantIds: [inactiveVariantId],
      },
    }),
  ],
): MovesetVariantManifest {
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
      },
    },
    species: [
      {
        speciesId: 'golisopod',
        defaultVariantId,
        evidence: {
          pvpokeScorePrior: 91.2,
          retainedFastMoves: ['WATERFALL', 'SHADOW_CLAW', 'FURY_CUTTER'],
          retainedChargedMoves: ['AQUA_JET', 'X_SCISSOR'],
          rejections: [],
        },
        candidates,
      },
    ],
  };
}

function createCsv(
  battleRating: number,
  opponents: readonly string[] = ['Absol'],
): string {
  return [
    'Pokemon,Battle Rating,Energy Remaining,HP Remaining',
    ...opponents.map((opponent) => `${opponent},${battleRating},10,20`),
    '',
  ].join('\n');
}

function createFiles(
  manifest: MovesetVariantManifest = createManifest(),
  targetManifestPath: string = manifestPath,
): Map<string, string> {
  const files = new Map<string, string>([
    [targetManifestPath, JSON.stringify(manifest)],
  ]);
  const formatDirectory = path.dirname(targetManifestPath);

  for (const species of manifest.species) {
    for (const candidate of species.candidates) {
      for (const [scenario, storageKey] of Object.entries(
        candidate.storageKeys,
      )) {
        const scenarioRating =
          candidate.id === alternateVariantId
            ? { '0-0': 600, '1-1': 700, '2-2': 800 }[scenario]
            : 400;
        files.set(
          path.join(formatDirectory, storageKey),
          createCsv(scenarioRating ?? 400),
        );
      }
    }
  }

  return files;
}

function createLoader(
  files: ReadonlyMap<string, string>,
  reads: string[] = [],
) {
  return createMovesetVariantSimulationLoader({
    rootPath,
    readText: (filePath: string): string => {
      reads.push(filePath);
      const value = files.get(filePath);
      if (value === undefined) {
        throw Object.assign(new Error(`Missing fixture ${filePath}`), {
          code: 'ENOENT',
        });
      }
      return value;
    },
    resolveOpponentSpeciesId: (value: string): string => value.toLowerCase(),
  });
}

describe('manifest-backed moveset variant simulation loading', () => {
  it('exposes the manifest policy identity for assignment fingerprints', () => {
    const loader = createLoader(createFiles());

    expect(loader.getManifestPolicyIdentity('great-league')).toEqual({
      schemaVersion: MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
      policyVersion: 'ranking-evidence-v1',
    });
  });

  it('loads only active manifest candidates and their declared storage keys', () => {
    const files = createFiles();
    files.set(
      path.join(
        path.dirname(manifestPath),
        'golisopod--unlisted--move_a--move_b_1-1.csv',
      ),
      createCsv(999),
    );
    const reads: string[] = [];
    const loader = createLoader(files, reads);

    expect(
      loader.getActiveVariants('golisopod', 'great-league').map(({ id }) => id),
    ).toEqual([defaultVariantId, alternateVariantId]);
    expect(
      loader.getMatchupResult(
        'golisopod',
        alternateVariantId,
        'absol',
        'great-league',
      ),
    ).toBe(690);
    expect(
      loader.getShieldScenarioMatchupResult(
        'golisopod',
        alternateVariantId,
        'absol',
        1,
        'great-league',
      ),
    ).toBe(700);
    expect(
      reads.some(
        (filePath) =>
          filePath.includes(inactiveVariantId) || filePath.includes('unlisted'),
      ),
    ).toBe(false);
  });

  it('builds the default matrix from only manifest-declared default storage', () => {
    const files = createFiles();
    files.set(
      path.join(path.dirname(manifestPath), 'unlisted-species_1-1.csv'),
      createCsv(999),
    );
    const reads: string[] = [];
    const loader = createLoader(files, reads);

    expect(loader.getDefaultMatchupMatrix('great-league')).toEqual(
      new Map([
        [
          'golisopod',
          new Map([
            [
              'absol',
              {
                shields0: {
                  battleRating: 400,
                  energyRemaining: 10,
                  hpRemaining: 20,
                },
                shields1: {
                  battleRating: 400,
                  energyRemaining: 10,
                  hpRemaining: 20,
                },
                shields2: {
                  battleRating: 400,
                  energyRemaining: 10,
                  hpRemaining: 20,
                },
              },
            ],
          ]),
        ],
      ]),
    );
    expect(reads).toEqual([
      manifestPath,
      path.join(path.dirname(manifestPath), 'golisopod_0-0.csv'),
      path.join(path.dirname(manifestPath), 'golisopod_1-1.csv'),
      path.join(path.dirname(manifestPath), 'golisopod_2-2.csv'),
    ]);
  });

  it('keeps the same active variant identity scoped to its format', () => {
    const greatFiles = createFiles();
    const ultraManifest: MovesetVariantManifest = {
      ...createManifest(),
      metadata: {
        ...createManifest().metadata,
        formatId: 'ultra-league',
        cp: 2500,
      },
    };
    const ultraFiles = createFiles(ultraManifest, ultraManifestPath);
    for (const scenario of ['0-0', '1-1', '2-2'] as const) {
      ultraFiles.set(
        path.join(
          path.dirname(ultraManifestPath),
          `golisopod--${alternateVariantId}_${scenario}.csv`,
        ),
        createCsv({ '0-0': 300, '1-1': 400, '2-2': 500 }[scenario]),
      );
    }
    const loader = createLoader(new Map([...greatFiles, ...ultraFiles]));

    expect(
      loader.getMatchupResult(
        'golisopod',
        alternateVariantId,
        'absol',
        'great-league',
      ),
    ).toBe(690);
    expect(
      loader.getMatchupResult(
        'golisopod',
        alternateVariantId,
        'absol',
        'ultra-league',
      ),
    ).toBe(390);
  });

  it('rejects inactive and unknown variants instead of substituting defaults', () => {
    const loader = createLoader(createFiles());

    for (const variantId of [
      inactiveVariantId,
      'unknown--move_a--move_b',
    ] as const) {
      expect(() =>
        loader.getShieldScenarioMatchupResult(
          'golisopod',
          variantId,
          'absol',
          1,
          'great-league',
        ),
      ).toThrowError(
        expect.objectContaining({
          name: 'MovesetVariantSimulationDataError',
          code: 'variant-unavailable',
        }),
      );
    }
  });

  it('rejects species absent from a present format manifest', () => {
    const loader = createLoader(createFiles());

    expect(() =>
      loader.getActiveVariants('feraligatr', 'great-league'),
    ).toThrowError(
      expect.objectContaining({
        code: 'variant-unavailable',
        speciesId: 'feraligatr',
      }),
    );
  });

  it('rejects alternate storage that does not match the default opponent set', () => {
    const files = createFiles();
    files.set(
      path.join(
        path.dirname(manifestPath),
        `golisopod--${alternateVariantId}_1-1.csv`,
      ),
      createCsv(700, ['Mewtwo']),
    );
    const loader = createLoader(files);

    expect(() =>
      loader.getShieldScenarioMatchupResult(
        'golisopod',
        alternateVariantId,
        'absol',
        1,
        'great-league',
      ),
    ).toThrowError(expect.objectContaining({ code: 'manifest-incomplete' }));
  });

  it('rejects a manifest whose declared active storage file is missing', () => {
    const files = createFiles();
    files.delete(
      path.join(
        path.dirname(manifestPath),
        `golisopod--${alternateVariantId}_2-2.csv`,
      ),
    );
    const loader = createLoader(files);

    expect(() =>
      loader.getMatchupResult(
        'golisopod',
        alternateVariantId,
        'absol',
        'great-league',
      ),
    ).toThrowError(expect.objectContaining({ code: 'manifest-incomplete' }));
  });

  it('validates active storage before exposing manifest candidates', () => {
    const files = createFiles();
    files.delete(path.join(path.dirname(manifestPath), 'golisopod_0-0.csv'));
    const loader = createLoader(files);

    expect(() =>
      loader.getActiveVariants('golisopod', 'great-league'),
    ).toThrowError(expect.objectContaining({ code: 'manifest-incomplete' }));
  });

  it('rejects blank numeric cells instead of parsing them as zero', () => {
    const files = createFiles();
    files.set(
      path.join(
        path.dirname(manifestPath),
        `golisopod--${alternateVariantId}_1-1.csv`,
      ),
      [
        'Pokemon,Battle Rating,Energy Remaining,HP Remaining',
        'Absol,,10,20',
        '',
      ].join('\n'),
    );
    const loader = createLoader(files);

    expect(() =>
      loader.getMatchupResult(
        'golisopod',
        alternateVariantId,
        'absol',
        'great-league',
      ),
    ).toThrowError(expect.objectContaining({ code: 'manifest-incomplete' }));
  });

  it.each([
    {
      name: 'missing',
      files: new Map<string, string>(),
      code: 'manifest-missing',
    },
    {
      name: 'malformed',
      files: new Map([[manifestPath, '{']]),
      code: 'manifest-malformed',
    },
    {
      name: 'incompatible',
      files: new Map([
        [
          manifestPath,
          JSON.stringify({
            ...createManifest(),
            metadata: {
              ...createManifest().metadata,
              formatId: 'ultra-league',
              cup: 'all',
              cp: 2500,
            },
          }),
        ],
      ]),
      code: 'manifest-incompatible',
    },
    {
      name: 'incomplete',
      files: createFiles(
        createManifest([
          createCandidate({
            completeness: { '0-0': true, '1-1': false, '2-2': true },
            evaluationCounts: { '0-0': 1, '1-1': 0, '2-2': 1 },
          }),
        ]),
      ),
      code: 'manifest-incomplete',
    },
  ])(
    'raises an actionable typed error for a $name manifest',
    ({ files, code }) => {
      const loader = createLoader(files);

      expect(() => loader.getDefaultMatchupMatrix('great-league')).toThrowError(
        expect.objectContaining({
          name: 'MovesetVariantSimulationDataError',
          code,
          formatId: 'great-league',
        }),
      );
    },
  );
});
