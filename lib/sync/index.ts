import * as fs from 'fs';
import { createHash } from 'node:crypto';
import * as path from 'path';
import { syncConfig } from './config';
import { fetchPokemonData, fetchMovesData } from './gamemaster';
import {
  prepareMovesetVariantManifests,
  publishSimulationGeneration,
} from './movesetVariantManifest';
import { scrapeRankings, type RankingSyncResult } from './rankings';
import { prepareRuntimeSimulationAssetIndex } from './runtimeSimulationAssetIndex';
import {
  createRuntimeSimulationSnapshotOpponentResolver,
  prepareRuntimeSimulationSnapshots,
  readRuntimeSimulationSnapshotSource,
} from './runtimeSimulationSnapshots';
import { deleteStaleVariantSimulationFiles } from './simulationCleanup';
import {
  generateSimulations,
  selectSimulationCandidateSets,
  type SimulationSyncResult,
} from './simulations';
import { resolvePvpokeSourcePath, validatePhase1SourceFiles } from './source';
import { type PokemonData, SyncRunOptions } from './types';
import { logError } from './utils';
import {
  crossValidateRankingsVsPokemon,
  logValidationErrors,
} from './validation';
import {
  type BattleFormatId,
  getBattleFormats,
} from '@/lib/data/battleFormats';
import { createMoveAvailabilityResolver } from '@/lib/data/moveAvailability';

/** Inputs for the validation, simulation, and manifest publication phases. */
export interface CompleteSimulationManifestSyncInput {
  readonly options: SyncRunOptions;
  readonly sourcePath: string;
  readonly rankingSyncResult: Pick<
    RankingSyncResult,
    | 'rankings'
    | 'candidateSets'
    | 'simulationSpeciesIdsByFormatId'
    | 'formatsWithChangedOverallRankings'
  >;
  readonly pokemonData: PokemonData[];
  readonly pokemonSource: string | Uint8Array;
  readonly movesSource: string | Uint8Array;
}

interface CompleteSimulationManifestSyncDependencies {
  readonly crossValidate: typeof crossValidateRankingsVsPokemon;
  readonly generate: typeof generateSimulations;
  readonly prepare: typeof prepareMovesetVariantManifests;
  readonly prepareRuntimeSnapshots: typeof prepareRuntimeSimulationSnapshots;
  readonly prepareRuntimeAssetIndex: typeof prepareRuntimeSimulationAssetIndex;
  readonly publish: typeof publishSimulationGeneration;
  readonly cleanup: typeof deleteStaleVariantSimulationFiles;
  readonly log: (message: string) => void;
}

const defaultCompleteSimulationManifestSyncDependencies: CompleteSimulationManifestSyncDependencies =
  {
    crossValidate: crossValidateRankingsVsPokemon,
    generate: generateSimulations,
    prepare: prepareMovesetVariantManifests,
    prepareRuntimeSnapshots: prepareRuntimeSimulationSnapshots,
    prepareRuntimeAssetIndex: prepareRuntimeSimulationAssetIndex,
    publish: publishSimulationGeneration,
    cleanup: deleteStaleVariantSimulationFiles,
    log: console.log,
  };

/**
 * Validate synchronized inputs, complete every simulation, then publish CSVs,
 * manifests, compact snapshots, and the runtime asset index as one recoverable
 * authority switch.
 */
