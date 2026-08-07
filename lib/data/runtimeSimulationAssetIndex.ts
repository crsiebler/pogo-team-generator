import path from 'path';
import { getBattleFormats } from './battleFormats';
import { getMovesetVariantManifestPath } from './movesetVariantManifest';

/** Current repository-owned runtime simulation asset index schema version. */
export const RUNTIME_SIMULATION_ASSET_INDEX_SCHEMA_VERSION = 1 as const;

/** Fixed repository-relative target for the generated runtime asset index. */
export const RUNTIME_SIMULATION_ASSET_INDEX_PATH =
  'data/simulations/runtime-asset-index.json';

/** Versioned allowlist of simulation assets authorized for runtime tracing. */
export interface RuntimeSimulationAssetIndex {
  readonly schemaVersion: typeof RUNTIME_SIMULATION_ASSET_INDEX_SCHEMA_VERSION;
  readonly assets: readonly string[];
}

/** Typed failure raised for malformed runtime simulation asset index data. */
export class RuntimeSimulationAssetIndexValidationError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'RuntimeSimulationAssetIndexValidationError';
  }
}

const catalogDirectories = new Set(
  getBattleFormats().map((format) =>
    path.posix.dirname(getMovesetVariantManifestPath(format)),
  ),
);
const canonicalAssetFilenamePattern =
  /^(?:moveset-variants\.json|[a-z0-9]+(?:_[a-z0-9]+)*(?:(?:--[a-z0-9]+(?:_[a-z0-9]+)*){3})?_(?:0-0|1-1|2-2)\.csv)$/;

function fail(pathValue: string, message: string): never {
  throw new RuntimeSimulationAssetIndexValidationError(pathValue, message);
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readAsset(value: unknown, index: number): string {
  const assetPath = `runtimeSimulationAssetIndex.assets[${index}]`;
  if (typeof value !== 'string' || !value) {
    fail(assetPath, 'must be a non-empty string');
  }
  if (
    value.includes('\\') ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    !catalogDirectories.has(path.posix.dirname(value)) ||
    !canonicalAssetFilenamePattern.test(path.posix.basename(value))
  ) {
    fail(
      assetPath,
      'must be canonical and confined to a catalog-derived simulation format directory',
    );
  }
  return value;
}

/** Parse and validate an unknown runtime simulation asset index value. */
export function parseRuntimeSimulationAssetIndex(
  value: unknown,
): RuntimeSimulationAssetIndex {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('runtimeSimulationAssetIndex', 'must be an object');
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== RUNTIME_SIMULATION_ASSET_INDEX_SCHEMA_VERSION) {
    fail(
      'runtimeSimulationAssetIndex.schemaVersion',
      `must be ${RUNTIME_SIMULATION_ASSET_INDEX_SCHEMA_VERSION}`,
    );
  }
  if (!Array.isArray(record.assets)) {
    fail('runtimeSimulationAssetIndex.assets', 'must be an array');
  }
  const assets = record.assets.map(readAsset);
  const uniqueAssets = new Set<string>();
  for (const asset of assets) {
    if (uniqueAssets.has(asset)) {
      fail('runtimeSimulationAssetIndex.assets', `duplicate asset ${asset}`);
    }
    uniqueAssets.add(asset);
  }
  return {
    schemaVersion: RUNTIME_SIMULATION_ASSET_INDEX_SCHEMA_VERSION,
    assets,
  };
}

/** Parse and validate serialized runtime simulation asset index JSON. */
export function parseRuntimeSimulationAssetIndexJson(
  json: string,
): RuntimeSimulationAssetIndex {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch (error) {
    throw new RuntimeSimulationAssetIndexValidationError(
      'runtimeSimulationAssetIndex',
      `must be valid JSON: ${error instanceof Error ? error.message : 'unknown parse error'}`,
    );
  }
  return parseRuntimeSimulationAssetIndex(value);
}

/** Validate and deterministically serialize a runtime simulation asset index. */
export function serializeRuntimeSimulationAssetIndex(
  index: RuntimeSimulationAssetIndex,
): string {
  const parsed = parseRuntimeSimulationAssetIndex(index);
  return `${JSON.stringify(
    { ...parsed, assets: [...parsed.assets].sort(compareAscii) },
    null,
    2,
  )}\n`;
}
