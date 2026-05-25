import { enumeratePlayPokemonLineups } from './lineupEnumeration';
import {
  scoreOrderedLineup,
  type LineupScoreResult,
  type LineupScoringContext,
} from './lineupScoring';
import type {
  BenchUtility,
  LineupAwareFitnessConfig,
  LineupRole,
  OrderedLineup,
  PlayPokemonRosterMetrics,
} from '@/lib/types';

const DEFAULT_VIABLE_LINEUP_SCORE = 0.55;
const DEFAULT_TOP_LINEUP_DEPTH = 5;

/** Injectable roster scoring context for production caches and deterministic tests. */
export interface PlayPokemonRosterScoringContext extends LineupScoringContext {
  scoreLineup?: (lineup: OrderedLineup) => LineupScoreResult;
}

/** Roster-level fitness output for bring-6 PlayPokemon scoring. */
export interface PlayPokemonRosterScoreResult {
  roster: string[];
  fitness: number;
  evaluatedLineupCount: number;
  metrics: PlayPokemonRosterMetrics;
  lineupScores?: LineupScoreResult[];
}

/** Scores a PlayPokemon bring-6 roster by aggregating all 60 ordered pick-3 lineups. */
export function scorePlayPokemonRoster(
  roster: string[],
  context: PlayPokemonRosterScoringContext,
  config: LineupAwareFitnessConfig,
): PlayPokemonRosterScoreResult {
  const scoredLineups = enumeratePlayPokemonLineups(roster)
    .map((lineup) => scoreRosterLineup(lineup, context, config))
    .toSorted((first, second) => second.score - first.score);
  const viableLineups = scoredLineups.filter(
    (lineup) => lineup.score >= DEFAULT_VIABLE_LINEUP_SCORE,
  );
  const metrics = buildRosterMetrics(roster, scoredLineups, viableLineups);
  const fitness = calculateRosterFitness(metrics, scoredLineups);
  const diagnosticLimit =
    config.mode === 'full' ? Math.max(0, config.recommendationLimit) : 0;

  return {
    roster: [...roster],
    fitness,
    evaluatedLineupCount: scoredLineups.length,
    metrics,
    lineupScores:
      diagnosticLimit > 0 ? scoredLineups.slice(0, diagnosticLimit) : undefined,
  };
}

function scoreRosterLineup(
  lineup: OrderedLineup,
  context: PlayPokemonRosterScoringContext,
  config: LineupAwareFitnessConfig,
): LineupScoreResult {
  if (context.scoreLineup) {
    return context.scoreLineup(lineup);
  }

  return config.mode === 'fast'
    ? scoreFastRosterLineup(lineup, context)
    : scoreOrderedLineup(lineup, context);
}

