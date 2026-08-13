import { runSync } from '@/lib/sync';
import {
  formatSimulationProjection,
  projectSimulationVariants,
  type SimulationProjection,
  type SimulationProjectionOptions,
} from '@/lib/sync/simulationProjection';
import type { SyncRunOptions } from '@/lib/sync/types';

const SUPPORTED_SYNC_OPTIONS = [
  '--resume',
  '--moveset-variants',
  '--project-simulations',
] as const;

/** Parsed non-interactive sync command options. */
export interface SyncCommandOptions {
  readonly resume: boolean;
  readonly includeMovesetVariants: boolean;
  readonly projectSimulations: boolean;
}

/** Injectable sync command boundaries for focused CLI tests. */
export interface SyncCommandDependencies {
  readonly runSync: (options: SyncRunOptions) => Promise<void>;
  readonly projectSimulations: (
    options: SimulationProjectionOptions,
  ) => Promise<SimulationProjection>;
  readonly writeOutput: (output: string) => void;
  readonly log: (message: string) => void;
}

const defaultDependencies: SyncCommandDependencies = {
  runSync,
  projectSimulations: projectSimulationVariants,
  writeOutput: (output: string) => process.stdout.write(output),
  log: console.log,
};

/** Parse supported sync flags and reject unknown arguments. */
export function parseSyncArguments(
  args: readonly string[],
): SyncCommandOptions {
  for (const argument of args) {
    if (!(SUPPORTED_SYNC_OPTIONS as readonly string[]).includes(argument)) {
      throw new Error(
        `Unknown sync option '${argument}'. Supported options: ${SUPPORTED_SYNC_OPTIONS.join(', ')}`,
      );
    }
  }

  const options: SyncCommandOptions = {
    resume: args.includes('--resume'),
    includeMovesetVariants: args.includes('--moveset-variants'),
    projectSimulations: args.includes('--project-simulations'),
  };
  if (options.projectSimulations && options.resume) {
    throw new Error(
      '--project-simulations is read-only and cannot be combined with --resume',
    );
  }

  return options;
}

/** Execute one parsed sync or read-only projection command. */
export async function runSyncCommand(
  args: readonly string[],
  dependencies: Partial<SyncCommandDependencies> = {},
): Promise<void> {
  const resolvedDependencies = { ...defaultDependencies, ...dependencies };
  const options = parseSyncArguments(args);

  if (options.projectSimulations) {
    const projection = await resolvedDependencies.projectSimulations({
      includeMovesetVariants: options.includeMovesetVariants,
    });
    resolvedDependencies.writeOutput(formatSimulationProjection(projection));
    return;
  }

  resolvedDependencies.log('Starting PvPoke data sync...');
  if (options.resume) {
    resolvedDependencies.log(
      'Resume mode enabled: keeping existing simulation CSV files',
    );
  }
  if (options.includeMovesetVariants) {
    resolvedDependencies.log('Moveset variant simulation enabled');
  }
  await resolvedDependencies.runSync({
    resume: options.resume,
    includeMovesetVariants: options.includeMovesetVariants,
  });
  resolvedDependencies.log('Sync completed successfully.');
}
