import { enumeratePlayPokemonLineups } from './lineupEnumeration';
import {
  scoreOrderedLineup,
  type LineupScoreResult,
  type LineupScoringContext,
} from './lineupScoring';
import {
  createNormalizedScoreBreakdown,
  type OptimizerScoreBreakdown,
  type OptimizerScoreComponents,
} from './scoreBreakdown';
import {
  calculateDefensiveTypeRatio,
  calculateOffensiveTypeRatio,
} from './typeEffectivenessRatios';
import { normalizeToChoosableSpeciesId } from '@/lib/data/pokemon';
import { MissingRankingDataError } from '@/lib/data/rankings';
import { calculateOptimizerThreatScore } from '@/lib/genetic/fitness/threatScore';
import type {
  BenchUtility,
  LineupAwareFitnessConfig,
  LineupRole,
  OrderedLineup,
  PlayPokemonRosterMetrics,
} from '@/lib/types';

const DEFAULT_VIABLE_LINEUP_SCORE = 0.55;
const DEFAULT_TOP_LINEUP_DEPTH = 5;
const PLAY_POKEMON_ORDERED_LINEUP_COUNT = 120;
const MAX_TOP_THREAT_POOL_SIZE = 30;
const MAX_FULL_META_THREAT_POOL_SIZE = 100;
const unavailableConsistencyRankingContexts =
  new WeakSet<PlayPokemonRosterScoringContext>();
type SupportingRoleRankingCategory = 'chargers' | 'attackers' | 'consistency';
const unavailableSupportingRoleRankingCategories = new WeakMap<
  PlayPokemonRosterScoringContext,
  Set<SupportingRoleRankingCategory>
>();
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
  scoreBreakdown: OptimizerScoreBreakdown;
  evaluatedLineupCount: number;
  metrics: PlayPokemonRosterMetrics;
  lineupScores?: LineupScoreResult[];
}

/** Scores a PlayPokemon bring-6 roster by aggregating all 120 ordered pick-3 lineups. */
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
  const scoreBreakdown = createRosterScoreBreakdown(
    roster,
    context,
    metrics,
    scoredLineups,
    config.includeDiagnostics,
  );
  const diagnosticLimit =
    config.mode === 'full' ? Math.max(0, config.recommendationLimit) : 0;

  return {
    roster: [...roster],
    fitness: scoreBreakdown.score,
    scoreBreakdown,
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
  const roleStrength = calculateOrderedLineupRoleStrength(lineup, context);
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

  const componentScores = {
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
  };
  const typeRatios = calculateFastLineupTypeRatios(speciesIds, context);
  const scoreBreakdown = createNormalizedScoreBreakdown({
    synergy: clamp01(
      componentScores.typeSynergy * 0.4 +
        componentScores.typeDiversity * 0.25 +
        componentScores.singleAnswerReliability * 0.2 +
        componentScores.coreBreakerReliability * 0.15,
    ),
    coverage: componentScores.matchupCoverage,
    safety: clamp01(
      componentScores.singleAnswerReliability * 0.4 +
        componentScores.coreBreakerReliability * 0.4 +
        overwhelmingReliability * 0.2,
    ),
    consistency: componentScores.rankingQuality,
    bulk: componentScores.statBalance,
    defensiveRatio: typeRatios.defensive,
    offensiveRatio: typeRatios.offensive,
    role: componentScores.roleStrength,
  });

  return {
    lineup,
    score: scoreBreakdown.score,
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
    resourcePathMetrics: calculateFastResourcePathMetrics(
      lineup,
      context,
      evaluatedThreats,
    ),
    componentScores,
    scoreBreakdown,
  };
}