/** Scores one lineup with the lightweight roster path used during hot GA evaluation. */
export function scoreFastRosterLineup(
  lineup: OrderedLineup,
  context: PlayPokemonRosterScoringContext,
): LineupScoreResult {
  const speciesIds = [lineup.lead, lineup.switch, lineup.closer];
  const coveredThreats: string[] = [];
  const weaknesses: string[] = [];
  const singleAnswerRisks: string[] = [];
  let dominatingMatchupCount = 0;
  let overwhelmingLossCount = 0;
  let evaluatedThreatCount = 0;

  for (const threat of context.threats) {
    const ratings = speciesIds
      .map((speciesId) => context.getMatchupRating(speciesId, threat))
      .filter((rating): rating is number => rating !== null);

    if (ratings.length === 0) {
      continue;
    }

    evaluatedThreatCount++;
    dominatingMatchupCount += ratings.filter((rating) => rating > 600).length;
    overwhelmingLossCount += ratings.filter((rating) => rating < 400).length;

    const winningRatings = ratings.filter((rating) => rating > 500);
    if (winningRatings.length > 0) {
      coveredThreats.push(threat);
    } else {
      weaknesses.push(threat);
    }

    if (winningRatings.length === 1) {
      singleAnswerRisks.push(threat);
    }
  }

  const coverageRate =
    evaluatedThreatCount > 0 ? coveredThreats.length / evaluatedThreatCount : 0;
  const rankingQuality = average(
    speciesIds.map((speciesId) =>
      normalizeScore(context.getRankingScore(speciesId)),
    ),
  );
  const roleStrength =
    normalizeScore(context.getRoleScore(lineup.lead, 'lead')) * 0.4 +
    normalizeScore(context.getRoleScore(lineup.switch, 'switch')) * 0.35 +
    normalizeScore(context.getRoleScore(lineup.closer, 'closer')) * 0.25;
  const singleAnswerReliability =
    evaluatedThreatCount > 0
      ? clamp01(1 - singleAnswerRisks.length / evaluatedThreatCount)
      : 1;
  const coreBreakerReliability =
    evaluatedThreatCount > 0
      ? clamp01(1 - weaknesses.length / evaluatedThreatCount)
      : 1;
  const overwhelmingReliability =
    evaluatedThreatCount > 0
      ? clamp01(1 - overwhelmingLossCount / (evaluatedThreatCount * 3))
      : 1;

  return {
    lineup,
    score:
      rankingQuality * 0.22 +
      roleStrength * 0.23 +
      coverageRate * 0.3 +
      singleAnswerReliability * 0.1 +
      coreBreakerReliability * 0.1 +
      overwhelmingReliability * 0.05,
    coverageMetrics: {
      coverageRate,
      dominatingMatchupCount,
      overwhelmingLossCount,
      singleAnswerThreatCount: singleAnswerRisks.length,
    },
    coveredThreats,
    weaknesses,
    singleAnswerRisks,
    diagnosticLabel: 'unknown',
    componentScores: {
      rankingQuality,
      roleStrength,
      matchupCoverage: coverageRate,
      typeSynergy: 0.5,
      typeDiversity: 0.5,
      moveCoverage: 0.5,
      energyPressure: 0.5,
      statBalance: 0.5,
      singleAnswerReliability,
      coreBreakerReliability,
      shieldReliability: 0.5,
    },
  };
}

function buildRosterMetrics(
  roster: string[],
  scoredLineups: LineupScoreResult[],
  viableLineups: LineupScoreResult[],
): PlayPokemonRosterMetrics {
  const topLineups = scoredLineups.slice(0, DEFAULT_TOP_LINEUP_DEPTH);
  const matchupSlotCount = Math.max(
    1,
    scoredLineups.length * inferThreatCount(scoredLineups) * 3,
  );
  const viableLeadDiversity = new Set(
    viableLineups.map((lineup) => lineup.lineup.lead),
  ).size;

  return {
    viableLineupCount: viableLineups.length,
    topLineupQuality: scoredLineups[0]?.score ?? 0,
    topNLineupDepth: average(topLineups.map((lineup) => lineup.score)),
    dominatingMatchupRate:
      sum(
        scoredLineups.map(
          (lineup) => lineup.coverageMetrics.dominatingMatchupCount,
        ),
      ) / matchupSlotCount,
    overwhelmingLossRate:
      sum(
        scoredLineups.map(
          (lineup) => lineup.coverageMetrics.overwhelmingLossCount,
        ),
      ) / matchupSlotCount,
    singleAnswerRisks: uniqueSorted(
      scoredLineups.flatMap((lineup) => lineup.singleAnswerRisks),
    ),
    viableLeadDiversity,
    benchUtilitySummary: buildBenchUtilitySummary(roster, viableLineups),
  };
}

