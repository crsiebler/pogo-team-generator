import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  analyzeFunctionTrace,
  formatFunctionTraceReport,
  inspectFunctionTrace,
  runFunctionTraceAnalyzerCli,
} from '@/lib/build/functionTraceAnalyzer';
import { validateRuntimeFunctionTraceAssets } from '@/lib/build/runtimeFunctionAssets';
import type { RuntimeFunctionAssetPlan } from '@/lib/build/runtimeFunctionAssets';

const fixtureRoot = path.join(
  process.cwd(),
  'lib/build/fixtures/functionTrace',
);
const validFixtureRoot = path.join(fixtureRoot, 'valid');
const validTracePath = path.join(
  validFixtureRoot,
  '.next/server/app/api/generate-team/route.js.nft.json',
);
const fixtureRuntimeAssetPlan: RuntimeFunctionAssetPlan = {
  generateTeam: [
    'data/pokemon.json',
    'data/rankings/cp1500/all/overall_rankings.csv',
    'data/simulations/cp1500/all/runtime-snapshot.json',
  ],
  generateTeamExcludes: [
    'data/simulations/cp1500/all/fixture_0-0.csv',
    'data/simulations/cp1500/all/moveset-variants.json',
  ],
  teamDetails: [
    'data/moves.json',
    'data/pokemon.json',
    'data/rankings/cp1500/all/overall_rankings.csv',
    'data/simulations/cp1500/all/runtime-snapshot.json',
  ],
  teamDetailsExcludes: [
    'data/simulations/cp1500/all/fixture_0-0.csv',
    'data/simulations/cp1500/all/moveset-variants.json',
  ],
  pokemonList: [
    'data/pokemon.json',
    'data/rankings/cp1500/all/overall_rankings.csv',
  ],
  pokemonListExcludes: [],
};

