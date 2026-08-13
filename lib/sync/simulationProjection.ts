import { promises as fs } from 'fs';
import path from 'path';
import { syncConfig } from './config';
import { fetchMovesData, fetchPokemonData } from './gamemaster';
import { scrapeRankings, type RankingSyncResult } from './rankings';
import { resolvePvpokeSourcePath, validatePhase1SourceFiles } from './source';
import type { MovesData, PokemonData } from './types';
import {
  getBattleFormats,
  type BattleFormat,
  type BattleFormatId,
} from '@/lib/data/battleFormats';
import { getMovesetVariantId } from '@/lib/data/movesetVariants';
import {
  MAX_MOVESET_CANDIDATES,
  type DerivedMovesetCandidateSet,
} from '@/lib/sync/movesetCandidates';
import type { MovesetVariantId } from '@/lib/types';

const SIMULATION_SCENARIOS = ['0-0', '1-1', '2-2'] as const;
type SimulationScenario = (typeof SIMULATION_SCENARIOS)[number];

/** Parsed metadata for a strictly recognized moveset-variant simulation file. */
export interface ParsedVariantSimulationFilename {
  readonly speciesId: string;
  readonly variantId: MovesetVariantId;
  readonly scenario: SimulationScenario;
}

/** Per-species variant growth projected for one format. */
export interface ProjectedSimulationSpecies {
  readonly speciesId: string;
  readonly candidateCount: number;
  readonly alternateVariantCount: number;
  readonly candidateCap: number;
  readonly shieldScenarioCsvs: number;
}

/** Deterministic simulation growth and stale-file report for one format. */
export interface SimulationFormatProjection {
  readonly formatId: BattleFormatId;
  readonly label: string;
  readonly cup: BattleFormat['cup'];
  readonly cp: BattleFormat['cp'];
  readonly candidateSpecies: number;
  readonly candidateVariants: number;
  readonly alternateVariants: number;
  readonly shieldScenarioCsvs: number;
  readonly species: readonly ProjectedSimulationSpecies[];
  readonly staleVariantFiles: readonly string[];
}

/** Aggregate deterministic simulation projection. */
export interface SimulationProjection {
  readonly includesMovesetVariants: boolean;
  readonly formats: readonly SimulationFormatProjection[];
  readonly totals: {
    readonly candidateSpecies: number;
    readonly candidateVariants: number;
    readonly alternateVariants: number;
    readonly shieldScenarioCsvs: number;
    readonly staleVariantFiles: number;
  };
}

/** Pure inputs for deterministic simulation projection. */
export interface BuildSimulationProjectionInput {
  readonly includeMovesetVariants?: boolean;
  readonly formats: readonly BattleFormat[];
  readonly candidateSets: readonly DerivedMovesetCandidateSet[];
  readonly simulationSpeciesIdsByFormatId: ReadonlyMap<
    BattleFormatId,
    readonly string[]
  >;
  readonly existingFilenamesByFormatId: ReadonlyMap<
    BattleFormatId,
    readonly string[]
  >;
}

/** Optional local source override for read-only projection. */
export interface SimulationProjectionOptions {
  readonly sourcePath?: string;
  readonly includeMovesetVariants?: boolean;
}

interface ProjectionRankingData {
  readonly candidateSets: RankingSyncResult['candidateSets'];
  readonly simulationSpeciesIdsByFormatId: RankingSyncResult['simulationSpeciesIdsByFormatId'];
}

