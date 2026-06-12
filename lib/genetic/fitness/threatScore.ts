import type {
  OptimizerThreatScore,
  OptimizerThreatScoreEntry,
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

/**
 * Calculates lower-is-better threat diagnostics for one team or lineup.
 */
export function calculateOptimizerThreatScore(
  speciesIds: string[],
  context: OptimizerThreatScoreContext,
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
  const weightedPools = [
    { score: topMetaScore, weight: TOP_META_POOL_WEIGHT },
    { score: fullMetaScore, weight: FULL_META_POOL_WEIGHT },
  ].filter(
    (entry): entry is { score: number; weight: number } =>
      entry.score !== undefined,
  );

  return {
    score:
      weightedPools.length > 0
        ? clamp01(
            weightedPools.reduce(
              (sum, entry) => sum + entry.score * entry.weight,
              0,
            ) / weightedPools.reduce((sum, entry) => sum + entry.weight, 0),
          )
        : 0,
    evaluatedCount: overallTeamThreats.length,
    topMetaThreats: sortThreatEntries(topMetaThreats),
    overallTeamThreats: sortThreatEntries(overallTeamThreats),
  };
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
    const rank = Math.max(1, context.getThreatRank(threatSpeciesId));
    const threatValue = calculateThreatValue(teamAnswers, rank);

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

function calculateThreatValue(teamAnswers: number, rank: number): number {
  const answerRisk =
    teamAnswers === 0
      ? 1
      : teamAnswers === 1
        ? 0.6
        : teamAnswers === 2
          ? 0.25
          : 0;
  const rankWeight = rank <= 10 ? 1 : rank <= 30 ? 0.75 : 0.5;

  return clamp01(answerRisk * rankWeight);
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