describe('function trace analyzer', () => {
  it('reports unique traced bytes by category from an NFT trace', async () => {
    const [
      simulationBytes,
      rankingBytes,
      applicationBytes,
      routeBytes,
      dependencyBytes,
      otherDataBytes,
    ] = await Promise.all([
      readFile(
        path.join(
          validFixtureRoot,
          'data/simulations/cp1500/all/runtime-snapshot.json',
        ),
      ).then((contents) => contents.byteLength),
      readFile(
        path.join(
          validFixtureRoot,
          'data/rankings/cp1500/all/overall_rankings.csv',
        ),
      ).then((contents) => contents.byteLength),
      readFile(path.join(validFixtureRoot, 'lib/fixture.txt')).then(
        (contents) => contents.byteLength,
      ),
      readFile(
        path.join(
          validFixtureRoot,
          '.next/server/app/api/generate-team/route.js',
        ),
      ).then((contents) => contents.byteLength),
      readFile(
        path.join(validFixtureRoot, 'node_modules/fixture/index.js'),
      ).then((contents) => contents.byteLength),
      readFile(path.join(validFixtureRoot, 'data/pokemon.json')).then(
        (contents) => contents.byteLength,
      ),
    ]);
    const report = await analyzeFunctionTrace({
      projectRoot: validFixtureRoot,
      tracePath: validTracePath,
    });

    expect(report).toEqual({
      trace: '.next/server/app/api/generate-team/route.js.nft.json',
      uniqueTracedFiles: 6,
      uncompressedBytes:
        simulationBytes +
        rankingBytes +
        applicationBytes +
        routeBytes +
        dependencyBytes +
        otherDataBytes,
      categories: [
        {
          category: 'simulations',
          files: 1,
          uncompressedBytes: simulationBytes,
        },
        {
          category: 'rankings',
          files: 1,
          uncompressedBytes: rankingBytes,
        },
        {
          category: 'applicationCode',
          files: 2,
          uncompressedBytes: applicationBytes + routeBytes,
        },
        {
          category: 'dependencies',
          files: 1,
          uncompressedBytes: dependencyBytes,
        },
        {
          category: 'otherData',
          files: 1,
          uncompressedBytes: otherDataBytes,
        },
      ],
      largestFiles: [
        {
          path: 'data/simulations/cp1500/all/runtime-snapshot.json',
          category: 'simulations',
          uncompressedBytes: simulationBytes,
        },
        {
          path: '.next/server/app/api/generate-team/route.js',
          category: 'applicationCode',
          uncompressedBytes: routeBytes,
        },
        {
          path: 'lib/fixture.txt',
          category: 'applicationCode',
          uncompressedBytes: applicationBytes,
        },
        {
          path: 'data/rankings/cp1500/all/overall_rankings.csv',
          category: 'rankings',
          uncompressedBytes: rankingBytes,
        },
        {
          path: 'node_modules/fixture/index.js',
          category: 'dependencies',
          uncompressedBytes: dependencyBytes,
        },
        {
          path: 'data/pokemon.json',
          category: 'otherData',
          uncompressedBytes: otherDataBytes,
        },
      ],
    });
  });

  it('formats byte-identical JSON for shuffled trace entries', async () => {
    const orderedTracePath = path.join(
      validFixtureRoot,
      '.next/server/app/api/generate-team/ordered.js.nft.json',
    );
    const shuffledTracePath = path.join(
      validFixtureRoot,
      '.next/server/app/api/generate-team/shuffled.js.nft.json',
    );
    const [report, shuffledReport] = await Promise.all([
      analyzeFunctionTrace({
        projectRoot: validFixtureRoot,
        tracePath: orderedTracePath,
      }),
      analyzeFunctionTrace({
        projectRoot: validFixtureRoot,
        tracePath: shuffledTracePath,
      }),
    ]);

    expect(
      formatFunctionTraceReport({ ...report, trace: 'trace.js.nft.json' }),
    ).toBe(
      formatFunctionTraceReport({
        ...shuffledReport,
        trace: 'trace.js.nft.json',
      }),
    );
  });

  it('fails actionably for missing and malformed traces', async () => {
    await expect(
      analyzeFunctionTrace({
        projectRoot: fixtureRoot,
        tracePath: path.join(fixtureRoot, 'missing.js.nft.json'),
      }),
    ).rejects.toThrow(/missing\.js\.nft\.json.*npm run build/i);

    await expect(
      analyzeFunctionTrace({
        projectRoot: fixtureRoot,
        tracePath: path.join(fixtureRoot, 'malformed.nft.json'),
      }),
    ).rejects.toThrow(/malformed\.nft\.json.*valid JSON/i);
  });

  it('reports missing traced assets without absolute host paths', async () => {
    const missingAssetTracePath = path.join(
      validFixtureRoot,
      '.next/server/app/api/generate-team/missing-asset.js.nft.json',
    );

    await expect(
      analyzeFunctionTrace({
        projectRoot: validFixtureRoot,
        tracePath: missingAssetTracePath,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain('data/missing.csv');
      expect(message).not.toContain(validFixtureRoot);
      return true;
    });
  });

  it('returns non-zero for structurally malformed trace JSON', async () => {
    const stderr: string[] = [];

    const exitCode = await runFunctionTraceAnalyzerCli({
      args: ['--trace', 'invalid-files.nft.json'],
      cwd: fixtureRoot,
      stdout: () => undefined,
      stderr: (message) => stderr.push(message),
    });

    expect(exitCode).toBe(1);
    expect(stderr.join('')).toMatch(/invalid-files\.nft\.json.*files array/i);
  });

  it('returns a non-zero CLI result and writes actionable errors', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runFunctionTraceAnalyzerCli({
      args: [],
      cwd: fixtureRoot,
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
    });

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join('')).toMatch(/route\.js\.nft\.json.*npm run build/i);
  });

  it('writes only deterministic report JSON on CLI success', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runFunctionTraceAnalyzerCli({
      args: [],
      cwd: validFixtureRoot,
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      uniqueTracedFiles: 6,
    });
  });

  it('rejects symlinked repository data authorities', async () => {
    const symlinkFixtureRoot = fs.mkdtempSync(
      path.join(process.cwd(), '.function-trace-symlink-fixture-'),
    );

    try {
      const traceDirectory = path.join(
        symlinkFixtureRoot,
        '.next/server/app/api/team-details',
      );
      const dataDirectory = path.join(symlinkFixtureRoot, 'data');
      fs.mkdirSync(traceDirectory, { recursive: true });
      fs.mkdirSync(dataDirectory, { recursive: true });
      fs.writeFileSync(path.join(traceDirectory, 'route.js'), 'export {};');
      fs.writeFileSync(path.join(symlinkFixtureRoot, 'external.json'), '{}');
      fs.symlinkSync(
        path.join(symlinkFixtureRoot, 'external.json'),
        path.join(dataDirectory, 'moves.json'),
      );
      const tracePath = path.join(traceDirectory, 'route.js.nft.json');
      fs.writeFileSync(
        tracePath,
        JSON.stringify({
          version: 1,
          files: ['../../../../../data/moves.json'],
        }),
      );

      await expect(
        analyzeFunctionTrace({
          projectRoot: symlinkFixtureRoot,
          tracePath,
        }),
      ).rejects.toThrow(/data\/moves\.json.*symbolic link/i);
    } finally {
      fs.rmSync(symlinkFixtureRoot, { force: true, recursive: true });
    }
  });

  it('rejects repository data beneath a symlinked directory', async () => {
    const symlinkFixtureRoot = fs.mkdtempSync(
      path.join(process.cwd(), '.function-trace-symlink-directory-fixture-'),
    );

    try {
      const traceDirectory = path.join(
        symlinkFixtureRoot,
        '.next/server/app/api/team-details',
      );
      const dataDirectory = path.join(symlinkFixtureRoot, 'data');
      const externalDirectory = path.join(symlinkFixtureRoot, 'external');
      fs.mkdirSync(traceDirectory, { recursive: true });
      fs.mkdirSync(dataDirectory, { recursive: true });
      fs.mkdirSync(externalDirectory, { recursive: true });
      fs.writeFileSync(path.join(traceDirectory, 'route.js'), 'export {};');
      fs.writeFileSync(path.join(externalDirectory, 'moves.json'), '{}');
      fs.symlinkSync(externalDirectory, path.join(dataDirectory, 'authority'));
      const tracePath = path.join(traceDirectory, 'route.js.nft.json');
      fs.writeFileSync(
        tracePath,
        JSON.stringify({
          version: 1,
          files: ['../../../../../data/authority/moves.json'],
        }),
      );

      await expect(
        analyzeFunctionTrace({
          projectRoot: symlinkFixtureRoot,
          tracePath,
        }),
      ).rejects.toThrow(/data\/authority\/moves\.json.*symbolic link/i);
    } finally {
      fs.rmSync(symlinkFixtureRoot, { force: true, recursive: true });
    }
  });

  it('rejects external node_modules outside trusted dependency roots', async () => {
    const fixtureParent = fs.mkdtempSync(
      path.join(process.cwd(), '.function-trace-dependency-fixture-'),
    );
    const projectRoot = path.join(fixtureParent, 'project');
    const externalDependency = path.join(
      fixtureParent,
      'external/node_modules/untrusted/index.js',
    );

    try {
      const traceDirectory = path.join(
        projectRoot,
        '.next/server/app/api/team-details',
      );
      fs.mkdirSync(traceDirectory, { recursive: true });
      fs.mkdirSync(path.dirname(externalDependency), { recursive: true });
      fs.writeFileSync(path.join(traceDirectory, 'route.js'), 'export {};');
      fs.writeFileSync(externalDependency, 'export {};');
      const tracePath = path.join(traceDirectory, 'route.js.nft.json');
      fs.writeFileSync(
        tracePath,
        JSON.stringify({
          version: 1,
          files: [path.relative(traceDirectory, externalDependency)],
        }),
      );

      await expect(
        analyzeFunctionTrace({
          projectRoot,
          tracePath,
        }),
      ).rejects.toThrow(/outside the project and trusted dependencies/i);
    } finally {
      fs.rmSync(fixtureParent, { force: true, recursive: true });
    }
  });

  it('rejects dependency roots that canonically contain the project', async () => {
    const fixtureParent = fs.mkdtempSync(
      path.join(process.cwd(), '.function-trace-broad-dependency-fixture-'),
    );
    const projectRoot = path.join(fixtureParent, 'project');
    const externalPath = path.join(fixtureParent, 'external.js');

    try {
      const traceDirectory = path.join(
        projectRoot,
        '.next/server/app/api/team-details',
      );
      fs.mkdirSync(traceDirectory, { recursive: true });
      fs.writeFileSync(path.join(traceDirectory, 'route.js'), 'export {};');
      fs.writeFileSync(externalPath, 'export {};');
      fs.symlinkSync(fixtureParent, path.join(projectRoot, 'node_modules'));
      const tracePath = path.join(traceDirectory, 'route.js.nft.json');
      fs.writeFileSync(
        tracePath,
        JSON.stringify({
          version: 1,
          files: [path.relative(traceDirectory, externalPath)],
        }),
      );

      await expect(
        inspectFunctionTrace({ projectRoot, tracePath }),
      ).rejects.toThrow(/dependency root.*contains.*project/i);
    } finally {
      fs.rmSync(fixtureParent, { force: true, recursive: true });
    }
  });

  it('derives trusted dependency roots from the canonical project path', async () => {
    const fixtureParent = fs.mkdtempSync(
      path.join(process.cwd(), '.function-trace-canonical-root-fixture-'),
    );
    const canonicalProjectRoot = path.join(fixtureParent, 'real/project');
    const projectAlias = path.join(fixtureParent, 'aliases/project');
    const lexicalDependency = path.join(
      fixtureParent,
      'aliases/node_modules/untrusted/index.js',
    );

    try {
      const traceDirectory = path.join(
        canonicalProjectRoot,
        '.next/server/app/api/team-details',
      );
      fs.mkdirSync(traceDirectory, { recursive: true });
      fs.mkdirSync(path.dirname(projectAlias), { recursive: true });
      fs.mkdirSync(path.dirname(lexicalDependency), { recursive: true });
      fs.writeFileSync(path.join(traceDirectory, 'route.js'), 'export {};');
      fs.writeFileSync(lexicalDependency, 'export {};');
      fs.symlinkSync(canonicalProjectRoot, projectAlias);
      const tracePath = path.join(
        projectAlias,
        '.next/server/app/api/team-details/route.js.nft.json',
      );
      fs.writeFileSync(
        tracePath,
        JSON.stringify({
          version: 1,
          files: [path.relative(path.dirname(tracePath), lexicalDependency)],
        }),
      );

      await expect(
        analyzeFunctionTrace({
          projectRoot: projectAlias,
          tracePath,
        }),
      ).rejects.toThrow(
        /node_modules\/untrusted\/index\.js.*outside the project and trusted dependencies/i,
      );
    } finally {
      fs.rmSync(fixtureParent, { force: true, recursive: true });
    }
  });

  it('reports in-project symlink aliases by canonical authority path', async () => {
    const symlinkFixtureRoot = fs.mkdtempSync(
      path.join(process.cwd(), '.function-trace-project-alias-fixture-'),
    );

    try {
      const traceDirectory = path.join(
        symlinkFixtureRoot,
        '.next/server/app/api/team-details',
      );
      const simulationPath = path.join(
        symlinkFixtureRoot,
        'data/simulations/cp1500/all/inactive_0-0.csv',
      );
      const aliasPath = path.join(symlinkFixtureRoot, 'lib/authority.csv');
      fs.mkdirSync(traceDirectory, { recursive: true });
      fs.mkdirSync(path.dirname(simulationPath), { recursive: true });
      fs.mkdirSync(path.dirname(aliasPath), { recursive: true });
      fs.writeFileSync(path.join(traceDirectory, 'route.js'), 'export {};');
      fs.writeFileSync(simulationPath, 'species,rating\nfixture,500\n');
      fs.symlinkSync(simulationPath, aliasPath);
      const tracePath = path.join(traceDirectory, 'route.js.nft.json');
      fs.writeFileSync(
        tracePath,
        JSON.stringify({
          version: 1,
          files: [path.relative(traceDirectory, aliasPath)],
        }),
      );

      const inventory = await inspectFunctionTrace({
        projectRoot: symlinkFixtureRoot,
        tracePath,
      });

      expect(inventory.files).toContainEqual({
        path: 'data/simulations/cp1500/all/inactive_0-0.csv',
        category: 'simulations',
        uncompressedBytes: 27,
      });
      expect(inventory.files.some((file) => file.path.includes('lib/'))).toBe(
        false,
      );
      expect(inventory.authorityPaths).toEqual(
        expect.arrayContaining([
          'data/simulations/cp1500/all/inactive_0-0.csv',
          'lib/authority.csv',
        ]),
      );
    } finally {
      fs.rmSync(symlinkFixtureRoot, { force: true, recursive: true });
    }
  });

  it('rejects project symlinks that erase package dependency authority', async () => {
    const fixtureParent = fs.mkdtempSync(
      path.join(process.cwd(), '.function-trace-trusted-symlink-fixture-'),
    );
    const projectRoot = path.join(fixtureParent, 'project');
    const storedDependencyPath = path.join(
      fixtureParent,
      'node_modules/.store/runtime/index.js',
    );
    const packagePath = path.join(fixtureParent, 'node_modules/pvpoke');

    try {
      const traceDirectory = path.join(
        projectRoot,
        '.next/server/app/api/team-details',
      );
      const aliasPath = path.join(projectRoot, 'lib/trusted.js');
      fs.mkdirSync(traceDirectory, { recursive: true });
      fs.mkdirSync(path.dirname(storedDependencyPath), { recursive: true });
      fs.mkdirSync(path.dirname(aliasPath), { recursive: true });
      fs.writeFileSync(path.join(traceDirectory, 'route.js'), 'export {};');
      fs.writeFileSync(storedDependencyPath, 'export {};');
      fs.symlinkSync(path.dirname(storedDependencyPath), packagePath);
      fs.symlinkSync(path.join(packagePath, 'index.js'), aliasPath);
      const tracePath = path.join(traceDirectory, 'route.js.nft.json');
      fs.writeFileSync(
        tracePath,
        JSON.stringify({
          version: 1,
          files: [path.relative(traceDirectory, aliasPath)],
        }),
      );

      await expect(
        inspectFunctionTrace({
          projectRoot,
          tracePath,
        }),
      ).rejects.toThrow(/package dependency authority/i);
    } finally {
      fs.rmSync(fixtureParent, { force: true, recursive: true });
    }
  });

  it('preserves package identity through symlinked dependency roots', async () => {
    const fixtureParent = fs.mkdtempSync(
      path.join(process.cwd(), '.function-trace-package-identity-fixture-'),
    );
    const projectRoot = path.join(fixtureParent, 'project');
    const dependencyRoot = path.join(fixtureParent, 'node_modules');
    const canonicalDependencyRoot = path.join(
      fixtureParent,
      'external-dependencies',
    );
    const dependencyPath = path.join(
      canonicalDependencyRoot,
      'pvpoke/index.js',
    );

    try {
      const traceDirectory = path.join(
        projectRoot,
        '.next/server/app/api/team-details',
      );
      fs.mkdirSync(traceDirectory, { recursive: true });
      fs.mkdirSync(path.dirname(dependencyPath), { recursive: true });
      fs.writeFileSync(path.join(traceDirectory, 'route.js'), 'export {};');
      fs.writeFileSync(dependencyPath, 'export {};');
      fs.symlinkSync(canonicalDependencyRoot, dependencyRoot);
      const tracePath = path.join(traceDirectory, 'route.js.nft.json');
      fs.writeFileSync(
        tracePath,
        JSON.stringify({
          version: 1,
          files: [path.relative(traceDirectory, dependencyPath)],
        }),
      );

      const inventory = await inspectFunctionTrace({ projectRoot, tracePath });

      expect(inventory.files).toContainEqual({
        path: '../node_modules/pvpoke/index.js',
        category: 'dependencies',
        uncompressedBytes: 10,
      });
      expect(() =>
        validateRuntimeFunctionTraceAssets({
          plan: {
            generateTeam: [],
            generateTeamExcludes: [],
            teamDetails: [],
            teamDetailsExcludes: [],
            pokemonList: [],
            pokemonListExcludes: [],
          },
          generateTeamTracedFiles: inventory.files.map((file) => file.path),
          teamDetailsTracedFiles: [],
          pokemonListTracedFiles: [],
          generateTeamUncompressedBytes: 10,
          teamDetailsUncompressedBytes: 0,
          runtimeSnapshotUncompressedBytes: 0,
        }),
      ).toThrow(/pvpoke vendor assets.*node_modules\/pvpoke/i);
    } finally {
      fs.rmSync(fixtureParent, { force: true, recursive: true });
    }
  });

  it('preserves package identity through package-level dependency symlinks', async () => {
    const fixtureParent = fs.mkdtempSync(
      path.join(process.cwd(), '.function-trace-package-symlink-fixture-'),
    );
    const projectRoot = path.join(fixtureParent, 'project');
    const dependencyRoot = path.join(fixtureParent, 'node_modules');
    const storedDependencyPath = path.join(
      dependencyRoot,
      '.store/runtime/index.js',
    );
    const packagePath = path.join(dependencyRoot, 'pvpoke');

    try {
      const traceDirectory = path.join(
        projectRoot,
        '.next/server/app/api/team-details',
      );
      fs.mkdirSync(traceDirectory, { recursive: true });
      fs.mkdirSync(path.dirname(storedDependencyPath), { recursive: true });
      fs.writeFileSync(path.join(traceDirectory, 'route.js'), 'export {};');
      fs.writeFileSync(storedDependencyPath, 'export {};');
      fs.symlinkSync(path.dirname(storedDependencyPath), packagePath);
      const tracedPackagePath = path.join(packagePath, 'index.js');
      const tracePath = path.join(traceDirectory, 'route.js.nft.json');
      fs.writeFileSync(
        tracePath,
        JSON.stringify({
          version: 1,
          files: [path.relative(traceDirectory, tracedPackagePath)],
        }),
      );

      const inventory = await inspectFunctionTrace({ projectRoot, tracePath });

      expect(inventory.files).toContainEqual({
        path: '../node_modules/pvpoke/index.js',
        category: 'dependencies',
        uncompressedBytes: 10,
      });
      expect(() =>
        validateRuntimeFunctionTraceAssets({
          plan: {
            generateTeam: [],
            generateTeamExcludes: [],
            teamDetails: [],
            teamDetailsExcludes: [],
            pokemonList: [],
            pokemonListExcludes: [],
          },
          generateTeamTracedFiles: inventory.files.map((file) => file.path),
          teamDetailsTracedFiles: [],
          pokemonListTracedFiles: [],
          generateTeamUncompressedBytes: 10,
          teamDetailsUncompressedBytes: 0,
          runtimeSnapshotUncompressedBytes: 0,
        }),
      ).toThrow(/pvpoke vendor assets.*node_modules\/pvpoke/i);
    } finally {
      fs.rmSync(fixtureParent, { force: true, recursive: true });
    }
  });

  it('preserves every package identity through chained dependency symlinks', async () => {
    const fixtureParent = fs.mkdtempSync(
      path.join(process.cwd(), '.function-trace-chained-package-fixture-'),
    );
    const projectRoot = path.join(fixtureParent, 'project');
    const dependencyRoot = path.join(fixtureParent, 'node_modules');
    const storedDependencyPath = path.join(
      dependencyRoot,
      '.store/runtime/index.js',
    );
    const packagePath = path.join(dependencyRoot, 'pvpoke');
    const linkPath = path.join(dependencyRoot, 'link');
    const aliasPath = path.join(dependencyRoot, 'alias');

    try {
      const traceDirectory = path.join(
        projectRoot,
        '.next/server/app/api/team-details',
      );
      fs.mkdirSync(traceDirectory, { recursive: true });
      fs.mkdirSync(path.dirname(storedDependencyPath), { recursive: true });
      fs.writeFileSync(path.join(traceDirectory, 'route.js'), 'export {};');
      fs.writeFileSync(storedDependencyPath, 'export {};');
      fs.symlinkSync('.store/runtime', packagePath);
      fs.symlinkSync('pvpoke', linkPath);
      fs.symlinkSync('link', aliasPath);
      const tracedAliasPath = path.join(aliasPath, 'index.js');
      const tracePath = path.join(traceDirectory, 'route.js.nft.json');
      fs.writeFileSync(
        tracePath,
        JSON.stringify({
          version: 1,
          files: [path.relative(traceDirectory, tracedAliasPath)],
        }),
      );

      const inventory = await inspectFunctionTrace({ projectRoot, tracePath });

      expect(inventory.authorityPaths).toEqual(
        expect.arrayContaining(['../node_modules/pvpoke/index.js']),
      );
      expect(() =>
        validateRuntimeFunctionTraceAssets({
          plan: {
            generateTeam: [],
            generateTeamExcludes: [],
            teamDetails: [],
            teamDetailsExcludes: [],
            pokemonList: [],
            pokemonListExcludes: [],
          },
          generateTeamTracedFiles: inventory.authorityPaths,
          teamDetailsTracedFiles: [],
          pokemonListTracedFiles: [],
          generateTeamUncompressedBytes: 10,
          teamDetailsUncompressedBytes: 0,
          runtimeSnapshotUncompressedBytes: 0,
        }),
      ).toThrow(/pvpoke vendor assets.*node_modules\/pvpoke/i);
    } finally {
      fs.rmSync(fixtureParent, { force: true, recursive: true });
    }
  });

  it('preserves package identity when a dependency symlink targets the project', async () => {
    const fixtureParent = fs.mkdtempSync(
      path.join(process.cwd(), '.function-trace-project-package-fixture-'),
    );
    const projectRoot = path.join(fixtureParent, 'project');
    const dependencyRoot = path.join(projectRoot, 'node_modules');
    const canonicalPackagePath = path.join(projectRoot, 'lib/runtime');
    const packagePath = path.join(dependencyRoot, 'pvpoke');
    const projectAliasPath = path.join(projectRoot, 'lib/package-alias.js');

    try {
      const traceDirectory = path.join(
        projectRoot,
        '.next/server/app/api/team-details',
      );
      fs.mkdirSync(traceDirectory, { recursive: true });
      fs.mkdirSync(canonicalPackagePath, { recursive: true });
      fs.mkdirSync(dependencyRoot, { recursive: true });
      fs.writeFileSync(path.join(traceDirectory, 'route.js'), 'export {};');
      fs.writeFileSync(
        path.join(canonicalPackagePath, 'index.js'),
        'export {};',
      );
      fs.symlinkSync(canonicalPackagePath, packagePath);
      const tracedPackagePath = path.join(packagePath, 'index.js');
      fs.symlinkSync(tracedPackagePath, projectAliasPath);
      const tracePath = path.join(traceDirectory, 'route.js.nft.json');
      fs.writeFileSync(
        tracePath,
        JSON.stringify({
          version: 1,
          files: [path.relative(traceDirectory, projectAliasPath)],
        }),
      );

      const inventory = await inspectFunctionTrace({ projectRoot, tracePath });

      expect(inventory.authorityPaths).toEqual(
        expect.arrayContaining([
          'lib/runtime/index.js',
          'lib/package-alias.js',
          'node_modules/pvpoke/index.js',
        ]),
      );
      expect(() =>
        validateRuntimeFunctionTraceAssets({
          plan: {
            generateTeam: [],
            generateTeamExcludes: [],
            teamDetails: [],
            teamDetailsExcludes: [],
            pokemonList: [],
            pokemonListExcludes: [],
          },
          generateTeamTracedFiles: inventory.authorityPaths,
          teamDetailsTracedFiles: [],
          pokemonListTracedFiles: [],
          generateTeamUncompressedBytes: 10,
          teamDetailsUncompressedBytes: 0,
          runtimeSnapshotUncompressedBytes: 0,
        }),
      ).toThrow(/pvpoke vendor assets.*node_modules\/pvpoke/i);
    } finally {
      fs.rmSync(fixtureParent, { force: true, recursive: true });
    }
  });

  it('preserves canonical and lexical identities across trusted dependency root aliases', async () => {
    const fixtureParent = fs.mkdtempSync(
      path.join(process.cwd(), '.function-trace-root-alias-fixture-'),
    );
    const projectRoot = path.join(fixtureParent, 'project');
    const canonicalDependencyRoot = path.join(fixtureParent, 'node_modules');
    const lexicalDependencyRoot = path.join(projectRoot, 'node_modules');
    const canonicalDependencyPath = path.join(
      canonicalDependencyRoot,
      'pvpoke/index.js',
    );

    try {
      const traceDirectory = path.join(
        projectRoot,
        '.next/server/app/api/team-details',
      );
      fs.mkdirSync(traceDirectory, { recursive: true });
      fs.mkdirSync(path.dirname(canonicalDependencyPath), { recursive: true });
      fs.writeFileSync(path.join(traceDirectory, 'route.js'), 'export {};');
      fs.writeFileSync(canonicalDependencyPath, 'export {};');
      fs.symlinkSync(canonicalDependencyRoot, lexicalDependencyRoot);
      const lexicalDependencyPath = path.join(
        lexicalDependencyRoot,
        'pvpoke/index.js',
      );
      const tracePath = path.join(traceDirectory, 'route.js.nft.json');
      fs.writeFileSync(
        tracePath,
        JSON.stringify({
          version: 1,
          files: [
            path.relative(traceDirectory, canonicalDependencyPath),
            path.relative(traceDirectory, lexicalDependencyPath),
          ],
        }),
      );

      const inventory = await inspectFunctionTrace({ projectRoot, tracePath });

      expect(inventory.authorityPaths).toEqual(
        expect.arrayContaining([
          '../node_modules/pvpoke/index.js',
          'node_modules/pvpoke/index.js',
        ]),
      );
      const dependencyFiles = inventory.files.filter(
        (file) => file.category === 'dependencies',
      );
      expect(dependencyFiles).toHaveLength(1);
      expect(
        dependencyFiles.reduce(
          (total, file) => total + file.uncompressedBytes,
          0,
        ),
      ).toBe(10);
    } finally {
      fs.rmSync(fixtureParent, { force: true, recursive: true });
    }
  });

  it('projects chained package identities through trusted dependency root aliases', async () => {
    const fixtureParent = fs.mkdtempSync(
      path.join(process.cwd(), '.function-trace-root-chain-fixture-'),
    );
    const projectRoot = path.join(fixtureParent, 'project');
    const canonicalDependencyRoot = path.join(
      fixtureParent,
      'external-dependencies',
    );
    const lexicalDependencyRoot = path.join(projectRoot, 'node_modules');
    const storedDependencyPath = path.join(
      canonicalDependencyRoot,
      '.store/runtime/index.js',
    );
    const packagePath = path.join(canonicalDependencyRoot, 'pvpoke');
    const aliasPath = path.join(canonicalDependencyRoot, 'alias');

    try {
      const traceDirectory = path.join(
        projectRoot,
        '.next/server/app/api/team-details',
      );
      fs.mkdirSync(traceDirectory, { recursive: true });
      fs.mkdirSync(path.dirname(storedDependencyPath), { recursive: true });
      fs.writeFileSync(path.join(traceDirectory, 'route.js'), 'export {};');
      fs.writeFileSync(storedDependencyPath, 'export {};');
      fs.symlinkSync('.store/runtime', packagePath);
      fs.symlinkSync('pvpoke', aliasPath);
      fs.symlinkSync(canonicalDependencyRoot, lexicalDependencyRoot);
      const tracePath = path.join(traceDirectory, 'route.js.nft.json');
      fs.writeFileSync(
        tracePath,
        JSON.stringify({
          version: 1,
          files: [
            path.relative(traceDirectory, path.join(aliasPath, 'index.js')),
          ],
        }),
      );

      const inventory = await inspectFunctionTrace({ projectRoot, tracePath });

      expect(inventory.authorityPaths).toEqual(
        expect.arrayContaining(['node_modules/pvpoke/index.js']),
      );
    } finally {
      fs.rmSync(fixtureParent, { force: true, recursive: true });
    }
  });

  it('preserves package identity through symlink-sensitive dot segments', async () => {
    const fixtureParent = fs.mkdtempSync(
      path.join(process.cwd(), '.function-trace-dot-segment-fixture-'),
    );
    const projectRoot = path.join(fixtureParent, 'project');
    const dependencyRoot = path.join(fixtureParent, 'node_modules');
    const storedDependencyPath = path.join(
      dependencyRoot,
      '.store/scope/runtime/index.js',
    );
    const packageTarget = path.join(dependencyRoot, '.store/scope/pvpoke');
    const packagePath = path.join(dependencyRoot, 'pvpoke');
    const aliasPath = path.join(dependencyRoot, 'alias');

    try {
      const traceDirectory = path.join(
        projectRoot,
        '.next/server/app/api/team-details',
      );
      fs.mkdirSync(traceDirectory, { recursive: true });
      fs.mkdirSync(path.dirname(storedDependencyPath), { recursive: true });
      fs.mkdirSync(packageTarget, { recursive: true });
      fs.writeFileSync(path.join(traceDirectory, 'route.js'), 'export {};');
      fs.writeFileSync(storedDependencyPath, 'export {};');
      fs.symlinkSync('.store/scope/pvpoke', packagePath);
      fs.symlinkSync('pvpoke/../runtime', aliasPath);
      const tracePath = path.join(traceDirectory, 'route.js.nft.json');
      fs.writeFileSync(
        tracePath,
        JSON.stringify({
          version: 1,
          files: [
            path.relative(traceDirectory, path.join(aliasPath, 'index.js')),
          ],
        }),
      );

      const inventory = await inspectFunctionTrace({ projectRoot, tracePath });

      expect(inventory.authorityPaths).toEqual(
        expect.arrayContaining(['../node_modules/pvpoke']),
      );
      expect(() =>
        validateRuntimeFunctionTraceAssets({
          plan: {
            generateTeam: [],
            generateTeamExcludes: [],
            teamDetails: [],
            teamDetailsExcludes: [],
            pokemonList: [],
            pokemonListExcludes: [],
          },
          generateTeamTracedFiles: inventory.authorityPaths,
          teamDetailsTracedFiles: [],
          pokemonListTracedFiles: [],
          generateTeamUncompressedBytes: 10,
          teamDetailsUncompressedBytes: 0,
          runtimeSnapshotUncompressedBytes: 0,
        }),
      ).toThrow(/pvpoke vendor assets.*node_modules\/pvpoke/i);
    } finally {
      fs.rmSync(fixtureParent, { force: true, recursive: true });
    }
  });

  it('retains every package identity for canonical duplicate validation', async () => {
    const fixtureParent = fs.mkdtempSync(
      path.join(process.cwd(), '.function-trace-package-alias-fixture-'),
    );
    const projectRoot = path.join(fixtureParent, 'project');
    const dependencyRoot = path.join(fixtureParent, 'node_modules');
    const storedDependencyPath = path.join(
      dependencyRoot,
      '.store/runtime/index.js',
    );
    const packagePath = path.join(dependencyRoot, 'pvpoke');

    try {
      const traceDirectory = path.join(
        projectRoot,
        '.next/server/app/api/team-details',
      );
      fs.mkdirSync(traceDirectory, { recursive: true });
      fs.mkdirSync(path.dirname(storedDependencyPath), { recursive: true });
      fs.writeFileSync(path.join(traceDirectory, 'route.js'), 'export {};');
      fs.writeFileSync(storedDependencyPath, 'export {};');
      fs.symlinkSync(path.dirname(storedDependencyPath), packagePath);
      const tracedPackagePath = path.join(packagePath, 'index.js');
      const tracePath = path.join(traceDirectory, 'route.js.nft.json');
      fs.writeFileSync(
        tracePath,
        JSON.stringify({
          version: 1,
          files: [
            path.relative(traceDirectory, storedDependencyPath),
            path.relative(traceDirectory, tracedPackagePath),
          ],
        }),
      );

      const inventory = await inspectFunctionTrace({ projectRoot, tracePath });

      expect(inventory.authorityPaths).toEqual(
        expect.arrayContaining([
          '../node_modules/.store/runtime/index.js',
          '../node_modules/pvpoke/index.js',
        ]),
      );
      const dependencyFiles = inventory.files.filter(
        (file) => file.category === 'dependencies',
      );
      expect(dependencyFiles).toHaveLength(1);
      expect(
        dependencyFiles.reduce(
          (total, file) => total + file.uncompressedBytes,
          0,
        ),
      ).toBe(10);
      expect(() =>
        validateRuntimeFunctionTraceAssets({
          plan: {
            generateTeam: [],
            generateTeamExcludes: [],
            teamDetails: [],
            teamDetailsExcludes: [],
            pokemonList: [],
            pokemonListExcludes: [],
          },
          generateTeamTracedFiles: inventory.authorityPaths,
          teamDetailsTracedFiles: [],
          pokemonListTracedFiles: [],
          generateTeamUncompressedBytes: inventory.files.reduce(
            (total, file) => total + file.uncompressedBytes,
            0,
          ),
          teamDetailsUncompressedBytes: 0,
          runtimeSnapshotUncompressedBytes: 0,
        }),
      ).toThrow(/pvpoke vendor assets.*node_modules\/pvpoke/i);
    } finally {
      fs.rmSync(fixtureParent, { force: true, recursive: true });
    }
  });

  it('validates both canonical route traces through the CLI', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runFunctionTraceAnalyzerCli({
      args: [],
      cwd: validFixtureRoot,
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
      validateRuntimeAssets: true,
      runtimeAssetPlan: fixtureRuntimeAssetPlan,
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toMatchObject({ uniqueTracedFiles: 6 });
  });

  it('counts a shared runtime snapshot once across function traces', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const sharedSnapshotBytes = 30 * 1024 * 1024;
    const inspectTrace = vi
      .fn()
      .mockResolvedValueOnce({
        trace: '.next/server/app/api/generate-team/route.js.nft.json',
        authorityPaths: fixtureRuntimeAssetPlan.generateTeam,
        files: fixtureRuntimeAssetPlan.generateTeam.map((filePath) => ({
          path: filePath,
          category: filePath.includes('/simulations/')
            ? ('simulations' as const)
            : filePath.includes('/rankings/')
              ? ('rankings' as const)
              : ('otherData' as const),
          uncompressedBytes: filePath.endsWith('/runtime-snapshot.json')
            ? sharedSnapshotBytes
            : 0,
        })),
      })
      .mockResolvedValueOnce({
        trace: '.next/server/app/api/team-details/route.js.nft.json',
        authorityPaths: fixtureRuntimeAssetPlan.teamDetails,
        files: fixtureRuntimeAssetPlan.teamDetails.map((filePath) => ({
          path: filePath,
          category: filePath.includes('/simulations/')
            ? ('simulations' as const)
            : filePath.includes('/rankings/')
              ? ('rankings' as const)
              : ('otherData' as const),
          uncompressedBytes: filePath.endsWith('/runtime-snapshot.json')
            ? sharedSnapshotBytes
            : 0,
        })),
      })
      .mockResolvedValueOnce({
        trace: '.next/server/app/api/pokemon-list/route.js.nft.json',
        authorityPaths: fixtureRuntimeAssetPlan.pokemonList,
        files: fixtureRuntimeAssetPlan.pokemonList.map((filePath) => ({
          path: filePath,
          category: filePath.includes('/rankings/')
            ? ('rankings' as const)
            : ('otherData' as const),
          uncompressedBytes: 0,
        })),
      });

    const exitCode = await runFunctionTraceAnalyzerCli({
      args: [],
      cwd: validFixtureRoot,
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
      validateRuntimeAssets: true,
      runtimeAssetPlan: fixtureRuntimeAssetPlan,
      inspectTrace,
    });

    expect(exitCode).toBe(0);
    expect(inspectTrace).toHaveBeenCalledTimes(3);
    expect(stdout).toHaveLength(1);
    expect(stderr).toEqual([]);
  });

  it('rejects distinct aggregate snapshot bytes computed from inspected traces', async () => {
    const stderr: string[] = [];
    const snapshotBytes = 30 * 1024 * 1024;
    const teamDetailsSnapshot =
      'data/simulations/cp2500/all/runtime-snapshot.json';
    const runtimeAssetPlan: RuntimeFunctionAssetPlan = {
      ...fixtureRuntimeAssetPlan,
      teamDetails: fixtureRuntimeAssetPlan.teamDetails.map((filePath) =>
        filePath.endsWith('/runtime-snapshot.json')
          ? teamDetailsSnapshot
          : filePath,
      ),
    };
    const inspectTrace = vi
      .fn()
      .mockResolvedValueOnce({
        trace: '.next/server/app/api/generate-team/route.js.nft.json',
        authorityPaths: fixtureRuntimeAssetPlan.generateTeam,
        files: fixtureRuntimeAssetPlan.generateTeam.map((filePath) => ({
          path: filePath,
          category: filePath.includes('/simulations/')
            ? ('simulations' as const)
            : filePath.includes('/rankings/')
              ? ('rankings' as const)
              : ('otherData' as const),
          uncompressedBytes: filePath.endsWith('/runtime-snapshot.json')
            ? snapshotBytes
            : 0,
        })),
      })
      .mockResolvedValueOnce({
        trace: '.next/server/app/api/team-details/route.js.nft.json',
        authorityPaths: runtimeAssetPlan.teamDetails,
        files: runtimeAssetPlan.teamDetails.map((filePath) => ({
          path: filePath,
          category: filePath.includes('/simulations/')
            ? ('simulations' as const)
            : filePath.includes('/rankings/')
              ? ('rankings' as const)
              : ('otherData' as const),
          uncompressedBytes: filePath.endsWith('/runtime-snapshot.json')
            ? snapshotBytes
            : 0,
        })),
      })
      .mockResolvedValueOnce({
        trace: '.next/server/app/api/pokemon-list/route.js.nft.json',
        authorityPaths: fixtureRuntimeAssetPlan.pokemonList,
        files: fixtureRuntimeAssetPlan.pokemonList.map((filePath) => ({
          path: filePath,
          category: filePath.includes('/rankings/')
            ? ('rankings' as const)
            : ('otherData' as const),
          uncompressedBytes: 0,
        })),
      });

    const exitCode = await runFunctionTraceAnalyzerCli({
      args: [],
      cwd: validFixtureRoot,
      stdout: () => undefined,
      stderr: (message) => stderr.push(message),
      validateRuntimeAssets: true,
      runtimeAssetPlan,
      inspectTrace,
    });

    expect(exitCode).toBe(1);
    expect(inspectTrace).toHaveBeenCalledTimes(3);
    expect(stderr.join('')).toMatch(/62914560.*52428800/i);
  });

  it('rejects custom traces when runtime asset validation is enabled', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runFunctionTraceAnalyzerCli({
      args: ['--trace', validTracePath],
      cwd: validFixtureRoot,
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
      validateRuntimeAssets: true,
      runtimeAssetPlan: fixtureRuntimeAssetPlan,
    });

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join('')).toMatch(/canonical generate-team trace/i);
  });
});
