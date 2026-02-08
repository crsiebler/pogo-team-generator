import { readFileSync, readdirSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { speciesIdToRankingName, getAllRankingsForPokemon } from './rankings';

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
 * Matchup matrix: Pokemon -> Opponent -> Shield Scenario -> Result
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
 * Parse a simulation CSV file and extract matchup results
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
    // Extract Pokemon name and moveset (e.g., "Altaria DB+SA/Ft")
    const pokemonFullName = record.Pokemon;

    matchups.set(pokemonFullName, {
      battleRating: record['Battle Rating'],
      energyRemaining: record['Energy Remaining'],
      hpRemaining: record['HP Remaining'],
    });
  }

  return matchups;
}

/**
 * Extract Pokemon name from filename
 * Example: "Corsola (Galarian) A+NSh_PG vs Open League 0-0 shields.csv" -> "Corsola (Galarian)"
 */
function extractPokemonFromFilename(filename: string): string {
  const match = filename.match(/^(.+?)\s+\w+\+.+?\s+vs\s+Open\s+League/);
  return match ? match[1].trim() : '';
}

/**
 * Extract shield count from filename
 * Example: "0-0 shields.csv" -> 0, "1-1 shields.csv" -> 1
 */
function extractShieldCount(filename: string): number {
  const match = filename.match(/(\d+)-\1\s+shields\.csv$/);
  return match ? parseInt(match[1]) : -1;
}

/**
 * Load all simulation data from data/simulation/ directory
 */
function loadSimulationData(): MatchupMatrix {
  const matrix: MatchupMatrix = new Map();
  const simulationDir = `${process.cwd()}/data/simulations`;

  try {
    const files = readdirSync(simulationDir);

    for (const filename of files) {
      if (!filename.endsWith('.csv')) continue;

      const pokemonName = extractPokemonFromFilename(filename);
      const shieldCount = extractShieldCount(filename);

      if (!pokemonName || shieldCount === -1) continue;

      const filePath = `${simulationDir}/${filename}`;
      const matchups = parseSimulationCSV(filePath);

      // Ensure Pokemon entry exists in matrix
      if (!matrix.has(pokemonName)) {
        matrix.set(pokemonName, new Map());
      }

      const pokemonMatchups = matrix.get(pokemonName)!;

      // Add matchup data for each opponent
      for (const [opponentFullName, result] of matchups.entries()) {
        // Extract just the Pokemon name without moveset
        const opponentName = opponentFullName.split(' ')[0];
        const variantMatch = opponentFullName.match(/\(([^)]+)\)/g);
        const variant = variantMatch ? variantMatch.join(' ') : '';
        const cleanOpponentName = variant
          ? `${opponentName} ${variant}`
          : opponentName;

        if (!pokemonMatchups.has(cleanOpponentName)) {
          pokemonMatchups.set(cleanOpponentName, {
            shields0: null,
            shields1: null,
            shields2: null,
          });
        }

        const matchupData = pokemonMatchups.get(cleanOpponentName)!;

        // Store result in appropriate shield scenario
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
      'Simulation data directory not found - falling back to ranking data only. Add simulation CSVs to data/simulation/ for enhanced matchup evaluation.',
    );
  }

  return matrix;
}

/**
 * Get the matchup matrix (lazy loaded)
 */
export function getMatchupMatrix(): MatchupMatrix {
  if (!matchupMatrix) {
    matchupMatrix = loadSimulationData();
  }
  return matchupMatrix;
}

/**
 * Get matchup result for a specific Pokemon vs opponent
 * Averages across shield scenarios with weighting: 1-1 shields = 50%, 0-0 = 25%, 2-2 = 25%
 */
export function getMatchupResult(
  pokemon: string,
  opponent: string,
): number | null {
  const matrix = getMatchupMatrix();
  const pokemonMatchups = matrix.get(pokemon);

  if (!pokemonMatchups) return null;

  const matchupData = pokemonMatchups.get(opponent);
  if (!matchupData) return null;

  // Calculate weighted average battle rating
  const ratings: number[] = [];
  const weights: number[] = [];

  if (matchupData.shields0) {
    ratings.push(matchupData.shields0.battleRating);
    weights.push(0.3); // 0-shield: 30% weight (fast move pressure)
  }

  if (matchupData.shields1) {
    ratings.push(matchupData.shields1.battleRating);
    weights.push(0.5); // 1-shield: 50% weight (most common scenario)
  }

  if (matchupData.shields2) {
    ratings.push(matchupData.shields2.battleRating);
    weights.push(0.2); // 2-shield: 20% weight (longer battles)
  }

  if (ratings.length === 0) return null;

  // Weighted average
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const weightedSum = ratings.reduce(
    (sum, rating, i) => sum + rating * weights[i],
    0,
  );

  return weightedSum / totalWeight;
}

