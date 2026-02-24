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
    const filesToDelete = [
      'pokemon.json',
      'moves.json',
      'cp1500_all_overall_rankings.csv',
      'cp1500_all_leads_rankings.csv',
      'cp1500_all_switches_rankings.csv',
      'cp1500_all_closers_rankings.csv',
    ];
    filesToDelete.forEach((file) => {
      const filePath = path.join(syncConfig.outputDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[sync] Deleted existing ${file}`);
      }
    });

    // Wipe existing simulations CSV files unless running in resume mode
    const simDir = path.join(syncConfig.outputDir, 'simulations');
    if (options.resume) {
      console.log('[sync] Resume mode: keeping existing simulation CSV files');
    } else if (fs.existsSync(simDir)) {
      const csvFiles = fs
        .readdirSync(simDir)
        .filter((file) => file.endsWith('.csv'));
      csvFiles.forEach((file) => {
        fs.unlinkSync(path.join(simDir, file));
        console.log(`[sync] Deleted existing simulation ${file}`);
      });
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
