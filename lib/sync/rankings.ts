import { promises as fs } from 'fs';
import path from 'path';
import { createPvpokeAdapter, RankingCategory, RankingCup } from './adapter';
import { syncConfig } from './config';
import {
  MovesData,
  PokemonData,
  RankingEntry,
  RankingsCsv,
  SyncRunOptions,
} from './types';
import { logError } from './utils';
import { logValidationErrors, validateRankingsCsv } from './validation';
import {
  normalizeMoveId,
  resolveSpeciesAlias,
  type SpeciesAliasKind,
} from '@/lib/data/aliases';
import { getBattleFormats } from '@/lib/data/battleFormats';

/** One unmodified ranking record read from PvPoke source data. */
export interface RankingSourceEntry {
  speciesId: string;
  speciesName: string;
  score: number;
  moveset: string[];
  stats?: {
    atk?: number;
    def?: number;
    hp?: number;
  };
}

/** Canonical ranking record retaining every source alias record. */
export interface NormalizedRankingSourceEntry extends RankingSourceEntry {
  sourceSpeciesId: string;
  sourceSpeciesName: string;
  speciesAliasKind: SpeciesAliasKind | null;
  sourceEntries: readonly RankingSourceEntry[];
}

function compareRankingSourceEntries(
  left: RankingSourceEntry,
  right: RankingSourceEntry,
): number {
  const scoreDifference = right.score - left.score;
  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const leftIsAlias = resolveSpeciesAlias(left.speciesId).aliasKind !== null;
  const rightIsAlias = resolveSpeciesAlias(right.speciesId).aliasKind !== null;
  if (leftIsAlias !== rightIsAlias) {
    return leftIsAlias ? 1 : -1;
  }

  const toStableKey = (entry: RankingSourceEntry): string => {
    return [
      entry.speciesId,
      entry.speciesName,
      entry.moveset.join(','),
      entry.stats?.atk ?? '',
      entry.stats?.def ?? '',
      entry.stats?.hp ?? '',
    ].join('|');
  };

  return toStableKey(left).localeCompare(toStableKey(right));
}

/**
 * Canonicalize and deterministically deduplicate rankings while retaining
 * source-form evidence.
 */
export function normalizeRankingSourceEntries(
  entries: RankingSourceEntry[],
): NormalizedRankingSourceEntry[] {
  const bySpeciesId = new Map<string, NormalizedRankingSourceEntry>();

  for (const entry of entries) {
    const alias = resolveSpeciesAlias(entry.speciesId);
    const canonicalSpeciesId = alias.canonicalSpeciesId;
    const existing = bySpeciesId.get(canonicalSpeciesId);
    const sourceEntries = [...(existing?.sourceEntries ?? []), entry].sort(
      compareRankingSourceEntries,
    );
    const preferredEntry = sourceEntries[0];
    const preferredAlias = resolveSpeciesAlias(preferredEntry.speciesId);
    const normalizedEntry: NormalizedRankingSourceEntry = {
      ...preferredEntry,
      speciesId: canonicalSpeciesId,
      sourceSpeciesId: preferredAlias.sourceSpeciesId,
      sourceSpeciesName: preferredEntry.speciesName,
      speciesAliasKind: preferredAlias.aliasKind,
      sourceEntries,
    };

    bySpeciesId.set(canonicalSpeciesId, normalizedEntry);
  }

  return Array.from(bySpeciesId.values()).sort((left, right) => {
    return (
      right.score - left.score || left.speciesId.localeCompare(right.speciesId)
    );
  });
}

interface RankingSyncDependencies {
  createAdapter: (sourcePath: string) => {
    readRankingJson(
      category: RankingCategory,
      leagueCp: number,
      cup?: RankingCup,
    ): Promise<unknown>;
  };
  readFile: (filePath: string) => Promise<string>;
  mkdir: (directoryPath: string) => Promise<void>;
  writeFile: (filePath: string, content: string) => Promise<void>;
}

const RANKING_CATEGORIES: RankingCategory[] = [
  'overall',
  'leads',
  'switches',
  'closers',
  'chargers',
  'attackers',
  'consistency',
];

const RANKING_HEADER =
  'Pokemon,Score,Dex,Type 1,Type 2,Attack,Defense,Stamina,Stat Product,Level,CP,Fast Move,Charged Move 1,Charged Move 2,Charged Move 1 Count,Charged Move 2 Count,Buddy Distance,Charged Move Cost';

const defaultDependencies: RankingSyncDependencies = {
  createAdapter: (sourcePath: string) => createPvpokeAdapter({ sourcePath }),
  readFile: async (filePath: string) => {
    return fs.readFile(filePath, 'utf-8');
  },
  mkdir: async (directoryPath: string) => {
    await fs.mkdir(directoryPath, { recursive: true });
  },
  writeFile: async (filePath: string, content: string) => {
    await fs.writeFile(filePath, content, 'utf-8');
  },
};

