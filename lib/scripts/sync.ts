/**
 * PvPoke Data Sync
 *
 * Syncs competitive data from a local PvPoke source into project outputs.
 *
 * Usage: npm run sync
 *
 * This script runs the complete sync pipeline:
 * 1. Read Pokemon and Moves JSON from local PvPoke source
 * 2. Convert rankings JSON data (overall, leads, switches, closers)
 * 3. Generate simulation data for top 150 Pokemon
 * 4. Cross-validate data consistency
 *
 * Output: Updated data files in data/ directory
 */
import { runSync } from '@/lib/sync';

const resume = process.argv.includes('--resume');

async function main(): Promise<void> {
  try {
    console.log('Starting PvPoke data sync...');
    if (resume) {
      console.log('Resume mode enabled: keeping existing simulation CSV files');
    }
    await runSync({ resume });
    console.log('Sync completed successfully.');
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

main();
