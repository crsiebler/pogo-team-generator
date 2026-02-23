import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';

type PathExists = (filePath: string) => boolean;
type ReadFile = (filePath: string) => Promise<string>;

const GAMEMASTER_RELATIVE_PATHS = {
  pokemon: 'src/data/gamemaster/pokemon.json',
  moves: 'src/data/gamemaster/moves.json',
} as const;

const RANKING_CATEGORIES = ['overall', 'leads', 'switches', 'closers'] as const;

export type RankingCategory = (typeof RANKING_CATEGORIES)[number];

export interface PvpokeAdapter {
  getRequiredGamemasterRelativePaths(): readonly string[];
  getGamemasterRelativePaths(): { pokemon: string; moves: string };
  getGamemasterFilePaths(): { pokemon: string; moves: string };
  readPokemonJson<T>(): Promise<T>;
  readMovesJson<T>(): Promise<T>;
  getRankingFilePath(category: RankingCategory, leagueCp: number): string;
  readRankingJson<T>(category: RankingCategory, leagueCp: number): Promise<T>;
  getSimulationAssetPath(relativePath: string): string;
  readJsonFile<T>(relativePath: string): Promise<T>;
}

interface PvpokeAdapterDependencies {
  sourcePath: string;
  pathExists: PathExists;
  readFile: ReadFile;
}

/**
 * Create a stable adapter around local PvPoke source layout.
 */
export function createPvpokeAdapter(
  dependencies: Pick<PvpokeAdapterDependencies, 'sourcePath'> &
    Partial<Omit<PvpokeAdapterDependencies, 'sourcePath'>>,
): PvpokeAdapter {
  const sourcePath = path.resolve(dependencies.sourcePath);
  const pathExists = dependencies.pathExists ?? fsPathExists;
  const readFile = dependencies.readFile ?? fsReadFileUtf8;

  const resolveUnderSource = (relativePath: string): string => {
    return path.join(sourcePath, relativePath);
  };

  const readJsonFile = async <T>(relativePath: string): Promise<T> => {
    const resolvedPath = resolveUnderSource(relativePath);
    if (!pathExists(resolvedPath)) {
      throw new Error(
        `[pvpoke-adapter] Missing source file: ${relativePath} (${resolvedPath})`,
      );
    }

    const content = await readFile(resolvedPath);
    try {
      return JSON.parse(content) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `[pvpoke-adapter] Invalid JSON in ${relativePath}: ${message}`,
      );
    }
  };

  return {
    getRequiredGamemasterRelativePaths(): readonly string[] {
      return [
        GAMEMASTER_RELATIVE_PATHS.pokemon,
        GAMEMASTER_RELATIVE_PATHS.moves,
      ];
    },
    getGamemasterFilePaths(): { pokemon: string; moves: string } {
      return {
        pokemon: resolveUnderSource(GAMEMASTER_RELATIVE_PATHS.pokemon),
        moves: resolveUnderSource(GAMEMASTER_RELATIVE_PATHS.moves),
      };
    },
    getGamemasterRelativePaths(): { pokemon: string; moves: string } {
      return {
        pokemon: GAMEMASTER_RELATIVE_PATHS.pokemon,
        moves: GAMEMASTER_RELATIVE_PATHS.moves,
      };
    },
    readPokemonJson<T>(): Promise<T> {
      return readJsonFile<T>(GAMEMASTER_RELATIVE_PATHS.pokemon);
    },
    readMovesJson<T>(): Promise<T> {
      return readJsonFile<T>(GAMEMASTER_RELATIVE_PATHS.moves);
    },
    getRankingFilePath(category: RankingCategory, leagueCp: number): string {
      if (!RANKING_CATEGORIES.includes(category)) {
        throw new Error(
          `[pvpoke-adapter] Unsupported ranking category: ${category}`,
        );
      }

      return resolveUnderSource(
        `src/data/rankings/all/${category}/rankings-${leagueCp}.json`,
      );
    },
    readRankingJson<T>(
      category: RankingCategory,
      leagueCp: number,
    ): Promise<T> {
      if (!RANKING_CATEGORIES.includes(category)) {
        throw new Error(
          `[pvpoke-adapter] Unsupported ranking category: ${category}`,
        );
      }

      return readJsonFile<T>(
        `src/data/rankings/all/${category}/rankings-${leagueCp}.json`,
      );
    },
    getSimulationAssetPath(relativePath: string): string {
      return resolveUnderSource(relativePath);
    },
    readJsonFile,
  };
}

async function fsReadFileUtf8(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8');
}

function fsPathExists(filePath: string): boolean {
  return fsSync.existsSync(filePath);
}
