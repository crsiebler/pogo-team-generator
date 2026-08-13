import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRuntimeSimulationRepository } from './runtimeSimulationRepository';
import {
  RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
  RUNTIME_SIMULATION_SNAPSHOT_MAX_JSON_BYTES,
  RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
  createRuntimeSimulationSnapshotActiveRatingsDigest,
  type RuntimeSimulationSnapshot,
} from './runtimeSimulationSnapshot';

const rootPath = '/repository';
const digest =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const defaultVariantId = 'vine_whip--sludge_bomb--power_whip' as const;
const alternateVariantId = 'tackle--sludge_bomb--power_whip' as const;

function createSnapshot(
  overrides: Partial<RuntimeSimulationSnapshot> = {},
): RuntimeSimulationSnapshot {
  const dictionaries = {
    species: ['bulbasaur'],
    opponents: ['ivysaur', 'venusaur'],
    moves: ['POWER_WHIP', 'SLUDGE_BOMB', 'TACKLE', 'VINE_WHIP'],
    variantIds: [alternateVariantId, defaultVariantId],
  } as const;
  const variants = [
    [0, 0, 2, 0, 1],
    [0, 1, 3, 0, 1],
  ] as const;
  const format = { id: 'great-league', cup: 'all', cp: 1500 } as const;
  const manifest = {
    schemaVersion: 1 as const,
    policyVersion: 'ranking-evidence-v1',
    digest,
    sourceDigests: [{ key: 'fixture', algorithm: 'sha256' as const, digest }],
  };
  const defaultVariantBySpecies = [1] as const;
  const opponentIterationOrderBySpecies = [[0]] as const;
  const encoding = {
    kind: 'uint16-le-base64',
    widthBytes: 2,
    byteOrder: 'little-endian',
    minimum: 0,
    maximum: 1000,
    missing: RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
    scenarios: ['0-0', '1-1', '2-2'],
    layout: 'variant-opponent-scenario',
  } as const;
  const shape = [2, 2, 3] as const;
  const bytes = Buffer.alloc(
    variants.length * dictionaries.opponents.length * 3 * 2,
  );
  [
    100,
    200,
    300,
    RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
    RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
    RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
    400,
    500,
    600,
    RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
    RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
    RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
  ].forEach((rating, index) => bytes.writeUInt16LE(rating, index * 2));
  const ratings = bytes.toString('base64');
  const snapshot: RuntimeSimulationSnapshot = {
    schemaVersion: RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
    format,
    manifest,
    activeRatingsDigest: createRuntimeSimulationSnapshotActiveRatingsDigest({
      schemaVersion: RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
      format,
      manifest,
      encoding,
      dictionaries,
      variants,
      defaultVariantBySpecies,
      opponentIterationOrderBySpecies,
      shape,
      ratings,
    }),
    encoding,
    dictionaries,
    variants,
    defaultVariantBySpecies,
    opponentIterationOrderBySpecies,
    shape,
    ratings,
  };
  return { ...snapshot, ...overrides };
}

function refreshActiveRatingsDigest(
  snapshot: RuntimeSimulationSnapshot,
): RuntimeSimulationSnapshot {
  return {
    ...snapshot,
    activeRatingsDigest:
      createRuntimeSimulationSnapshotActiveRatingsDigest(snapshot),
  };
}

function createRepository(
  files: ReadonlyMap<string, string>,
  reads: string[] = [],
  limits: number[] = [],
) {
  return createRuntimeSimulationRepository({
    rootPath,
    readText: (filePath: string, maxBytes?: number): string => {
      reads.push(filePath);
      if (maxBytes !== undefined) {
        limits.push(maxBytes);
      }
      const contents = files.get(filePath);
      if (contents === undefined) {
        throw Object.assign(new Error(`Missing fixture ${filePath}`), {
          code: 'ENOENT',
        });
      }
      return contents;
    },
  });
}

