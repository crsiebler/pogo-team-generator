/**
 * PvPoke Data Sync
 *
 * Syncs competitive data from a local PvPoke source into project outputs.
 *
 * Usage: npm run sync -- [--resume] [--moveset-variants]
 *        npm run sync -- --project-simulations [--moveset-variants]
 *
 * This script runs the complete sync pipeline:
 * 1. Read Pokemon and Moves JSON from local PvPoke source
 * 2. Convert rankings JSON data (overall, leads, switches, closers)
 * 3. Generate simulation data for top 150 Pokemon
 * 4. Cross-validate data consistency
 *
 * Output: Updated data files in data/ directory
 */
import { runSyncCommand } from '@/lib/scripts/syncCommand';

async function main(): Promise<void> {
  try {
    await runSyncCommand(process.argv.slice(2));
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

main();
