import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import type { RankedPokemon } from '../types';

// Lazy-loaded rankings
let overallRankings: RankedPokemon[] | null = null;
let leadsRankings: RankedPokemon[] | null = null;
let switchesRankings: RankedPokemon[] | null = null;
let closersRankings: RankedPokemon[] | null = null;

/**
 * Parse CSV file to RankedPokemon array
 */
function parseRankingCSV(filename: string): RankedPokemon[] {
  const filePath = `${process.cwd()}/data/${filename}`;
  const fileContent = readFileSync(filePath, 'utf-8');

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

  return records as RankedPokemon[];
}

/**
 * Get overall rankings (lazy loaded)
 */
export function getOverallRankings(): RankedPokemon[] {
  if (!overallRankings) {
    overallRankings = parseRankingCSV('cp1500_all_overall_rankings.csv');
  }
  return overallRankings;
}

/**
 * Get leads rankings (lazy loaded)
 */
export function getLeadsRankings(): RankedPokemon[] {
  if (!leadsRankings) {
    leadsRankings = parseRankingCSV('cp1500_all_leads_rankings.csv');
  }
  return leadsRankings;
}

/**
 * Get switches rankings (lazy loaded)
 */
export function getSwitchesRankings(): RankedPokemon[] {
  if (!switchesRankings) {
    switchesRankings = parseRankingCSV('cp1500_all_switches_rankings.csv');
  }
  return switchesRankings;
}

/**
 * Get closers rankings (lazy loaded)
 */
export function getClosersRankings(): RankedPokemon[] {
  if (!closersRankings) {
    closersRankings = parseRankingCSV('cp1500_all_closers_rankings.csv');
  }
  return closersRankings;
}

/**
 * Get ranking score for a specific Pokémon in a specific role
 */
export function getRankingScore(
  pokemonName: string,
  role: 'overall' | 'leads' | 'switches' | 'closers',
): number {
  let rankings: RankedPokemon[];

  switch (role) {
    case 'overall':
      rankings = getOverallRankings();
      break;
    case 'leads':
      rankings = getLeadsRankings();
      break;
    case 'switches':
      rankings = getSwitchesRankings();
      break;
    case 'closers':
      rankings = getClosersRankings();
      break;
  }

  const entry = rankings.find((r) => r.Pokemon === pokemonName);
  return entry ? entry.Score : 0;
}

/**
 * Get average ranking score across all roles
 */
export function getAverageRankingScore(pokemonName: string): number {
  const overall = getRankingScore(pokemonName, 'overall');
  const leads = getRankingScore(pokemonName, 'leads');
  const switches = getRankingScore(pokemonName, 'switches');
  const closers = getRankingScore(pokemonName, 'closers');

  const scores = [overall, leads, switches, closers].filter((s) => s > 0);
  if (scores.length === 0) return 0;

  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

/**
 * Get all rankings for a Pokémon
 */
export function getAllRankingsForPokemon(pokemonName: string): {
  overall: number;
  leads: number;
  switches: number;
  closers: number;
  average: number;
} {
  return {
    overall: getRankingScore(pokemonName, 'overall'),
    leads: getRankingScore(pokemonName, 'leads'),
    switches: getRankingScore(pokemonName, 'switches'),
    closers: getRankingScore(pokemonName, 'closers'),
    average: getAverageRankingScore(pokemonName),
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
 * Get optimal moveset for a Pokémon from rankings
 * Returns the highest-ranked moveset (1 fast move + 2 charged moves)
 */
export function getOptimalMoveset(pokemonName: string): {
  fastMove: string | null;
  chargedMove1: string | null;
  chargedMove2: string | null;
} {
  const overall = getOverallRankings();
  const entry = overall.find((r) => r.Pokemon === pokemonName);

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
export function getRankedPokemonNames(): Set<string> {
  const rankings = getOverallRankings();
  return new Set(rankings.map((r) => r.Pokemon));
}

/**
 * Get top N ranked Pokemon names (by overall score)
 * @param minScore Minimum score threshold (default 80)
 * @param maxCount Maximum number of Pokemon to include (default 150)
 */
export function getTopRankedPokemonNames(
  minScore: number = 80,
  maxCount: number = 150,
): Set<string> {
  const rankings = getOverallRankings()
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
): RankedPokemon[] {
  let rankings: RankedPokemon[];

  switch (role) {
    case 'overall':
      rankings = getOverallRankings();
      break;
    case 'leads':
      rankings = getLeadsRankings();
      break;
    case 'switches':
      rankings = getSwitchesRankings();
      break;
    case 'closers':
      rankings = getClosersRankings();
      break;
  }

  return rankings.slice(0, count);
}

/**
 * Get meta threats (top 50 overall rankings)
 */
export function getMetaThreats(): RankedPokemon[] {
  return getTopPokemon('overall', 50);
}

/**
 * Check if Pokémon is in meta (top 100 overall)
 */
export function isMetaPokemon(pokemonName: string): boolean {
  const score = getRankingScore(pokemonName, 'overall');
  return score >= 80;
}

/**
 * Convert speciesId to ranking name
 * Example: "marowak_alolan" → "Alolan Marowak"
 */
export function speciesIdToRankingName(speciesId: string): string {
  const parts = speciesId.split('_');

  // Handle forms
  let name = parts[0];
  let prefix = '';

  if (parts.includes('shadow')) {
    prefix = 'Shadow ';
  }

  if (parts.includes('alolan')) {
    prefix = 'Alolan ' + prefix;
  } else if (parts.includes('galarian')) {
    prefix = 'Galarian ' + prefix;
  } else if (parts.includes('hisuian')) {
    prefix = 'Hisuian ' + prefix;
  }

  // Capitalize first letter
  name = name.charAt(0).toUpperCase() + name.slice(1);

  return prefix + name;
}

/**
 * Get ranking entry for speciesId
 */
export function getRankingForSpeciesId(
  speciesId: string,
  role: 'overall' | 'leads' | 'switches' | 'closers',
): RankedPokemon | undefined {
  const rankingName = speciesIdToRankingName(speciesId);

  let rankings: RankedPokemon[];

  switch (role) {
    case 'overall':
      rankings = getOverallRankings();
      break;
    case 'leads':
      rankings = getLeadsRankings();
      break;
    case 'switches':
      rankings = getSwitchesRankings();
      break;
    case 'closers':
      rankings = getClosersRankings();
      break;
  }

  return rankings.find((r) => r.Pokemon === rankingName);
}
