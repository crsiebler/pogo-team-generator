import type { BattleFormatId } from './battleFormats';
import { DEFAULT_BATTLE_FORMAT_ID, getBattleFormatById } from './battleFormats';
import {
  normalizeToChoosableSpeciesId,
  speciesIdToSpeciesName,
} from './pokemon';
import {
  getAllRankingsForPokemon,
  getRoleBasedThreatSpeciesIds,
} from './rankings';
import {
  createRuntimeSimulationRepository,
  MovesetVariantSimulationDataError,
  type RuntimeMatchupMatrix,
  type RuntimeMatchupResult,
} from './runtimeSimulationRepository';
import { readRuntimeSimulationSnapshotFile } from './runtimeSimulationSnapshotFile';
import type { MovesetVariant, MovesetVariantId } from '@/lib/types';

/**
 * Simulation matchup result for a specific shield scenario
 */
export type MatchupResult = RuntimeMatchupResult;

/**
 * Matchup matrix keyed by speciesId.
 */
type MatchupMatrix = RuntimeMatchupMatrix;

/**
 * Raised when requested format simulation files are unavailable.
 */
export class MissingSimulationDataError extends Error {
  readonly formatId: BattleFormatId;

  constructor(formatId: BattleFormatId) {
    const battleFormat = getBattleFormatById(formatId);
    const formatDescriptor = battleFormat
      ? `${battleFormat.label} (${battleFormat.cup}/${battleFormat.cp})`
      : formatId;

    super(
      `Simulation data missing for ${formatDescriptor}. Run simulation sync for this format before generating teams.`,
    );
    this.name = 'MissingSimulationDataError';
    this.formatId = formatId;
  }
}

/**
 * Extract the display species name from simulation row value.
 * Example: "Aegislash (Shield) AS+FC/GB" -> "Aegislash (Shield)"
 */
