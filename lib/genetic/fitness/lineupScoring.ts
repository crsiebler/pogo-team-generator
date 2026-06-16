import { calculateEffectiveness } from '@/lib/coverage/typeChart';
import type { BattleFormatId } from '@/lib/data/battleFormats';
import { getMoveByMoveId, calculatePressureScore } from '@/lib/data/moves';
import {
  getPokemonBySpeciesId,
  normalizeToChoosableSpeciesId,
  speciesIdToSpeciesName,
} from '@/lib/data/pokemon';
import {
  getAverageRankingScore,
  getRankingScore,
  MissingRankingDataError,
} from '@/lib/data/rankings';
import {
  getMatchupQualityScore,
  getMatchupResult,
  getShieldScenarioMatchupResult,
  getTopThreatsByRole,
} from '@/lib/data/simulations';
import { scoreMatchupRating } from '@/lib/genetic/fitness/matchupScoring';
import {
  createNormalizedScoreBreakdown,
  type OptimizerScoreBreakdown,
  type OptimizerScoreComponents,
} from '@/lib/genetic/fitness/scoreBreakdown';
import {
  calculateOptimizerThreatScore,
  type OptimizerThreatScorePoolWeights,
} from '@/lib/genetic/fitness/threatScore';
import {
  calculateDefensiveTypeRatio,
  calculateOffensiveTypeRatio,
} from '@/lib/genetic/fitness/typeEffectivenessRatios';
import { getRecommendedMovesetForPokemon } from '@/lib/genetic/moveset';
import type {
  LineupCoverageMetrics,
  LineupPatternLabel,
  LineupResourcePathMetric,
  LineupResourcePathMetrics,
  LineupRole,
  OrderedLineup,
  Pokemon,
} from '@/lib/types';

interface LineupMoveset {
  fastMove: string | null;
  chargedMove1: string | null;
  chargedMove2: string | null;
}

interface LineupMoveData {
  type: string;
  power?: number;
  energy?: number;
}

type LineupRankingCategory = 'chargers' | 'attackers' | 'consistency';
const unavailableRoleRankingCategories = new WeakMap<
  LineupScoringContext,
  Set<LineupRankingCategory>
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

const ROLE_RANKING_BY_LINEUP_ROLE: Record<
  LineupRole,
  'leads' | 'switches' | 'closers'
> = {
  lead: 'leads',
  switch: 'switches',
  closer: 'closers',
};

const MAX_TOP_THREAT_POOL_SIZE = 50;
const MAX_FULL_META_THREAT_POOL_SIZE = 100;
const MAX_RECOMMENDED_LINEUP_WEAKNESSES = 5;
const MATCHUP_WIN_THRESHOLD = 500;
const MATCHUP_LOSS_THRESHOLD = 500;

/** Injectable data access for deterministic lineup scoring. */
export interface LineupScoringContext {
  threats: string[];
  topThreats?: string[];
  fullMetaThreats?: string[];
  formatId?: BattleFormatId;
  getPokemon: (speciesId: string) => Pokemon | undefined;
  getRankingScore: (speciesId: string) => number;
  getRoleScore: (speciesId: string, role: LineupRole) => number;
  getRankingCategoryScore?: (
    speciesId: string,
    category: LineupRankingCategory,
  ) => number;
  getMatchupRating: (
    speciesId: string,
    threatSpeciesId: string,
  ) => number | null;
  getShieldScenarioMatchupRating?: (
    speciesId: string,
    threatSpeciesId: string,
    shields: 0 | 1 | 2,
  ) => number | null;
  getMatchupQualityScore?: (speciesId: string) => number;
  getMove?: (moveId: string) => LineupMoveData | undefined;
  getRecommendedMoveset?: (speciesId: string) => LineupMoveset | undefined;
  getPressureScore?: (fastMoveId: string, chargedMoveId: string) => number;
  threatScorePoolWeights?: Partial<OptimizerThreatScorePoolWeights>;
}

