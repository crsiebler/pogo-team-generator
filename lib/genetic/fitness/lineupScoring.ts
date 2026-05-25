import { calculateEffectiveness } from '@/lib/coverage/typeChart';
import type { BattleFormatId } from '@/lib/data/battleFormats';
import { getMoveByMoveId, calculatePressureScore } from '@/lib/data/moves';
import {
  getPokemonBySpeciesId,
  speciesIdToSpeciesName,
} from '@/lib/data/pokemon';
import { getAverageRankingScore, getRankingScore } from '@/lib/data/rankings';
import {
  getMatchupQualityScore,
  getMatchupResult,
  getShieldScenarioMatchupResult,
  getTopThreatsByRole,
} from '@/lib/data/simulations';
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
}

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

/** Injectable data access for deterministic lineup scoring. */
export interface LineupScoringContext {
  threats: string[];
  formatId?: BattleFormatId;
  getPokemon: (speciesId: string) => Pokemon | undefined;
  getRankingScore: (speciesId: string) => number;
  getRoleScore: (speciesId: string, role: LineupRole) => number;
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
}

/** Builds the production data context for lineup scoring. */
export function createDefaultLineupScoringContext(
  formatId?: BattleFormatId,
  threatCount: number = 100,
): LineupScoringContext {
  return {
    threats: getTopThreatsByRole(threatCount, formatId),
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
): LineupScoreResult {
  const speciesIds = [lineup.lead, lineup.switch, lineup.closer];
  const pokemon = speciesIds
    .map((speciesId) => context.getPokemon(speciesId))
    .filter((entry): entry is Pokemon => entry !== undefined);

  const coverage = calculateCoverage(lineup, context);
  // Legacy signals intentionally left outside this lineup-level helper:
  // shadow preference, GBL surprise factor, and anchor synergy remain GA concerns
  // until the canonical fitness integration story replaces algorithm routing.
  const componentScores: LineupComponentScores = {
    rankingQuality: average(
      speciesIds.map((speciesId) =>
        normalizeScore(context.getRankingScore(speciesId)),
      ),
    ),
    roleStrength:
      normalizeScore(context.getRoleScore(lineup.lead, 'lead')) * 0.4 +
      normalizeScore(context.getRoleScore(lineup.switch, 'switch')) * 0.35 +
      normalizeScore(context.getRoleScore(lineup.closer, 'closer')) * 0.25,
    matchupCoverage:
      coverage.coverageMetrics.coverageRate * 0.65 +
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
      coverage.weaknesses.length,
      coverage.evaluatedThreatCount,
    ),
    shieldReliability: calculateShieldReliability(speciesIds, context),
  };

  const score =
    componentScores.rankingQuality * 0.16 +
    componentScores.roleStrength * 0.16 +
    componentScores.matchupCoverage * 0.18 +
    componentScores.typeSynergy * 0.08 +
    componentScores.typeDiversity * 0.07 +
    componentScores.moveCoverage * 0.07 +
    componentScores.energyPressure * 0.05 +
    componentScores.statBalance * 0.11 +
    componentScores.singleAnswerReliability * 0.05 +
    componentScores.coreBreakerReliability * 0.05 +
    componentScores.shieldReliability * 0.02;

  return {
    lineup,
    score,
    coverageMetrics: coverage.coverageMetrics,
    coveredThreats: coverage.coveredThreats,
    weaknesses: coverage.weaknesses,
    singleAnswerRisks: coverage.singleAnswerRisks,
    diagnosticLabel: calculateLineupPatternLabel(lineup, context),
    resourcePathMetrics: calculateResourcePathMetrics(lineup, context),
    componentScores,
  };
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
}

function calculateCoverage(
  lineup: OrderedLineup,
  context: LineupScoringContext,
): LineupCoverageResult {
  const speciesIds = [lineup.lead, lineup.switch, lineup.closer];
  const coveredThreats: string[] = [];
  const weaknesses: string[] = [];
  const singleAnswerRisks: string[] = [];
  let dominatingMatchupCount = 0;
  let evaluatedThreatCount = 0;
  let overwhelmingLossCount = 0;

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

  return {
    coverageMetrics: {
      coverageRate:
        evaluatedThreatCount > 0
          ? coveredThreats.length / evaluatedThreatCount
          : 0,
      dominatingMatchupCount,
      overwhelmingLossCount,
      singleAnswerThreatCount: singleAnswerRisks.length,
    },
    coveredThreats,
    weaknesses,
    singleAnswerRisks,
    evaluatedThreatCount,
  };
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
    ? average(ratings.map((rating) => rating / 1000))
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
    score: average(ratings.map((rating) => rating / 1000)),
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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
