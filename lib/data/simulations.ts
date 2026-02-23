import { readFileSync, readdirSync } from 'fs';
import { parse } from 'csv-parse/sync';
import {
  normalizeToChoosableSpeciesId,
  speciesIdToSpeciesName,
  speciesNameToChoosableId,
} from './pokemon';
import { getAllRankingsForPokemon } from './rankings';

/**
 * Simulation matchup result for a specific shield scenario
 */
export interface MatchupResult {
  battleRating: number; // >500 = win, <500 = loss, =500 = tie
  energyRemaining: number;
  hpRemaining: number;
}

/**
 * Complete matchup data across all shield scenarios
 */
interface MatchupData {
  shields0: MatchupResult | null;
  shields1: MatchupResult | null;
  shields2: MatchupResult | null;
}

/**
 * Matchup matrix keyed by speciesId.
 */
type MatchupMatrix = Map<string, Map<string, MatchupData>>;

let matchupMatrix: MatchupMatrix | null = null;

/**
 * CSV record structure from simulation files
 */
interface SimulationCSVRecord {
  Pokemon: string;
  'Battle Rating': number;
  'Energy Remaining': number;
  'HP Remaining': number;
}

/**
 * Extract the display species name from simulation row value.
 * Example: "Aegislash (Shield) AS+FC/GB" -> "Aegislash (Shield)"
 */
function extractSpeciesNameFromSimulationCell(value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return '';
  }

  const lastSpaceIndex = trimmedValue.lastIndexOf(' ');
  if (lastSpaceIndex === -1) {
    return trimmedValue;
  }

  const trailingToken = trimmedValue.slice(lastSpaceIndex + 1);
  const isMovesetToken = /^[A-Za-z0-9]+\+[A-Za-z0-9]+(?:\/[A-Za-z0-9]+)+$/.test(
    trailingToken,
  );

  if (!isMovesetToken) {
    return trimmedValue;
  }

  return trimmedValue.slice(0, lastSpaceIndex).trim();
}

/**
 * Parse a simulation CSV file and extract matchup results by opponent speciesId.
 */
function parseSimulationCSV(filePath: string): Map<string, MatchupResult> {
  const fileContent = readFileSync(filePath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    cast: (value, context) => {
      if (
        context.column &&
        typeof context.column === 'string' &&
        ['Battle Rating', 'Energy Remaining', 'HP Remaining'].includes(
          context.column,
        )
      ) {
        return parseFloat(value);
      }
      return value;
    },
  }) as SimulationCSVRecord[];

  const matchups = new Map<string, MatchupResult>();

  for (const record of records) {
    const speciesDisplayName = extractSpeciesNameFromSimulationCell(
      record.Pokemon,
    );
    const opponentSpeciesId = speciesNameToChoosableId(speciesDisplayName);
    if (!opponentSpeciesId) {
      continue;
    }

    matchups.set(opponentSpeciesId, {
      battleRating: record['Battle Rating'],
      energyRemaining: record['Energy Remaining'],
      hpRemaining: record['HP Remaining'],
    });
  }

  return matchups;
}

/**
 * Extract speciesId from filename.
 * Example: "cp1500_marowak_shadow_0-0.csv" -> "marowak_shadow"
 */
function extractSpeciesIdFromFilename(filename: string): string {
  const match = filename.match(/^cp1500_(.+)_(\d+-\d+)\.csv$/);
  if (!match) {
    return '';
  }

  return normalizeToChoosableSpeciesId(match[1]);
}

/**
 * Extract shield count from filename.
 */
function extractShieldCount(filename: string): number {
  const match = filename.match(/^cp1500_.+_(\d+)-\d+\.csv$/);
  return match ? parseInt(match[1]) : -1;
}

/**
 * Load all simulation data from data/simulations/ directory.
 */
function loadSimulationData(): MatchupMatrix {
  const matrix: MatchupMatrix = new Map();
  const simulationDir = `${process.cwd()}/data/simulations`;

  try {
    const files = readdirSync(simulationDir);

    for (const filename of files) {
      if (!filename.endsWith('.csv')) {
        continue;
      }

      const speciesId = extractSpeciesIdFromFilename(filename);
      const shieldCount = extractShieldCount(filename);

      if (!speciesId || shieldCount === -1) {
        continue;
      }

      const filePath = `${simulationDir}/${filename}`;
      const matchups = parseSimulationCSV(filePath);

      if (!matrix.has(speciesId)) {
        matrix.set(speciesId, new Map());
      }

      const pokemonMatchups = matrix.get(speciesId)!;

      for (const [opponentSpeciesId, result] of matchups.entries()) {
        if (!pokemonMatchups.has(opponentSpeciesId)) {
          pokemonMatchups.set(opponentSpeciesId, {
            shields0: null,
            shields1: null,
            shields2: null,
          });
        }

        const matchupData = pokemonMatchups.get(opponentSpeciesId)!;

        if (shieldCount === 0) {
          matchupData.shields0 = result;
        } else if (shieldCount === 1) {
          matchupData.shields1 = result;
        } else if (shieldCount === 2) {
          matchupData.shields2 = result;
        }
      }
    }
  } catch {
    console.warn(
      'Simulation data directory not found - falling back to ranking data only. Add simulation CSVs to data/simulations/ for enhanced matchup evaluation.',
    );
  }

  return matrix;
}

