import { scoreMatchupRating } from './matchupScoring';
import type { PlayPokemonRosterScoreResult } from './rosterScoring';
import {
  getAssignedMovesetVariantId,
  MAX_ROSTER_MOVESET_ASSIGNMENTS,
} from '@/lib/genetic/moveset';
import type {
  Chromosome,
  FinalistRerankingStats,
  MovesetVariantId,
  RosterMovesetAssignment,
} from '@/lib/types';

export const MAX_ASSIGNMENTS_PER_FINALIST = MAX_ROSTER_MOVESET_ASSIGNMENTS;
export const MAX_FULLY_SCORED_ASSIGNMENTS_PER_FINALIST = 12;

/** Injectable boundaries for deterministic finalist assignment reranking. */
export interface FinalistRerankingDependencies {
  readonly topThreats: readonly string[];
  readonly fullMetaThreats: readonly string[];
  getAssignments: (
    roster: readonly string[],
  ) => readonly RosterMovesetAssignment[];
  getMatchupRating: (
    speciesId: string,
    opponentSpeciesId: string,
    variantId: MovesetVariantId | undefined,
  ) => number | null;
  scoreAssignment: (
    finalist: Chromosome,
    assignment: RosterMovesetAssignment,
    lightweightScore: number,
  ) => PlayPokemonRosterScoreResult;
  getCanonicalRosterKey: (roster: readonly string[]) => string;
}

/** Selected finalist, fixed assignment, full score, and bounded-work counters. */
export interface FinalistRerankingResult {
  readonly finalist: Chromosome;
  readonly assignment: RosterMovesetAssignment;
  readonly score: PlayPokemonRosterScoreResult;
  readonly stats: Omit<FinalistRerankingStats, 'lineupCache'>;
}

interface PrefilteredAssignment {
  readonly assignment: RosterMovesetAssignment;
  readonly lightweightScore: number;
}

interface ScoredFinalistAssignment extends PrefilteredAssignment {
  readonly finalist: Chromosome;
  readonly score: PlayPokemonRosterScoreResult;
}

/**
 * Approximate assignment quality from aggregate simulation matrices only.
 * The objective rewards the best three roster answers per threat and weights
 * top-meta evidence 70/30 over full-meta evidence. Full lineup scoring remains
 * authoritative after this bounded prefilter.
 */
export function scoreLightweightRosterAssignment(
  assignment: RosterMovesetAssignment,
  topThreats: readonly string[],
  fullMetaThreats: readonly string[],
  getMatchupRating: FinalistRerankingDependencies['getMatchupRating'],
): number {
  const speciesIds = Object.keys(assignment.variantsBySpeciesId).toSorted();
  const topMetaScore = scoreThreatPool(
    speciesIds,
    unique(topThreats),
    assignment,
    getMatchupRating,
  );
  const fullMetaScore = scoreThreatPool(
    speciesIds,
    unique(fullMetaThreats),
    assignment,
    getMatchupRating,
  );
  const pools = [
    { score: topMetaScore, weight: 0.7 },
    { score: fullMetaScore, weight: 0.3 },
  ].filter(
    (pool): pool is { score: number; weight: number } =>
      pool.score !== undefined,
  );
  if (pools.length === 0) {
    return 0;
  }
  const totalWeight = sum(pools.map(({ weight }) => weight));
  return sum(pools.map(({ score, weight }) => score * weight)) / totalWeight;
}

