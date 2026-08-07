import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeFunctionTrace,
  formatFunctionTraceReport,
  runFunctionTraceAnalyzerCli,
} from '@/lib/build/functionTraceAnalyzer';
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
    'data/simulations/cp1500/all/fixture_0-0.csv',
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
      dependencyBytes,
      otherDataBytes,
    ] = await Promise.all([
      readFile(
        path.join(
          validFixtureRoot,
          'data/simulations/cp1500/all/fixture_0-0.csv',
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
      uniqueTracedFiles: 5,
      uncompressedBytes:
        simulationBytes +
        rankingBytes +
        applicationBytes +
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
          files: 1,
          uncompressedBytes: applicationBytes,
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
          path: 'data/simulations/cp1500/all/fixture_0-0.csv',
          category: 'simulations',
          uncompressedBytes: simulationBytes,
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
    const shuffledTracePath = path.join(
      validFixtureRoot,
      '.next/server/app/api/generate-team/shuffled.js.nft.json',
    );
    const [report, shuffledReport] = await Promise.all([
      analyzeFunctionTrace({
        projectRoot: validFixtureRoot,
        tracePath: validTracePath,
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
      uniqueTracedFiles: 5,
    });
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
    expect(JSON.parse(stdout.join(''))).toMatchObject({ uniqueTracedFiles: 5 });
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
