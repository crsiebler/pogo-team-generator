import type { BattleFormatId } from '@/lib/data/battleFormats';
import { getShieldScenarioMatchupResult } from '@/lib/data/simulations';
import type { ShieldScenarioAnalysis, ThreatAnalysisEntry } from '@/lib/types';

const SHIELD_SCENARIOS = [0, 1, 2] as const;

/**
 * Build shield-scenario coverage statistics from threat analysis entries.
 */
export function buildShieldScenarioAnalysis(
  team: string[],
  threats: ThreatAnalysisEntry[],
  formatId?: BattleFormatId,
): ShieldScenarioAnalysis {
  const summaries = SHIELD_SCENARIOS.map((shieldCount) => {
    let evaluatedThreats = 0;
    let coveredThreats = 0;

    for (const threat of threats) {
      let hasAnyData = false;
      let hasWin = false;

      for (const teamMember of team) {
        const rating = getShieldScenarioMatchupResult(
          teamMember,
          threat.speciesId,
          shieldCount,
          formatId,
        );

        if (rating === null) {
          continue;
        }

        hasAnyData = true;

        if (rating > 500) {
          hasWin = true;
          break;
        }
      }

      if (!hasAnyData) {
        continue;
      }

      evaluatedThreats += 1;

      if (hasWin) {
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
