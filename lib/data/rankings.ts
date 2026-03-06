import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import type { RankedPokemon } from '../types';
import type { BattleFormatId } from './battleFormats';
import { DEFAULT_BATTLE_FORMAT_ID, getBattleFormatById } from './battleFormats';
import {
  normalizeToChoosableSpeciesName,
  speciesNameToChoosableId,
  speciesIdToSpeciesName,
} from './pokemon';

type RankingCategory = 'overall' | 'leads' | 'switches' | 'closers';

interface FormatRankingsCache {
  overall: RankedPokemon[] | null;
  leads: RankedPokemon[] | null;
  switches: RankedPokemon[] | null;
  closers: RankedPokemon[] | null;
}

const formatRankingsCache: Map<BattleFormatId, FormatRankingsCache> = new Map();

/**
 * Raised when ranking CSVs for the selected format are unavailable.
 */
export class MissingRankingDataError extends Error {
  readonly formatId: BattleFormatId;
  readonly category: RankingCategory;
  readonly filename: string;

  constructor(
    formatId: BattleFormatId,
    category: RankingCategory,
    filename: string,
  ) {
    const battleFormat = getBattleFormatById(formatId);
    const formatDescriptor = battleFormat
      ? `${battleFormat.label} (${battleFormat.cup}/${battleFormat.cp})`
      : formatId;

    super(
      `Ranking data missing for ${formatDescriptor}, category ${category}: ${filename}. Run rankings sync for this format before generating teams.`,
    );
    this.name = 'MissingRankingDataError';
    this.formatId = formatId;
    this.category = category;
    this.filename = filename;
  }
}

/**
 * Resolve a valid format id with default fallback.
 */
function resolveFormatId(formatId?: BattleFormatId): BattleFormatId {
  return formatId ?? DEFAULT_BATTLE_FORMAT_ID;
}

/**
 * Build deterministic ranking CSV relative path by format and category.
 */
function getRankingRelativePath(
  category: RankingCategory,
  formatId?: BattleFormatId,
): string {
  const resolvedFormatId = resolveFormatId(formatId);
  const battleFormat = getBattleFormatById(resolvedFormatId);

  if (!battleFormat) {
    throw new Error(`Unsupported battle format id: ${resolvedFormatId}`);
  }

  return `rankings/cp${battleFormat.cp}/${battleFormat.cup}/${category}_rankings.csv`;
}

/**
 * Get or initialize rankings cache bucket for a battle format.
 */
function getFormatRankingsCache(
  formatId?: BattleFormatId,
): FormatRankingsCache {
  const resolvedFormatId = resolveFormatId(formatId);
  const existingCache = formatRankingsCache.get(resolvedFormatId);

  if (existingCache) {
    return existingCache;
  }

  const newCache: FormatRankingsCache = {
    overall: null,
    leads: null,
    switches: null,
    closers: null,
  };

  formatRankingsCache.set(resolvedFormatId, newCache);
  return newCache;
}

/**
 * Parse CSV file to RankedPokemon array
 */
function parseRankingCSV(
  category: RankingCategory,
  formatId?: BattleFormatId,
): RankedPokemon[] {
  const relativePath = getRankingRelativePath(category, formatId);
  const filePath = `${process.cwd()}/data/${relativePath}`;
  let fileContent: string;

  try {
    fileContent = readFileSync(filePath, 'utf-8');
  } catch (error) {
    const resolvedFormatId = resolveFormatId(formatId);
    const battleFormat = getBattleFormatById(resolvedFormatId);
    const formatDescriptor = battleFormat
      ? `${battleFormat.label} (${battleFormat.cup}/${battleFormat.cp})`
      : resolvedFormatId;

    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      throw new MissingRankingDataError(
        resolvedFormatId,
        category,
        relativePath,
      );
    }

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown file read error';

    throw new Error(
      `Failed to load rankings file ${relativePath} for ${formatDescriptor}, category ${category}: ${errorMessage}`,
    );
  }

  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    cast: (value, context) => {
      // Cast numeric columns
      if (context.column && typeof context.column === 'string') {
        const numericColumns = [
          'Score',
          'Dex',
          'Attack',
          'Defense',
          'Stamina',
          'Stat Product',
          'Level',
          'CP',
          'Charged Move 1 Count',
          'Charged Move 2 Count',
          'Buddy Distance',
          'Charged Move Cost',
        ];

        if (numericColumns.includes(context.column)) {
          const parsed = parseFloat(value);
          return isNaN(parsed) ? 0 : parsed;
        }
      }

      return value;
    },
  });

  return (records as RankedPokemon[]).map((record) => {
    return {
      ...record,
      Pokemon: normalizeToChoosableSpeciesName(record.Pokemon),
    };
  });
}

/**
 * Get overall rankings (lazy loaded)
 */