function buildBenchUtilitySummary(
  roster: string[],
  viableLineups: LineupScoreResult[],
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

  for (const scoredLineup of viableLineups) {
    incrementRoleAppearance(utilityBySpecies, scoredLineup.lineup, 'lead');
    incrementRoleAppearance(utilityBySpecies, scoredLineup.lineup, 'switch');
    incrementRoleAppearance(utilityBySpecies, scoredLineup.lineup, 'closer');
  }

  return roster.map((speciesId) => {
    const utility = utilityBySpecies.get(speciesId)!;
    const roleCoverage = [
      utility.leadAppearances,
      utility.switchAppearances,
      utility.closerAppearances,
    ].filter((count) => count > 0).length;
    const appearanceShare =
      viableLineups.length > 0
        ? utility.totalAppearances / (viableLineups.length * 3)
        : 0;
    utility.utilityScore = clamp01(appearanceShare * 2 + roleCoverage / 6);

    if (utility.totalAppearances === 0) {
      utility.warnings.push('unbringable');
    } else if (utility.utilityScore < 0.2) {
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

function calculateRosterFitness(
  metrics: PlayPokemonRosterMetrics,
  scoredLineups: LineupScoreResult[],
): number {
  const deadBenchPenalty =
    metrics.benchUtilitySummary.filter(
      (utility) => utility.totalAppearances === 0,
    ).length / Math.max(1, metrics.benchUtilitySummary.length);
  const averageBenchUtility = average(
    metrics.benchUtilitySummary.map((utility) => utility.utilityScore),
  );
  const coverageBreadth = calculateCoverageBreadth(scoredLineups);
  const singleAnswerDependencyRate =
    calculateSingleAnswerDependencyRate(scoredLineups);
  const repeatedWeaknessRate = calculateRepeatedWeaknessRate(scoredLineups);

  return clamp01(
    metrics.topLineupQuality * 0.24 +
      metrics.topNLineupDepth * 0.2 +
      normalizeCount(metrics.viableLineupCount, 60) * 0.16 +
      normalizeCount(metrics.viableLeadDiversity, 6) * 0.12 +
      averageBenchUtility * 0.12 +
      coverageBreadth * 0.08 +
      metrics.dominatingMatchupRate * 0.05 -
      metrics.overwhelmingLossRate * 0.1 -
      singleAnswerDependencyRate * 0.08 -
      repeatedWeaknessRate * 0.08 -
      deadBenchPenalty * 0.15,
  );
}

function calculateCoverageBreadth(scoredLineups: LineupScoreResult[]): number {
  const coveredThreats = new Set(
    scoredLineups.flatMap((lineup) => lineup.coveredThreats),
  );
  const threatUniverse = getThreatUniverse(scoredLineups);

  return threatUniverse.size > 0
    ? coveredThreats.size / threatUniverse.size
    : 0;
}

function calculateSingleAnswerDependencyRate(
  scoredLineups: LineupScoreResult[],
): number {
  const threatUniverse = getThreatUniverse(scoredLineups);
  const denominator = Math.max(1, scoredLineups.length * threatUniverse.size);
  const occurrenceCount = sum(
    scoredLineups.map((lineup) => lineup.singleAnswerRisks.length),
  );

  return occurrenceCount / denominator;
}

function calculateRepeatedWeaknessRate(
  scoredLineups: LineupScoreResult[],
): number {
  const weaknessCounts = new Map<string, number>();
  for (const weakness of scoredLineups.flatMap((lineup) => lineup.weaknesses)) {
    weaknessCounts.set(weakness, (weaknessCounts.get(weakness) ?? 0) + 1);
  }

  const repeatedWeaknessCount = sum(
    [...weaknessCounts.values()].map((count) => Math.max(0, count - 1)),
  );
  const denominator = Math.max(
    1,
    scoredLineups.length * getThreatUniverse(scoredLineups).size,
  );

  return repeatedWeaknessCount / denominator;
}

function getThreatUniverse(scoredLineups: LineupScoreResult[]): Set<string> {
  return new Set(
    scoredLineups.flatMap((lineup) => [
      ...lineup.coveredThreats,
      ...lineup.weaknesses,
      ...lineup.singleAnswerRisks,
    ]),
  );
}

function inferThreatCount(scoredLineups: LineupScoreResult[]): number {
  const lineupThreatCounts = scoredLineups.map((lineup) => {
    const allThreats = new Set([
      ...lineup.coveredThreats,
      ...lineup.weaknesses,
      ...lineup.singleAnswerRisks,
    ]);
    return Math.max(
      allThreats.size,
      lineup.coverageMetrics.singleAnswerThreatCount,
    );
  });

  return Math.max(1, ...lineupThreatCounts);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].toSorted();
}

function normalizeCount(value: number, max: number): number {
  return clamp01(value / max);
}

function normalizeScore(score: number): number {
  return score > 1 ? clamp01(score / 100) : clamp01(score);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]): number {
  return values.length > 0 ? sum(values) / values.length : 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export type { LineupScoreResult };
