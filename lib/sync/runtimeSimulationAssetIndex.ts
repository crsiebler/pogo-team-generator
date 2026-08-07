import path from 'path';
import type { PreparedMovesetVariantManifest } from './movesetVariantManifest';
import { getBattleFormats } from '@/lib/data/battleFormats';
import {
  getMovesetVariantManifestPath,
  MOVESET_VARIANT_SCENARIOS,
  parseMovesetVariantManifestJson,
} from '@/lib/data/movesetVariantManifest';
import {
  RUNTIME_SIMULATION_ASSET_INDEX_PATH,
  RUNTIME_SIMULATION_ASSET_INDEX_SCHEMA_VERSION,
  serializeRuntimeSimulationAssetIndex,
} from '@/lib/data/runtimeSimulationAssetIndex';

/** Canonical bytes and fixed target for one prepared runtime asset index. */
export interface PreparedRuntimeSimulationAssetIndex {
  readonly targetPath: typeof RUNTIME_SIMULATION_ASSET_INDEX_PATH;
  readonly contents: string;
}

function addUniqueAsset(assets: Set<string>, asset: string): void {
  if (assets.has(asset)) {
    throw new Error(`[sync-runtime-assets] Duplicate asset: ${asset}`);
  }
  assets.add(asset);
}

/**
 * Derive the runtime asset allowlist from every validated prepared manifest.
 * Inactive candidate evidence remains outside the runtime index.
 */
export function prepareRuntimeSimulationAssetIndex(
  manifests: readonly PreparedMovesetVariantManifest[],
): PreparedRuntimeSimulationAssetIndex {
  const manifestsByFormatId = new Map<
    PreparedMovesetVariantManifest['formatId'],
    PreparedMovesetVariantManifest
  >();
  for (const manifest of manifests) {
    if (manifestsByFormatId.has(manifest.formatId)) {
      throw new Error(
        `[sync-runtime-assets] Duplicate manifest for ${manifest.formatId}`,
      );
    }
    manifestsByFormatId.set(manifest.formatId, manifest);
  }
  const supportedFormatIds = new Set(
    getBattleFormats().map((format) => format.id),
  );
  for (const manifest of manifests) {
    if (!supportedFormatIds.has(manifest.formatId)) {
      throw new Error(
        `[sync-runtime-assets] Unsupported manifest format ${manifest.formatId}`,
      );
    }
  }

  const assets = new Set<string>();
  for (const format of getBattleFormats()) {
    const preparedManifest = manifestsByFormatId.get(format.id);
    if (!preparedManifest) {
      throw new Error(
        `[sync-runtime-assets] Missing manifest for ${format.id}`,
      );
    }
    const expectedManifestPath = getMovesetVariantManifestPath(format);
    if (preparedManifest.targetPath !== expectedManifestPath) {
      throw new Error(
        `[sync-runtime-assets] Manifest target must match ${format.id}: ${expectedManifestPath}`,
      );
    }
    const manifest = parseMovesetVariantManifestJson(preparedManifest.contents);
    if (manifest.metadata.formatId !== format.id) {
      throw new Error(
        `[sync-runtime-assets] Manifest contents must match ${format.id}`,
      );
    }
    addUniqueAsset(assets, expectedManifestPath);
    const formatDirectory = path.posix.dirname(expectedManifestPath);
    for (const species of manifest.species) {
      for (const candidate of species.candidates) {
        if (!candidate.active) {
          continue;
        }
        for (const scenario of MOVESET_VARIANT_SCENARIOS) {
          const asset = path.posix.join(
            formatDirectory,
            candidate.storageKeys[scenario],
          );
          if (path.posix.dirname(asset) !== formatDirectory) {
            throw new Error(
              `[sync-runtime-assets] Asset must stay within ${formatDirectory}: ${asset}`,
            );
          }
          addUniqueAsset(assets, asset);
        }
      }
    }
  }

  return {
    targetPath: RUNTIME_SIMULATION_ASSET_INDEX_PATH,
    contents: serializeRuntimeSimulationAssetIndex({
      schemaVersion: RUNTIME_SIMULATION_ASSET_INDEX_SCHEMA_VERSION,
      assets: [...assets],
    }),
  };
}