describe('runtime simulation snapshot repository', () => {
  it('prepares one format once before serving synchronous lookups', () => {
    const snapshotPath = path.join(
      rootPath,
      'data/simulations/cp1500/all/runtime-snapshot.json',
    );
    const reads: string[] = [];
    const limits: number[] = [];
    const repository = createRepository(
      new Map([[snapshotPath, JSON.stringify(createSnapshot())]]),
      reads,
      limits,
    );

    expect(() =>
      repository.getDefaultMatchupMatrix('great-league'),
    ).toThrowError(expect.objectContaining({ code: 'snapshot-not-prepared' }));

    repository.prepare('great-league');
    repository.prepare('great-league');

    expect(reads).toEqual([snapshotPath]);
    expect(limits).toEqual([RUNTIME_SIMULATION_SNAPSHOT_MAX_JSON_BYTES]);
    expect(repository.getManifestPolicyIdentity('great-league')).toEqual({
      schemaVersion: 1,
      policyVersion: 'ranking-evidence-v1',
    });
    expect(
      repository
        .getActiveVariants('bulbasaur', 'great-league')
        .map(({ id, isDefault }) => ({ id, isDefault })),
    ).toEqual([
      { id: defaultVariantId, isDefault: true },
      { id: alternateVariantId, isDefault: false },
    ]);
    expect(
      repository.getShieldScenarioMatchupResult(
        'bulbasaur',
        defaultVariantId,
        'ivysaur',
        1,
        'great-league',
      ),
    ).toBe(500);
    expect(
      repository.getMatchupResult(
        'bulbasaur',
        defaultVariantId,
        'ivysaur',
        'great-league',
      ),
    ).toBe(490);
    expect(
      repository
        .getDefaultMatchupMatrix('great-league')
        .get('bulbasaur')
        ?.get('ivysaur'),
    ).toEqual({
      shields0: { battleRating: 400 },
      shields1: { battleRating: 500 },
      shields2: { battleRating: 600 },
    });
  });

  it('preserves missing alternate rows without substituting the default', () => {
    const snapshotPath = path.join(
      rootPath,
      'data/simulations/cp1500/all/runtime-snapshot.json',
    );
    const repository = createRepository(
      new Map([[snapshotPath, JSON.stringify(createSnapshot())]]),
    );
    repository.prepare('great-league');

    expect(
      repository.getShieldScenarioMatchupResult(
        'bulbasaur',
        alternateVariantId,
        'venusaur',
        1,
        'great-league',
      ),
    ).toBeNull();
    expect(
      repository.getMatchupResult(
        'bulbasaur',
        alternateVariantId,
        'venusaur',
        'great-league',
      ),
    ).toBeNull();
  });

  it('keeps prepared formats isolated across success and failure', () => {
    const greatLeaguePath = path.join(
      rootPath,
      'data/simulations/cp1500/all/runtime-snapshot.json',
    );
    const masterLeaguePath = path.join(
      rootPath,
      'data/simulations/cp10000/all/runtime-snapshot.json',
    );
    const masterLeagueSnapshot = refreshActiveRatingsDigest(
      createSnapshot({
        format: { id: 'master-league', cup: 'all', cp: 10000 },
      }),
    );
    const files = new Map([
      [greatLeaguePath, JSON.stringify(createSnapshot())],
      [masterLeaguePath, JSON.stringify(masterLeagueSnapshot)],
    ]);
    const repository = createRepository(files);

    repository.prepare('great-league');
    const greatLeagueMatrix =
      repository.getDefaultMatchupMatrix('great-league');
    repository.prepare('master-league');

    expect(repository.getDefaultMatchupMatrix('great-league')).toBe(
      greatLeagueMatrix,
    );
    expect(repository.getDefaultMatchupMatrix('master-league')).not.toBe(
      greatLeagueMatrix,
    );
    expect(() => repository.prepare('ultra-league')).toThrowError(
      expect.objectContaining({ code: 'manifest-missing' }),
    );
    expect(repository.getDefaultMatchupMatrix('great-league')).toBe(
      greatLeagueMatrix,
    );
  });

  it('fails closed on missing or incompatible snapshots without CSV fallback', () => {
    const snapshotPath = path.join(
      rootPath,
      'data/simulations/cp1500/all/runtime-snapshot.json',
    );
    const reads: string[] = [];
    const repository = createRepository(new Map(), reads);

    expect(() => repository.prepare('great-league')).toThrowError(
      expect.objectContaining({ code: 'manifest-missing' }),
    );
    expect(reads).toEqual([
      path.join(rootPath, 'data/simulations/cp1500/all/runtime-snapshot.json'),
    ]);

    const incompatible = refreshActiveRatingsDigest(
      createSnapshot({
        manifest: {
          ...createSnapshot().manifest,
          policyVersion: 'unsupported-policy',
        },
      }),
    );
    const incompatibleRepository = createRepository(
      new Map([
        [
          path.join(
            rootPath,
            'data/simulations/cp1500/all/runtime-snapshot.json',
          ),
          JSON.stringify(incompatible),
        ],
      ]),
    );
    expect(() => incompatibleRepository.prepare('great-league')).toThrowError(
      expect.objectContaining({ code: 'manifest-incompatible' }),
    );
    expect(() =>
      incompatibleRepository.getManifestPolicyIdentity('great-league'),
    ).toThrowError(expect.objectContaining({ code: 'snapshot-not-prepared' }));

    const changedDefault = createSnapshot({ defaultVariantBySpecies: [0] });
    const changedDefaultRepository = createRepository(
      new Map([[snapshotPath, JSON.stringify(changedDefault)]]),
    );
    expect(() => changedDefaultRepository.prepare('great-league')).toThrowError(
      expect.objectContaining({ code: 'manifest-incomplete' }),
    );

    const changedSource = createSnapshot({
      manifest: {
        ...createSnapshot().manifest,
        sourceDigests: [
          {
            key: 'changed-fixture',
            algorithm: 'sha256',
            digest,
          },
        ],
      },
    });
    const changedSourceRepository = createRepository(
      new Map([[snapshotPath, JSON.stringify(changedSource)]]),
    );
    expect(() => changedSourceRepository.prepare('great-league')).toThrowError(
      expect.objectContaining({ code: 'manifest-incomplete' }),
    );
  });
});