export async function completeSimulationManifestSync(
  input: CompleteSimulationManifestSyncInput,
  dependencies: Partial<CompleteSimulationManifestSyncDependencies> = {},
): Promise<SimulationSyncResult> {
  const resolvedDependencies = {
    ...defaultCompleteSimulationManifestSyncDependencies,
    ...dependencies,
  };
  const crossValidation = resolvedDependencies.crossValidate(
    input.rankingSyncResult.rankings,
    input.pokemonData,
  );
  logValidationErrors(
    'Cross-validation (Rankings vs Pokemon)',
    crossValidation.errors,
  );
  if (!crossValidation.valid) {
    throw new Error(
      `Cross-validation failed: ${crossValidation.errors.join(', ')}`,
    );
  }

  const includeMovesetVariants = input.options.includeMovesetVariants ?? false;
  const candidateSets = selectSimulationCandidateSets(
    input.rankingSyncResult.candidateSets,
    includeMovesetVariants,
    input.rankingSyncResult.simulationSpeciesIdsByFormatId,
  );
  const candidateSetKeys = new Set(
    candidateSets.map(({ formatId, speciesId }) => `${formatId}|${speciesId}`),
  );
  for (const [formatId, speciesIds] of input.rankingSyncResult
    .simulationSpeciesIdsByFormatId) {
    for (const speciesId of speciesIds) {
      if (!candidateSetKeys.has(`${formatId}|${speciesId}`)) {
        throw new Error(
          `[sync] Missing simulation candidate set for ${formatId}/${speciesId}`,
        );
      }
    }
  }
  const simulationResult = await resolvedDependencies.generate({
    ...input.options,
    includeMovesetVariants,
    sourcePath: input.sourcePath,
    forceRegenerateFormatIds: new Set(
      input.rankingSyncResult.formatsWithChangedOverallRankings,
    ),
    candidateSets,
    simulationSpeciesIdsByFormatId:
      input.rankingSyncResult.simulationSpeciesIdsByFormatId,
    deferPublication: true,
  });
  const preparedManifests = resolvedDependencies.prepare({
    pokemonSource: input.pokemonSource,
    movesSource: input.movesSource,
    candidateSets,
    variantSelections: simulationResult.variantSelections,
    getMoveAvailability: createMoveAvailabilityResolver(input.pokemonData),
  });
  const preparedRuntimeSnapshots = resolvedDependencies.prepareRuntimeSnapshots(
    preparedManifests,
    simulationResult.preparedCsvFiles,
    {
      readText: readRuntimeSimulationSnapshotSource,
      resolveOpponentSpeciesId: createRuntimeSimulationSnapshotOpponentResolver(
        input.pokemonData,
      ),
    },
  );
  const preparedRuntimeAssetIndex =
    resolvedDependencies.prepareRuntimeAssetIndex(preparedManifests);
  await resolvedDependencies.publish(
    simulationResult.preparedCsvFiles,
    preparedManifests,
    preparedRuntimeSnapshots,
    preparedRuntimeAssetIndex,
  );
  await resolvedDependencies.cleanup(preparedManifests, {
    reportDeleted: (filePath) =>
      resolvedDependencies.log(
        `[sync] Deleted stale moveset variant ${filePath}`,
      ),
  });
  return simulationResult;
}

const SYNC_OUTPUT_ROOTS = [
  'moves.json',
  'pokemon.json',
  'rankings',
  'simulations',
] as const;

/**
 * Return stable successful-sync metadata, preserving its timestamp when the
 * generated output fingerprint did not change.
 */
export function resolveSuccessfulSyncMetadata(
  previousMetadata: string | null,
  previousOutputFingerprint: string,
  currentOutputFingerprint: string,
  completedAt: Date,
): string {
  if (
    previousMetadata !== null &&
    previousOutputFingerprint === currentOutputFingerprint
  ) {
    try {
      const parsed = JSON.parse(previousMetadata) as {
        readonly lastSuccessfulSyncAt?: unknown;
      };
      if (
        typeof parsed.lastSuccessfulSyncAt === 'string' &&
        !Number.isNaN(new Date(parsed.lastSuccessfulSyncAt).getTime())
      ) {
        return previousMetadata;
      }
    } catch {
      // Replace malformed metadata after an otherwise successful sync.
    }
  }

  return JSON.stringify(
    { lastSuccessfulSyncAt: completedAt.toISOString() },
    null,
    2,
  );
}

/** Create a deterministic fingerprint of every generated sync output. */
export function createSyncOutputFingerprint(
  outputDirectory: string = syncConfig.outputDir,
): string {
  const outputPaths = SYNC_OUTPUT_ROOTS.flatMap((resourcePath) =>
    collectSyncOutputFiles(path.join(outputDirectory, resourcePath)),
  ).sort((left, right) => left.localeCompare(right));
  const hash = createHash('sha256');

  for (const outputPath of outputPaths) {
    hash.update(path.relative(outputDirectory, outputPath));
    hash.update('\0');
    hash.update(fs.readFileSync(outputPath));
    hash.update('\0');
  }

  return hash.digest('hex');
}

/** Resolve metadata after hashing the completed generated output. */
export function resolveCompletedSyncMetadata(
  previousMetadata: string | null,
  previousOutputFingerprint: string,
  outputDirectory: string = syncConfig.outputDir,
  completedAt: Date = new Date(),
): string {
  return resolveSuccessfulSyncMetadata(
    previousMetadata,
    previousOutputFingerprint,
    createSyncOutputFingerprint(outputDirectory),
    completedAt,
  );
}

function collectSyncOutputFiles(outputPath: string): string[] {
  if (!fs.existsSync(outputPath)) {
    return [];
  }
  const stats = fs.lstatSync(outputPath);
  if (stats.isFile()) {
    return [outputPath];
  }
  if (!stats.isDirectory()) {
    return [];
  }

  return fs
    .readdirSync(outputPath, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isSymbolicLink()
        ? []
        : collectSyncOutputFiles(path.join(outputPath, entry.name)),
    );
}