function getMoveByIdOrThrow(
  moveId: string,
  moveById: Map<string, MovesData>,
  speciesId: string,
): MovesData {
  const normalizedMoveId = normalizeMoveId(moveId);
  const move = moveById.get(normalizedMoveId);
  if (!move) {
    throw new Error(
      `[sync-rankings] Missing move '${moveId}' for '${speciesId}'`,
    );
  }

  return move;
}

function normalizeType(type: string | undefined): string {
  if (!type || type.trim().length === 0) {
    return 'none';
  }

  return type;
}

function calculateBattleStats(
  pokemon: PokemonData,
  level: number,
  atkIv: number,
  defIv: number,
  hpIv: number,
  rankingStats: RankingSourceEntry['stats'],
): { attack: number; defense: number; stamina: number; cp: number } {
  const fallbackCpm = level <= 1 ? 0.094 : Math.sqrt(level / 109.5);
  const derivedCpm =
    typeof rankingStats?.atk === 'number' && rankingStats.atk > 0
      ? rankingStats.atk / (pokemon.baseStats.atk + atkIv)
      : fallbackCpm;

  const attack = derivedCpm * (pokemon.baseStats.atk + atkIv);
  const defense = derivedCpm * (pokemon.baseStats.def + defIv);
  const stamina = Math.max(
    Math.floor(derivedCpm * (pokemon.baseStats.hp + hpIv)),
    10,
  );

  const cp = Math.floor(
    ((pokemon.baseStats.atk + atkIv) *
      Math.sqrt(pokemon.baseStats.def + defIv) *
      Math.sqrt(pokemon.baseStats.hp + hpIv) *
      Math.pow(derivedCpm, 2)) /
      10,
  );

  return {
    attack: Math.round(attack * 10) / 10,
    defense: Math.round(defense * 10) / 10,
    stamina,
    cp,
  };
}

function convertRankingEntryToCsvRow(
  ranking: RankingSourceEntry,
  pokemonBySpeciesId: Map<string, PokemonData>,
  moveById: Map<string, MovesData>,
  leagueCp: number,
): RankingEntry {
  const pokemon = pokemonBySpeciesId.get(ranking.speciesId);
  if (!pokemon) {
    throw new Error(
      `[sync-rankings] Missing pokemon '${ranking.speciesId}' in gamemaster data`,
    );
  }

  const defaultIvs = getDefaultIvsForLeagueCp(pokemon, leagueCp);
  if (!defaultIvs || defaultIvs.length < 4) {
    throw new Error(
      `[sync-rankings] Missing cp${leagueCp} default IVs for '${ranking.speciesId}'`,
    );
  }

  const [level, atkIv, defIv, hpIv] = defaultIvs;
  const battleStats = calculateBattleStats(
    pokemon,
    level,
    atkIv,
    defIv,
    hpIv,
    ranking.stats,
  );

  const [fastMoveId, chargedMove1Id, chargedMove2Id] = ranking.moveset;
  if (!fastMoveId || !chargedMove1Id) {
    throw new Error(
      `[sync-rankings] Invalid moveset for '${ranking.speciesId}'`,
    );
  }

  const fastMove = getMoveByIdOrThrow(fastMoveId, moveById, ranking.speciesId);
  const chargedMove1 = getMoveByIdOrThrow(
    chargedMove1Id,
    moveById,
    ranking.speciesId,
  );

  if (fastMove.energyGain <= 0) {
    throw new Error(
      `[sync-rankings] Fast move '${fastMove.moveId}' has invalid energy gain`,
    );
  }

  const chargedMove2 = chargedMove2Id
    ? getMoveByIdOrThrow(chargedMove2Id, moveById, ranking.speciesId)
    : undefined;
  const chargedMove1Count = Math.ceil(
    chargedMove1.energy / fastMove.energyGain,
  );
  const chargedMove2Count = chargedMove2
    ? Math.ceil(chargedMove2.energy / fastMove.energyGain)
    : 0;

  return {
    Pokemon: pokemon.speciesName,
    Score: ranking.score,
    Dex: pokemon.dex,
    'Type 1': normalizeType(pokemon.types[0]),
    'Type 2': normalizeType(pokemon.types[1]),
    Attack: battleStats.attack,
    Defense: battleStats.defense,
    Stamina: battleStats.stamina,
    'Stat Product': Math.round(
      battleStats.attack * battleStats.defense * battleStats.stamina,
    ),
    Level: level,
    CP: battleStats.cp,
    'Fast Move': fastMove.name,
    'Charged Move 1': chargedMove1.name,
    'Charged Move 2': chargedMove2?.name ?? '',
    'Charged Move 1 Count': chargedMove1Count,
    'Charged Move 2 Count': chargedMove2Count,
    'Buddy Distance': pokemon.buddyDistance,
    'Charged Move Cost': pokemon.thirdMoveCost,
  };
}

