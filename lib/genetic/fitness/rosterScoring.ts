import { enumeratePlayPokemonLineups } from './lineupEnumeration';
import {
  scoreOrderedLineup,
  type LineupScoreResult,
  type LineupScoringContext,
} from './lineupScoring';
import {
  calculateDefensiveTypeRatio,
  calculateOffensiveTypeRatio,
} from './typeEffectivenessRatios';
import { normalizeToChoosableSpeciesId } from '@/lib/data/pokemon';
import type {
  BenchUtility,
  LineupAwareFitnessConfig,
  LineupRole,
  OrderedLineup,
  PlayPokemonRosterMetrics,
} from '@/lib/types';

const DEFAULT_VIABLE_LINEUP_SCORE = 0.55;
const DEFAULT_TOP_LINEUP_DEPTH = 5;
const MAX_TOP_THREAT_POOL_SIZE = 30;
const MAX_FULL_META_THREAT_POOL_SIZE = 100;
const ALL_TYPES = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
];

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
  const fitness = calculateRosterFitness(
    roster,
    context,
    metrics,
    scoredLineups,
  );
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
  const overallThreats = sanitizeThreatPool(
    context.threats,
    MAX_FULL_META_THREAT_POOL_SIZE,
  );
  const topThreats = sanitizeThreatPool(
    context.topThreats ?? overallThreats,
    MAX_TOP_THREAT_POOL_SIZE,
  );
  const fullMetaThreats = sanitizeThreatPool(
    context.fullMetaThreats ?? overallThreats,
    MAX_FULL_META_THREAT_POOL_SIZE,
  );
  const evaluatedThreats = uniquePreservingOrder([
    ...overallThreats,
    ...topThreats,
    ...fullMetaThreats,
  ]);
  const coveredThreats: string[] = [];
  const weaknesses: string[] = [];
  const singleAnswerRisks: string[] = [];
  let dominatingMatchupCount = 0;
  let overwhelmingLossCount = 0;
  let evaluatedThreatCount = 0;

  const topThreatCoverage = calculateThreatPoolCoverage(
    speciesIds,
    topThreats,
    context,
  );
  const fullMetaCoverage = calculateThreatPoolCoverage(
    speciesIds,
    fullMetaThreats,
    context,
  );

  for (const threat of evaluatedThreats) {
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
  const weightedCoverage = calculateWeightedPoolCoverage(
    topThreatCoverage,
    fullMetaCoverage,
    coverageRate,
  );
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
      weightedCoverage * 0.3 +
      singleAnswerReliability * 0.1 +
      coreBreakerReliability * 0.1 +
      overwhelmingReliability * 0.05,
    coverageMetrics: {
      coverageRate,
      dominatingMatchupCount,
      overwhelmingLossCount,
      singleAnswerThreatCount: singleAnswerRisks.length,
      topThreatCoverage,
      fullMetaCoverage,
    },
    coveredThreats,
    weaknesses,
    singleAnswerRisks,
    diagnosticLabel: 'unknown',
    componentScores: {
      rankingQuality,
      roleStrength,
      matchupCoverage: weightedCoverage,
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

function calculateThreatPoolCoverage(
  speciesIds: string[],
  threats: string[],
  context: PlayPokemonRosterScoringContext,
): NonNullable<LineupScoreResult['coverageMetrics']['topThreatCoverage']> {
  let coveredThreatCount = 0;
  let evaluatedThreatCount = 0;
  let dominatingMatchupCount = 0;
  let noAnswerThreatCount = 0;
  let overwhelmingLossCount = 0;
  let singleAnswerThreatCount = 0;

  for (const threat of threats) {
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
      coveredThreatCount++;
    } else {
      noAnswerThreatCount++;
    }

    if (winningRatings.length === 1) {
      singleAnswerThreatCount++;
    }
  }

  return {
    coverageRate:
      evaluatedThreatCount > 0 ? coveredThreatCount / evaluatedThreatCount : 0,
    evaluatedThreatCount,
    noAnswerThreatCount,
    singleAnswerThreatCount,
    dominatingMatchupCount,
    overwhelmingLossCount,
  };
}

function calculateWeightedPoolCoverage(
  topThreatCoverage: NonNullable<
    LineupScoreResult['coverageMetrics']['topThreatCoverage']
  >,
  fullMetaCoverage: NonNullable<
    LineupScoreResult['coverageMetrics']['fullMetaCoverage']
  >,
  fallbackCoverageRate: number,
): number {
  const weightedPools = [
    { metrics: topThreatCoverage, weight: 0.7 },
    { metrics: fullMetaCoverage, weight: 0.3 },
  ].filter((pool) => pool.metrics.evaluatedThreatCount > 0);

  if (weightedPools.length === 0) {
    return fallbackCoverageRate;
  }

  const totalWeight = weightedPools.reduce((sum, pool) => sum + pool.weight, 0);

  return (
    weightedPools.reduce(
      (sum, pool) => sum + pool.metrics.coverageRate * pool.weight,
      0,
    ) / totalWeight
  );
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
  roster: string[],
  context: PlayPokemonRosterScoringContext,
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
  const topLineups = getTopLineupsIncludingCutoffTies(
    scoredLineups,
    DEFAULT_TOP_LINEUP_DEPTH,
  );
  const repeatedWeaknessRate = calculateRepeatedWeaknessRate(
    scoredLineups,
    topLineups,
  );
  const typeCoverage = calculateRosterTypeCoverage(roster, context);
  const primaryRedundancyPenalty = calculatePrimaryRedundancyPenalty(
    roster,
    context,
    topLineups,
  );

  return clamp01(
    metrics.topLineupQuality * 0.22 +
      metrics.topNLineupDepth * 0.18 +
      normalizeCount(metrics.viableLineupCount, 60) * 0.15 +
      normalizeCount(metrics.viableLeadDiversity, 6) * 0.12 +
      averageBenchUtility * 0.12 +
      coverageBreadth * 0.09 +
      typeCoverage.offensive * 0.06 +
      typeCoverage.defensive * 0.06 +
      metrics.dominatingMatchupRate * 0.05 -
      metrics.overwhelmingLossRate * 0.1 -
      singleAnswerDependencyRate * 0.08 -
      repeatedWeaknessRate * 0.08 -
      primaryRedundancyPenalty * 0.08 -
      deadBenchPenalty * 0.15,
  );
}

function calculateRosterTypeCoverage(
  roster: string[],
  context: PlayPokemonRosterScoringContext,
): { offensive: number; defensive: number } {
  const pokemon = roster
    .map((speciesId) => context.getPokemon(speciesId))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
  if (pokemon.length === 0) {
    return { offensive: 0.5, defensive: 0.5 };
  }

  const attackingMoveTypes = pokemon.flatMap((entry) =>
    getRosterAttackingTypes(entry, context),
  );
  const offensive = calculateWeightedTypePoolScore(
    calculateOffensiveTypeRatio({
      attackingMoveTypes,
      defenderTypeProfiles: getThreatTypeProfiles(
        context,
        context.topThreats ?? context.threats,
      ),
    }),
    calculateOffensiveTypeRatio({
      attackingMoveTypes,
      defenderTypeProfiles: getThreatTypeProfiles(
        context,
        context.fullMetaThreats ?? context.threats,
      ),
    }),
  );
  const expectedAttackTypes = getExpectedAttackTypes(context);
  const defensive = calculateDefensiveTypeRatio({
    defenderTypes: pokemon.map((entry) => entry.types),
    incomingAttackTypes: expectedAttackTypes,
  });

  return { offensive, defensive };
}

function calculateWeightedTypePoolScore(
  topThreatScore: number,
  fullMetaScore: number,
): number {
  return clamp01(topThreatScore * 0.7 + fullMetaScore * 0.3);
}

function getThreatTypeProfiles(
  context: PlayPokemonRosterScoringContext,
  threats: string[],
): string[][] {
  const profiles = threats
    .map((speciesId) => context.getPokemon(speciesId)?.types ?? [])
    .filter((types) => types.length > 0);

  return profiles.length > 0 ? profiles : ALL_TYPES.map((type) => [type]);
}

function getExpectedAttackTypes(
  context: PlayPokemonRosterScoringContext,
): string[] {
  const attackTypes = context.threats.flatMap((speciesId) => {
    const pokemon = context.getPokemon(speciesId);

    return pokemon ? getExpectedThreatAttackTypes(pokemon, context) : [];
  });

  return attackTypes.length > 0 ? attackTypes : ALL_TYPES;
}

function getExpectedThreatAttackTypes(
  pokemon: NonNullable<
    ReturnType<PlayPokemonRosterScoringContext['getPokemon']>
  >,
  context: PlayPokemonRosterScoringContext,
): string[] {
  const moveset = context.getRecommendedMoveset?.(pokemon.speciesId);
  if (!moveset) {
    return pokemon.types;
  }

  const moveIds = [
    moveset.fastMove,
    moveset.chargedMove1,
    moveset.chargedMove2,
  ].filter((moveId): moveId is string => moveId !== null);
  if (moveIds.length === 0) {
    return pokemon.types;
  }

  const moveTypes = moveIds
    .map((moveId) => context.getMove?.(moveId)?.type)
    .filter((moveType): moveType is string => moveType !== undefined);

  return moveTypes.length === moveIds.length
    ? moveTypes
    : [...moveTypes, ...pokemon.types];
}

function getRosterAttackingTypes(
  pokemon: NonNullable<
    ReturnType<PlayPokemonRosterScoringContext['getPokemon']>
  >,
  context: PlayPokemonRosterScoringContext,
): string[] {
  const moveset = context.getRecommendedMoveset?.(pokemon.speciesId);
  if (!moveset) {
    return pokemon.types;
  }

  const moveIds = [
    moveset.fastMove,
    moveset.chargedMove1,
    moveset.chargedMove2,
  ].filter((moveId): moveId is string => moveId !== null);
  if (moveIds.length === 0) {
    return pokemon.types;
  }

  const moveTypes = moveIds
    .map((moveId) => context.getMove?.(moveId)?.type)
    .filter((moveType): moveType is string => moveType !== undefined);

  return moveTypes.length === moveIds.length
    ? uniqueSorted(moveTypes)
    : uniqueSorted([...moveTypes, ...pokemon.types]);
}

function calculatePrimaryRedundancyPenalty(
  roster: string[],
  context: PlayPokemonRosterScoringContext,
  recommendedLineups: LineupScoreResult[],
): number {
  const appearances = new Map<string, number>();
  for (const lineup of recommendedLineups) {
    for (const speciesId of [
      lineup.lineup.lead,
      lineup.lineup.switch,
      lineup.lineup.closer,
    ]) {
      appearances.set(speciesId, (appearances.get(speciesId) ?? 0) + 1);
    }
  }

  const speciesByPrimaryType = new Map<string, string[]>();
  for (const speciesId of roster) {
    const primaryType = context.getPokemon(speciesId)?.types[0];
    if (!primaryType) {
      continue;
    }
    speciesByPrimaryType.set(primaryType, [
      ...(speciesByPrimaryType.get(primaryType) ?? []),
      speciesId,
    ]);
  }

  const duplicatePressure = sum(
    [...speciesByPrimaryType.values()].map((speciesIds) => {
      if (speciesIds.length <= 1) {
        return 0;
      }

      const usefulShare =
        speciesIds.filter((speciesId) => (appearances.get(speciesId) ?? 0) > 0)
          .length / speciesIds.length;

      return (speciesIds.length - 1) * (1 - usefulShare);
    }),
  );

  return clamp01(duplicatePressure / Math.max(1, roster.length - 1));
}

function getTopLineupsIncludingCutoffTies(
  scoredLineups: LineupScoreResult[],
  depth: number,
): LineupScoreResult[] {
  if (scoredLineups.length <= depth) {
    return scoredLineups;
  }

  const cutoffScore = scoredLineups[depth - 1]?.score;
  if (cutoffScore === undefined) {
    return [];
  }

  return scoredLineups.filter((lineup) => lineup.score >= cutoffScore);
}

function calculateCoverageBreadth(scoredLineups: LineupScoreResult[]): number {
  const coveredThreats = new Set(
    scoredLineups.flatMap((lineup) => lineup.coveredThreats),
  );
  const threatUniverse = getThreatUniverse(scoredLineups);
  const topThreatCoverage = getEvaluatedPoolCoverageAverage(
    scoredLineups
      .map((lineup) => lineup.coverageMetrics.topThreatCoverage)
      .filter((metrics) => metrics !== undefined),
  );
  const fullMetaCoverage = getEvaluatedPoolCoverageAverage(
    scoredLineups
      .map((lineup) => lineup.coverageMetrics.fullMetaCoverage)
      .filter((metrics) => metrics !== undefined),
  );
  const weightedPools = [
    { coverage: topThreatCoverage, weight: 0.7 },
    { coverage: fullMetaCoverage, weight: 0.3 },
  ].filter((pool) => pool.coverage !== undefined);

  if (weightedPools.length > 0) {
    const totalWeight = weightedPools.reduce(
      (total, pool) => total + pool.weight,
      0,
    );

    return (
      weightedPools.reduce(
        (total, pool) => total + pool.coverage! * pool.weight,
        0,
      ) / totalWeight
    );
  }

  return threatUniverse.size > 0
    ? coveredThreats.size / threatUniverse.size
    : 0;
}

function getEvaluatedPoolCoverageAverage(
  metrics: NonNullable<
    LineupScoreResult['coverageMetrics']['topThreatCoverage']
  >[],
): number | undefined {
  const evaluatedRates = metrics
    .filter((metric) => metric.evaluatedThreatCount > 0)
    .map((metric) => normalizeMetricRate(metric.coverageRate));

  return evaluatedRates.length > 0 ? average(evaluatedRates) : undefined;
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
  recommendedLineups: LineupScoreResult[],
): number {
  const representedSpecies = new Set(
    recommendedLineups.flatMap((lineup) => [
      lineup.lineup.lead,
      lineup.lineup.switch,
      lineup.lineup.closer,
    ]),
  );
  const lineupsWithUnrepresentedMembers = scoredLineups.filter((lineup) =>
    [lineup.lineup.lead, lineup.lineup.switch, lineup.lineup.closer].some(
      (speciesId) => !representedSpecies.has(speciesId),
    ),
  );
  if (lineupsWithUnrepresentedMembers.length === 0) {
    return 0;
  }

  const weaknessCounts = new Map<string, number>();
  for (const weakness of lineupsWithUnrepresentedMembers.flatMap(
    (lineup) => lineup.weaknesses,
  )) {
    weaknessCounts.set(weakness, (weaknessCounts.get(weakness) ?? 0) + 1);
  }

  const repeatedWeaknessCount = sum(
    [...weaknessCounts.values()].map((count) => Math.max(0, count - 1)),
  );
  const denominator = Math.max(
    1,
    lineupsWithUnrepresentedMembers.length *
      getThreatUniverse(scoredLineups).size,
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

function uniquePreservingOrder(values: string[]): string[] {
  return [...new Set(values)];
}

function sanitizeThreatPool(values: string[], limit: number): string[] {
  return uniquePreservingOrder(
    values
      .map((value) => normalizeToChoosableSpeciesId(value.trim()))
      .filter((value) => value.length > 0),
  ).slice(0, limit);
}

function normalizeMetricRate(value: number): number {
  return Number.isFinite(value) ? clamp01(value) : 0;
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
