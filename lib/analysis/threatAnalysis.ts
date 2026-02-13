import { getTopPokemon, speciesIdToRankingName } from '@/lib/data/rankings';
import { winsMatchup } from '@/lib/data/simulations';
import type {
  ThreatAnalysis,
  ThreatAnalysisEntry,
  ThreatSeverityTier,
} from '@/lib/types';

const TOP_THREAT_COUNT = 50;

/**
 * Build ranked threat analysis for a generated team.
 */
export function buildThreatAnalysis(team: string[]): ThreatAnalysis {
  const teamNames = team.map((speciesId) => speciesIdToRankingName(speciesId));
  const topThreats = getTopPokemon('overall', TOP_THREAT_COUNT).slice(
    0,
    TOP_THREAT_COUNT,
  );

  const entries: ThreatAnalysisEntry[] = topThreats.map((threat, index) => {
    const rank = index + 1;
    const teamAnswers = teamNames.filter((teamMember) =>
      winsMatchup(teamMember, threat.Pokemon),
    ).length;

    return {
      pokemon: threat.Pokemon,
      rank,
      teamAnswers,
      severityTier: calculateThreatSeverity(rank, teamAnswers),
    };
  });

  return {
    evaluatedCount: entries.length,
    entries,
  };
}

/**
 * Convert threat rank and team answers into a display-friendly severity tier.
 */
export function calculateThreatSeverity(
  rank: number,
  teamAnswers: number,
): ThreatSeverityTier {
  const normalizedAnswers = Math.max(0, teamAnswers);
  const boundedRank = Math.max(1, rank);

  let severityScore = 0;

  if (normalizedAnswers === 0) {
    severityScore = 3;
  } else if (normalizedAnswers === 1) {
    severityScore = 2;
  } else if (normalizedAnswers === 2) {
    severityScore = 1;
  }

  if (boundedRank <= 10) {
    severityScore += 1;
  }

  if (boundedRank > 100) {
    severityScore -= 1;
  }

  if (severityScore >= 3) {
    return 'critical';
  }

  if (severityScore === 2) {
    return 'high';
  }

  if (severityScore === 1) {
    return 'medium';
  }

  return 'low';
}
