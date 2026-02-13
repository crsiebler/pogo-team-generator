import { speciesIdToRankingName } from '@/lib/data/rankings';
import { winsMatchup } from '@/lib/data/simulations';
import type {
  PokemonContributionAnalysis,
  PokemonContributionAnalysisEntry,
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
): PokemonContributionAnalysis {
  const teamNames = team.map((speciesId) => speciesIdToRankingName(speciesId));

  const entries: PokemonContributionAnalysisEntry[] = team.map(
    (speciesId, index) => {
      const pokemonName = teamNames[index];

      const threatsHandled = threatEntries.filter((threat) =>
        winsMatchup(pokemonName, threat.pokemon),
      ).length;

      const coverageAdded = threatEntries.filter(
        (threat) =>
          threat.teamAnswers === 1 && winsMatchup(pokemonName, threat.pokemon),
      ).length;

      const highSeverityRelief = threatEntries.filter(
        (threat) =>
          (threat.severityTier === 'high' ||
            threat.severityTier === 'critical') &&
          winsMatchup(pokemonName, threat.pokemon),
      ).length;

      const fragilityRiskTier = getFragilityRiskTier(coverageAdded);

      return {
        speciesId,
        pokemon: pokemonName,
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
    },
  );

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
  const fragilityLabel =
    fragilityRiskTier === 'high'
      ? 'high'
      : fragilityRiskTier === 'moderate'
        ? 'moderate'
        : 'low';

  return `Covers ${threatsHandled} ranked threats, adds ${coverageAdded} unique team answers, and stabilizes ${highSeverityRelief} high-pressure matchups. Replacement fragility is ${fragilityLabel}.`;
}
