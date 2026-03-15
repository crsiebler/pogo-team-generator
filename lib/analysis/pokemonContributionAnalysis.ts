import type { BattleFormatId } from '@/lib/data/battleFormats';
import { speciesIdToRankingName } from '@/lib/data/rankings';
import { winsMatchup } from '@/lib/data/simulations';
import type {
  PokemonContributionAnalysis,
  PokemonContributionRiskTier,
  ThreatAnalysisEntry,
} from '@/lib/types';

const HIGH_FRAGILITY_THRESHOLD = 6;
const MODERATE_FRAGILITY_THRESHOLD = 3;

/**
 * Build per-Pokemon contribution details from existing team threat analysis.
 */
export function buildPokemonContributionAnalysis(
  team: string[],
  threatEntries: ThreatAnalysisEntry[],
  formatId?: BattleFormatId,
): PokemonContributionAnalysis {
  const entries = team.map((speciesId) => {
    const pokemon = speciesIdToRankingName(speciesId);

    const threatsHandled = threatEntries.filter((threat) =>
      winsMatchup(speciesId, threat.speciesId, formatId),
    ).length;

    const coverageAdded = threatEntries.filter(
      (threat) =>
        threat.teamAnswers === 1 &&
        winsMatchup(speciesId, threat.speciesId, formatId),
    ).length;

    const highSeverityRelief = threatEntries.filter(
      (threat) =>
        (threat.severityTier === 'high' ||
          threat.severityTier === 'critical') &&
        winsMatchup(speciesId, threat.speciesId, formatId),
    ).length;

    const fragilityRiskTier = getFragilityRiskTier(coverageAdded);

    return {
      speciesId,
      pokemon,
      threatsHandled,
      coverageAdded,
      highSeverityRelief,
      fragilityRiskTier,
      rationale: buildContributionRationale({
        threatsHandled,
        coverageAdded,
        highSeverityRelief,
        fragilityRiskTier,
      }),
    };
  });

  return { entries };
}

/**
 * Convert coverage-added volume into a replacement fragility tier.
 */
export function getFragilityRiskTier(
  coverageAdded: number,
): PokemonContributionRiskTier {
  if (coverageAdded >= HIGH_FRAGILITY_THRESHOLD) {
    return 'high';
  }

  if (coverageAdded >= MODERATE_FRAGILITY_THRESHOLD) {
    return 'moderate';
  }

  return 'low';
}

interface ContributionRationaleInput {
  threatsHandled: number;
  coverageAdded: number;
  highSeverityRelief: number;
  fragilityRiskTier: PokemonContributionRiskTier;
}

/**
 * Build concise, user-facing rationale without exposing scoring formulas.
 */
function buildContributionRationale({
  threatsHandled,
  coverageAdded,
  highSeverityRelief,
  fragilityRiskTier,
}: ContributionRationaleInput): string {
  return `Covers ${threatsHandled} ranked threats, adds ${coverageAdded} unique team answers, and stabilizes ${highSeverityRelief} high-pressure matchups. Replacement fragility is ${fragilityRiskTier}.`;
}