/** Injectable read-only boundaries for simulation projection. */
export interface SimulationProjectionDependencies {
  readonly resolveSourcePath: () => string;
  readonly validateSource: (sourcePath: string) => void;
  readonly loadRankingData: (
    sourcePath: string,
  ) => Promise<ProjectionRankingData>;
  readonly readSimulationDirectory: (
    format: BattleFormat,
  ) => Promise<readonly string[]>;
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function getFormatDirectory(format: BattleFormat): string {
  return path.join(
    syncConfig.outputDir,
    'simulations',
    `cp${format.cp}`,
    format.cup,
  );
}

function toRepositoryPath(format: BattleFormat, filename: string): string {
  return path.posix.join(
    'data',
    'simulations',
    `cp${format.cp}`,
    format.cup,
    filename,
  );
}

async function loadReadOnlyRankingData(
  sourcePath: string,
): Promise<ProjectionRankingData> {
  const noOpDirectory = async (): Promise<void> => undefined;
  const noOpWrite = async (): Promise<void> => undefined;
  const [pokemonData, movesData] = await Promise.all([
    fetchPokemonData(
      sourcePath,
      {
        mkdir: noOpDirectory,
        writeFile: noOpWrite,
      },
      { quiet: true },
    ),
    fetchMovesData(
      sourcePath,
      {
        mkdir: noOpDirectory,
        writeFile: noOpWrite,
      },
      { quiet: true },
    ),
  ]);
  const rankingResult = await scrapeRankings(
    { sourcePath, quiet: true },
    {
      readFile: async (filePath: string): Promise<string> => {
        if (filePath.endsWith(path.join('data', 'pokemon.json'))) {
          return JSON.stringify(pokemonData satisfies PokemonData[]);
        }
        if (filePath.endsWith(path.join('data', 'moves.json'))) {
          return JSON.stringify(movesData satisfies MovesData[]);
        }
        throw new Error(`[sync-projection] Unexpected file read: ${filePath}`);
      },
      mkdir: noOpDirectory,
      writeFile: noOpWrite,
    },
  );

  return {
    candidateSets: rankingResult.candidateSets,
    simulationSpeciesIdsByFormatId:
      rankingResult.simulationSpeciesIdsByFormatId,
  };
}

const defaultDependencies: SimulationProjectionDependencies = {
  resolveSourcePath: () => resolvePvpokeSourcePath().sourcePath,
  validateSource: validatePhase1SourceFiles,
  loadRankingData: loadReadOnlyRankingData,
  readSimulationDirectory: async (
    format: BattleFormat,
  ): Promise<readonly string[]> => {
    try {
      return await fs.readdir(getFormatDirectory(format));
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return [];
      }
      throw error;
    }
  },
};

/**
 * Parse only canonical variant filenames with one of the required shield paths.
 */
export function parseVariantSimulationFilename(
  filename: string,
): ParsedVariantSimulationFilename | null {
  const idPart = '[a-z0-9]+(?:_[a-z0-9]+)*';
  const match = filename.match(
    new RegExp(
      `^(${idPart})--(${idPart})--(${idPart})--(${idPart})_(0-0|1-1|2-2)\\.csv$`,
    ),
  );
  if (!match) {
    return null;
  }

  const variantId = `${match[2]}--${match[3]}--${match[4]}` as MovesetVariantId;
  if (
    match[3] === match[4] ||
    getMovesetVariantId({
      fastMove: match[2],
      chargedMove1: match[3],
      chargedMove2: match[4],
    }) !== variantId
  ) {
    return null;
  }

  return {
    speciesId: match[1],
    variantId,
    scenario: match[5] as SimulationScenario,
  };
}

