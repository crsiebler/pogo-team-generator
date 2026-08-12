import { promises as fs } from 'fs';
import path from 'path';
import type { PreparedMovesetVariantManifest } from './movesetVariantManifest';
import { parseVariantSimulationFilename } from './simulationProjection';
import { getBattleFormatById } from '@/lib/data/battleFormats';
import {
  getMovesetVariantManifestPath,
  parseMovesetVariantManifestJson,
} from '@/lib/data/movesetVariantManifest';

/** Minimal directory entry metadata needed by stale variant cleanup. */
export interface SimulationCleanupDirectoryEntry {
  readonly name: string;
  readonly isFile: boolean;
}

/** Injectable filesystem boundaries for deterministic stale variant cleanup. */
export interface SimulationCleanupDependencies {
  readonly realpath: (filePath: string) => Promise<string>;
  readonly readDirectory: (
    directoryPath: string,
  ) => Promise<readonly SimulationCleanupDirectoryEntry[]>;
  readonly isRegularFile: (filePath: string) => Promise<boolean>;
  readonly unlink: (filePath: string) => Promise<void>;
  readonly reportDeleted: (repositoryPath: string) => void;
}

interface CleanupPlan {
  readonly directoryPath: string;
  readonly repositoryDirectory: string;
  readonly declaredVariantFiles: ReadonlySet<string>;
}

interface StaleVariantFile {
  readonly absolutePath: string;
  readonly directoryPath: string;
  readonly physicalDirectoryPath: string;
  readonly repositoryPath: string;
}

const defaultDependencies: SimulationCleanupDependencies = {
  realpath: async (filePath) => fs.realpath(filePath),
  readDirectory: async (directoryPath) => {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      isFile: entry.isFile(),
    }));
  },
  isRegularFile: async (filePath) => (await fs.lstat(filePath)).isFile(),
  unlink: async (filePath) => {
    await fs.unlink(filePath);
  },
  reportDeleted: () => undefined,
};

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function createCleanupPlans(
  manifests: readonly PreparedMovesetVariantManifest[],
): readonly CleanupPlan[] {
  const formatIds = new Set<string>();

  return manifests.map((preparedManifest) => {
    if (formatIds.has(preparedManifest.formatId)) {
      throw new Error(
        `[sync-cleanup] Duplicate cleanup format: ${preparedManifest.formatId}`,
      );
    }
    formatIds.add(preparedManifest.formatId);

    const format = getBattleFormatById(preparedManifest.formatId);
    const expectedTargetPath = format
      ? getMovesetVariantManifestPath(format)
      : null;
    if (
      !format ||
      !expectedTargetPath ||
      preparedManifest.targetPath !== expectedTargetPath
    ) {
      throw new Error(
        `[sync-cleanup] Manifest target must match ${preparedManifest.formatId}: ${expectedTargetPath ?? 'unsupported format'}`,
      );
    }

    const manifest = parseMovesetVariantManifestJson(preparedManifest.contents);
    if (manifest.metadata.formatId !== preparedManifest.formatId) {
      throw new Error(
        `[sync-cleanup] Manifest contents must match ${preparedManifest.formatId}`,
      );
    }
    const repositoryDirectory = path.posix.dirname(
      expectedTargetPath.split(path.sep).join(path.posix.sep),
    );
    const directoryPath = path.resolve(path.dirname(expectedTargetPath));
    const declaredVariantFiles = new Set(
      manifest.species.flatMap((species) =>
        species.candidates.flatMap((candidate) =>
          candidate.isDefault ? [] : Object.values(candidate.storageKeys),
        ),
      ),
    );

    return {
      directoryPath,
      repositoryDirectory,
      declaredVariantFiles,
    };
  });
}

/**
 * Delete strictly recognized variant CSVs omitted by newly published manifests.
 * Every manifest and directory boundary is validated before any unlink occurs.
 */
export async function deleteStaleVariantSimulationFiles(
  manifests: readonly PreparedMovesetVariantManifest[],
  dependencies: Partial<SimulationCleanupDependencies> = {},
): Promise<readonly string[]> {
  const resolvedDependencies = { ...defaultDependencies, ...dependencies };
  const plans = createCleanupPlans(manifests);
  const physicalWorkspacePath = await resolvedDependencies.realpath(
    path.resolve('.'),
  );
  const validatedPlans = await Promise.all(
    plans.map(async (plan) => {
      const physicalDirectoryPath = await resolvedDependencies.realpath(
        plan.directoryPath,
      );
      const expectedPhysicalDirectoryPath = path.resolve(
        physicalWorkspacePath,
        plan.repositoryDirectory,
      );
      if (physicalDirectoryPath !== expectedPhysicalDirectoryPath) {
        throw new Error(
          `[sync-cleanup] Format directory must match its physical catalog path: ${plan.repositoryDirectory}`,
        );
      }
      return { ...plan, physicalDirectoryPath };
    }),
  );
  const staleFiles = (
    await Promise.all(
      validatedPlans.map(async (plan): Promise<readonly StaleVariantFile[]> => {
        const entries = await resolvedDependencies.readDirectory(
          plan.directoryPath,
        );
        return entries.flatMap((entry): StaleVariantFile[] => {
          if (
            !entry.isFile ||
            parseVariantSimulationFilename(entry.name) === null ||
            plan.declaredVariantFiles.has(entry.name)
          ) {
            return [];
          }
          const absolutePath = path.resolve(plan.directoryPath, entry.name);
          if (path.dirname(absolutePath) !== plan.directoryPath) {
            throw new Error(
              `[sync-cleanup] Refusing out-of-directory cleanup target: ${entry.name}`,
            );
          }
          return [
            {
              absolutePath,
              directoryPath: plan.directoryPath,
              physicalDirectoryPath: plan.physicalDirectoryPath,
              repositoryPath: path.posix.join(
                plan.repositoryDirectory,
                entry.name,
              ),
            },
          ];
        });
      }),
    )
  )
    .flat()
    .sort((left, right) =>
      compareAscii(left.repositoryPath, right.repositoryPath),
    );

  for (const staleFile of staleFiles) {
    try {
      const currentPhysicalDirectoryPath = await resolvedDependencies.realpath(
        staleFile.directoryPath,
      );
      if (currentPhysicalDirectoryPath !== staleFile.physicalDirectoryPath) {
        throw new Error('format directory changed during cleanup');
      }
      if (!(await resolvedDependencies.isRegularFile(staleFile.absolutePath))) {
        throw new Error('cleanup target is no longer a regular file');
      }
      await resolvedDependencies.unlink(staleFile.absolutePath);
      resolvedDependencies.reportDeleted(staleFile.repositoryPath);
    } catch (error) {
      throw new Error(
        `[sync-cleanup] Failed to delete ${staleFile.repositoryPath}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  return staleFiles.map(({ repositoryPath }) => repositoryPath);
}