/**
 * Get the matchup matrix (lazy loaded).
 */
export function getMatchupMatrix(): MatchupMatrix {
  if (!matchupMatrix) {
    matchupMatrix = loadSimulationData();
  }

  return matchupMatrix;
}

/**
 * Get matchup result for a specific speciesId vs opponent speciesId.
 * Averages across shield scenarios with weighting: 1-1 shields = 50%, 0-0 = 30%, 2-2 = 20%.
 */
export function getMatchupResult(
  speciesId: string,
  opponentSpeciesId: string,
): number | null {
  const matrix = getMatchupMatrix();
  const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
  const canonicalOpponentSpeciesId =
    normalizeToChoosableSpeciesId(opponentSpeciesId);
  const pokemonMatchups = matrix.get(canonicalSpeciesId);

  if (!pokemonMatchups) {
    return null;
  }

  const matchupData = pokemonMatchups.get(canonicalOpponentSpeciesId);
  if (!matchupData) {
    return null;
  }

  const ratings: number[] = [];
  const weights: number[] = [];

  if (matchupData.shields0) {
    ratings.push(matchupData.shields0.battleRating);
    weights.push(0.3);
  }

  if (matchupData.shields1) {
    ratings.push(matchupData.shields1.battleRating);
    weights.push(0.5);
  }

  if (matchupData.shields2) {
    ratings.push(matchupData.shields2.battleRating);
    weights.push(0.2);
  }

  if (ratings.length === 0) {
    return null;
  }

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const weightedSum = ratings.reduce(
    (sum, rating, index) => sum + rating * weights[index],
    0,
  );

  return weightedSum / totalWeight;
}

/**
 * Check if speciesId wins matchup (battle rating > 500).
 */
export function winsMatchup(
  speciesId: string,
  opponentSpeciesId: string,
): boolean {
  const rating = getMatchupResult(speciesId, opponentSpeciesId);
  return rating !== null && rating > 500;
}

/**
 * Get all opponent speciesIds that a speciesId loses to.
 */
export function getLosses(speciesId: string): string[] {
  const matrix = getMatchupMatrix();
  const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
  const pokemonMatchups = matrix.get(canonicalSpeciesId);

  if (!pokemonMatchups) {
    return [];
  }

  const losses: string[] = [];

  for (const opponentSpeciesId of pokemonMatchups.keys()) {
    const rating = getMatchupResult(canonicalSpeciesId, opponentSpeciesId);
    if (rating !== null && rating < 500) {
      losses.push(opponentSpeciesId);
    }
  }

  return losses;
}

/**
 * Calculate team coverage against a list of threat speciesIds.
 */
export function calculateTeamCoverage(
  team: string[],
  threats: string[],
): number {
  const canonicalTeam = team.map(normalizeToChoosableSpeciesId);
  const canonicalThreats = threats.map(normalizeToChoosableSpeciesId);
  let coveredThreats = 0;

  for (const threatSpeciesId of canonicalThreats) {
    const hasCounter = canonicalTeam.some((speciesId) =>
      winsMatchup(speciesId, threatSpeciesId),
    );

    if (hasCounter) {
      coveredThreats++;
    }
  }

  return canonicalThreats.length > 0
    ? coveredThreats / canonicalThreats.length
    : 0;
}

/**
 * Get common threats that the entire team loses to.
 */
export function getTeamWeaknesses(team: string[]): string[] {
  const matrix = getMatchupMatrix();
  const canonicalTeam = team.map(normalizeToChoosableSpeciesId);

  const allOpponents = new Set<string>();
  for (const speciesId of canonicalTeam) {
    const matchups = matrix.get(speciesId);
    if (!matchups) {
      continue;
    }

    for (const opponentSpeciesId of matchups.keys()) {
      allOpponents.add(opponentSpeciesId);
    }
  }

  const teamWeaknesses: string[] = [];

  for (const opponentSpeciesId of allOpponents) {
    const beatsAll = canonicalTeam.every(
      (speciesId) => !winsMatchup(speciesId, opponentSpeciesId),
    );

    if (beatsAll) {
      teamWeaknesses.push(opponentSpeciesId);
    }
  }

  return teamWeaknesses;
}

/**
 * Get top N threat speciesIds from simulation matrix, ranked by overall ranking score.
 */
