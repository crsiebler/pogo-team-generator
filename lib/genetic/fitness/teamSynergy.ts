import { getPokemonBySpeciesId } from '../../data/pokemon';
import {
  getAllRankingsForPokemon,
  speciesIdToRankingName,
} from '../../data/rankings';
import { calculateTeamCoverage, getTopThreats } from '../../data/simulations';
import type { Chromosome, TournamentMode } from '../../types';

/**
 * Calculate team coverage matrix score (40% weight)
 * Ensures team has 2+ counters for each meta threat across shield scenarios
 */
function calculateTeamCoverageMatrix(team: string[]): number {
  const metaThreats = getTopThreats(100); // Sample top 100 threats
  const teamPokemon = team
    .map((id) => getPokemonBySpeciesId(id))
    .filter(Boolean);

  if (teamPokemon.length === 0 || metaThreats.length === 0) return 0;

  let totalCoverage = 0;

  for (const threat of metaThreats) {
    let counters = 0;

    // Check how many team members beat this threat
    for (const pokemon of teamPokemon) {
      const threatName = threat; // threat is already a string (Pokemon name)
      const teamSpeciesId = pokemon!.speciesId;
      const coverage = calculateTeamCoverage([teamSpeciesId], [threatName]);

      if (coverage > 0.5) {
        // > 500 rating = win
        counters++;
      }
    }

    // Scoring: 0 counters = 0, 1 counter = 0.5, 2+ counters = 1.0
    const threatCoverage = counters >= 2 ? 1.0 : counters === 1 ? 0.5 : 0.0;
    totalCoverage += threatCoverage;
  }

  return totalCoverage / metaThreats.length;
}

/**
 * Calculate shield scenario balance (20% weight)
 * Ensures team performs well across all shield scenarios using weighted average
 */
function calculateShieldScenarioBalance(team: string[]): number {
  const metaThreats = getTopThreats(50); // Sample top 50 threats
  let totalBalance = 0;

  for (const threat of metaThreats) {
    const threatName = threat; // threat is already a string (Pokemon name)
    const teamSpeciesIds = team;

    const coverage = calculateTeamCoverage(teamSpeciesIds, [threatName]);

    // Weight coverage (any win is good, but consistency across scenarios matters)
    totalBalance += Math.min(coverage, 1.0);
  }

  return totalBalance / metaThreats.length;
}

/**
 * Calculate core break penalty (15% weight)
 * Penalizes if top-ranked threats beat 2/3 of the team
 */
function calculateCoreBreakPenalty(team: string[]): number {
  const topThreats = getTopThreats(30); // Top 30 threats
  let penalty = 0;

  for (const threat of topThreats) {
    const threatName = threat; // threat is already a string (Pokemon name)
    const teamSpeciesIds = team;

    const coverage = calculateTeamCoverage(teamSpeciesIds, [threatName]);

    // If threat beats most of team (low coverage), add penalty
    if (coverage < 0.4) {
      // Threat beats >60% of team
      penalty += 1.0;
    } else if (coverage < 0.7) {
      // Threat beats >30% of team
      penalty += 0.5;
    }
  }

  // Return inverse score (lower penalty = higher score)
  const maxPenalty = topThreats.length;
  return Math.max(0, 1.0 - penalty / maxPenalty);
}

/**
 * Calculate move diversity (10% weight)
 * Penalizes teams with duplicate fast moves
 */
function calculateMoveDiversity(team: string[]): number {
  const teamPokemon = team
    .map((id) => getPokemonBySpeciesId(id))
    .filter(Boolean);

  if (teamPokemon.length === 0) return 0;

  const fastMoves = new Set<string>();

  for (const pokemon of teamPokemon) {
    // Use first fast move as representative
    if (pokemon!.fastMoves.length > 0) {
      const moveName = pokemon!.fastMoves[0];
      if (fastMoves.has(moveName)) {
        // Duplicate found - penalize
        return Math.max(0, 1.0 - 0.5); // -50% penalty for any duplicate
      }
      fastMoves.add(moveName);
    }
  }

  return 1.0; // Perfect diversity
}

/**
 * Calculate individual quality score (15% weight)
 * Reduced ranking weight with capped scores
 */
function calculateIndividualQuality(team: string[]): number {
  let totalScore = 0;
  let validCount = 0;

  for (const speciesId of team) {
    const rankingName = speciesIdToRankingName(speciesId);
    const rankings = getAllRankingsForPokemon(rankingName);

    if (rankings.average > 0) {
      // Cap ranking scores so #1 and #50 aren't vastly different
      const cappedScore = Math.min(rankings.average, 95) / 100;
      totalScore += cappedScore;
      validCount++;
    }
  }

  if (validCount === 0) return 0;
  return totalScore / validCount;
}

/**
 * Main team synergy fitness function
 * Focuses on team-level coverage and redundancy rather than individual perfection
 */
export function calculateFitness(
  chromosome: Chromosome,
  mode: TournamentMode,
): number {
  const { team } = chromosome;

  // Team-level analysis (85% weight)
  const coverageMatrix = calculateTeamCoverageMatrix(team) * 0.4;
  const shieldBalance = calculateShieldScenarioBalance(team) * 0.2;
  const coreBreakPenalty = calculateCoreBreakPenalty(team) * 0.15;
  const moveDiversity = calculateMoveDiversity(team) * 0.1;

  // Individual quality (15% weight - reduced from 21%)
  const individualQuality = calculateIndividualQuality(team) * 0.15;

  const teamSynergyScore =
    coverageMatrix +
    shieldBalance +
    coreBreakPenalty +
    moveDiversity +
    individualQuality;

  // Mode-specific adjustments (minimal for team synergy)
  let modeBonus = 0;
  if (mode === 'GBL') {
    modeBonus += 0.1; // Slight bonus for GBL teams
  }

  return teamSynergyScore + modeBonus;
}
