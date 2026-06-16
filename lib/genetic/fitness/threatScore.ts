import { scoreMatchupRating } from '@/lib/genetic/fitness/matchupScoring';
import type {
  OptimizerThreatScore,
  OptimizerThreatScoreEntry,
  OptimizerThreatScorePool,
  ThreatSeverityTier,
} from '@/lib/types';

const MATCHUP_WIN_THRESHOLD = 500;
const TOP_META_POOL_WEIGHT = 0.7;
const FULL_META_POOL_WEIGHT = 0.3;

/** Injectable threat-score context for deterministic optimizer diagnostics. */
export interface OptimizerThreatScoreContext {
  topThreats: string[];
  fullMetaThreats: string[];
  getThreatName: (speciesId: string) => string;
  getThreatRank: (speciesId: string) => number;
  getMatchupRating: (
    speciesId: string,
    threatSpeciesId: string,
  ) => number | null;
}

/** Configurable non-negative weighting for aggregate threat score pools. */
export interface OptimizerThreatScorePoolWeights {
  topMeta: number;
  fullMeta: number;
}

/**
 * Optional controls for lower-is-better threat diagnostics.
 * Weights are normalized over evaluated pools only. Invalid negative,
 * non-finite, or full-meta-dominant values fall back to defaults.
 */
export interface OptimizerThreatScoreOptions {
  poolWeights?: Partial<OptimizerThreatScorePoolWeights>;
}

/**
 * Calculates lower-is-better threat diagnostics for one team or lineup.
 */
export function calculateOptimizerThreatScore(
  speciesIds: string[],
  context: OptimizerThreatScoreContext,
  options: OptimizerThreatScoreOptions = {},
): OptimizerThreatScore {
  const topMetaThreats = calculateThreatEntries(
    speciesIds,
    context.topThreats,
    context,
  );
  const overallTeamThreats = calculateThreatEntries(
    speciesIds,
    uniquePreservingOrder([...context.topThreats, ...context.fullMetaThreats]),
    context,
  );
  const topMetaScore = calculatePoolThreatScore(topMetaThreats);
  const fullMetaThreats = calculateThreatEntries(
    speciesIds,
    context.fullMetaThreats,
    context,
  );
  const fullMetaScore = calculatePoolThreatScore(fullMetaThreats);
  const weights = normalizeThreatPoolWeights(
    resolvePoolWeights(options.poolWeights),
    { topMeta: topMetaScore, fullMeta: fullMetaScore },
  );

  return {
    score: clamp01(
      (topMetaScore ?? 0) * weights.topMeta +
        (fullMetaScore ?? 0) * weights.fullMeta,
    ),
    evaluatedCount: overallTeamThreats.length,
    topMetaThreats: sortThreatEntries(topMetaThreats),
    overallTeamThreats: sortThreatEntries(overallTeamThreats),
    pools: {
      topMeta: createThreatScorePool(
        topMetaScore,
        topMetaThreats,
        weights.topMeta,
      ),
      fullMeta: createThreatScorePool(
        fullMetaScore,
        fullMetaThreats,
        weights.fullMeta,
      ),
    },
  };
}

function createThreatScorePool(
  score: number | undefined,
  entries: OptimizerThreatScoreEntry[],
  weight: number,
): OptimizerThreatScorePool {
  return {
    score: score ?? null,
    evaluatedCount: entries.length,
    weight,
  };
}

function resolvePoolWeights(
  weights: Partial<OptimizerThreatScorePoolWeights> | undefined,
): OptimizerThreatScorePoolWeights {
  const resolvedWeights = {
    topMeta: sanitizePoolWeight(weights?.topMeta, TOP_META_POOL_WEIGHT),
    fullMeta: sanitizePoolWeight(weights?.fullMeta, FULL_META_POOL_WEIGHT),
  };

  return resolvedWeights.fullMeta <= resolvedWeights.topMeta
    ? resolvedWeights
    : { topMeta: TOP_META_POOL_WEIGHT, fullMeta: FULL_META_POOL_WEIGHT };
}

function normalizeThreatPoolWeights(
  weights: OptimizerThreatScorePoolWeights,
  scores: Record<keyof OptimizerThreatScorePoolWeights, number | undefined>,
): OptimizerThreatScorePoolWeights {
  const topMeta = scores.topMeta === undefined ? 0 : weights.topMeta;
  const fullMeta = scores.fullMeta === undefined ? 0 : weights.fullMeta;
  const totalWeight = topMeta + fullMeta;

  return totalWeight > 0
    ? { topMeta: topMeta / totalWeight, fullMeta: fullMeta / totalWeight }
    : { topMeta: 0, fullMeta: 0 };
}

function sanitizePoolWeight(
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function calculateThreatEntries(
  speciesIds: string[],
  threats: string[],
  context: OptimizerThreatScoreContext,
): OptimizerThreatScoreEntry[] {
  return uniquePreservingOrder(threats).flatMap((threatSpeciesId) => {
    const ratings = speciesIds
      .map((speciesId) => context.getMatchupRating(speciesId, threatSpeciesId))
      .filter((rating): rating is number => rating !== null);
    if (ratings.length === 0) {
      return [];
    }

    const teamAnswers = ratings.filter(
      (rating) => rating > MATCHUP_WIN_THRESHOLD,
    ).length;
    const answerQuality = ratings.reduce(
      (total, rating) => total + scoreMatchupRating(rating),
      0,
    );
    const averageTeamRating = average(ratings);
    const rank = Math.max(1, context.getThreatRank(threatSpeciesId));
    const threatValue = calculateThreatValue(answerQuality, averageTeamRating);

    return [
      {
        speciesId: threatSpeciesId,
        pokemon: context.getThreatName(threatSpeciesId),
        rank,
        teamAnswers,
        threatValue,
        severityTier: calculateThreatSeverity(threatValue),
      },
    ];
  });
}

function calculateThreatValue(
  answerQuality: number,
  averageTeamRating: number,
): number {
  const answerRisk =
    answerQuality >= 2.25 ? 0 : clamp01(1 - answerQuality / 2.25);
  const averageMatchupRisk = clamp01((500 - averageTeamRating) / 75);

  return clamp01(Math.max(answerRisk, averageMatchupRisk));
}

function average(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function calculatePoolThreatScore(
  entries: OptimizerThreatScoreEntry[],
): number | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  return clamp01(
    entries.reduce((sum, entry) => sum + entry.threatValue, 0) / entries.length,
  );
}

function sortThreatEntries(
  entries: OptimizerThreatScoreEntry[],
): OptimizerThreatScoreEntry[] {
  return entries.toSorted(
    (first, second) =>
      second.threatValue - first.threatValue ||
      first.teamAnswers - second.teamAnswers ||
      first.rank - second.rank ||
      first.speciesId.localeCompare(second.speciesId),
  );
}

function calculateThreatSeverity(threatValue: number): ThreatSeverityTier {
  if (threatValue >= 0.8) {
    return 'critical';
  }

  if (threatValue >= 0.55) {
    return 'high';
  }

  if (threatValue >= 0.25) {
    return 'medium';
  }

  return 'low';
}

function uniquePreservingOrder(values: string[]): string[] {
  return [...new Set(values)];
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}
