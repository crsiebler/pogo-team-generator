import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  assertRequiredSourceFilesExist,
  resolvePvpokeSourcePath,
  validatePhase1SourceFiles,
} from './source';

describe('resolvePvpokeSourcePath', () => {
  it('prefers PVPOKE_PATH when configured and present', () => {
    const cwd = '/workspace/project';
    const pvpokePath = '/data/pvpoke';
    const resolution = resolvePvpokeSourcePath({
      cwd,
      env: { ...process.env, PVPOKE_PATH: pvpokePath },
      pathExists: (filePath: string) => filePath === pvpokePath,
    });

    expect(resolution).toEqual({
      sourcePath: pvpokePath,
      sourceType: 'PVPOKE_PATH',
    });
  });

  it('falls back to vendor/pvpoke when PVPOKE_PATH is unavailable', () => {
    const cwd = '/workspace/project';
    const fallbackPath = path.resolve(cwd, 'vendor/pvpoke');
    const resolution = resolvePvpokeSourcePath({
      cwd,
      env: process.env,
      pathExists: (filePath: string) => filePath === fallbackPath,
    });

    expect(resolution).toEqual({
      sourcePath: fallbackPath,
      sourceType: 'vendor/pvpoke',
    });
  });

  it('throws a clear error when no valid source path exists', () => {
    expect(() => {
      resolvePvpokeSourcePath({
        cwd: '/workspace/project',
        env: { ...process.env, PVPOKE_PATH: '/missing/path' },
        pathExists: () => false,
      });
    }).toThrowError(
      /Unable to resolve local PvPoke source path\. Resolution order: PVPOKE_PATH, then vendor\/pvpoke\./,
    );
  });
});

describe('assertRequiredSourceFilesExist', () => {
  it('passes when all required files exist', () => {
    expect(() => {
      assertRequiredSourceFilesExist(
        '/source/pvpoke',
        ['a.json', 'b.json'],
        'phase-x',
        () => true,
      );
    }).not.toThrow();
  });

  it('throws with missing files and absolute paths', () => {
    expect(() => {
      assertRequiredSourceFilesExist(
        '/source/pvpoke',
        ['present.json', 'missing.json'],
        'phase-x',
        (filePath: string) => filePath.endsWith('present.json'),
      );
    }).toThrowError(
      /\[source:phase-x\] Missing required PvPoke source files:\n- missing\.json \(\/source\/pvpoke\/missing\.json\)/,
    );
  });
});

describe('validatePhase1SourceFiles', () => {
  it('checks required gamemaster source files', () => {
    const existingPaths = new Set([
      '/source/pvpoke/src/data/gamemaster/pokemon.json',
      '/source/pvpoke/src/data/gamemaster/moves.json',
    ]);

    expect(() => {
      validatePhase1SourceFiles('/source/pvpoke', (filePath: string) => {
        return existingPaths.has(filePath);
      });
    }).not.toThrow();
  });
});