function calculateFastLineupTypeRatios(
  speciesIds: string[],
  context: PlayPokemonRosterScoringContext,
): { offensive: number; defensive: number } {
  const pokemon = speciesIds
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
        MAX_TOP_THREAT_POOL_SIZE,
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
  const defensive = calculateWeightedTypePoolScore(
    calculateDefensiveTypeRatio({
      defenderTypes: pokemon.map((entry) => entry.types),
      incomingAttackTypes: getExpectedAttackTypes(
        context,
        context.topThreats ?? context.threats,
        MAX_TOP_THREAT_POOL_SIZE,
      ),
    }),
    calculateDefensiveTypeRatio({
      defenderTypes: pokemon.map((entry) => entry.types),
      incomingAttackTypes: getExpectedAttackTypes(
        context,
        context.fullMetaThreats ?? context.threats,
      ),
    }),
  );

  return { offensive, defensive };
}

function calculateFastResourcePathMetrics(
  lineup: OrderedLineup,
  context: PlayPokemonRosterScoringContext,
  threats: string[],
): LineupScoreResult['resourcePathMetrics'] {
  if (!context.getShieldScenarioMatchupRating) {
    return undefined;
  }

  const balanced = calculateFastResourcePathMetric(lineup, context, threats, {
    lead: 1,
    switch: 1,
    closer: 1,
  });
  const shieldSpend = calculateFastResourcePathMetric(
    lineup,
    context,
    threats,
    {
      lead: 2,
      switch: 0,
      closer: 0,
    },
  );
  const shieldSave = calculateFastResourcePathMetric(lineup, context, threats, {
    lead: 0,
    switch: 2,
    closer: 2,
  });

  return balanced.available || shieldSpend.available || shieldSave.available
    ? { balanced, shieldSpend, shieldSave }
    : undefined;
}