/** Prefilter assignments and rerank default-scored finalists by full fitness. */
export function rerankRosterFinalists(
  finalists: readonly Chromosome[],
  dependencies: FinalistRerankingDependencies,
): FinalistRerankingResult {
  if (finalists.length === 0) {
    throw new Error('At least one default-scored finalist is required.');
  }

  let assignmentEvaluationCount = 0;
  let fullScoreCount = 0;
  const scoredFinalists: ScoredFinalistAssignment[] = [];

  for (const finalist of finalists) {
    const assignments = dependencies.getAssignments(finalist.team);
    if (
      assignments.length === 0 ||
      assignments.length > MAX_ASSIGNMENTS_PER_FINALIST
    ) {
      throw new Error(
        `Finalist assignments must contain between 1 and ${MAX_ASSIGNMENTS_PER_FINALIST} candidates.`,
      );
    }
    const matchupCache = new Map<string, number | null>();
    const getCachedMatchupRating: FinalistRerankingDependencies['getMatchupRating'] =
      (speciesId, opponentSpeciesId, variantId) => {
        const key = JSON.stringify([
          speciesId,
          opponentSpeciesId,
          variantId ?? null,
        ]);
        if (matchupCache.has(key)) {
          return matchupCache.get(key)!;
        }
        const rating = dependencies.getMatchupRating(
          speciesId,
          opponentSpeciesId,
          variantId,
        );
        matchupCache.set(key, rating);
        return rating;
      };

    const prefiltered = assignments
      .map((assignment): PrefilteredAssignment => {
        assignmentEvaluationCount++;
        return {
          assignment,
          lightweightScore: scoreLightweightRosterAssignment(
            assignment,
            dependencies.topThreats,
            dependencies.fullMetaThreats,
            getCachedMatchupRating,
          ),
        };
      })
      .toSorted(comparePrefilteredAssignments)
      .slice(0, MAX_FULLY_SCORED_ASSIGNMENTS_PER_FINALIST);

    const fullyScored = prefiltered.map((candidate) => {
      fullScoreCount++;
      const score = dependencies.scoreAssignment(
        finalist,
        candidate.assignment,
        candidate.lightweightScore,
      );
      if (
        !Number.isFinite(score.fitness) ||
        score.fitness !== score.scoreBreakdown.score ||
        score.evaluatedLineupCount !== 120
      ) {
        throw new Error(
          'Variant-aware finalist fitness must equal its score breakdown and must evaluate all 120 ordered lineups.',
        );
      }
      return { ...candidate, finalist, score };
    });
    scoredFinalists.push(
      fullyScored.toSorted(compareAssignmentsByFullScore)[0],
    );
  }

  const winner = scoredFinalists.toSorted((first, second) => {
    if (first.score.fitness !== second.score.fitness) {
      return second.score.fitness - first.score.fitness;
    }
    if (first.finalist.fitness !== second.finalist.fitness) {
      return second.finalist.fitness - first.finalist.fitness;
    }
    return dependencies
      .getCanonicalRosterKey(first.finalist.team)
      .localeCompare(dependencies.getCanonicalRosterKey(second.finalist.team));
  })[0];

  return {
    finalist: winner.finalist,
    assignment: winner.assignment,
    score: winner.score,
    stats: {
      finalistCount: finalists.length,
      assignmentEvaluationCount,
      fullScoreCount,
    },
  };
}

function scoreThreatPool(
  speciesIds: readonly string[],
  threats: readonly string[],
  assignment: RosterMovesetAssignment,
  getMatchupRating: FinalistRerankingDependencies['getMatchupRating'],
): number | undefined {
  const threatScores = threats.flatMap((threat) => {
    const answerScores = speciesIds
      .flatMap((speciesId) => {
        const rating = getMatchupRating(
          speciesId,
          threat,
          getAssignedMovesetVariantId(assignment, speciesId),
        );
        return rating === null ? [] : [scoreMatchupRating(rating)];
      })
      .toSorted((first, second) => second - first)
      .slice(0, 3);
    if (answerScores.length === 0) {
      return [];
    }
    const depthWeights = [0.55, 0.3, 0.15].slice(0, answerScores.length);
    const totalWeight = sum(depthWeights);
    return [
      sum(answerScores.map((score, index) => score * depthWeights[index])) /
        totalWeight,
    ];
  });
  return threatScores.length > 0
    ? sum(threatScores) / threatScores.length
    : undefined;
}

function comparePrefilteredAssignments(
  first: PrefilteredAssignment,
  second: PrefilteredAssignment,
): number {
  if (first.lightweightScore !== second.lightweightScore) {
    return second.lightweightScore - first.lightweightScore;
  }
  const defaultDifference =
    countAlternates(first.assignment) - countAlternates(second.assignment);
  return defaultDifference !== 0
    ? defaultDifference
    : first.assignment.fingerprint.localeCompare(second.assignment.fingerprint);
}

function compareAssignmentsByFullScore(
  first: ScoredFinalistAssignment,
  second: ScoredFinalistAssignment,
): number {
  if (first.score.fitness !== second.score.fitness) {
    return second.score.fitness - first.score.fitness;
  }
  return comparePrefilteredAssignments(first, second);
}

function countAlternates(assignment: RosterMovesetAssignment): number {
  return Object.values(assignment.variantsBySpeciesId).filter(
    ({ isDefault }) => !isDefault,
  ).length;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