export function extractSpeciesNameFromSimulationCell(value: string): string {
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
 * Resolve selected format id with Great League fallback.
 */
function resolveFormatId(formatId?: BattleFormatId): BattleFormatId {
  return formatId ?? DEFAULT_BATTLE_FORMAT_ID;
}

const runtimeSimulationRepository = createRuntimeSimulationRepository({
  rootPath: process.cwd(),
  readText: readRuntimeSimulationSnapshotFile,
});

/** Return manifest-declared active movesets for one species and format. */
export function getActiveMovesetVariants(
  speciesId: string,
  formatId?: BattleFormatId,
): readonly MovesetVariant[] {
  return runtimeSimulationRepository.getActiveVariants(
    speciesId,
    resolveFormatId(formatId),
  );
}

/** Return the schema and policy identity governing one format manifest. */
export function getMovesetVariantManifestPolicyIdentity(
  formatId?: BattleFormatId,
): Readonly<{ schemaVersion: number; policyVersion: string }> {
  return runtimeSimulationRepository.getManifestPolicyIdentity(
    resolveFormatId(formatId),
  );
}

/**
 * Get the matchup matrix (lazy loaded).
 */
export function getMatchupMatrix(formatId?: BattleFormatId): MatchupMatrix {
  const resolvedFormatId = resolveFormatId(formatId);
  return runtimeSimulationRepository.getDefaultMatchupMatrix(resolvedFormatId);
}

/**
 * Ensure simulation data exists for the selected format.
 */
export function ensureSimulationDataAvailable(formatId?: BattleFormatId): void {
  const resolvedFormatId = resolveFormatId(formatId);
  try {
    runtimeSimulationRepository.prepare(resolvedFormatId);
  } catch (error) {
    if (
      error instanceof MovesetVariantSimulationDataError &&
      error.code === 'manifest-missing'
    ) {
      throw new MissingSimulationDataError(resolvedFormatId);
    }
    throw error;
  }
  const matrix = getMatchupMatrix(resolvedFormatId);

  if (matrix.size === 0) {
    throw new MissingSimulationDataError(resolvedFormatId);
  }
}

/**
 * Get matchup result for a specific speciesId vs opponent speciesId.
 * Averages across shield scenarios with weighting: 1-1 shields = 50%, 0-0 = 30%, 2-2 = 20%.
 */
export function getMatchupResult(
  speciesId: string,
  opponentSpeciesId: string,
  formatId?: BattleFormatId,
  movesetVariantId?: MovesetVariantId,
): number | null {
  if (movesetVariantId) {
    return runtimeSimulationRepository.getMatchupResult(
      speciesId,
      movesetVariantId,
      opponentSpeciesId,
      resolveFormatId(formatId),
    );
  }
  const matrix = getMatchupMatrix(formatId);
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
 * Get matchup result for a specific shield scenario.
 */
export function getShieldScenarioMatchupResult(
  speciesId: string,
  opponentSpeciesId: string,
  shields: 0 | 1 | 2,
  formatId?: BattleFormatId,
  movesetVariantId?: MovesetVariantId,
): number | null {
  if (movesetVariantId) {
    return runtimeSimulationRepository.getShieldScenarioMatchupResult(
      speciesId,
      movesetVariantId,
      opponentSpeciesId,
      shields,
      resolveFormatId(formatId),
    );
  }
  const matrix = getMatchupMatrix(formatId);
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

  if (shields === 0) {
    return matchupData.shields0?.battleRating ?? null;
  }

  if (shields === 1) {
    return matchupData.shields1?.battleRating ?? null;
  }

  return matchupData.shields2?.battleRating ?? null;
}

/** Get a matchup rating for one explicit moveset and shield scenario. */
export function getMovesetVariantShieldScenarioMatchupResult(
  speciesId: string,
  movesetVariantId: MovesetVariantId,
  opponentSpeciesId: string,
  shields: 0 | 1 | 2,
  formatId?: BattleFormatId,
): number | null {
  return getShieldScenarioMatchupResult(
    speciesId,
    opponentSpeciesId,
    shields,
    formatId,
    movesetVariantId,
  );
}

/**
 * Check if speciesId wins matchup (battle rating > 500).
 */
export function winsMatchup(
  speciesId: string,
  opponentSpeciesId: string,
  formatId?: BattleFormatId,
): boolean {
  const rating = getMatchupResult(speciesId, opponentSpeciesId, formatId);
  return rating !== null && rating > 500;
}

/**
 * Get all opponent speciesIds that a speciesId loses to.
 */
export function getLosses(
  speciesId: string,
  formatId?: BattleFormatId,
): string[] {
  const matrix = getMatchupMatrix(formatId);
  const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
  const pokemonMatchups = matrix.get(canonicalSpeciesId);

  if (!pokemonMatchups) {
    return [];
  }

  const losses: string[] = [];

  for (const opponentSpeciesId of pokemonMatchups.keys()) {
    const rating = getMatchupResult(
      canonicalSpeciesId,
      opponentSpeciesId,
      formatId,
    );
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
  formatId?: BattleFormatId,
): number {
  const canonicalTeam = team.map(normalizeToChoosableSpeciesId);
  const canonicalThreats = threats.map(normalizeToChoosableSpeciesId);
  let coveredThreats = 0;

  for (const threatSpeciesId of canonicalThreats) {
    const hasCounter = canonicalTeam.some((speciesId) =>
      winsMatchup(speciesId, threatSpeciesId, formatId),
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
export function getTeamWeaknesses(
  team: string[],
  formatId?: BattleFormatId,
): string[] {
  const matrix = getMatchupMatrix(formatId);
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
      (speciesId) => !winsMatchup(speciesId, opponentSpeciesId, formatId),
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
export function getTopThreats(
  count: number = 50,
  formatId?: BattleFormatId,
): string[] {
  const matrix = getMatchupMatrix(formatId);
  const allSpeciesIds = Array.from(matrix.keys());

  const rankedSpecies = allSpeciesIds
    .map((speciesId) => {
      const displayName = speciesIdToSpeciesName(speciesId);
      const rankings = getAllRankingsForPokemon(displayName, formatId);
      return { speciesId, score: rankings.overall };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return rankedSpecies.slice(0, count).map((entry) => entry.speciesId);
}

/**
 * Get a deduplicated threat pool built from top N of each role ranking.
 * Filters to species that exist in simulation data when available.
 */
export function getTopThreatsByRole(
  topPerRole: number = 100,
  formatId?: BattleFormatId,
): string[] {
  const matrix = getMatchupMatrix(formatId);
  const threats = getRoleBasedThreatSpeciesIds(topPerRole, formatId).map(
    normalizeToChoosableSpeciesId,
  );

  if (matrix.size === 0) {
    return Array.from(new Set(threats));
  }

  const availableSpecies = new Set(matrix.keys());
  return Array.from(
    new Set(threats.filter((speciesId) => availableSpecies.has(speciesId))),
  );
}

/**
 * Get team weaknesses weighted by threatening Pokemon ranking.
 */
export function getWeightedTeamWeaknesses(
  team: string[],
  formatId?: BattleFormatId,
): Array<{ opponent: string; weight: number }> {
  const weaknesses = getTeamWeaknesses(team, formatId);

  return weaknesses.map((opponentSpeciesId) => {
    const rankings = getAllRankingsForPokemon(
      speciesIdToSpeciesName(opponentSpeciesId),
      formatId,
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
  threats?: string[],
  formatId?: BattleFormatId,
): Array<{ opponent: string; weight: number; counter: string }> {
  const canonicalTeam = team.map(normalizeToChoosableSpeciesId);
  const topThreats = threats ?? getTopThreats(topN, formatId);
  const singleCounters: Array<{
    opponent: string;
    weight: number;
    counter: string;
  }> = [];

  for (const threatSpeciesId of topThreats) {
    const counters: string[] = [];
    for (const speciesId of canonicalTeam) {
      if (winsMatchup(speciesId, threatSpeciesId, formatId)) {
        counters.push(speciesId);
      }
    }

    if (counters.length === 1) {
      const rankings = getAllRankingsForPokemon(
        speciesIdToSpeciesName(threatSpeciesId),
        formatId,
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
export function getMeanBattleRating(
  speciesId: string,
  formatId?: BattleFormatId,
  movesetVariantId?: MovesetVariantId,
): number {
  const matrix = getMatchupMatrix(formatId);
  const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
  const pokemonMatchups = matrix.get(canonicalSpeciesId);

  if (!pokemonMatchups) {
    return 500;
  }

  const ratings: number[] = [];

  for (const opponentSpeciesId of pokemonMatchups.keys()) {
    const rating = getMatchupResult(
      canonicalSpeciesId,
      opponentSpeciesId,
      formatId,
      movesetVariantId,
    );
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
export function getMedianBattleRating(
  speciesId: string,
  formatId?: BattleFormatId,
  movesetVariantId?: MovesetVariantId,
): number {
  const matrix = getMatchupMatrix(formatId);
  const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
  const pokemonMatchups = matrix.get(canonicalSpeciesId);

  if (!pokemonMatchups) {
    return 500;
  }

  const ratings: number[] = [];

  for (const opponentSpeciesId of pokemonMatchups.keys()) {
    const rating = getMatchupResult(
      canonicalSpeciesId,
      opponentSpeciesId,
      formatId,
      movesetVariantId,
    );
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
  formatId?: BattleFormatId,
): string[] {
  const matrix = getMatchupMatrix(formatId);
  const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
  const pokemonMatchups = matrix.get(canonicalSpeciesId);

  if (!pokemonMatchups) {
    return [];
  }

  const losses: Array<{ opponent: string; rating: number }> = [];

  for (const opponentSpeciesId of pokemonMatchups.keys()) {
    const rating = getMatchupResult(
      canonicalSpeciesId,
      opponentSpeciesId,
      formatId,
    );
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
export function countersThreats(
  speciesId: string,
  threats: string[],
  formatId?: BattleFormatId,
): number {
  let counterCount = 0;

  for (const threatSpeciesId of threats) {
    if (winsMatchup(speciesId, threatSpeciesId, formatId)) {
      counterCount++;
    }
  }

  return counterCount;
}

/**
 * Calculate matchup quality score (0-1 scale).
 */
export function getMatchupQualityScore(
  speciesId: string,
  formatId?: BattleFormatId,
  movesetVariantId?: MovesetVariantId,
): number {
  const mean = getMeanBattleRating(speciesId, formatId, movesetVariantId);
  const median = getMedianBattleRating(speciesId, formatId, movesetVariantId);
  const meanScore = mean / 1000;
  const medianScore = median / 1000;

  return (meanScore + medianScore) / 2;
}
