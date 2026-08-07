import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GENERATE_TEAM_TRACE_MAX_BYTES,
  createRuntimeFunctionAssetPlan,
  loadRuntimeFunctionAssetPlan,
  validateRuntimeFunctionTraceAssets,
} from '@/lib/build/runtimeFunctionAssets';
import { getBattleFormats } from '@/lib/data/battleFormats';
import {
  RUNTIME_SIMULATION_ASSET_INDEX_SCHEMA_VERSION,
  type RuntimeSimulationAssetIndex,
} from '@/lib/data/runtimeSimulationAssetIndex';

const runtimeIndex: RuntimeSimulationAssetIndex = {
  schemaVersion: RUNTIME_SIMULATION_ASSET_INDEX_SCHEMA_VERSION,
  assets: [
    'data/simulations/cp1500/all/azumarill_0-0.csv',
    'data/simulations/cp1500/all/moveset-variants.json',
  ],
};

describe('runtime function assets', () => {
  it('derives exact route assets from the runtime index and format catalog', () => {
    const plan = createRuntimeFunctionAssetPlan(
      runtimeIndex,
      getBattleFormats(),
    );

    expect(plan.generateTeam).toContain(
      'data/simulations/cp1500/all/azumarill_0-0.csv',
    );
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
    expect(
      plan.pokemonListExcludes.every((asset) => !asset.includes('*')),
    ).toBe(true);
  });

  it('accepts traces containing exactly the planned data assets', () => {
    const plan = createRuntimeFunctionAssetPlan(
      runtimeIndex,
      getBattleFormats(),
    );

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
      }),
    ).not.toThrow();
  });

  it('rejects missing active assets and inactive simulation files', () => {
    const plan = createRuntimeFunctionAssetPlan(
      runtimeIndex,
      getBattleFormats(),
    );
    const withoutActiveAsset = plan.generateTeam.filter(
      (asset) => asset !== runtimeIndex.assets[0],
    );

    expect(() =>
      validateRuntimeFunctionTraceAssets({
        plan,
        generateTeamTracedFiles: withoutActiveAsset,
        pokemonListTracedFiles: plan.pokemonList,
        generateTeamUncompressedBytes: 1,
      }),
    ).toThrow(/missing.*azumarill_0-0\.csv/i);

    expect(() =>
      validateRuntimeFunctionTraceAssets({
        plan,
        generateTeamTracedFiles: [
          ...plan.generateTeam,
          'data/simulations/cp1500/all/inactive_0-0.csv',
        ],
        pokemonListTracedFiles: plan.pokemonList,
        generateTeamUncompressedBytes: 1,
      }),
    ).toThrow(/unauthorized.*inactive_0-0\.csv/i);
  });

  it('rejects unrelated pokemon-list data and oversized generate-team traces', () => {
    const plan = createRuntimeFunctionAssetPlan(
      runtimeIndex,
      getBattleFormats(),
    );

    expect(() =>
      validateRuntimeFunctionTraceAssets({
        plan,
        generateTeamTracedFiles: plan.generateTeam,
        pokemonListTracedFiles: [...plan.pokemonList, 'data/moves.json'],
        generateTeamUncompressedBytes: 1,
      }),
    ).toThrow(/pokemon-list.*unauthorized.*moves\.json/i);

    expect(() =>
      validateRuntimeFunctionTraceAssets({
        plan,
        generateTeamTracedFiles: plan.generateTeam,
        pokemonListTracedFiles: plan.pokemonList,
        generateTeamUncompressedBytes: GENERATE_TEAM_TRACE_MAX_BYTES + 1,
      }),
    ).toThrow(/209715201.*209715200/i);
  });

  it('covers checked-in runtime assets for every supported format', () => {
    const plan = loadRuntimeFunctionAssetPlan();
    const generateTeamAssets = new Set(plan.generateTeam);

    for (const asset of [...plan.generateTeam, ...plan.pokemonList]) {
      expect(existsSync(path.resolve(process.cwd(), asset)), asset).toBe(true);
    }

    for (const format of getBattleFormats()) {
      expect(generateTeamAssets).toContain(
        `data/simulations/cp${format.cp}/${format.cup}/moveset-variants.json`,
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
  });
});
