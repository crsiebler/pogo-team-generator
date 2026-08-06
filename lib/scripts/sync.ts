/**
 * PvPoke Data Sync
 *
 * Syncs competitive data from a local PvPoke source into project outputs.
 *
 * Usage: npm run sync [--resume|--project-simulations]
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
import {
  formatSimulationProjection,
  projectSimulationVariants,
} from '@/lib/sync/simulationProjection';

const resume = process.argv.includes('--resume');
const projectSimulations = process.argv.includes('--project-simulations');

async function main(): Promise<void> {
  try {
    if (projectSimulations) {
      if (resume) {
        throw new Error(
          '--project-simulations is read-only and cannot be combined with --resume',
        );
      }
      const projection = await projectSimulationVariants();
      process.stdout.write(formatSimulationProjection(projection));
      return;
    }

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