/** Component score breakdown for fast ranking and later diagnostics. */
export interface LineupComponentScores {
  rankingQuality: number;
  roleStrength: number;
  matchupCoverage: number;
  typeSynergy: number;
  typeDiversity: number;
  moveCoverage: number;
  energyPressure: number;
  statBalance: number;
  singleAnswerReliability: number;
  coreBreakerReliability: number;
  shieldReliability: number;
}

/** Scored ordered lineup with shared recommendation-ready diagnostics. */
export interface LineupScoreResult {
  lineup: OrderedLineup;
  score: number;
  coverageMetrics: LineupCoverageMetrics;
  coveredThreats: string[];
  weaknesses: string[];
  singleAnswerRisks: string[];
  diagnosticLabel: LineupPatternLabel;
  resourcePathMetrics?: LineupResourcePathMetrics;
  componentScores: LineupComponentScores;
  scoreBreakdown: OptimizerScoreBreakdown;
}

/** Optional diagnostic controls for full versus hot-path lineup scoring. */
export interface LineupScoringOptions {
  includeThreatScore?: boolean;
}

/** Builds the production data context for lineup scoring. */
export function createDefaultLineupScoringContext(
  formatId?: BattleFormatId,
  threatCount: number = 100,
): LineupScoringContext {
  const boundedThreatCount = clampInteger(
    threatCount,
    0,
    MAX_FULL_META_THREAT_POOL_SIZE,
  );
  const fullMetaThreats = getTopThreatsByRole(boundedThreatCount, formatId);
  const topThreats = getTopThreatsByRole(
    clampInteger(threatCount, 0, MAX_TOP_THREAT_POOL_SIZE),
    formatId,
  );

  return {
    threats: fullMetaThreats,
    topThreats,
    fullMetaThreats,
    formatId,
    getPokemon: getPokemonBySpeciesId,
    getRankingScore: (speciesId) =>
      getAverageRankingScore(speciesIdToSpeciesName(speciesId), formatId),
    getRoleScore: (speciesId, role) =>
      getRankingScore(
        speciesIdToSpeciesName(speciesId),
        ROLE_RANKING_BY_LINEUP_ROLE[role],
        formatId,
      ) / 100,
    getRankingCategoryScore: (speciesId, category) =>
      getRankingScore(
        speciesIdToSpeciesName(speciesId),
        category as Parameters<typeof getRankingScore>[1],
        formatId,
      ) / 100,
    getMatchupRating: (speciesId, threatSpeciesId) =>
      getMatchupResult(speciesId, threatSpeciesId, formatId),
    getShieldScenarioMatchupRating: (speciesId, threatSpeciesId, shields) =>
      getShieldScenarioMatchupResult(
        speciesId,
        threatSpeciesId,
        shields,
        formatId,
      ),
    getMatchupQualityScore: (speciesId) =>
      getMatchupQualityScore(speciesId, formatId),
    getMove: getMoveByMoveId,
    getRecommendedMoveset: (speciesId) => {
      const pokemon = getPokemonBySpeciesId(speciesId);
      return pokemon
        ? getRecommendedMovesetForPokemon(pokemon, formatId)
        : undefined;
    },
    getPressureScore: calculatePressureScore,
  };
}

