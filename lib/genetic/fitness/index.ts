import {
  createDefaultLineupScoringContext,
  scoreOrderedLineup,
  type LineupScoreResult,
  type LineupScoringContext,
} from './lineupScoring';
import { buildGblLineupRecommendation } from './recommendations';
import { scoreFastRosterLineup, scorePlayPokemonRoster } from './rosterScoring';
import type { BattleFormatId } from '@/lib/data/battleFormats';
import type {
  Chromosome,
  LineupAwareFitnessConfig,
  OrderedLineup,
  TournamentMode,
} from '@/lib/types';

export {
  PlayPokemonRosterValidationError,
  enumeratePlayPokemonLineups,
  getPlayPokemonLineupKey,
} from './lineupEnumeration';

export {
  createDefaultLineupScoringContext,
  calculateLineupPatternLabel,
  scoreOrderedLineup,
  type LineupComponentScores,
  type LineupScoreResult,
  type LineupScoringContext,
  type LineupScoringOptions,
} from './lineupScoring';

export {
  scorePlayPokemonRoster,
  type PlayPokemonRosterScoreResult,
  type PlayPokemonRosterScoringContext,
} from './rosterScoring';

export {
  buildGblLineupRecommendation,
  buildPlayPokemonRosterRecommendations,
  type GblLineupRecommendationOptions,
  type PlayPokemonRosterRecommendationOptions,
  type PlayPokemonRosterRecommendationResult,
} from './recommendations';

export {
  OPTIMIZER_HARD_CONSTRAINT_CATEGORIES,
  OPTIMIZER_SCORE_COMPONENT_WEIGHTS,
  aggregateWeightedScore,
  createNormalizedScoreBreakdown,
  type OptimizerHardConstraintCategory,
  type OptimizerScoreBreakdown,
  type OptimizerScoreComponent,
  type OptimizerScoreComponents,
  type OptimizerScoreWeights,
} from './scoreBreakdown';

export {
  calculateOptimizerThreatScore,
  type OptimizerThreatScoreContext,
} from './threatScore';

export {
  calculateDefensiveTypeRatio,
  calculateOffensiveTypeRatio,
  calculateTypeEffectivenessMultiplier,
} from './typeEffectivenessRatios';

const FAST_LINEUP_AWARE_CONFIG: LineupAwareFitnessConfig = {
  mode: 'fast',
  includeDiagnostics: false,
  recommendationLimit: 0,
};
const LINEUP_AWARE_CACHE_VERSION = 1;

/** Read-only cache counters for one cache namespace. */
export interface LineupAwareFitnessCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
}

/** Per-run caches and data context for canonical lineup-aware fitness. */
export interface LineupAwareFitnessContext {
  scoringContext: LineupScoringContext;
  scoreLineup: (lineup: OrderedLineup) => LineupScoreResult;
  scoreFastLineup: (lineup: OrderedLineup) => LineupScoreResult;
  readonly cacheStats: {
    readonly lineup: LineupAwareFitnessCacheStats;
    readonly fastLineup: LineupAwareFitnessCacheStats;
  };
}

/** Creates a cacheable fitness context for one generation run. */
export function createLineupAwareFitnessContext(
  formatId?: BattleFormatId,
): LineupAwareFitnessContext {
  const scoringContext = createDefaultLineupScoringContext(formatId, 50);
  const lineupScoreCache = new Map<string, LineupScoreResult>();
  const fastLineupScoreCache = new Map<string, LineupScoreResult>();
  let lineupCacheHits = 0;
  let lineupCacheMisses = 0;
  let fastLineupCacheHits = 0;
  let fastLineupCacheMisses = 0;
  const cacheStats = {
    get lineup(): LineupAwareFitnessCacheStats {
      return {
        hits: lineupCacheHits,
        misses: lineupCacheMisses,
        size: lineupScoreCache.size,
      };
    },
    get fastLineup(): LineupAwareFitnessCacheStats {
      return {
        hits: fastLineupCacheHits,
        misses: fastLineupCacheMisses,
        size: fastLineupScoreCache.size,
      };
    },
  };

  return {
    scoringContext,
    cacheStats,
    scoreLineup: (lineup) => {
      const cacheKey = getLineupAwareFitnessCacheKey(lineup, formatId);
      const cached = lineupScoreCache.get(cacheKey);
      if (cached) {
        lineupCacheHits++;
        return cached;
      }

      lineupCacheMisses++;
      const score = scoreOrderedLineup(lineup, scoringContext, {
        includeThreatScore: false,
      });
      lineupScoreCache.set(cacheKey, score);
      return score;
    },
    scoreFastLineup: (lineup) => {
      const cacheKey = getLineupAwareFitnessCacheKey(lineup, formatId);
      const cached = fastLineupScoreCache.get(cacheKey);
      if (cached) {
        fastLineupCacheHits++;
        return cached;
      }

      fastLineupCacheMisses++;
      const score = scoreFastRosterLineup(lineup, scoringContext);
      fastLineupScoreCache.set(cacheKey, score);
      return score;
    },
  };
}

/** Calculates the canonical lineup-aware fitness for one chromosome. */
export function calculateLineupAwareFitness(
  chromosome: Chromosome,
  mode: TournamentMode,
  formatId?: BattleFormatId,
  context: LineupAwareFitnessContext = createLineupAwareFitnessContext(
    formatId,
  ),
): number {
  if (mode === 'PlayPokemon') {
    return scorePlayPokemonRoster(
      chromosome.team,
      {
        ...context.scoringContext,
        scoreLineup: context.scoreFastLineup,
      },
      FAST_LINEUP_AWARE_CONFIG,
    ).fitness;
  }

  return buildGblLineupRecommendation(chromosome.team, {
    scoreLineup: context.scoreLineup,
  }).score;
}

/** Evaluates a population using the canonical lineup-aware fitness path. */
export function evaluatePopulation(
  population: Chromosome[],
  mode: TournamentMode,
  formatId?: BattleFormatId,
  context: LineupAwareFitnessContext = createLineupAwareFitnessContext(
    formatId,
  ),
): void {
  for (const chromosome of population) {
    chromosome.fitness = calculateLineupAwareFitness(
      chromosome,
      mode,
      formatId,
      context,
    );
  }
}

/** Builds a deterministic, versioned cache key for one ordered lineup score. */
export function getLineupAwareFitnessCacheKey(
  lineup: OrderedLineup,
  formatId?: BattleFormatId,
): string {
  return JSON.stringify([
    LINEUP_AWARE_CACHE_VERSION,
    formatId ?? 'default-format',
    lineup.lead,
    lineup.switch,
    lineup.closer,
  ]);
}
