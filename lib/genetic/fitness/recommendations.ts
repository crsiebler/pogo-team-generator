import {
  scoreOrderedLineup,
  type LineupScoreResult,
  type LineupScoringContext,
} from './lineupScoring';
import { validateTeamUniqueness } from '@/lib/data/pokemon';
import type {
  BenchUtility,
  LineupRole,
  OrderedLineup,
  RecommendedLineup,
} from '@/lib/types';

const DEFAULT_RECOMMENDATION_LIMIT = 5;
const DEFAULT_LOW_UTILITY_THRESHOLD = 0.2;

/** Options for converting bounded lineup diagnostics into API-ready output. */
export interface PlayPokemonRosterRecommendationOptions {
  limit?: number;
  lowUtilityThreshold?: number;
}

/** API-ready lineup recommendations and bench utility for a PlayPokemon roster. */
export interface PlayPokemonRosterRecommendationResult {
  recommendedLineups: RecommendedLineup[];
  benchUtility: BenchUtility[];
}

/** Options for selecting a role-ordered GBL lineup recommendation. */
export interface GblLineupRecommendationOptions {
  context?: LineupScoringContext;
  scoreLineup?: (lineup: OrderedLineup) => LineupScoreResult;
}

/**
 * Builds bounded PlayPokemon lineup recommendations from pre-scored finalist
 * lineups without enumerating or returning all 60 possible pick-3 lineups.
 */
export function buildPlayPokemonRosterRecommendations(
  roster: string[],
  lineupScores: LineupScoreResult[],
  options: PlayPokemonRosterRecommendationOptions = {},
): PlayPokemonRosterRecommendationResult {
  const limit = Math.max(0, options.limit ?? DEFAULT_RECOMMENDATION_LIMIT);
  const lowUtilityThreshold =
    options.lowUtilityThreshold ?? DEFAULT_LOW_UTILITY_THRESHOLD;
  const recommendedLineups = lineupScores
    .toSorted((first, second) => second.score - first.score)
    .slice(0, limit)
    .map(toRecommendedLineup);

  return {
    recommendedLineups,
    benchUtility: buildRecommendedBenchUtility(
      roster,
      recommendedLineups,
      lowUtilityThreshold,
    ),
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
    .toSorted((first, second) => second.score - first.score)[0];

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
    coverageMetrics: scoreResult.coverageMetrics,
    coveredThreats: [...scoreResult.coveredThreats],
    weaknesses: [...scoreResult.weaknesses],
    diagnosticLabel: scoreResult.diagnosticLabel,
    ...(scoreResult.resourcePathMetrics
      ? { resourcePathMetrics: scoreResult.resourcePathMetrics }
      : {}),
  };
}

function buildRecommendedBenchUtility(
  roster: string[],
  recommendedLineups: RecommendedLineup[],
  lowUtilityThreshold: number,
): BenchUtility[] {
  const utilityBySpecies = new Map<string, BenchUtility>();
  for (const speciesId of roster) {
    utilityBySpecies.set(speciesId, {
      speciesId,
      utilityScore: 0,
      totalAppearances: 0,
      leadAppearances: 0,
      switchAppearances: 0,
      closerAppearances: 0,
      warnings: [],
    });
  }

  for (const recommendation of recommendedLineups) {
    incrementRoleAppearance(utilityBySpecies, recommendation.lineup, 'lead');
    incrementRoleAppearance(utilityBySpecies, recommendation.lineup, 'switch');
    incrementRoleAppearance(utilityBySpecies, recommendation.lineup, 'closer');
  }

  return roster.map((speciesId) => {
    const utility = utilityBySpecies.get(speciesId)!;
    utility.utilityScore =
      recommendedLineups.length > 0
        ? utility.totalAppearances / recommendedLineups.length
        : 0;

    if (utility.totalAppearances === 0) {
      utility.warnings.push('unbringable');
    } else if (utility.utilityScore < lowUtilityThreshold) {
      utility.warnings.push('low-utility');
    }

    return utility;
  });
}

function incrementRoleAppearance(
  utilityBySpecies: Map<string, BenchUtility>,
  lineup: OrderedLineup,
  role: LineupRole,
): void {
  const utility = utilityBySpecies.get(lineup[role]);
  if (!utility) {
    return;
  }

  utility.totalAppearances++;
  if (role === 'lead') {
    utility.leadAppearances++;
  } else if (role === 'switch') {
    utility.switchAppearances++;
  } else {
    utility.closerAppearances++;
  }
}