/** Persist successful sync metadata for UI freshness indicators. */
function writeSyncMetadata(contents: string): void {
  const syncMetadataPath = path.join(
    syncConfig.outputDir,
    'sync-metadata.json',
  );
  fs.writeFileSync(syncMetadataPath, contents);
}

/**
 * Run the complete data sync pipeline
 */
export async function runSync(options: SyncRunOptions = {}): Promise<void> {
  try {
    console.log('[sync] Starting data sync pipeline');

    const syncMetadataPath = path.join(
      syncConfig.outputDir,
      'sync-metadata.json',
    );
    const previousSyncMetadata = fs.existsSync(syncMetadataPath)
      ? fs.readFileSync(syncMetadataPath, 'utf8')
      : null;
    const previousOutputFingerprint = createSyncOutputFingerprint();

    const sourceResolution = resolvePvpokeSourcePath();
    console.log(
      `[sync] Resolved PvPoke source path (${sourceResolution.sourceType}): ${sourceResolution.sourcePath}`,
    );
    validatePhase1SourceFiles(sourceResolution.sourcePath);

    // Wipe existing data files
    const filesToDelete = ['pokemon.json', 'moves.json'];
    filesToDelete.forEach((file) => {
      const filePath = path.join(syncConfig.outputDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[sync] Deleted existing ${file}`);
      }
    });

    const legacyRankingFiles = fs
      .readdirSync(syncConfig.outputDir)
      .filter((file) => /^cp\d+_(all|kanto)_.+_rankings\.csv$/.test(file));
    legacyRankingFiles.forEach((file) => {
      const filePath = path.join(syncConfig.outputDir, file);
      fs.unlinkSync(filePath);
      console.log(`[sync] Deleted legacy ranking file ${file}`);
    });

    const rankingsDir = path.join(syncConfig.outputDir, 'rankings');
    const previousOverallRankingsByFormatId = new Map<BattleFormatId, string>();
    if (options.resume) {
      for (const format of getBattleFormats()) {
        const overallRankingsPath = path.join(
          rankingsDir,
          `cp${format.cp}`,
          format.cup,
          'overall_rankings.csv',
        );
        if (fs.existsSync(overallRankingsPath)) {
          previousOverallRankingsByFormatId.set(
            format.id,
            fs.readFileSync(overallRankingsPath, 'utf8'),
          );
        }
      }
    }
    if (fs.existsSync(rankingsDir)) {
      fs.rmSync(rankingsDir, { recursive: true, force: true });
      console.log('[sync] Deleted existing rankings directory');
    }

    if (options.resume) {
      console.log('[sync] Resume mode: keeping existing simulation CSV files');
    } else {
      console.log(
        '[sync] Keeping existing simulation files until replacement data validates',
      );
    }

    // Sync gamemaster JSON data
    console.log('[sync] Phase 1: Syncing gamemaster JSON from local source');
    const pokemonData = await fetchPokemonData(sourceResolution.sourcePath);
    const movesData = await fetchMovesData(sourceResolution.sourcePath);

    // Scrape rankings
    console.log('[sync] Phase 2: Syncing rankings data');
    const rankingSyncResult = await scrapeRankings({
      ...options,
      sourcePath: sourceResolution.sourcePath,
      ...(options.resume ? { previousOverallRankingsByFormatId } : {}),
    });

    console.log(
      '[sync] Phase 3: Cross-validating and generating simulation data',
    );
    const simulationResult = await completeSimulationManifestSync({
      options,
      sourcePath: sourceResolution.sourcePath,
      rankingSyncResult,
      pokemonData,
      pokemonSource: fs.readFileSync(
        path.join(syncConfig.outputDir, 'pokemon.json'),
      ),
      movesSource: fs.readFileSync(
        path.join(syncConfig.outputDir, 'moves.json'),
      ),
    });
    console.log(
      `[sync] Atomically published ${getBattleFormats().length} moveset variant manifests`,
    );

    writeSyncMetadata(
      resolveCompletedSyncMetadata(
        previousSyncMetadata,
        previousOutputFingerprint,
      ),
    );
    console.log('[sync] Wrote sync-metadata.json');

    console.log('[sync] Pipeline completed successfully');
    const simMessage = `Simulations: ${simulationResult.simulations.length}`;
    console.log(
      `[sync] Results: Pokemon: ${pokemonData.length}, Moves: ${movesData.length}, Rankings: ${rankingSyncResult.rankings.length}, ${simMessage}`,
    );
  } catch (error) {
    logError(error as Error, 'sync-pipeline');
    throw error;
  }
}
