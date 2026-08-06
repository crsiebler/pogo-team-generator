import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildMovesetVariantManifest,
  serializeBuiltMovesetVariantManifest,
  type PreparedMovesetVariantManifest,
} from './movesetVariantManifest';
import { deleteStaleVariantSimulationFiles } from './simulationCleanup';
import {
  getBattleFormatById,
  type BattleFormat,
} from '@/lib/data/battleFormats';
import {
  getMovesetVariantManifestPath,
  MAX_ACTIVE_MOVESET_VARIANTS,
  MAX_MOVESET_CANDIDATES,
  type MovesetVariantManifestSpecies,
} from '@/lib/data/movesetVariantManifest';

const defaultVariantId = 'fury_cutter--x_scissor--aqua_jet' as const;
const alternateVariantId = 'shadow_claw--x_scissor--aqua_jet' as const;
const identityRealpath = async (filePath: string): Promise<string> => filePath;

function getFormat(formatId: BattleFormat['id']): BattleFormat {
  return getBattleFormatById(formatId)!;
}

function createSpecies(): MovesetVariantManifestSpecies {
  const createCandidate = (
    id: typeof defaultVariantId | typeof alternateVariantId,
    fastMove: 'FURY_CUTTER' | 'SHADOW_CLAW',
    isDefault: boolean,
  ) => ({
    id,
    fastMove,
    chargedMove1: 'X_SCISSOR',
    chargedMove2: 'AQUA_JET',
    isDefault,
    evidence: {
      kind: isDefault ? ('preferred' as const) : ('substitution' as const),
      sourceCategories: ['overall' as const],
      sourceVariantIds: [id],
    },
    acquisitionRequirements: {
      fastMove: { kind: 'regular' as const },
      chargedMove1: { kind: 'regular' as const },
      chargedMove2: { kind: 'regular' as const },
    },
    storageKeys: {
      '0-0': isDefault ? 'golisopod_0-0.csv' : `golisopod--${id}_0-0.csv`,
      '1-1': isDefault ? 'golisopod_1-1.csv' : `golisopod--${id}_1-1.csv`,
      '2-2': isDefault ? 'golisopod_2-2.csv' : `golisopod--${id}_2-2.csv`,
    },
    completeness: { '0-0': true, '1-1': true, '2-2': true },
    evaluationCounts: { '0-0': 100, '1-1': 100, '2-2': 100 },
    active: isDefault,
  });

  return {
    speciesId: 'golisopod',
    defaultVariantId,
    evidence: {
      pvpokeScorePrior: 90,
      retainedFastMoves: ['FURY_CUTTER', 'SHADOW_CLAW'],
      retainedChargedMoves: ['X_SCISSOR', 'AQUA_JET'],
      rejections: [],
    },
    candidates: [
      createCandidate(defaultVariantId, 'FURY_CUTTER', true),
      createCandidate(alternateVariantId, 'SHADOW_CLAW', false),
    ],
  };
}

