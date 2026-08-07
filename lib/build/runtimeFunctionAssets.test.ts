import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GENERATE_TEAM_TRACE_MAX_BYTES,
  RUNTIME_SIMULATION_SNAPSHOTS_MAX_BYTES,
  createRuntimeFunctionAssetPlan,
  loadRuntimeFunctionAssetPlan,
  validateRuntimeFunctionTraceAssets,
} from '@/lib/build/runtimeFunctionAssets';
import { getBattleFormats } from '@/lib/data/battleFormats';
import { RUNTIME_SIMULATION_ASSET_INDEX_PATH } from '@/lib/data/runtimeSimulationAssetIndex';

describe('runtime function assets', () => {
  it('derives compact route assets from the format catalog', () => {
    const plan = createRuntimeFunctionAssetPlan(getBattleFormats());

    expect(plan.generateTeam).toContain(
      'data/simulations/cp1500/all/runtime-snapshot.json',
    );
    expect(plan.generateTeamExcludes).toEqual([
      'data/simulations/**/*.csv',
      'data/simulations/**/moveset-variants.json',
      RUNTIME_SIMULATION_ASSET_INDEX_PATH,
    ]);
    expect(plan.generateTeam).toContain('data/moves.json');
    expect(plan.generateTeam).toContain('data/type-effectiveness.json');
    expect(plan.pokemonList).toEqual(
      [
        'data/pokemon.json',
        ...getBattleFormats()
          .map(
            (format) =>
              `data/rankings/cp${format.cp}/${format.cup}/overall_rankings.csv`,
          )
          .sort(),
      ].sort(),
    );
    expect(plan.pokemonListExcludes).toHaveLength(
      getBattleFormats().length * 6,
    );
    expect(
      plan.pokemonListExcludes.some((asset) =>
        asset.endsWith('/overall_rankings.csv'),
      ),
    ).toBe(false);

    for (const format of getBattleFormats()) {
      for (const category of [
        'overall',
        'leads',
        'switches',
        'closers',
        'chargers',
        'attackers',
        'consistency',
      ]) {
        expect(plan.generateTeam).toContain(
          `data/rankings/cp${format.cp}/${format.cup}/${category}_rankings.csv`,
        );
      }
    }

    expect(plan.generateTeam.every((asset) => !asset.includes('*'))).toBe(true);
    expect(plan.pokemonList.every((asset) => !asset.includes('*'))).toBe(true);
    expect(plan.generateTeamExcludes).toHaveLength(3);
    expect(
      plan.pokemonListExcludes.every((asset) => !asset.includes('*')),
    ).toBe(true);
  });

  it('accepts traces containing exactly the planned data assets', () => {
    const plan = createRuntimeFunctionAssetPlan(getBattleFormats());

    expect(() =>
      validateRuntimeFunctionTraceAssets({
        plan,
        generateTeamTracedFiles: [
          '../node_modules/next/index.js',
          'lib/genetic/algorithm.ts',
          ...plan.generateTeam,
        ],
        pokemonListTracedFiles: [
          '../node_modules/next/index.js',
          ...plan.pokemonList,
        ],
        generateTeamUncompressedBytes: GENERATE_TEAM_TRACE_MAX_BYTES,
        generateTeamSnapshotUncompressedBytes:
          RUNTIME_SIMULATION_SNAPSHOTS_MAX_BYTES,
      }),
    ).not.toThrow();
  });

  it('rejects missing snapshots and any simulation CSV', () => {
    const plan = createRuntimeFunctionAssetPlan(getBattleFormats());
    const withoutActiveAsset = plan.generateTeam.filter(
      (asset) => asset !== 'data/simulations/cp1500/all/runtime-snapshot.json',
    );

    expect(() =>
      validateRuntimeFunctionTraceAssets({
        plan,
        generateTeamTracedFiles: withoutActiveAsset,
        pokemonListTracedFiles: plan.pokemonList,
        generateTeamUncompressedBytes: 1,
        generateTeamSnapshotUncompressedBytes: 1,
      }),
    ).toThrow(/missing.*runtime-snapshot\.json/i);

    expect(() =>
      validateRuntimeFunctionTraceAssets({
        plan,
        generateTeamTracedFiles: [
          ...plan.generateTeam,
          'data/simulations/cp1500/all/inactive_0-0.csv',
        ],
        pokemonListTracedFiles: plan.pokemonList,
        generateTeamUncompressedBytes: 1,
        generateTeamSnapshotUncompressedBytes: 1,
      }),
    ).toThrow(/unauthorized.*inactive_0-0\.csv/i);
  });

  it('rejects unrelated pokemon-list data and oversized generate-team traces', () => {
    const plan = createRuntimeFunctionAssetPlan(getBattleFormats());

    expect(() =>
      validateRuntimeFunctionTraceAssets({
        plan,
        generateTeamTracedFiles: plan.generateTeam,
        pokemonListTracedFiles: [...plan.pokemonList, 'data/moves.json'],
        generateTeamUncompressedBytes: 1,
        generateTeamSnapshotUncompressedBytes: 1,
      }),
    ).toThrow(/pokemon-list.*unauthorized.*moves\.json/i);

    expect(() =>
      validateRuntimeFunctionTraceAssets({
        plan,
        generateTeamTracedFiles: plan.generateTeam,
        pokemonListTracedFiles: plan.pokemonList,
        generateTeamUncompressedBytes: GENERATE_TEAM_TRACE_MAX_BYTES + 1,
        generateTeamSnapshotUncompressedBytes: 1,
      }),
    ).toThrow(/104857601.*104857600/i);

    expect(() =>
      validateRuntimeFunctionTraceAssets({
        plan,
        generateTeamTracedFiles: plan.generateTeam,
        pokemonListTracedFiles: plan.pokemonList,
        generateTeamUncompressedBytes: 1,
        generateTeamSnapshotUncompressedBytes:
          RUNTIME_SIMULATION_SNAPSHOTS_MAX_BYTES + 1,
      }),
    ).toThrow(/52428801.*52428800/i);
  });

  it('covers checked-in runtime assets for every supported format', () => {
    const plan = loadRuntimeFunctionAssetPlan();
    const generateTeamAssets = new Set(plan.generateTeam);

    for (const asset of [...plan.generateTeam, ...plan.pokemonList]) {
      expect(existsSync(path.resolve(process.cwd(), asset)), asset).toBe(true);
    }

    for (const format of getBattleFormats()) {
      expect(generateTeamAssets).toContain(
        `data/simulations/cp${format.cp}/${format.cup}/runtime-snapshot.json`,
      );
      for (const category of [
        'overall',
        'leads',
        'switches',
        'closers',
        'chargers',
        'attackers',
        'consistency',
      ]) {
        expect(generateTeamAssets).toContain(
          `data/rankings/cp${format.cp}/${format.cup}/${category}_rankings.csv`,
        );
      }
    }

    expect(plan.generateTeam.filter((asset) => asset.endsWith('.csv'))).toEqual(
      plan.generateTeam.filter((asset) => asset.includes('/rankings/')),
    );
    expect(
      plan.generateTeam.some((asset) =>
        asset.endsWith('moveset-variants.json'),
      ),
    ).toBe(false);
  });
});