/**
 * Check if Pokemon wins matchup (battle rating > 500)
 */
export function winsMatchup(pokemon: string, opponent: string): boolean {
  const rating = getMatchupResult(pokemon, opponent);
  return rating !== null && rating > 500;
}

/**
 * Get all opponents that a Pokemon loses to
 */
export function getLosses(pokemon: string): string[] {
  const matrix = getMatchupMatrix();
  const pokemonMatchups = matrix.get(pokemon);

  if (!pokemonMatchups) return [];

  const losses: string[] = [];

  for (const opponent of pokemonMatchups.keys()) {
    const rating = getMatchupResult(pokemon, opponent);
    if (rating !== null && rating < 500) {
      losses.push(opponent);
    }
  }

  return losses;
}

/**
 * Calculate team coverage against a list of threats
 * Returns the percentage of threats that at least one team member can beat
 */
export function calculateTeamCoverage(
  team: string[],
  threats: string[],
): number {
  const teamNames = team.map((id) => speciesIdToRankingName(id));
  let coveredThreats = 0;

  for (const threat of threats) {
    // Check if any team member beats this threat
    const hasCounter = teamNames.some((pokemon) =>
      winsMatchup(pokemon, threat),
    );

    if (hasCounter) {
      coveredThreats++;
    }
  }

  return threats.length > 0 ? coveredThreats / threats.length : 0;
}

/**
 * Get common threats that the entire team loses to
 * These are major weaknesses that need to be addressed
 */
export function getTeamWeaknesses(team: string[]): string[] {
  const matrix = getMatchupMatrix();
  const teamNames = team.map((id) => speciesIdToRankingName(id));

  // Get all possible opponents
  const allOpponents = new Set<string>();
  for (const pokemon of teamNames) {
    const matchups = matrix.get(pokemon);
    if (matchups) {
      for (const opponent of matchups.keys()) {
        allOpponents.add(opponent);
      }
    }
  }

  // Find opponents that beat ALL team members
  const teamWeaknesses: string[] = [];

  for (const opponent of allOpponents) {
    const beatsAll = teamNames.every(
      (pokemon) => !winsMatchup(pokemon, opponent),
    );

    if (beatsAll) {
      teamWeaknesses.push(opponent);
    }
  }

  return teamWeaknesses;
}

/**
 * Get top N threats from the meta (based on availability in simulation data)
 * Sorted by overall ranking score (highest first)
 */
export function getTopThreats(count: number = 50): string[] {
  const matrix = getMatchupMatrix();
  const allPokemon = Array.from(matrix.keys());

  // Sort by overall ranking score (highest first)
  const rankedPokemon = allPokemon
    .map((name) => {
      const rankings = getAllRankingsForPokemon(name);
      return { name, score: rankings.overall };
    })
    .filter((p) => p.score > 0) // Only include Pokemon with ranking data
    .sort((a, b) => b.score - a.score); // Highest score first

  return rankedPokemon.slice(0, count).map((p) => p.name);
}

/**
 * Get team weaknesses weighted by the ranking of the threatening Pokemon
 * Returns array of {opponent, weight} where weight is based on ranking
 * Higher ranked threats get much higher weight (exponential scaling)
 */
export function getWeightedTeamWeaknesses(
  team: string[],
): Array<{ opponent: string; weight: number }> {
  const weaknesses = getTeamWeaknesses(team);

  return weaknesses.map((opponent) => {
    const rankings = getAllRankingsForPokemon(opponent);
    const score = rankings.overall;

    // Exponential weight based on ranking
    // Rank 95+: weight 3.0 (devastating)
    // Rank 90-95: weight 2.5
    // Rank 85-90: weight 2.0
    // Rank 80-85: weight 1.5
    // Rank 75-80: weight 1.0
    // Rank <75: weight 0.5 (less concerning)
    let weight = 0.5;
    if (score >= 95) {
      weight = 3.0; // Top tier meta threat - CRITICAL to handle
    } else if (score >= 90) {
      weight = 2.5;
    } else if (score >= 85) {
      weight = 2.0;
    } else if (score >= 80) {
      weight = 1.5;
    } else if (score >= 75) {
      weight = 1.0;
    }

    return { opponent, weight };
  });
}

/**
 * Get threats that only ONE team member can beat (single point of failure)
 * Returns array of {opponent, weight} where weight is based on ranking
 * These are critical weaknesses - if that one Pokemon is eliminated, team loses
 */