export function getOverallRankings(formatId?: BattleFormatId): RankedPokemon[] {
  const cache = getFormatRankingsCache(formatId);

  if (!cache.overall) {
    cache.overall = parseRankingCSV('overall', formatId);
  }

  return cache.overall;
}

/**
 * Get leads rankings (lazy loaded)
 */
export function getLeadsRankings(formatId?: BattleFormatId): RankedPokemon[] {
  const cache = getFormatRankingsCache(formatId);

  if (!cache.leads) {
    cache.leads = parseRankingCSV('leads', formatId);
  }

  return cache.leads;
}

/**
 * Get switches rankings (lazy loaded)
 */
export function getSwitchesRankings(
  formatId?: BattleFormatId,
): RankedPokemon[] {
  const cache = getFormatRankingsCache(formatId);

  if (!cache.switches) {
    cache.switches = parseRankingCSV('switches', formatId);
  }

  return cache.switches;
}

/**
 * Get closers rankings (lazy loaded)
 */
export function getClosersRankings(formatId?: BattleFormatId): RankedPokemon[] {
  const cache = getFormatRankingsCache(formatId);

  if (!cache.closers) {
    cache.closers = parseRankingCSV('closers', formatId);
  }

  return cache.closers;
}

/**
 * Get ranking score for a specific Pokémon in a specific role
 */
export function getRankingScore(
  pokemonName: string,
  role: 'overall' | 'leads' | 'switches' | 'closers',
  formatId?: BattleFormatId,
): number {
  const canonicalPokemonName = normalizeToChoosableSpeciesName(pokemonName);
  let rankings: RankedPokemon[];

  switch (role) {
    case 'overall':
      rankings = getOverallRankings(formatId);
      break;
    case 'leads':
      rankings = getLeadsRankings(formatId);
      break;
    case 'switches':
      rankings = getSwitchesRankings(formatId);
      break;
    case 'closers':
      rankings = getClosersRankings(formatId);
      break;
  }

  const entry = rankings.find((r) => r.Pokemon === canonicalPokemonName);
  return entry ? entry.Score : 0;
}

/**
 * Get average ranking score across all roles
 */
