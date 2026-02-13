import type { CoreBreakerAnalysis, CoreBreakerSeverityTier } from '@/lib/types';
import type { ThreatAnalysisEntry } from '@/lib/types';

/**
 * Build core-breaker analysis from ranked threats using team-size thresholds.
 */
export function buildCoreBreakerAnalysis(
  teamSize: number,
  threats: ThreatAnalysisEntry[],
): CoreBreakerAnalysis {
  const threshold = getCoreBreakerThreshold(teamSize);

  const entries = threats
    .filter((threat) => threat.teamAnswers <= threshold)
    .map((threat) => ({
      pokemon: threat.pokemon,
      rank: threat.rank,
      teamAnswers: threat.teamAnswers,
      severityTier: calculateCoreBreakerSeverity(teamSize, threat.teamAnswers),
    }))
    .sort((left, right) => left.rank - right.rank);

  return {
    threshold,
    entries,
  };
}

/**
 * Determine the maximum number of answers that still qualifies as a
 * core-breaker risk for the given team size.
 */
export function getCoreBreakerThreshold(teamSize: number): number {
  if (teamSize <= 3) {
    return 1;
  }

  return 2;
}

/**
 * Convert answer counts into core-breaker severity tiers.
 */
export function calculateCoreBreakerSeverity(
  teamSize: number,
  teamAnswers: number,
): CoreBreakerSeverityTier {
  const normalizedAnswers = Math.max(0, teamAnswers);

  if (teamSize <= 3) {
    return normalizedAnswers === 0 ? 'high' : 'medium';
  }

  return normalizedAnswers <= 1 ? 'high' : 'medium';
}
