import { promises as fs } from 'fs';
import path from 'path';
import { createPvpokeAdapter } from './adapter';
import { syncConfig } from './config';
import { PokemonJson, MovesJson } from './types';
import { logError } from './utils';
import {
  validatePokemonJson,
  validateMovesJson,
  logValidationErrors,
} from './validation';

interface GamemasterSyncDependencies {
  createAdapter: (sourcePath: string) => {
    readPokemonJson<T>(): Promise<T>;
    readMovesJson<T>(): Promise<T>;
  };
  mkdir: (directoryPath: string) => Promise<void>;
  writeFile: (filePath: string, content: string) => Promise<void>;
}

interface SyncGamemasterJsonOptions {
  sourcePath: string;
  sourceDescription: string;
  readSourceJson: (adapter: {
    readPokemonJson<T>(): Promise<T>;
    readMovesJson<T>(): Promise<T>;
  }) => Promise<unknown>;
  outputFileName: string;
  validationContext: string;
  operationContext: string;
  validate: (data: unknown) => { valid: boolean; errors: string[] };
}

const defaultDependencies: GamemasterSyncDependencies = {
  createAdapter: (sourcePath: string) => createPvpokeAdapter({ sourcePath }),
  mkdir: async (directoryPath: string) => {
    await fs.mkdir(directoryPath, { recursive: true });
  },
  writeFile: async (filePath: string, content: string) => {
    await fs.writeFile(filePath, content, 'utf-8');
  },
};

async function syncGamemasterJson<T>(
  options: SyncGamemasterJsonOptions,
  dependencies: GamemasterSyncDependencies,
): Promise<T> {
  const {
    sourcePath,
    sourceDescription,
    readSourceJson,
    outputFileName,
    validationContext,
    operationContext,
    validate,
  } = options;

  try {
    const adapter = dependencies.createAdapter(sourcePath);
    const data = await readSourceJson(adapter);

    const validation = validate(data);
    logValidationErrors(validationContext, validation.errors);
    if (!validation.valid) {
      throw new Error(
        `${validationContext} validation failed: ${validation.errors.join(', ')}`,
      );
    }

    await dependencies.mkdir(syncConfig.outputDir);
    const outputFilePath = path.join(syncConfig.outputDir, outputFileName);
    await dependencies.writeFile(
      outputFilePath,
      `${JSON.stringify(data, null, 2)}\n`,
    );

    console.log(
      `[${operationContext}] Synced ${sourceDescription} to ${outputFilePath}`,
    );

    return data as T;
  } catch (error) {
    logError(error as Error, operationContext, {
      sourcePath,
      sourceDescription,
    });
    throw error;
  }
}

/**
 * Sync Pokemon data from local PvPoke source with validation and file saving.
 */
export async function fetchPokemonData(
  sourcePath: string,
  dependencies: Partial<GamemasterSyncDependencies> = {},
): Promise<PokemonJson> {
  return syncGamemasterJson<PokemonJson>(
    {
      sourcePath,
      sourceDescription: 'gamemaster pokemon JSON',
      readSourceJson: (adapter) => adapter.readPokemonJson(),
      outputFileName: 'pokemon.json',
      validationContext: 'Pokemon JSON',
      operationContext: 'sync-pokemon',
      validate: validatePokemonJson,
    },
    {
      ...defaultDependencies,
      ...dependencies,
    },
  );
}

/**
 * Sync Moves data from local PvPoke source with validation and file saving.
 */
export async function fetchMovesData(
  sourcePath: string,
  dependencies: Partial<GamemasterSyncDependencies> = {},
): Promise<MovesJson> {
  return syncGamemasterJson<MovesJson>(
    {
      sourcePath,
      sourceDescription: 'gamemaster moves JSON',
      readSourceJson: (adapter) => adapter.readMovesJson(),
      outputFileName: 'moves.json',
      validationContext: 'Moves JSON',
      operationContext: 'sync-moves',
      validate: validateMovesJson,
    },
    {
      ...defaultDependencies,
      ...dependencies,
    },
  );
}