/** Scores one ordered pick-3 lineup while preserving legacy quality signals. */
export function scoreOrderedLineup(
  lineup: OrderedLineup,
  context: LineupScoringContext,
  options: LineupScoringOptions = {},
): LineupScoreResult {
  const speciesIds = [lineup.lead, lineup.switch, lineup.closer];
  const pokemon = speciesIds
    .map((speciesId) => context.getPokemon(speciesId))
    .filter((entry): entry is Pokemon => entry !== undefined);

  const coverage = calculateCoverage(lineup, context);
  const weightedCoverage = coverage.weightedPoolCoverage;
  // Legacy signals intentionally left outside this lineup-level helper:
  // shadow preference, GBL surprise factor, and anchor synergy remain GA concerns
  // until the canonical fitness integration story replaces algorithm routing.
  const componentScores: LineupComponentScores = {
    rankingQuality: average(
      speciesIds.map((speciesId) =>
        normalizeScore(context.getRankingScore(speciesId)),
      ),
    ),
    roleStrength: calculateLineupRoleStrength(lineup, context),
    matchupCoverage:
      weightedCoverage * 0.65 +
      calculateRoleMatchupScore(lineup.lead, context.threats, context) * 0.35,
    typeSynergy: calculateTypeSynergy(pokemon),
    typeDiversity: calculateTypeDiversity(pokemon),
    moveCoverage: calculateMoveCoverage(pokemon, context),
    energyPressure: calculateEnergyPressure(pokemon, context),
    statBalance: calculateStatBalance(pokemon),
    singleAnswerReliability: calculateSingleAnswerReliability(
      coverage.coverageMetrics.singleAnswerThreatCount,
      coverage.evaluatedThreatCount,
    ),
    coreBreakerReliability: calculateCoreBreakerReliability(
      coverage.noAnswerThreatCount,
      coverage.evaluatedThreatCount,
    ),
    shieldReliability: calculateShieldReliability(speciesIds, context),
  };

  const diagnosticLabel = calculateLineupPatternLabel(lineup, context);
  const topThreats = sanitizeThreatPool(
    context.topThreats ?? context.threats,
    MAX_TOP_THREAT_POOL_SIZE,
  );
  const fullMetaThreats = sanitizeThreatPool(
    context.fullMetaThreats ?? context.threats,
    MAX_FULL_META_THREAT_POOL_SIZE,
  );
  const scoreBreakdown = createLineupScoreBreakdown(
    lineup,
    pokemon,
    componentScores,
    context,
    topThreats,
    fullMetaThreats,
    options.includeThreatScore ?? true,
  );

  return {
    lineup,
    score: scoreBreakdown.score,
    coverageMetrics: coverage.coverageMetrics,
    coveredThreats: coverage.coveredThreats,
    weaknesses: coverage.weaknesses,
    singleAnswerRisks: coverage.singleAnswerRisks,
    diagnosticLabel,
    resourcePathMetrics: calculateResourcePathMetrics(lineup, context),
    componentScores,
    scoreBreakdown,
  };
}

function createLineupScoreBreakdown(
  lineup: OrderedLineup,
  pokemon: Pokemon[],
  componentScores: LineupComponentScores,
  context: LineupScoringContext,
  topThreats: string[],
  fullMetaThreats: string[],
  includeThreatScore: boolean,
): OptimizerScoreBreakdown {
  const structureSafetyAdjustment = calculateStructureSafetyAdjustment(
    lineup,
    context,
  );
  const typeRatios = calculateLineupTypeRatios(pokemon, context);
  const components: OptimizerScoreComponents = {
    synergy: clamp01(
      componentScores.typeSynergy * 0.45 +
        componentScores.typeDiversity * 0.25 +
        componentScores.singleAnswerReliability * 0.15 +
        componentScores.coreBreakerReliability * 0.15 +
        structureSafetyAdjustment,
    ),
    coverage: clamp01(
      componentScores.matchupCoverage * 0.7 +
        componentScores.moveCoverage * 0.3,
    ),
    safety: clamp01(
      componentScores.singleAnswerReliability * 0.35 +
        componentScores.coreBreakerReliability * 0.35 +
        componentScores.shieldReliability * 0.2 +
        structureSafetyAdjustment * 0.1,
    ),
    consistency: clamp01(
      componentScores.energyPressure * 0.35 +
        componentScores.shieldReliability * 0.35 +
        componentScores.rankingQuality * 0.3,
    ),
    bulk: componentScores.statBalance,
    defensiveRatio: typeRatios.defensive,
    offensiveRatio: typeRatios.offensive,
    role: componentScores.roleStrength,
  };

  return createNormalizedScoreBreakdown(
    components,
    undefined,
    includeThreatScore
      ? {
          threatScore: calculateOptimizerThreatScore(
            [lineup.lead, lineup.switch, lineup.closer],
            createThreatScoreContext(context, topThreats, fullMetaThreats),
            { poolWeights: context.threatScorePoolWeights },
          ),
        }
      : {},
  );
}