export function getAverageRankingScore(
  pokemonName: string,
  formatId?: BattleFormatId,
): number {
  const canonicalPokemonName = normalizeToChoosableSpeciesName(pokemonName);
  const overall = getRankingScore(canonicalPokemonName, 'overall', formatId);
  const leads = getRankingScore(canonicalPokemonName, 'leads', formatId);
  const switches = getRankingScore(canonicalPokemonName, 'switches', formatId);
  const closers = getRankingScore(canonicalPokemonName, 'closers', formatId);

  const scores = [overall, leads, switches, closers].filter((s) => s > 0);
  if (scores.length === 0) return 0;

  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

/**
 * Get all rankings for a Pokémon.
 */
export function getAllRankingsForPokemon(
  pokemonName: string,
  formatId?: BattleFormatId,
): {
  overall: number;
  leads: number;
  switches: number;
  closers: number;
  average: number;
} {
  const canonicalPokemonName = normalizeToChoosableSpeciesName(pokemonName);
  return {
    overall: getRankingScore(canonicalPokemonName, 'overall', formatId),
    leads: getRankingScore(canonicalPokemonName, 'leads', formatId),
    switches: getRankingScore(canonicalPokemonName, 'switches', formatId),
    closers: getRankingScore(canonicalPokemonName, 'closers', formatId),
    average: getAverageRankingScore(canonicalPokemonName, formatId),
  };
}

/**
 * Convert CSV move name to move ID format
 * Examples:
 * - "Shadow Ball" -> "SHADOW_BALL"
 * - "Weather Ball (Fire)" -> "WEATHER_BALL_FIRE"
 * - "Play Rough" -> "PLAY_ROUGH"
 */
function moveNameToMoveId(moveName: string): string {
  // Extract type from parentheses if present (e.g., "Weather Ball (Fire)")
  const match = moveName.match(/^(.+?)\s*\((.+?)\)$/);

  if (match) {
    const baseName = match[1].trim();
    const type = match[2].trim();
    // Convert both parts to uppercase and join with underscore
    const baseId = baseName.toUpperCase().replace(/\s+/g, '_');
    const typeId = type.toUpperCase().replace(/\s+/g, '_');
    return `${baseId}_${typeId}`;
  }

  // No type suffix, just convert to uppercase and replace spaces
  return moveName.toUpperCase().replace(/\s+/g, '_');
}

/**
 * Get optimal moveset for a Pokémon from rankings.
 * Returns the highest-ranked moveset (1 fast move + 2 charged moves).
 */
export function getOptimalMoveset(
  pokemonName: string,
  formatId?: BattleFormatId,
): {
  fastMove: string | null;
  chargedMove1: string | null;
  chargedMove2: string | null;
} {
  const canonicalPokemonName = normalizeToChoosableSpeciesName(pokemonName);
  const overall = getOverallRankings(formatId);
  const entry = overall.find((r) => r.Pokemon === canonicalPokemonName);

  if (!entry) {
    return {
      fastMove: null,
      chargedMove1: null,
      chargedMove2: null,
    };
  }

  return {
    fastMove: entry['Fast Move'] ? moveNameToMoveId(entry['Fast Move']) : null,
    chargedMove1: entry['Charged Move 1']
      ? moveNameToMoveId(entry['Charged Move 1'])
      : null,
    chargedMove2: entry['Charged Move 2']
      ? moveNameToMoveId(entry['Charged Move 2'])
      : null,
  };
}

/**
 * Get all unique Pokemon names from overall rankings
 */
export function getRankedPokemonNames(formatId?: BattleFormatId): Set<string> {
  const rankings = getOverallRankings(formatId);
  return new Set(rankings.map((r) => r.Pokemon));
}

/**
 * Get ranked canonical speciesIds from overall rankings.
 */
export function getRankedSpeciesIds(formatId?: BattleFormatId): Set<string> {
  const rankedSpeciesIds = new Set<string>();

  for (const pokemonName of getRankedPokemonNames(formatId)) {
    const speciesId = speciesNameToChoosableId(pokemonName);
    if (speciesId) {
      rankedSpeciesIds.add(speciesId);
    }
  }

  return rankedSpeciesIds;
}

/**
 * Get top N ranked Pokemon names (by overall score)
 * @param minScore Minimum score threshold (default 80)
 * @param maxCount Maximum number of Pokemon to include (default 150)
 */
export function getTopRankedPokemonNames(
  minScore: number = 80,
  maxCount: number = 150,
  formatId?: BattleFormatId,
): Set<string> {
  const rankings = getOverallRankings(formatId)
    .filter((r) => r.Score >= minScore)
    .slice(0, maxCount);
  return new Set(rankings.map((r) => r.Pokemon));
}
/**
 * Get top N Pokémon by role
 */
export function getTopPokemon(
  role: 'overall' | 'leads' | 'switches' | 'closers',
  count: number,
  formatId?: BattleFormatId,
): RankedPokemon[] {
  let rankings: RankedPokemon[];

  switch (role) {
    case 'overall':
      rankings = getOverallRankings(formatId);
      break;
    case 'leads':
      rankings = getLeadsRankings(formatId);
      break;
    case 'switches':
      rankings = getSwitchesRankings(formatId);
      break;
    case 'closers':
      rankings = getClosersRankings(formatId);
      break;
  }

  return rankings.slice(0, count);
}

/**
 * Get meta threats (top 50 overall rankings)
 */
export function getMetaThreats(formatId?: BattleFormatId): RankedPokemon[] {
  return getTopPokemon('overall', 50, formatId);
}

/**
 * Get a deduplicated threat pool built from top N of each role ranking.
 * Returns canonical choosable speciesIds.
 */
export function getRoleBasedThreatSpeciesIds(
  topPerRole: number = 100,
  formatId?: BattleFormatId,
): string[] {
  const roles: Array<'overall' | 'leads' | 'switches' | 'closers'> = [
    'overall',
    'leads',
    'switches',
    'closers',
  ];

  const threatSpeciesIds = new Set<string>();

  for (const role of roles) {
    const roleRankings = getTopPokemon(role, topPerRole, formatId);

    for (const ranking of roleRankings) {
      const speciesId = speciesNameToChoosableId(ranking.Pokemon);
      if (speciesId) {
        threatSpeciesIds.add(speciesId);
      }
    }
  }

  return Array.from(threatSpeciesIds);
}

/**
 * Check if Pokémon is in meta (top 100 overall)
 */
export function isMetaPokemon(
  pokemonName: string,
  formatId?: BattleFormatId,
): boolean {
  const score = getRankingScore(pokemonName, 'overall', formatId);
  return score >= 80;
}

/**
 * Convert speciesId to ranking name
 * Example: "marowak_alolan" → "Alolan Marowak"
 */
export function speciesIdToRankingName(speciesId: string): string {
  return speciesIdToSpeciesName(speciesId);
}

/**
 * Get ranking entry for speciesId
 */
export function getRankingForSpeciesId(
  speciesId: string,
  role: 'overall' | 'leads' | 'switches' | 'closers',
  formatId?: BattleFormatId,
): RankedPokemon | undefined {
  const rankingName = speciesIdToRankingName(speciesId);

  let rankings: RankedPokemon[];

  switch (role) {
    case 'overall':
      rankings = getOverallRankings(formatId);
      break;
    case 'leads':
      rankings = getLeadsRankings(formatId);
      break;
    case 'switches':
      rankings = getSwitchesRankings(formatId);
      break;
    case 'closers':
      rankings = getClosersRankings(formatId);
      break;
  }

  return rankings.find((r) => r.Pokemon === rankingName);
}
