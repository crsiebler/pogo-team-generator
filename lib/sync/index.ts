import * as fs from 'fs';
import * as path from 'path';
import { syncConfig } from './config';
import { fetchPokemonData, fetchMovesData } from './gamemaster';
import { scrapeRankings } from './rankings';
import { generateSimulations } from './simulations';
import { resolvePvpokeSourcePath, validatePhase1SourceFiles } from './source';
import { SyncRunOptions } from './types';
import { logError } from './utils';
import {
  crossValidateRankingsVsPokemon,
  logValidationErrors,
} from './validation';

/**
 * Persist successful sync metadata for UI freshness indicators.
 */
function writeSyncMetadata(): void {
  const syncMetadataPath = path.join(
    syncConfig.outputDir,
    'sync-metadata.json',
  );
  const syncMetadata = {
    lastSuccessfulSyncAt: new Date().toISOString(),
  };

  fs.writeFileSync(syncMetadataPath, JSON.stringify(syncMetadata, null, 2));
}

/**
 * Run the complete data sync pipeline
 */
export async function runSync(options: SyncRunOptions = {}): Promise<void> {
  try {
    console.log('[sync] Starting data sync pipeline');

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
    if (fs.existsSync(rankingsDir)) {
      fs.rmSync(rankingsDir, { recursive: true, force: true });
      console.log('[sync] Deleted existing rankings directory');
    }

    // Wipe existing simulations CSV files unless running in resume mode
    const simDir = path.join(syncConfig.outputDir, 'simulations');
    if (options.resume) {
      console.log('[sync] Resume mode: keeping existing simulation CSV files');
    } else if (fs.existsSync(simDir)) {
      fs.rmSync(simDir, { recursive: true, force: true });
      console.log('[sync] Deleted existing simulations directory');
    }

    // Sync gamemaster JSON data
    console.log('[sync] Phase 1: Syncing gamemaster JSON from local source');
    const pokemonData = await fetchPokemonData(sourceResolution.sourcePath);
    const movesData = await fetchMovesData(sourceResolution.sourcePath);

    // Scrape rankings
    console.log('[sync] Phase 2: Syncing rankings data');
    const rankings = await scrapeRankings({
      ...options,
      sourcePath: sourceResolution.sourcePath,
    });

    // Generate simulations
    let simulations: {
      Pokemon: string;
      Opponent: string;
      'Battle Rating': number;
      'Shield Scenario': string;
    }[] = [];
    console.log('[sync] Phase 3: Generating simulation data');
    simulations = await generateSimulations({
      ...options,
      sourcePath: sourceResolution.sourcePath,
    });

    // Cross-validate data consistency
    console.log('[sync] Phase 4: Cross-validating data consistency');
    const crossValidation = crossValidateRankingsVsPokemon(
      rankings,
      pokemonData,
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

    writeSyncMetadata();
    console.log('[sync] Wrote sync-metadata.json');

    console.log('[sync] Pipeline completed successfully');
    const simMessage = `Simulations: ${simulations.length}`;
    console.log(
      `[sync] Results: Pokemon: ${pokemonData.length}, Moves: ${movesData.length}, Rankings: ${rankings.length}, ${simMessage}`,
    );
  } catch (error) {
    logError(error as Error, 'sync-pipeline');
    throw error;
  }
}
