import * as fs from 'fs';
import * as path from 'path';
import { createPvpokeAdapter } from './adapter';

type PathExists = (filePath: string) => boolean;

export interface SourcePathResolution {
  sourcePath: string;
  sourceType: 'PVPOKE_PATH' | 'vendor/pvpoke';
}

interface ResolvePvpokeSourcePathDependencies {
  env: NodeJS.ProcessEnv;
  cwd: string;
  pathExists: PathExists;
}

/**
 * Resolve PvPoke source path with deterministic precedence.
 */
export function resolvePvpokeSourcePath(
  dependencies?: Partial<ResolvePvpokeSourcePathDependencies>,
): SourcePathResolution {
  const env = dependencies?.env ?? process.env;
  const cwd = dependencies?.cwd ?? process.cwd();
  const pathExists = dependencies?.pathExists ?? fs.existsSync;

  const configuredSourcePath = env.PVPOKE_PATH?.trim();
  if (configuredSourcePath) {
    const resolvedConfiguredPath = path.resolve(cwd, configuredSourcePath);
    if (pathExists(resolvedConfiguredPath)) {
      return {
        sourcePath: resolvedConfiguredPath,
        sourceType: 'PVPOKE_PATH',
      };
    }
  }

  const fallbackPath = path.resolve(cwd, 'vendor/pvpoke');
  if (pathExists(fallbackPath)) {
    return {
      sourcePath: fallbackPath,
      sourceType: 'vendor/pvpoke',
    };
  }

  throw new Error(buildSourcePathResolutionError(configuredSourcePath, cwd));
}

/**
 * Validate required source files for phase 1 exist before execution.
 */
export function validatePhase1SourceFiles(
  sourcePath: string,
  pathExists: PathExists = fs.existsSync,
): void {
  const adapter = createPvpokeAdapter({ sourcePath, pathExists });
  assertRequiredSourceFilesExist(
    sourcePath,
    adapter.getRequiredGamemasterRelativePaths(),
    'phase-1-gamemaster-sync',
    pathExists,
  );
}

/**
 * Validate a set of required files under the resolved source path.
 */
export function assertRequiredSourceFilesExist(
  sourcePath: string,
  requiredRelativePaths: readonly string[],
  phaseName: string,
  pathExists: PathExists = fs.existsSync,
): void {
  const missingFiles = requiredRelativePaths.filter((relativePath) => {
    return !pathExists(path.join(sourcePath, relativePath));
  });

  if (missingFiles.length === 0) {
    return;
  }

  const missingWithAbsolutePaths = missingFiles.map((relativePath) => {
    return `- ${relativePath} (${path.join(sourcePath, relativePath)})`;
  });

  throw new Error(
    [
      `[source:${phaseName}] Missing required PvPoke source files:`,
      ...missingWithAbsolutePaths,
      `Resolved source path: ${sourcePath}`,
    ].join('\n'),
  );
}

function buildSourcePathResolutionError(
  configuredSourcePath: string | undefined,
  cwd: string,
): string {
  const checkedPaths: string[] = [];

  if (configuredSourcePath) {
    checkedPaths.push(`PVPOKE_PATH=${path.resolve(cwd, configuredSourcePath)}`);
  } else {
    checkedPaths.push('PVPOKE_PATH=<not set>');
  }

  checkedPaths.push(`vendor/pvpoke=${path.resolve(cwd, 'vendor/pvpoke')}`);

  return [
    'Unable to resolve local PvPoke source path.',
    'Resolution order: PVPOKE_PATH, then vendor/pvpoke.',
    `Checked: ${checkedPaths.join(', ')}`,
  ].join(' ');
}