/** Build a deterministic, side-effect-free projection from derived candidates. */
export function buildSimulationProjection(
  input: BuildSimulationProjectionInput,
): SimulationProjection {
  const includesMovesetVariants = input.includeMovesetVariants ?? false;
  const formats = input.formats.map((format): SimulationFormatProjection => {
    const simulationTargets = new Set(
      input.simulationSpeciesIdsByFormatId.get(format.id) ?? [],
    );
    const candidateIdsBySpecies = new Map<
      string,
      Map<MovesetVariantId, boolean>
    >();

    for (const candidateSet of input.candidateSets) {
      if (
        !includesMovesetVariants ||
        candidateSet.formatId !== format.id ||
        !simulationTargets.has(candidateSet.speciesId)
      ) {
        continue;
      }
      const variants =
        candidateIdsBySpecies.get(candidateSet.speciesId) ?? new Map();
      for (const candidate of candidateSet.candidates) {
        variants.set(
          candidate.id,
          (variants.get(candidate.id) ?? false) || candidate.isDefault,
        );
      }
      candidateIdsBySpecies.set(candidateSet.speciesId, variants);
    }

    const expectedVariantFilenames = new Set<string>();
    const species = Array.from(candidateIdsBySpecies.entries())
      .flatMap(([speciesId, variants]): ProjectedSimulationSpecies[] => {
        const candidates = Array.from(variants.entries()).sort(
          ([left], [right]) => compareAscii(left, right),
        );
        const hasDefault = candidates.some(([, isDefault]) => isDefault);
        if (candidates.length <= 1 || !hasDefault) {
          return [];
        }
        if (candidates.length > MAX_MOVESET_CANDIDATES) {
          throw new Error(
            `[sync-projection] ${format.id}/${speciesId} has ${candidates.length} candidates; maximum is ${MAX_MOVESET_CANDIDATES}`,
          );
        }

        const alternates = candidates.filter(([, isDefault]) => !isDefault);
        for (const [variantId] of alternates) {
          for (const scenario of SIMULATION_SCENARIOS) {
            expectedVariantFilenames.add(
              `${speciesId}--${variantId}_${scenario}.csv`,
            );
          }
        }

        return [
          {
            speciesId,
            candidateCount: candidates.length,
            alternateVariantCount: alternates.length,
            candidateCap: MAX_MOVESET_CANDIDATES,
            shieldScenarioCsvs: alternates.length * SIMULATION_SCENARIOS.length,
          },
        ];
      })
      .sort((left, right) => compareAscii(left.speciesId, right.speciesId));
    const existingFilenames =
      input.existingFilenamesByFormatId.get(format.id) ?? [];
    const staleVariantFiles = [...new Set(existingFilenames)]
      .filter((filename) => parseVariantSimulationFilename(filename) !== null)
      .filter((filename) => !expectedVariantFilenames.has(filename))
      .sort(compareAscii)
      .map((filename) => toRepositoryPath(format, filename));
    const candidateVariants = species.reduce(
      (sum, entry) => sum + entry.candidateCount,
      0,
    );
    const alternateVariants = species.reduce(
      (sum, entry) => sum + entry.alternateVariantCount,
      0,
    );

    return {
      formatId: format.id,
      label: format.label,
      cup: format.cup,
      cp: format.cp,
      candidateSpecies: species.length,
      candidateVariants,
      alternateVariants,
      shieldScenarioCsvs: alternateVariants * SIMULATION_SCENARIOS.length,
      species,
      staleVariantFiles,
    };
  });

  return {
    includesMovesetVariants,
    formats,
    totals: {
      candidateSpecies: formats.reduce(
        (sum, format) => sum + format.candidateSpecies,
        0,
      ),
      candidateVariants: formats.reduce(
        (sum, format) => sum + format.candidateVariants,
        0,
      ),
      alternateVariants: formats.reduce(
        (sum, format) => sum + format.alternateVariants,
        0,
      ),
      shieldScenarioCsvs: formats.reduce(
        (sum, format) => sum + format.shieldScenarioCsvs,
        0,
      ),
      staleVariantFiles: formats.reduce(
        (sum, format) => sum + format.staleVariantFiles.length,
        0,
      ),
    },
  };
}

/** Serialize a simulation projection with stable key and array ordering. */
export function formatSimulationProjection(
  projection: SimulationProjection,
): string {
  return `${JSON.stringify(projection, null, 2)}\n`;
}

/** Derive and inspect simulation candidates without writing or deleting data. */
export async function projectSimulationVariants(
  options: SimulationProjectionOptions = {},
  dependencies: Partial<SimulationProjectionDependencies> = {},
): Promise<SimulationProjection> {
  const resolvedDependencies = { ...defaultDependencies, ...dependencies };
  const sourcePath =
    options.sourcePath ?? resolvedDependencies.resolveSourcePath();
  resolvedDependencies.validateSource(sourcePath);
  const rankingData = await resolvedDependencies.loadRankingData(sourcePath);
  const formats = getBattleFormats();
  const existingFilenames = await Promise.all(
    formats.map((format) =>
      resolvedDependencies.readSimulationDirectory(format),
    ),
  );

  return buildSimulationProjection({
    includeMovesetVariants: options.includeMovesetVariants ?? false,
    formats,
    candidateSets: rankingData.candidateSets,
    simulationSpeciesIdsByFormatId: rankingData.simulationSpeciesIdsByFormatId,
    existingFilenamesByFormatId: new Map(
      formats.map((format, index) => [
        format.id,
        existingFilenames[index] ?? [],
      ]),
    ),
  });
}
