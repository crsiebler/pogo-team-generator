import type { BattleFormatId } from '@/lib/data/battleFormats';
import {
  getRoleBasedThreatSpeciesIds,
  speciesIdToRankingName,
} from '@/lib/data/rankings';
import { getMatchupResult } from '@/lib/data/simulations';
import type {
  ThreatAnalysis,
  ThreatAnalysisEntry,
  ThreatSeverityTier,
} from '@/lib/types';

const THREATS_PER_ROLE = 100;

/**
 * Build ranked threat analysis for a generated team.
 */
export function buildThreatAnalysis(
  team: string[],
  formatId?: BattleFormatId,
): ThreatAnalysis {
  const threatSpeciesIds = getRoleBasedThreatSpeciesIds(
    THREATS_PER_ROLE,
    formatId,
  );

  const entries: ThreatAnalysisEntry[] = threatSpeciesIds.flatMap(
    (threatSpeciesId, index) => {
      const ratings = team
        .map((teamMember) =>
          getMatchupResult(teamMember, threatSpeciesId, formatId),
        )
        .filter((rating): rating is number => rating !== null);

      if (ratings.length === 0) {
        return [];
      }

      const rank = index + 1;
      const teamAnswers = ratings.filter((rating) => rating > 500).length;

      return [
        {
          speciesId: threatSpeciesId,
          pokemon: speciesIdToRankingName(threatSpeciesId),
          rank,
          teamAnswers,
          severityTier: calculateThreatSeverity(rank, teamAnswers),
        },
      ];
    },
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