export function getSingleCounterThreats(
  team: string[],
  topN: number = 50,
): Array<{ opponent: string; weight: number; counter: string }> {
  const teamNames = team.map((id) => speciesIdToRankingName(id));
  const topThreats = getTopThreats(topN);
  const singleCounters: Array<{
    opponent: string;
    weight: number;
    counter: string;
  }> = [];

  for (const threat of topThreats) {
    // Count how many team members beat this threat
    const counters: string[] = [];
    for (const pokemon of teamNames) {
      if (winsMatchup(pokemon, threat)) {
        counters.push(pokemon);
      }
    }

    // If exactly 1 counter, this is a single point of failure
    if (counters.length === 1) {
      const rankings = getAllRankingsForPokemon(threat);
      const score = rankings.overall;

      // Weight based on threat ranking
      let weight = 0.3;
      if (score >= 95) {
        weight = 1.5; // Critical - need backup for top threats
      } else if (score >= 90) {
        weight = 1.2;
      } else if (score >= 85) {
        weight = 1.0;
      } else if (score >= 80) {
        weight = 0.7;
      } else if (score >= 75) {
        weight = 0.5;
      }

      singleCounters.push({ opponent: threat, weight, counter: counters[0] });
    }
  }

  return singleCounters;
}

/**
 * Calculate mean battle rating for a Pokemon across all matchups
 * Higher mean = generally wins more matchups
 */
export function getMeanBattleRating(pokemon: string): number {
  const matrix = getMatchupMatrix();
  const pokemonMatchups = matrix.get(pokemon);

  if (!pokemonMatchups) return 500; // Neutral if no data

  const ratings: number[] = [];

  for (const opponent of pokemonMatchups.keys()) {
    const rating = getMatchupResult(pokemon, opponent);
    if (rating !== null) {
      ratings.push(rating);
    }
  }

  if (ratings.length === 0) return 500;

  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

/**
 * Calculate median battle rating for a Pokemon across all matchups
 * Higher median = more consistent, fewer terrible matchups
 */
export function getMedianBattleRating(pokemon: string): number {
  const matrix = getMatchupMatrix();
  const pokemonMatchups = matrix.get(pokemon);

  if (!pokemonMatchups) return 500; // Neutral if no data

  const ratings: number[] = [];

  for (const opponent of pokemonMatchups.keys()) {
    const rating = getMatchupResult(pokemon, opponent);
    if (rating !== null) {
      ratings.push(rating);
    }
  }

  if (ratings.length === 0) return 500;

  // Sort ratings to find median
  ratings.sort((a, b) => a - b);
  const mid = Math.floor(ratings.length / 2);

  if (ratings.length % 2 === 0) {
    return (ratings[mid - 1] + ratings[mid]) / 2;
  } else {
    return ratings[mid];
  }
}

/**
 * Get the worst matchups for a Pokemon (losses with lowest battle ratings)
 * Returns array of opponent names sorted by how badly this Pokemon loses
 */
export function getWorstMatchups(
  pokemon: string,
  count: number = 10,
): string[] {
  const matrix = getMatchupMatrix();
  const pokemonMatchups = matrix.get(pokemon);

  if (!pokemonMatchups) return [];

  const losses: Array<{ opponent: string; rating: number }> = [];

  for (const opponent of pokemonMatchups.keys()) {
    const rating = getMatchupResult(pokemon, opponent);
    if (rating !== null && rating < 500) {
      losses.push({ opponent, rating });
    }
  }

  // Sort by rating (lowest = worst loss)
  losses.sort((a, b) => a.rating - b.rating);

  return losses.slice(0, count).map((l) => l.opponent);
}

/**
 * Check if a Pokemon counters any of the specified threats
 * Returns count of threats this Pokemon beats
 */
export function countersThreats(pokemon: string, threats: string[]): number {
  let counterCount = 0;

  for (const threat of threats) {
    if (winsMatchup(pokemon, threat)) {
      counterCount++;
    }
  }

  return counterCount;
}

/**
 * Calculate matchup quality score for a Pokemon (0-1 scale)
 * Combines mean and median battle ratings
 */
export function getMatchupQualityScore(pokemon: string): number {
  const mean = getMeanBattleRating(pokemon);
  const median = getMedianBattleRating(pokemon);

  // Normalize from 0-1000 scale to 0-1
  // 500 = 0.5 (neutral), >500 = positive, <500 = negative
  const meanScore = mean / 1000;
  const medianScore = median / 1000;

  // Weight both equally - mean for overall performance, median for consistency
  return (meanScore + medianScore) / 2;
}