function createPreparedManifest(
  format: BattleFormat,
): PreparedMovesetVariantManifest {
  const manifest = buildMovesetVariantManifest({
    format,
    policyVersion: 'test-policy',
    sourceDigests: [
      {
        key: 'test.json',
        algorithm: 'sha256',
        digest: 'a'.repeat(64),
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
    species: [createSpecies()],
  });
  return {
    formatId: format.id,
    targetPath: getMovesetVariantManifestPath(format),
    contents: serializeBuiltMovesetVariantManifest(manifest),
  };
}

describe('deleteStaleVariantSimulationFiles', () => {
  it('deletes only recognized undeclared variant files in deterministic order', async () => {
    const manifest = createPreparedManifest(getFormat('great-league'));
    const unlink = vi.fn().mockResolvedValue(undefined);

    const deleted = await deleteStaleVariantSimulationFiles([manifest], {
      realpath: identityRealpath,
      readDirectory: vi.fn().mockResolvedValue([
        {
          name: 'golisopod--waterfall--liquidation--aerial_ace_2-2.csv',
          isFile: true,
        },
        { name: 'golisopod_1-1.csv', isFile: true },
        {
          name: `golisopod--${alternateVariantId}_1-1.csv`,
          isFile: true,
        },
        {
          name: 'golisopod--waterfall--liquidation--aerial_ace_0-0.csv',
          isFile: true,
        },
        { name: 'golisopod--bad_3-3.csv', isFile: true },
        {
          name: 'golisopod--waterfall--liquidation--aerial_ace_1-1.csv',
          isFile: false,
        },
      ]),
      unlink,
    });

    expect(deleted).toEqual([
      'data/simulations/cp1500/all/golisopod--waterfall--liquidation--aerial_ace_0-0.csv',
      'data/simulations/cp1500/all/golisopod--waterfall--liquidation--aerial_ace_2-2.csv',
    ]);
    expect(unlink.mock.calls.map(([filePath]) => filePath)).toEqual(
      deleted.map((filePath) => path.resolve(filePath)),
    );
  });

  it('validates every manifest boundary before reading or deleting files', async () => {
    const valid = createPreparedManifest(getFormat('great-league'));
    const invalid = {
      ...createPreparedManifest(getFormat('weather-cup')),
      targetPath: 'data/simulations/cp1500/all/moveset-variants.json',
    };
    const readDirectory = vi.fn();
    const unlink = vi.fn();

    await expect(
      deleteStaleVariantSimulationFiles([valid, invalid], {
        realpath: identityRealpath,
        readDirectory,
        unlink,
      }),
    ).rejects.toThrow('Manifest target must match weather-cup');

    expect(readDirectory).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
  });

  it('scopes identical stale filenames to each catalog format directory', async () => {
    const staleFilename =
      'golisopod--waterfall--liquidation--aerial_ace_1-1.csv';
    const unlink = vi.fn().mockResolvedValue(undefined);

    const deleted = await deleteStaleVariantSimulationFiles(
      [
        createPreparedManifest(getFormat('great-league')),
        createPreparedManifest(getFormat('weather-cup')),
      ],
      {
        realpath: identityRealpath,
        readDirectory: vi
          .fn()
          .mockResolvedValue([{ name: staleFilename, isFile: true }]),
        unlink,
      },
    );

    expect(deleted).toEqual([
      `data/simulations/cp1500/all/${staleFilename}`,
      `data/simulations/cp1500/weather/${staleFilename}`,
    ]);
  });

  it('rejects duplicate format cleanup plans before deleting files', async () => {
    const manifest = createPreparedManifest(getFormat('great-league'));
    const unlink = vi.fn();

    await expect(
      deleteStaleVariantSimulationFiles([manifest, manifest], {
        realpath: identityRealpath,
        readDirectory: vi.fn(),
        unlink,
      }),
    ).rejects.toThrow('Duplicate cleanup format: great-league');

    expect(unlink).not.toHaveBeenCalled();
  });

  it('rejects a format directory that resolves outside its catalog path', async () => {
    const unlink = vi.fn();
    const readDirectory = vi.fn();
    const workspacePath = path.resolve('.');
    const formatDirectory = path.resolve('data/simulations/cp1500/all');

    await expect(
      deleteStaleVariantSimulationFiles(
        [createPreparedManifest(getFormat('great-league'))],
        {
          realpath: vi.fn(async (filePath: string) => {
            if (filePath === workspacePath) {
              return workspacePath;
            }
            if (filePath === formatDirectory) {
              return path.resolve('../outside');
            }
            return filePath;
          }),
          readDirectory,
          unlink,
        },
      ),
    ).rejects.toThrow('Format directory must match its physical catalog path');

    expect(readDirectory).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
  });

  it('reports successful deletions before a later scoped deletion failure', async () => {
    const firstFilename =
      'golisopod--waterfall--liquidation--aerial_ace_0-0.csv';
    const secondFilename =
      'golisopod--waterfall--liquidation--aerial_ace_1-1.csv';
    const reportDeleted = vi.fn();
    const unlink = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('permission denied'));

    await expect(
      deleteStaleVariantSimulationFiles(
        [createPreparedManifest(getFormat('great-league'))],
        {
          realpath: identityRealpath,
          readDirectory: vi.fn().mockResolvedValue([
            { name: secondFilename, isFile: true },
            { name: firstFilename, isFile: true },
          ]),
          unlink,
          reportDeleted,
        },
      ),
    ).rejects.toThrow(
      `Failed to delete data/simulations/cp1500/all/${secondFilename}: permission denied`,
    );
    expect(reportDeleted).toHaveBeenCalledTimes(1);
    expect(reportDeleted).toHaveBeenCalledWith(
      `data/simulations/cp1500/all/${firstFilename}`,
    );
  });
});