function createThreatScoreContext(
  context: LineupScoringContext,
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

function calculateStructureSafetyAdjustment(
  lineup: OrderedLineup,
  context: LineupScoringContext,
): number {
  const topThreats = sanitizeThreatPool(
    context.topThreats ?? context.threats,
    MAX_TOP_THREAT_POOL_SIZE,
  );
  if (topThreats.length === 0) {
    return 0;
  }

  const reward = leadCoversBacklineWeakness(lineup, context, topThreats)
    ? 0.08
    : 0;
  const penalty = hasAbaLeadAlignmentFragility(lineup, context, topThreats)
    ? -0.12
    : 0;

  return reward + penalty;
}

function leadCoversBacklineWeakness(
  lineup: OrderedLineup,
  context: LineupScoringContext,
  topThreats: string[],
): boolean {
  return topThreats.some((threat) => {
    const leadRating = context.getMatchupRating(lineup.lead, threat);
    const switchRating = context.getMatchupRating(lineup.switch, threat);
    const closerRating = context.getMatchupRating(lineup.closer, threat);

    return (
      leadRating !== null &&
      switchRating !== null &&
      closerRating !== null &&
      leadRating > MATCHUP_WIN_THRESHOLD &&
      switchRating < MATCHUP_LOSS_THRESHOLD &&
      closerRating < MATCHUP_LOSS_THRESHOLD
    );
  });
}

function hasAbaLeadAlignmentFragility(
  lineup: OrderedLineup,
  context: LineupScoringContext,
  topThreats: string[],
): boolean {
  return topThreats.some((threat) => {
    const leadRating = context.getMatchupRating(lineup.lead, threat);
    const switchRating = context.getMatchupRating(lineup.switch, threat);
    const closerRating = context.getMatchupRating(lineup.closer, threat);

    return (
      leadRating !== null &&
      switchRating !== null &&
      closerRating !== null &&
      leadRating < MATCHUP_LOSS_THRESHOLD &&
      switchRating > MATCHUP_WIN_THRESHOLD &&
      closerRating < MATCHUP_LOSS_THRESHOLD
    );
  });
}

function calculateLineupTypeRatios(
  pokemon: Pokemon[],
  context: LineupScoringContext,
): { offensive: number; defensive: number } {
  if (pokemon.length === 0) {
    return { offensive: 0.5, defensive: 0.5 };
  }

  const attackingMoveTypes = pokemon.flatMap((entry) =>
    getLineupAttackingTypes(entry, context),
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
  context: LineupScoringContext,
  threats: string[],
  limit: number = MAX_FULL_META_THREAT_POOL_SIZE,
): string[][] {
  const profiles = sanitizeThreatPool(threats, limit)
    .map((speciesId) => context.getPokemon(speciesId)?.types ?? [])
    .filter((types) => types.length > 0);

  return profiles.length > 0 ? profiles : ALL_TYPES.map((type) => [type]);
}

function getExpectedAttackTypes(
  context: LineupScoringContext,
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
  pokemon: Pokemon,
  context: LineupScoringContext,
): string[] {
  const moveset = getContextMoveset(pokemon, context);
  const moveTypes = [
    moveset.fastMove,
    moveset.chargedMove1,
    moveset.chargedMove2,
  ]
    .filter((moveId): moveId is string => moveId !== null)
    .map((moveId) => getContextMove(moveId, context)?.type)
    .filter((moveType): moveType is string => moveType !== undefined);

  return moveTypes.length > 0 ? moveTypes : pokemon.types;
}

function getLineupAttackingTypes(
  pokemon: Pokemon,
  context: LineupScoringContext,
): string[] {
  const moveset = getContextMoveset(pokemon, context);
  const moveIds = [
    moveset.fastMove,
    moveset.chargedMove1,
    moveset.chargedMove2,
  ].filter((moveId): moveId is string => moveId !== null);
  if (moveIds.length === 0) {
    return pokemon.types;
  }

  const moveTypes = moveIds
    .map((moveId) => getContextMove(moveId, context)?.type)
    .filter((moveType): moveType is string => moveType !== undefined);

  return moveTypes.length === moveIds.length
    ? uniquePreservingOrder(moveTypes)
    : uniquePreservingOrder([...moveTypes, ...pokemon.types]);
}

function calculateLineupRoleStrength(
  lineup: OrderedLineup,
  context: LineupScoringContext,
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
  context: LineupScoringContext,
): number {
  const primary = normalizeScore(context.getRoleScore(speciesId, role));
  const consistency = getOptionalRankingCategoryScore(
    speciesId,
    'consistency',
    context,
  );

  if (role === 'lead') {
    return weightedAverage([
      { score: primary, weight: 0.8 },
      {
        score: getOptionalRankingCategoryScore(speciesId, 'chargers', context),
        weight: 0.1,
      },
      { score: consistency, weight: 0.1 },
    ]);
  }

  if (role === 'switch') {
    return weightedAverage([
      { score: primary, weight: 0.65 },
      {
        score: getOptionalRankingCategoryScore(speciesId, 'chargers', context),
        weight: 0.25,
      },
      { score: consistency, weight: 0.1 },
    ]);
  }

  return weightedAverage([
    { score: primary, weight: 0.65 },
    {
      score: getOptionalRankingCategoryScore(speciesId, 'attackers', context),
      weight: 0.2,
    },
    { score: consistency, weight: 0.15 },
  ]);
}

function getOptionalRankingCategoryScore(
  speciesId: string,
  category: LineupRankingCategory,
  context: LineupScoringContext,
): number | undefined {
  if (!context.getRankingCategoryScore) {
    return undefined;
  }
  const unavailableCategories = unavailableRoleRankingCategories.get(context);
  if (unavailableCategories?.has(category)) {
    return undefined;
  }

  try {
    const score = context.getRankingCategoryScore(speciesId, category);

    return normalizeScore(score);
  } catch (error) {
    if (error instanceof MissingRankingDataError) {
      if (!unavailableCategories) {
        unavailableRoleRankingCategories.set(context, new Set([category]));
      } else {
        unavailableCategories.add(category);
      }

      return undefined;
    }

    throw error;
  }
}

/** Classifies a lineup structure for diagnostics only, not primary scoring. */
export function calculateLineupPatternLabel(
  lineup: OrderedLineup,
  context: Pick<LineupScoringContext, 'getPokemon'>,
): LineupPatternLabel {
  const lead = context.getPokemon(lineup.lead);
  const switchPokemon = context.getPokemon(lineup.switch);
  const closer = context.getPokemon(lineup.closer);

  if (!lead || !switchPokemon || !closer) {
    return 'unknown';
  }

  if (sharesType(lead, closer)) {
    return 'ABA';
  }

  if (sharesType(switchPokemon, closer)) {
    return 'ABB';
  }

  return 'ABC';
}

interface LineupCoverageResult extends Pick<
  LineupScoreResult,
  'coverageMetrics' | 'coveredThreats' | 'weaknesses' | 'singleAnswerRisks'
> {
  evaluatedThreatCount: number;
  noAnswerThreatCount: number;
  weightedPoolCoverage: number;
}

interface ThreatPoolCoverageResult {
  metrics: NonNullable<LineupCoverageMetrics['topThreatCoverage']>;
  softCoverageRate: number;
}

function calculateCoverage(
  lineup: OrderedLineup,
  context: LineupScoringContext,
): LineupCoverageResult {
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
  const weaknessCandidates: Array<{
    threat: string;
    averageMatchupRating: number;
  }> = [];
  const singleAnswerRisks: string[] = [];
  let dominatingMatchupCount = 0;
  let evaluatedThreatCount = 0;
  let noAnswerThreatCount = 0;
  let overwhelmingLossCount = 0;

  const topThreatCoverageResult = calculateThreatPoolCoverage(
    speciesIds,
    topThreats,
    context,
  );
  const fullMetaCoverageResult = calculateThreatPoolCoverage(
    speciesIds,
    fullMetaThreats,
    context,
  );

  for (const threat of evaluatedThreats) {
    const ratings = getThreatRatings(speciesIds, threat, context);

    if (ratings.length === 0) {
      continue;
    }

    evaluatedThreatCount++;

    dominatingMatchupCount += ratings.filter((rating) => rating > 600).length;
    overwhelmingLossCount += ratings.filter((rating) => rating < 400).length;

    const winningRatings = ratings.filter((rating) => rating > 500);
    const losingRatings = ratings.filter((rating) => rating < 500);
    if (winningRatings.length > 0) {
      coveredThreats.push(threat);
    } else {
      noAnswerThreatCount++;
    }

    if (losingRatings.length > ratings.length / 2) {
      weaknessCandidates.push({
        threat,
        averageMatchupRating: average(ratings),
      });
    }

    if (winningRatings.length === 1) {
      singleAnswerRisks.push(threat);
    }
  }

  const coverageMetrics: LineupCoverageMetrics = {
    coverageRate:
      evaluatedThreatCount > 0
        ? coveredThreats.length / evaluatedThreatCount
        : 0,
    dominatingMatchupCount,
    overwhelmingLossCount,
    singleAnswerThreatCount: singleAnswerRisks.length,
    topThreatCoverage: topThreatCoverageResult.metrics,
    fullMetaCoverage: fullMetaCoverageResult.metrics,
  };

  return {
    coverageMetrics,
    coveredThreats,
    weaknesses: weaknessCandidates
      .toSorted(
        (first, second) =>
          first.averageMatchupRating - second.averageMatchupRating ||
          first.threat.localeCompare(second.threat),
      )
      .slice(0, MAX_RECOMMENDED_LINEUP_WEAKNESSES)
      .map((entry) => entry.threat),
    singleAnswerRisks,
    evaluatedThreatCount,
    noAnswerThreatCount,
    weightedPoolCoverage: calculateWeightedPoolCoverage(
      coverageMetrics,
      topThreatCoverageResult,
      fullMetaCoverageResult,
    ),
  };
}

function calculateThreatPoolCoverage(
  speciesIds: string[],
  threats: string[],
  context: LineupScoringContext,
): ThreatPoolCoverageResult {
  let coveredThreatCount = 0;
  let evaluatedThreatCount = 0;
  let dominatingMatchupCount = 0;
  let noAnswerThreatCount = 0;
  let overwhelmingLossCount = 0;
  let singleAnswerThreatCount = 0;
  let softCoverageTotal = 0;

  for (const threat of threats) {
    const ratings = getThreatRatings(speciesIds, threat, context);
    if (ratings.length === 0) {
      continue;
    }

    evaluatedThreatCount++;
    softCoverageTotal += Math.max(
      ...ratings.map((rating) => scoreMatchupRating(rating)),
    );
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
    metrics: {
      coverageRate:
        evaluatedThreatCount > 0
          ? coveredThreatCount / evaluatedThreatCount
          : 0,
      evaluatedThreatCount,
      noAnswerThreatCount,
      singleAnswerThreatCount,
      dominatingMatchupCount,
      overwhelmingLossCount,
    },
    softCoverageRate:
      evaluatedThreatCount > 0 ? softCoverageTotal / evaluatedThreatCount : 0,
  };
}

function getThreatRatings(
  speciesIds: string[],
  threat: string,
  context: LineupScoringContext,
): number[] {
  return speciesIds
    .map((speciesId) => context.getMatchupRating(speciesId, threat))
    .filter((rating): rating is number => rating !== null);
}

function calculateWeightedPoolCoverage(
  coverageMetrics: LineupCoverageMetrics,
  topThreatCoverage: ThreatPoolCoverageResult,
  fullMetaCoverage: ThreatPoolCoverageResult,
): number {
  const weightedPools = [
    { coverage: topThreatCoverage, weight: 0.7 },
    { coverage: fullMetaCoverage, weight: 0.3 },
  ].filter(
    (pool): pool is { coverage: ThreatPoolCoverageResult; weight: number } =>
      pool.coverage.metrics.evaluatedThreatCount > 0,
  );

  if (weightedPools.length === 0) {
    return coverageMetrics.coverageRate;
  }

  const totalWeight = weightedPools.reduce((sum, pool) => sum + pool.weight, 0);

  return (
    weightedPools.reduce(
      (sum, pool) => sum + pool.coverage.softCoverageRate * pool.weight,
      0,
    ) / totalWeight
  );
}

function calculateRoleMatchupScore(
  speciesId: string,
  threats: string[],
  context: LineupScoringContext,
): number {
  const ratings = threats
    .map((threat) => context.getMatchupRating(speciesId, threat))
    .filter((rating): rating is number => rating !== null);

  return ratings.length > 0
    ? average(ratings.map((rating) => scoreMatchupRating(rating)))
    : 0.5;
}

function calculateTypeSynergy(pokemon: Pokemon[]): number {
  if (pokemon.length === 0) {
    return 0;
  }

  const weaknessCounts = new Map<string, number>();
  const weaknessesByPokemon = pokemon.map((entry) => {
    const weaknesses = ALL_TYPES.filter(
      (type) => calculateEffectiveness(entry.types, type) >= 1.6,
    );
    for (const weakness of weaknesses) {
      weaknessCounts.set(weakness, (weaknessCounts.get(weakness) ?? 0) + 1);
    }
    return weaknesses;
  });

  let score = 1;
  for (const count of weaknessCounts.values()) {
    if (count >= 3) {
      score -= 0.35;
    } else if (count === 2) {
      score -= 0.15;
    }
  }

  let coveredWeaknesses = 0;
  let totalWeaknesses = 0;
  weaknessesByPokemon.forEach((weaknesses, index) => {
    for (const weakness of weaknesses) {
      totalWeaknesses++;
      if (
        pokemon.some(
          (entry, teammateIndex) =>
            teammateIndex !== index &&
            calculateEffectiveness(entry.types, weakness) <= 0.625,
        )
      ) {
        coveredWeaknesses++;
      }
    }
  });

  if (totalWeaknesses > 0) {
    score += (coveredWeaknesses / totalWeaknesses) * 0.25;
  }

  return clamp01(score);
}

function calculateTypeDiversity(pokemon: Pokemon[]): number {
  if (pokemon.length === 0) {
    return 0;
  }

  const typeCounts = new Map<string, number>();
  for (const entry of pokemon) {
    for (const type of entry.types) {
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    }
  }

  let score = 1;
  for (const count of typeCounts.values()) {
    if (count >= 3) {
      score -= 0.55;
    } else if (count === 2) {
      score -= 0.15;
    }
  }

  return clamp01(score);
}

function calculateMoveCoverage(
  pokemon: Pokemon[],
  context: LineupScoringContext,
): number {
  if (pokemon.length === 0) {
    return 0;
  }

  return average(
    pokemon.map((entry) => {
      const recommended = getContextMoveset(entry, context);
      const chargedMoves = [recommended.chargedMove1, recommended.chargedMove2]
        .filter((moveId): moveId is string => moveId !== null)
        .map((moveId) => getContextMove(moveId, context))
        .filter((move): move is NonNullable<typeof move> => move !== undefined);
      const moveTypes = new Set(chargedMoves.map((move) => move.type));
      const hasStab = chargedMoves.some((move) =>
        entry.types.includes(move.type),
      );

      return clamp01((hasStab ? 0.45 : 0) + Math.min(moveTypes.size, 2) * 0.25);
    }),
  );
}

function calculateEnergyPressure(
  pokemon: Pokemon[],
  context: LineupScoringContext,
): number {
  if (pokemon.length === 0) {
    return 0;
  }

  return average(
    pokemon.map((entry) => {
      const recommended = getContextMoveset(entry, context);
      if (!recommended.fastMove || !recommended.chargedMove1) {
        return 0.5;
      }

      return clamp01(
        getContextPressureScore(
          recommended.fastMove,
          recommended.chargedMove1,
          context,
        ) * 2,
      );
    }),
  );
}

function getContextMoveset(
  pokemon: Pokemon,
  context: LineupScoringContext,
): LineupMoveset {
  if (context.getRecommendedMoveset) {
    return (
      context.getRecommendedMoveset(pokemon.speciesId) ?? {
        fastMove: null,
        chargedMove1: null,
        chargedMove2: null,
      }
    );
  }

  return getRecommendedMovesetForPokemon(pokemon, context.formatId);
}

function getContextMove(
  moveId: string,
  context: LineupScoringContext,
): LineupMoveData | undefined {
  if (context.getMove) {
    return context.getMove(moveId);
  }

  return getMoveByMoveId(moveId);
}

function getContextPressureScore(
  fastMoveId: string,
  chargedMoveId: string,
  context: LineupScoringContext,
): number {
  return (
    context.getPressureScore?.(fastMoveId, chargedMoveId) ??
    calculatePressureScore(fastMoveId, chargedMoveId)
  );
}

function calculateStatBalance(pokemon: Pokemon[]): number {
  if (pokemon.length === 0) {
    return 0;
  }

  let bulkyCount = 0;
  let balancedCount = 0;
  let attackWeightedCount = 0;

  for (const entry of pokemon) {
    const bulkRatio =
      (entry.baseStats.def + entry.baseStats.hp) / entry.baseStats.atk;
    if (bulkRatio >= 2.5) {
      bulkyCount++;
    } else if (bulkRatio >= 1.8) {
      balancedCount++;
    } else {
      attackWeightedCount++;
    }
  }

  let score = 0.55;
  score += bulkyCount > 0 ? 0.25 : 0;
  score += balancedCount > 0 ? 0.2 : 0;
  score -= attackWeightedCount >= 2 ? 0.35 : 0;
  score -= attackWeightedCount === 3 ? 0.25 : 0;

  return clamp01(score);
}

function calculateSingleAnswerReliability(
  singleAnswerThreatCount: number,
  threatCount: number,
): number {
  return threatCount > 0
    ? clamp01(1 - singleAnswerThreatCount / threatCount)
    : 1;
}

function calculateCoreBreakerReliability(
  weaknessCount: number,
  threatCount: number,
): number {
  return threatCount > 0 ? clamp01(1 - weaknessCount / threatCount) : 1;
}

function calculateShieldReliability(
  speciesIds: string[],
  context: LineupScoringContext,
): number {
  if (!context.getMatchupQualityScore) {
    return 0.5;
  }

  return average(
    speciesIds.map((speciesId) =>
      clamp01(context.getMatchupQualityScore!(speciesId)),
    ),
  );
}

function calculateResourcePathMetrics(
  lineup: OrderedLineup,
  context: LineupScoringContext,
): LineupResourcePathMetrics | undefined {
  if (!context.getShieldScenarioMatchupRating) {
    return undefined;
  }

  return {
    balanced: calculateResourcePathMetric(lineup, context, {
      lead: 1,
      switch: 1,
      closer: 1,
    }),
    shieldSpend: calculateResourcePathMetric(lineup, context, {
      lead: 2,
      switch: 0,
      closer: 0,
    }),
    shieldSave: calculateResourcePathMetric(lineup, context, {
      lead: 0,
      switch: 2,
      closer: 2,
    }),
  };
}

function calculateResourcePathMetric(
  lineup: OrderedLineup,
  context: LineupScoringContext,
  shieldsByRole: Record<LineupRole, 0 | 1 | 2>,
): LineupResourcePathMetric {
  const ratings: number[] = [];
  let availableRatingCount = 0;

  for (const threat of context.threats) {
    for (const role of ['lead', 'switch', 'closer'] as const) {
      const rating = context.getShieldScenarioMatchupRating!(
        lineup[role],
        threat,
        shieldsByRole[role],
      );
      ratings.push(rating ?? 500);
      availableRatingCount += rating === null ? 0 : 1;
    }
  }

  if (ratings.length === 0 || availableRatingCount === 0) {
    return { available: false };
  }

  return {
    available: true,
    score: average(ratings.map((rating) => scoreMatchupRating(rating))),
  };
}

function sharesType(first: Pokemon, second: Pokemon): boolean {
  return first.types.some((type) => second.types.includes(type));
}

function normalizeScore(score: number): number {
  return score > 1 ? clamp01(score / 100) : clamp01(score);
}

function average(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
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

  const totalWeight = availableEntries.reduce(
    (total, entry) => total + entry.weight,
    0,
  );

  return (
    availableEntries.reduce(
      (total, entry) => total + entry.score * entry.weight,
      0,
    ) / totalWeight
  );
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

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
