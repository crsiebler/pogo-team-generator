import { speciesIdToRankingName } from '@/lib/data/rankings';
import { getShieldScenarioMatchupResult } from '@/lib/data/simulations';
import type { ShieldScenarioAnalysis, ThreatAnalysisEntry } from '@/lib/types';

const SHIELD_SCENARIOS = [0, 1, 2] as const;

/**
 * Build shield-scenario coverage statistics from threat analysis entries.
 */
export function buildShieldScenarioAnalysis(
  team: string[],
  threats: ThreatAnalysisEntry[],
): ShieldScenarioAnalysis {
  const teamNames = team.map((speciesId) => speciesIdToRankingName(speciesId));

  const summaries = SHIELD_SCENARIOS.map((shieldCount) => {
    let evaluatedThreats = 0;
    let coveredThreats = 0;

    for (const threat of threats) {
      const ratings = teamNames
        .map((teamMember) =>
          getShieldScenarioMatchupResult(
            teamMember,
            threat.pokemon,
            shieldCount,
          ),
        )
        .filter((rating): rating is number => rating !== null);

      if (ratings.length === 0) {
        continue;
      }

      evaluatedThreats += 1;

      if (ratings.some((rating) => rating > 500)) {
        coveredThreats += 1;
      }
    }

    const coverageRate =
      evaluatedThreats > 0 ? coveredThreats / evaluatedThreats : 0;

    return {
      coveredThreats,
      evaluatedThreats,
      coverageRate,
    };
  });

  return {
    '0-0': summaries[0],
    '1-1': summaries[1],
    '2-2': summaries[2],
  };
}
