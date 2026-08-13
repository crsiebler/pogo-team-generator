import { describe, expect, it } from 'vitest';
import {
  RUNTIME_SIMULATION_ASSET_INDEX_PATH,
  RUNTIME_SIMULATION_ASSET_INDEX_SCHEMA_VERSION,
  parseRuntimeSimulationAssetIndex,
  serializeRuntimeSimulationAssetIndex,
} from './runtimeSimulationAssetIndex';

describe('runtime simulation asset index validation', () => {
  const assets = [
    'data/simulations/cp1500/all/bulbasaur_0-0.csv',
    'data/simulations/cp1500/all/moveset-variants.json',
  ];

  it('defines and round trips a canonical versioned asset index', () => {
    expect(RUNTIME_SIMULATION_ASSET_INDEX_PATH).toBe(
      'data/simulations/runtime-asset-index.json',
    );

    const serialized = serializeRuntimeSimulationAssetIndex({
      schemaVersion: RUNTIME_SIMULATION_ASSET_INDEX_SCHEMA_VERSION,
      assets: [...assets].reverse(),
    });

    expect(serialized).toBe(
      `${JSON.stringify(
        {
          schemaVersion: RUNTIME_SIMULATION_ASSET_INDEX_SCHEMA_VERSION,
          assets,
        },
        null,
        2,
      )}\n`,
    );
    expect(parseRuntimeSimulationAssetIndex(JSON.parse(serialized))).toEqual({
      schemaVersion: RUNTIME_SIMULATION_ASSET_INDEX_SCHEMA_VERSION,
      assets,
    });
  });

  it.each([
    '/data/simulations/cp1500/all/bulbasaur_0-0.csv',
    'data/simulations/cp1500/all/../all/bulbasaur_0-0.csv',
    'data\\simulations\\cp1500\\all\\bulbasaur_0-0.csv',
    'data/simulations/cp1500/unknown/bulbasaur_0-0.csv',
    'data/simulations/cp1500/all/nested/bulbasaur_0-0.csv',
  ])('rejects noncanonical or unconfined asset path %s', (asset) => {
    expect(() =>
      parseRuntimeSimulationAssetIndex({
        schemaVersion: RUNTIME_SIMULATION_ASSET_INDEX_SCHEMA_VERSION,
        assets: [asset],
      }),
    ).toThrow(/catalog-derived simulation format directory/i);
  });

  it('rejects duplicate assets', () => {
    expect(() =>
      parseRuntimeSimulationAssetIndex({
        schemaVersion: RUNTIME_SIMULATION_ASSET_INDEX_SCHEMA_VERSION,
        assets: [assets[0], assets[0]],
      }),
    ).toThrow(/duplicate asset/i);
  });

  it('rejects unsupported schema versions and malformed asset filenames', () => {
    expect(() =>
      parseRuntimeSimulationAssetIndex({ schemaVersion: 2, assets }),
    ).toThrow(/schemaVersion: must be 1/i);
    expect(() =>
      parseRuntimeSimulationAssetIndex({
        schemaVersion: RUNTIME_SIMULATION_ASSET_INDEX_SCHEMA_VERSION,
        assets: ['data/simulations/cp1500/all/not-a-simulation.txt'],
      }),
    ).toThrow(/catalog-derived simulation format directory/i);
  });
});