export function getTopThreats(count: number = 50): string[] {
  const matrix = getMatchupMatrix();
  const allSpeciesIds = Array.from(matrix.keys());

  const rankedSpecies = allSpeciesIds
    .map((speciesId) => {
      const displayName = speciesIdToSpeciesName(speciesId);
      const rankings = getAllRankingsForPokemon(displayName);
      return { speciesId, score: rankings.overall };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return rankedSpecies.slice(0, count).map((entry) => entry.speciesId);
}

/**
 * Get team weaknesses weighted by threatening Pokemon ranking.
 */
export function getWeightedTeamWeaknesses(
  team: string[],
): Array<{ opponent: string; weight: number }> {
  const weaknesses = getTeamWeaknesses(team);

  return weaknesses.map((opponentSpeciesId) => {
    const rankings = getAllRankingsForPokemon(
      speciesIdToSpeciesName(opponentSpeciesId),
    );
    const score = rankings.overall;

    let weight = 0.5;
    if (score >= 95) {
      weight = 3.0;
    } else if (score >= 90) {
      weight = 2.5;
    } else if (score >= 85) {
      weight = 2.0;
    } else if (score >= 80) {
      weight = 1.5;
    } else if (score >= 75) {
      weight = 1.0;
    }

    return { opponent: opponentSpeciesId, weight };
  });
}

/**
 * Get threats that only one team member can beat.
 */
export function getSingleCounterThreats(
  team: string[],
  topN: number = 50,
): Array<{ opponent: string; weight: number; counter: string }> {
  const canonicalTeam = team.map(normalizeToChoosableSpeciesId);
  const topThreats = getTopThreats(topN);
  const singleCounters: Array<{
    opponent: string;
    weight: number;
    counter: string;
  }> = [];

  for (const threatSpeciesId of topThreats) {
    const counters: string[] = [];
    for (const speciesId of canonicalTeam) {
      if (winsMatchup(speciesId, threatSpeciesId)) {
        counters.push(speciesId);
      }
    }

    if (counters.length === 1) {
      const rankings = getAllRankingsForPokemon(
        speciesIdToSpeciesName(threatSpeciesId),
      );
      const score = rankings.overall;

      let weight = 0.3;
      if (score >= 95) {
        weight = 1.5;
      } else if (score >= 90) {
        weight = 1.2;
      } else if (score >= 85) {
        weight = 1.0;
      } else if (score >= 80) {
        weight = 0.7;
      } else if (score >= 75) {
        weight = 0.5;
      }

      singleCounters.push({
        opponent: threatSpeciesId,
        weight,
        counter: counters[0],
      });
    }
  }

  return singleCounters;
}

/**
 * Calculate mean battle rating across all known matchups.
 */
export function getMeanBattleRating(speciesId: string): number {
  const matrix = getMatchupMatrix();
  const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
  const pokemonMatchups = matrix.get(canonicalSpeciesId);

  if (!pokemonMatchups) {
    return 500;
  }

  const ratings: number[] = [];

  for (const opponentSpeciesId of pokemonMatchups.keys()) {
    const rating = getMatchupResult(canonicalSpeciesId, opponentSpeciesId);
    if (rating !== null) {
      ratings.push(rating);
    }
  }

  if (ratings.length === 0) {
    return 500;
  }

  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
}

/**
 * Calculate median battle rating across all known matchups.
 */
export function getMedianBattleRating(speciesId: string): number {
  const matrix = getMatchupMatrix();
  const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
  const pokemonMatchups = matrix.get(canonicalSpeciesId);

  if (!pokemonMatchups) {
    return 500;
  }

  const ratings: number[] = [];

  for (const opponentSpeciesId of pokemonMatchups.keys()) {
    const rating = getMatchupResult(canonicalSpeciesId, opponentSpeciesId);
    if (rating !== null) {
      ratings.push(rating);
    }
  }

  if (ratings.length === 0) {
    return 500;
  }

  ratings.sort((a, b) => a - b);
  const midpoint = Math.floor(ratings.length / 2);

  if (ratings.length % 2 === 0) {
    return (ratings[midpoint - 1] + ratings[midpoint]) / 2;
  }

  return ratings[midpoint];
}

/**
 * Get worst matchup speciesIds for a speciesId.
 */
export function getWorstMatchups(
  speciesId: string,
  count: number = 10,
): string[] {
  const matrix = getMatchupMatrix();
  const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
  const pokemonMatchups = matrix.get(canonicalSpeciesId);

  if (!pokemonMatchups) {
    return [];
  }

  const losses: Array<{ opponent: string; rating: number }> = [];

  for (const opponentSpeciesId of pokemonMatchups.keys()) {
    const rating = getMatchupResult(canonicalSpeciesId, opponentSpeciesId);
    if (rating !== null && rating < 500) {
      losses.push({ opponent: opponentSpeciesId, rating });
    }
  }

  losses.sort((a, b) => a.rating - b.rating);
  return losses.slice(0, count).map((loss) => loss.opponent);
}

/**
 * Count how many listed threat speciesIds this speciesId beats.
 */
export function countersThreats(speciesId: string, threats: string[]): number {
  let counterCount = 0;

  for (const threatSpeciesId of threats) {
    if (winsMatchup(speciesId, threatSpeciesId)) {
      counterCount++;
    }
  }

  return counterCount;
}

/**
 * Calculate matchup quality score (0-1 scale).
 */
export function getMatchupQualityScore(speciesId: string): number {
  const mean = getMeanBattleRating(speciesId);
  const median = getMedianBattleRating(speciesId);
  const meanScore = mean / 1000;
  const medianScore = median / 1000;

  return (meanScore + medianScore) / 2;
}