function getDefaultIvsForLeagueCp(
  pokemon: PokemonData,
  leagueCp: number,
): number[] | undefined {
  if (leagueCp <= 500) {
    return pokemon.defaultIVs.cp500;
  }

  if (leagueCp <= 1500) {
    return pokemon.defaultIVs.cp1500;
  }

  return pokemon.defaultIVs.cp2500;
}

function convertEntriesToCsv(entries: RankingEntry[]): string {
  const rows = entries.map((entry) => {
    return [
      entry.Pokemon,
      entry.Score,
      entry.Dex,
      entry['Type 1'],
      entry['Type 2'],
      entry.Attack,
      entry.Defense,
      entry.Stamina,
      entry['Stat Product'],
      entry.Level,
      entry.CP,
      entry['Fast Move'],
      entry['Charged Move 1'],
      entry['Charged Move 2'],
      entry['Charged Move 1 Count'],
      entry['Charged Move 2 Count'],
      entry['Buddy Distance'],
      entry['Charged Move Cost'],
    ].join(',');
  });

  return `${[RANKING_HEADER, ...rows].join('\n')}\n`;
}

/**
 * Check whether a rankings conversion failure should be treated as skippable.
 */
function isSkippableMissingPokemonError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith('[sync-rankings] Missing pokemon ')
  );
}

/**
 * Sync rankings CSV data from local PvPoke ranking JSON files.
 */
export async function scrapeRankings(
  options: SyncRunOptions = {},
  dependencies: Partial<RankingSyncDependencies> = {},
): Promise<RankingsCsv> {
  const sourcePath = options.sourcePath;
  if (!sourcePath) {
    throw new Error(
      '[sync-rankings] Missing sourcePath for local rankings synchronization',
    );
  }

  const resolvedDependencies: RankingSyncDependencies = {
    ...defaultDependencies,
    ...dependencies,
  };

  try {
    const allRankings: RankingsCsv = [];

    const pokemonDataPath = path.join(syncConfig.outputDir, 'pokemon.json');
    const movesDataPath = path.join(syncConfig.outputDir, 'moves.json');
    const pokemonData = JSON.parse(
      await resolvedDependencies.readFile(pokemonDataPath),
    ) as PokemonData[];
    const movesData = JSON.parse(
      await resolvedDependencies.readFile(movesDataPath),
    ) as MovesData[];

    const pokemonBySpeciesId = new Map<string, PokemonData>();
    pokemonData.forEach((pokemon) => {
      pokemonBySpeciesId.set(pokemon.speciesId, pokemon);
    });

    const moveById = new Map<string, MovesData>();
    movesData.forEach((move) => {
      moveById.set(move.moveId, move);
    });

    const adapter = resolvedDependencies.createAdapter(sourcePath);
    const rankingFormats = getBattleFormats().map((format) => {
      return {
        cup: format.cup,
        cp: format.cp,
      };
    });

    for (const format of rankingFormats) {
      for (const category of RANKING_CATEGORIES) {
        console.log(
          `[sync-rankings] Syncing cp${format.cp} ${format.cup} ${category} rankings from local JSON`,
        );

        const sourceRankings = (await adapter.readRankingJson(
          category,
          format.cp,
          format.cup,
        )) as RankingSourceEntry[];

        const normalizedRankings =
          normalizeRankingSourceEntries(sourceRankings);

        const convertedEntries: RankingEntry[] = [];

        for (const ranking of normalizedRankings) {
          try {
            convertedEntries.push(
              convertRankingEntryToCsvRow(
                ranking,
                pokemonBySpeciesId,
                moveById,
                format.cp,
              ),
            );
          } catch (error) {
            if (!isSkippableMissingPokemonError(error)) {
              throw error;
            }

            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.warn(`${errorMessage}; skipping ranking entry`);
          }
        }

        const csvText = convertEntriesToCsv(convertedEntries);
        const validation = validateRankingsCsv(csvText);
        logValidationErrors(
          `cp${format.cp} ${format.cup} ${category} rankings CSV`,
          validation.errors,
        );

        if (!validation.valid) {
          throw new Error(
            `cp${format.cp} ${format.cup} ${category} rankings CSV validation failed: ${validation.errors.join(', ')}`,
          );
        }

        const outputFilePath = path.join(
          syncConfig.outputDir,
          'rankings',
          `cp${format.cp}`,
          format.cup,
          `${category}_rankings.csv`,
        );
        await resolvedDependencies.mkdir(path.dirname(outputFilePath));
        await resolvedDependencies.writeFile(outputFilePath, csvText);

        console.log(
          `[sync-rankings] Synced ${convertedEntries.length} ${category} ranking entries to ${outputFilePath}`,
        );

        allRankings.push(...convertedEntries);
      }
    }

    console.log(
      `[sync-rankings] Successfully synced and validated ${allRankings.length} total ranking entries`,
    );
    return allRankings;
  } catch (error) {
    logError(error as Error, 'sync-rankings', {
      sourcePath,
      categories: RANKING_CATEGORIES,
    });
    throw error;
  }
}