function calculateFastResourcePathMetric(
  lineup: OrderedLineup,
  context: PlayPokemonRosterScoringContext,
  threats: string[],
  shieldsByRole: Record<LineupRole, 0 | 1 | 2>,
): NonNullable<LineupScoreResult['resourcePathMetrics']>['balanced'] {
  const ratings: number[] = [];
  let availableRatingCount = 0;

  try {
    for (const threat of threats) {
      for (const role of ['lead', 'switch', 'closer'] as const) {
        const rating = context.getShieldScenarioMatchupRating!(
          lineup[role],
          threat,
          shieldsByRole[role],
        );
        if (rating !== null) {
          availableRatingCount++;
        }
        ratings.push(rating ?? 500);
      }
    }
  } catch {
    return { available: false };
  }

  return availableRatingCount > 0
    ? {
        available: true,
        score: average(ratings.map((rating) => rating / 1000)),
      }
    : { available: false };
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

function createRosterScoreBreakdown(
  roster: string[],
  context: PlayPokemonRosterScoringContext,
  metrics: PlayPokemonRosterMetrics,
  scoredLineups: LineupScoreResult[],
  includeThreatScore: boolean,
): OptimizerScoreBreakdown {
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
  const safety = calculateSafetyComponent(
    metrics,
    scoredLineups,
    coverageBreadth,
    singleAnswerDependencyRate,
    repeatedWeaknessRate,
  );
  const consistency = calculateConsistencyComponent(roster, context);
  const bulk = calculateBulkComponent(roster, context);
  const components: OptimizerScoreComponents = {
    synergy: clamp01(
      metrics.topLineupQuality * 0.35 +
        metrics.topNLineupDepth * 0.25 +
        normalizeCount(
          metrics.viableLineupCount,
          PLAY_POKEMON_ORDERED_LINEUP_COUNT,
        ) *
          0.15 +
        normalizeCount(metrics.viableLeadDiversity, 6) * 0.1 +
        averageBenchUtility * 0.15 -
        deadBenchPenalty * 0.2,
    ),
    coverage: clamp01(
      coverageBreadth * 0.55 +
        typeCoverage.offensive * 0.15 +
        typeCoverage.defensive * 0.15 +
        metrics.dominatingMatchupRate * 0.15 -
        primaryRedundancyPenalty * 0.25,
    ),
    safety,
    consistency,
    bulk,
    defensiveRatio: typeCoverage.defensive,
    offensiveRatio: typeCoverage.offensive,
    role: calculateRosterRoleComponent(roster, context),
  };

  return createNormalizedScoreBreakdown(
    components,
    undefined,
    includeThreatScore
      ? {
          threatScore: calculateOptimizerThreatScore(
            roster,
            createThreatScoreContext(
              context,
              sanitizeThreatPool(
                context.topThreats ?? context.threats,
                MAX_TOP_THREAT_POOL_SIZE,
              ),
              sanitizeThreatPool(
                context.fullMetaThreats ?? context.threats,
                MAX_FULL_META_THREAT_POOL_SIZE,
              ),
            ),
          ),
        }
      : {},
  );
}

function createThreatScoreContext(
  context: PlayPokemonRosterScoringContext,
  topThreats: string[],
  fullMetaThreats: string[],
): Parameters<typeof calculateOptimizerThreatScore>[1] {
  const ranks = new Map<string, number>();
  uniquePreservingOrder([...topThreats, ...fullMetaThreats]).forEach(
    (speciesId, index) => ranks.set(speciesId, index + 1),
  );

  return {
    topThreats,
    fullMetaThreats,
    getThreatName: (speciesId) =>
      context.getPokemon(speciesId)?.speciesName ?? speciesId,
    getThreatRank: (speciesId) => ranks.get(speciesId) ?? ranks.size + 1,
    getMatchupRating: context.getMatchupRating,
  };
}

function calculateSafetyComponent(
  metrics: PlayPokemonRosterMetrics,
  scoredLineups: LineupScoreResult[],
  coverageBreadth: number,
  singleAnswerDependencyRate: number,
  repeatedWeaknessRate: number,
): number {
  const topThreatRisk = calculatePoolSafetyRisk(
    scoredLineups
      .map((lineup) => lineup.coverageMetrics.topThreatCoverage)
      .filter((metric) => metric !== undefined),
  );
  const fullMetaRisk = calculatePoolSafetyRisk(
    scoredLineups
      .map((lineup) => lineup.coverageMetrics.fullMetaCoverage)
      .filter((metric) => metric !== undefined),
  );
  const weightedPoolRisks = [
    { risk: topThreatRisk, weight: 0.7 },
    { risk: fullMetaRisk, weight: 0.3 },
  ].filter((entry) => entry.risk !== undefined);
  const poolRisk =
    weightedPoolRisks.length > 0
      ? weightedPoolRisks.reduce(
          (total, entry) => total + entry.risk! * entry.weight,
          0,
        ) / weightedPoolRisks.reduce((total, entry) => total + entry.weight, 0)
      : undefined;
  const fallbackRisk = clamp01(
    metrics.overwhelmingLossRate * 0.35 +
      singleAnswerDependencyRate * 0.25 +
      repeatedWeaknessRate * 0.2 +
      (1 - coverageBreadth) * 0.2,
  );
  const recoveryRisk = calculateResourcePathRecoveryRisk(scoredLineups);
  const fallbackWithRecoveryRisk =
    recoveryRisk === undefined
      ? fallbackRisk
      : clamp01(fallbackRisk * 0.75 + recoveryRisk * 0.25);

  const combinedRisk =
    poolRisk === undefined
      ? fallbackWithRecoveryRisk
      : clamp01(poolRisk * 0.7 + fallbackWithRecoveryRisk * 0.3);

  return clamp01(1 - combinedRisk);
}

function calculateResourcePathRecoveryRisk(
  scoredLineups: LineupScoreResult[],
): number | undefined {
  const resourcePathScores = scoredLineups.flatMap((lineup) => {
    const metrics = lineup.resourcePathMetrics;
    if (!metrics) {
      return [];
    }

    return [metrics.balanced, metrics.shieldSpend, metrics.shieldSave]
      .filter((metric) => metric.available)
      .map((metric) => metric.score);
  });

  return resourcePathScores.length > 0
    ? clamp01(1 - average(resourcePathScores))
    : undefined;
}

function calculatePoolSafetyRisk(
  metrics: NonNullable<
    LineupScoreResult['coverageMetrics']['topThreatCoverage']
  >[],
): number | undefined {
  const evaluatedMetrics = metrics.filter(
    (metric) => metric.evaluatedThreatCount > 0,
  );
  if (evaluatedMetrics.length === 0) {
    return undefined;
  }

  return clamp01(
    average(
      evaluatedMetrics.map((metric) => {
        const evaluatedThreatCount = Math.max(1, metric.evaluatedThreatCount);
        const matchupSlots = Math.max(1, evaluatedThreatCount * 3);

        return clamp01(
          (metric.overwhelmingLossCount / matchupSlots) * 0.45 +
            (metric.noAnswerThreatCount / evaluatedThreatCount) * 0.35 +
            (metric.singleAnswerThreatCount / evaluatedThreatCount) * 0.2,
        );
      }),
    ),
  );
}

function calculateConsistencyComponent(
  roster: string[],
  context: PlayPokemonRosterScoringContext,
): number {
  const speciesScores = roster.map((speciesId) => {
    const fallback = calculateFallbackConsistency(speciesId, context);
    const rankingScore = getOptionalConsistencyRankingScore(speciesId, context);

    return rankingScore === undefined || rankingScore <= 0
      ? fallback
      : clamp01(rankingScore * 0.7 + fallback * 0.3);
  });

  return average(speciesScores);
}

function calculateFallbackConsistency(
  speciesId: string,
  context: PlayPokemonRosterScoringContext,
): number {
  return clamp01(
    calculateMoveConsistency(speciesId, context) * 0.55 +
      calculateShieldStability(speciesId, context) * 0.45,
  );
}

function getOptionalConsistencyRankingScore(
  speciesId: string,
  context: PlayPokemonRosterScoringContext,
): number | undefined {
  if (!context.getRankingCategoryScore) {
    return undefined;
  }
  if (unavailableConsistencyRankingContexts.has(context)) {
    return undefined;
  }

  try {
    return normalizeScore(
      context.getRankingCategoryScore(speciesId, 'consistency'),
    );
  } catch (error) {
    // Optional role exports are allowed to be absent; fall back to local reliability proxies.
    if (error instanceof MissingRankingDataError) {
      unavailableConsistencyRankingContexts.add(context);
      return undefined;
    }
    throw error;
  }
}

function calculateMoveConsistency(
  speciesId: string,
  context: PlayPokemonRosterScoringContext,
): number {
  const pokemon = context.getPokemon(speciesId);
  const moveset = context.getRecommendedMoveset?.(speciesId);
  if (!pokemon || !moveset) {
    return 0.5;
  }

  const chargedMoves = [moveset.chargedMove1, moveset.chargedMove2]
    .filter((moveId): moveId is string => moveId !== null)
    .map((moveId) => context.getMove?.(moveId))
    .filter((move): move is NonNullable<typeof move> => move !== undefined);
  if (chargedMoves.length === 0) {
    return 0.5;
  }

  const dpeValues = chargedMoves.map((move) =>
    move.power !== undefined && move.energy !== undefined && move.energy !== 0
      ? move.power / Math.abs(move.energy)
      : 1,
  );
  const energyCosts = chargedMoves.map((move) => Math.abs(move.energy ?? 55));
  const averageDpe = average(dpeValues);
  const dpeSpread = Math.max(...dpeValues) - Math.min(...dpeValues);
  const energySpread = Math.max(...energyCosts) - Math.min(...energyCosts);
  const moveTypes = new Set(chargedMoves.map((move) => move.type));
  const hasUsefulSecondMove = chargedMoves.length > 1 && moveTypes.size > 1;
  const neutralDamageScore = calculateUsefulNeutralDamageScore(
    [...moveTypes],
    context,
  );
  const baitDependencePenalty = chargedMoves.some(
    (move) => (move.power ?? 0) <= 45 && Math.abs(move.energy ?? 100) <= 40,
  )
    ? 0.25
    : 0;

  return clamp01(
    0.35 +
      Math.min(averageDpe / 2.2, 1) * 0.18 +
      neutralDamageScore * 0.2 +
      (hasUsefulSecondMove ? 0.12 : 0) -
      Math.min(dpeSpread / 1.5, 1) * 0.12 -
      Math.min(energySpread / 50, 1) * 0.12 -
      baitDependencePenalty,
  );
}

function calculateUsefulNeutralDamageScore(
  chargedMoveTypes: string[],
  context: PlayPokemonRosterScoringContext,
): number {
  if (chargedMoveTypes.length === 0) {
    return 0.5;
  }

  return calculateWeightedTypePoolScore(
    calculateOffensiveTypeRatio({
      attackingMoveTypes: chargedMoveTypes,
      defenderTypeProfiles: getThreatTypeProfiles(
        context,
        context.topThreats ?? context.threats,
        MAX_TOP_THREAT_POOL_SIZE,
      ),
    }),
    calculateOffensiveTypeRatio({
      attackingMoveTypes: chargedMoveTypes,
      defenderTypeProfiles: getThreatTypeProfiles(
        context,
        context.fullMetaThreats ?? context.threats,
      ),
    }),
  );
}

function calculateShieldStability(
  speciesId: string,
  context: PlayPokemonRosterScoringContext,
): number {
  if (!context.getShieldScenarioMatchupRating || context.threats.length === 0) {
    return 0.5;
  }

  const stabilityScores = context.threats.flatMap((threat) => {
    let ratings: number[];
    try {
      ratings = ([0, 1, 2] as const)
        .map((shields) =>
          context.getShieldScenarioMatchupRating!(speciesId, threat, shields),
        )
        .filter((rating): rating is number => rating !== null);
    } catch {
      // Optional shield-scenario data can be absent from fast contexts.
      return [];
    }
    if (ratings.length < 2) {
      return [];
    }

    const range = Math.max(...ratings) - Math.min(...ratings);
    const averageRating = average(ratings) / 1000;

    return [clamp01((1 - range / 500) * 0.55 + averageRating * 0.45)];
  });

  return stabilityScores.length > 0 ? average(stabilityScores) : 0.5;
}

function calculateBulkComponent(
  roster: string[],
  context: PlayPokemonRosterScoringContext,
): number {
  const bulkScores = roster
    .map((speciesId) => context.getPokemon(speciesId))
    .filter(
      (pokemon): pokemon is NonNullable<typeof pokemon> =>
        pokemon !== undefined,
    )
    .map((pokemon) => {
      const attack = Math.max(1, pokemon.baseStats.atk);
      const bulkApproximation =
        (pokemon.baseStats.def * pokemon.baseStats.hp) / attack;

      return clamp01((bulkApproximation - 50) / 250);
    });

  return bulkScores.length > 0 ? average(bulkScores) : 0.5;
}

function calculateRosterRoleComponent(
  roster: string[],
  context: PlayPokemonRosterScoringContext,
): number {
  return average(
    roster.map((speciesId) => calculateBestRosterRoleFit(speciesId, context)),
  );
}

function calculateBestRosterRoleFit(
  speciesId: string,
  context: PlayPokemonRosterScoringContext,
): number {
  return Math.max(
    calculateRoleFitScore(speciesId, 'lead', context),
    calculateRoleFitScore(speciesId, 'switch', context),
    calculateRoleFitScore(speciesId, 'closer', context),
  );
}

function calculateOrderedLineupRoleStrength(
  lineup: OrderedLineup,
  context: PlayPokemonRosterScoringContext,
): number {
  return (
    calculateRoleFitScore(lineup.lead, 'lead', context) * 0.4 +
    calculateRoleFitScore(lineup.switch, 'switch', context) * 0.35 +
    calculateRoleFitScore(lineup.closer, 'closer', context) * 0.25
  );
}

function calculateRoleFitScore(
  speciesId: string,
  role: LineupRole,
  context: PlayPokemonRosterScoringContext,
): number {
  const primary = normalizeScore(context.getRoleScore(speciesId, role));
  const consistency = getOptionalSupportingRoleRankingScore(
    speciesId,
    'consistency',
    context,
  );

  if (role === 'lead') {
    return weightedAverage([
      { score: primary, weight: 0.8 },
      {
        score: getOptionalSupportingRoleRankingScore(
          speciesId,
          'chargers',
          context,
        ),
        weight: 0.1,
      },
      { score: consistency, weight: 0.1 },
    ]);
  }

  if (role === 'switch') {
    return weightedAverage([
      { score: primary, weight: 0.65 },
      {
        score: getOptionalSupportingRoleRankingScore(
          speciesId,
          'chargers',
          context,
        ),
        weight: 0.25,
      },
      { score: consistency, weight: 0.1 },
    ]);
  }

  return weightedAverage([
    { score: primary, weight: 0.65 },
    {
      score: getOptionalSupportingRoleRankingScore(
        speciesId,
        'attackers',
        context,
      ),
      weight: 0.2,
    },
    { score: consistency, weight: 0.15 },
  ]);
}

function getOptionalSupportingRoleRankingScore(
  speciesId: string,
  category: SupportingRoleRankingCategory,
  context: PlayPokemonRosterScoringContext,
): number | undefined {
  if (!context.getRankingCategoryScore) {
    return undefined;
  }
  const unavailableCategories =
    unavailableSupportingRoleRankingCategories.get(context);
  if (unavailableCategories?.has(category)) {
    return undefined;
  }

  try {
    const score = context.getRankingCategoryScore(speciesId, category);

    return normalizeScore(score);
  } catch (error) {
    if (error instanceof MissingRankingDataError) {
      if (!unavailableCategories) {
        unavailableSupportingRoleRankingCategories.set(
          context,
          new Set([category]),
        );
      } else {
        unavailableCategories.add(category);
      }

      return undefined;
    }

    throw error;
  }
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
        MAX_TOP_THREAT_POOL_SIZE,
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
  const defensive = calculateWeightedTypePoolScore(
    calculateDefensiveTypeRatio({
      defenderTypes: pokemon.map((entry) => entry.types),
      incomingAttackTypes: getExpectedAttackTypes(
        context,
        context.topThreats ?? context.threats,
        MAX_TOP_THREAT_POOL_SIZE,
      ),
    }),
    calculateDefensiveTypeRatio({
      defenderTypes: pokemon.map((entry) => entry.types),
      incomingAttackTypes: getExpectedAttackTypes(
        context,
        context.fullMetaThreats ?? context.threats,
      ),
    }),
  );

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
  limit: number = MAX_FULL_META_THREAT_POOL_SIZE,
): string[][] {
  const profiles = sanitizeThreatPool(threats, limit)
    .map((speciesId) => context.getPokemon(speciesId)?.types ?? [])
    .filter((types) => types.length > 0);

  return profiles.length > 0 ? profiles : ALL_TYPES.map((type) => [type]);
}

function getExpectedAttackTypes(
  context: PlayPokemonRosterScoringContext,
  threats: string[],
  limit: number = MAX_FULL_META_THREAT_POOL_SIZE,
): string[] {
  const attackTypes = sanitizeThreatPool(threats, limit).flatMap(
    (speciesId) => {
      const pokemon = context.getPokemon(speciesId);

      return pokemon ? getExpectedThreatAttackTypes(pokemon, context) : [];
    },
  );

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

function weightedAverage(
  entries: Array<{ score: number | undefined; weight: number }>,
): number {
  const availableEntries = entries.filter(
    (entry): entry is { score: number; weight: number } =>
      entry.score !== undefined,
  );
  if (availableEntries.length === 0) {
    return 0;
  }

  const totalWeight = sum(availableEntries.map((entry) => entry.weight));

  return (
    sum(availableEntries.map((entry) => entry.score * entry.weight)) /
    totalWeight
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export type { LineupScoreResult };
