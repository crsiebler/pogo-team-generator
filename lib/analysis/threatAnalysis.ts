import type {
  OptimizerThreatScore,
  ThreatAnalysis,
  ThreatAnalysisEntry,
  ThreatSeverityTier,
} from '@/lib/types';

/**
 * Build ranked threat analysis from the assignment-aware final score.
 */
export function buildThreatAnalysis(
  threatScore: OptimizerThreatScore | undefined,
): ThreatAnalysis {
  const entries: ThreatAnalysisEntry[] = (threatScore?.overallTeamThreats ?? [])
    .map(({ speciesId, pokemon, rank, teamAnswers }) => ({
      speciesId,
      pokemon,
      rank,
      teamAnswers,
      severityTier: calculateThreatSeverity(rank, teamAnswers),
    }))
    .toSorted((first, second) =>
      first.rank !== second.rank
        ? first.rank - second.rank
        : first.speciesId.localeCompare(second.speciesId),
    );

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
