import { getPlayPokemonLineupKey } from './lineupEnumeration';
import {
  compareScoredLineups,
  scoreOrderedLineup,
  type LineupScoreResult,
  type LineupScoringContext,
} from './lineupScoring';
import type { TournamentPlan } from './opponentRosterEvaluation';
import { validateTeamUniqueness } from '@/lib/data/pokemon';
import type { OrderedLineup, RecommendedLineup } from '@/lib/types';

const DEFAULT_RECOMMENDATION_LIMIT = 5;

/** Options for converting bounded lineup diagnostics into API-ready output. */
export interface PlayPokemonRosterRecommendationOptions {
  limit?: number;
  plans?: readonly TournamentPlan[];
}

/** API-ready lineup recommendations for a PlayPokemon roster. */
export interface PlayPokemonRosterRecommendationResult {
  recommendedLineups: RecommendedLineup[];
}

/** Options for selecting a role-ordered GBL lineup recommendation. */
export interface GblLineupRecommendationOptions {
  context?: LineupScoringContext;
  scoreLineup?: (lineup: OrderedLineup) => LineupScoreResult;
}

/**
 * Builds bounded PlayPokemon lineup recommendations from pre-scored finalist
 * lineups without enumerating or returning all 120 possible pick-3 lineups.
 */
export function buildPlayPokemonRosterRecommendations(
  lineupScores: LineupScoreResult[],
  options: PlayPokemonRosterRecommendationOptions = {},
): PlayPokemonRosterRecommendationResult {
  const limit = Math.max(0, options.limit ?? DEFAULT_RECOMMENDATION_LIMIT);
  const planByOrder = new Map(
    options.plans?.map((plan) => [getPlayPokemonLineupKey(plan.lineup), plan]),
  );
  const sorted = lineupScores.toSorted((a, b) => {
    if (!options.plans) return compareScoredLineups(a, b);
    const first = planByOrder.get(getPlayPokemonLineupKey(a.lineup));
    const second = planByOrder.get(getPlayPokemonLineupKey(b.lineup));
    return (
      (second?.lowerTail ?? -1) - (first?.lowerTail ?? -1) ||
      (second?.typical ?? -1) - (first?.typical ?? -1) ||
      b.scoreBreakdown.components.role - a.scoreBreakdown.components.role ||
      getPlayPokemonLineupKey(a.lineup).localeCompare(
        getPlayPokemonLineupKey(b.lineup),
      )
    );
  });
  const seen = new Set<string>();
  const distinct = sorted.filter((score) => {
    const id = [score.lineup.lead, score.lineup.switch, score.lineup.closer]
      .sort()
      .join('|');
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const selected = new Set(distinct);
  const recommendedLineups = [
    ...distinct,
    ...sorted.filter((score) => !selected.has(score)),
  ]
    .slice(0, limit)
    .map(toRecommendedLineup);

  return {
    recommendedLineups,
  };
}

/** Builds the single best role-ordered lineup recommendation for a GBL team. */
export function buildGblLineupRecommendation(
  team: string[],
  options: GblLineupRecommendationOptions = {},
): RecommendedLineup {
  if (team.length !== 3) {
    throw new Error('GBL lineup recommendations require exactly 3 Pokemon.');
  }

  if (!validateTeamUniqueness(team) || new Set(team).size !== 3) {
    throw new Error('GBL lineup recommendations require 3 unique Pokemon.');
  }

  const scoreLineup = createGblLineupScorer(options);
  const bestLineup = enumerateGblOrderedLineups(team)
    .map(scoreLineup)
    .toSorted(compareScoredLineups)[0];

  return toRecommendedLineup(bestLineup);
}

function createGblLineupScorer(
  options: GblLineupRecommendationOptions,
): (lineup: OrderedLineup) => LineupScoreResult {
  if (options.scoreLineup) {
    return options.scoreLineup;
  }

  if (!options.context) {
    throw new Error(
      'GBL lineup recommendations require a scoring context or scorer.',
    );
  }

  return (lineup) => scoreOrderedLineup(lineup, options.context!);
}

function enumerateGblOrderedLineups(team: string[]): OrderedLineup[] {
  const lineups: OrderedLineup[] = [];

  for (const lead of team) {
    for (const switchPokemon of team) {
      if (switchPokemon === lead) {
        continue;
      }

      const closer = team.find(
        (speciesId) => speciesId !== lead && speciesId !== switchPokemon,
      );
      if (!closer) {
        continue;
      }

      lineups.push({ lead, switch: switchPokemon, closer });
    }
  }

  return lineups;
}

function toRecommendedLineup(
  scoreResult: LineupScoreResult,
): RecommendedLineup {
  return {
    lineup: scoreResult.lineup,
    score: scoreResult.score,
    scoreBreakdown: scoreResult.scoreBreakdown,
    coverageMetrics: scoreResult.coverageMetrics,
    coveredThreats: [...scoreResult.coveredThreats],
    weaknesses: [...scoreResult.weaknesses],
    diagnosticLabel: scoreResult.diagnosticLabel,
  };
}
