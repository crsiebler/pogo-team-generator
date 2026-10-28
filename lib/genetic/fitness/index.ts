import {
  createDefaultLineupScoringContext,
  scoreOrderedLineup,
  type LineupScoreResult,
  type LineupScoringContext,
  type LineupMovesetPolicy,
} from './lineupScoring';
import {
  evaluateTournamentRoster,
  type TournamentEvaluation,
} from './opponentRosterEvaluation';
import { buildGblLineupRecommendation } from './recommendations';
import { scoreFastRosterLineup } from './rosterScoring';
import {
  DEFAULT_BATTLE_FORMAT_ID,
  type BattleFormatId,
} from '@/lib/data/battleFormats';
import {
  loadOpponentRosters,
  type OpponentRosterDataset,
} from '@/lib/data/opponentRosters';
import { resolveRankedDefaultRosterMovesetAssignment } from '@/lib/genetic/moveset';
import { resolveRosterMovesetAssignment } from '@/lib/genetic/moveset';
import { TOURNAMENT_POLICY } from '@/lib/genetic/paretoSelection';
import type {
  Chromosome,
  OrderedLineup,
  RosterMovesetAssignment,
  TournamentMode,
  TournamentSelection,
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
  type LineupMovesetPolicy,
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

const LINEUP_AWARE_CACHE_VERSION = 6;

/** Read-only cache counters for one cache namespace. */
export interface LineupAwareFitnessCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
}

/** Per-run caches and data context for canonical lineup-aware fitness. */
export interface LineupAwareFitnessContext {
  evaluateTournament: (
    roster: readonly string[],
    assignment?: RosterMovesetAssignment,
    stage?: TournamentSelection['stage'],
  ) => TournamentEvaluation;
  scoringContext: LineupScoringContext;
  resolveMovesetAssignment: (
    roster: readonly string[],
  ) => RosterMovesetAssignment;
  scoreLineup: (
    lineup: OrderedLineup,
    assignment?: RosterMovesetAssignment,
  ) => LineupScoreResult;
  scoreFastLineup: (
    lineup: OrderedLineup,
    assignment?: RosterMovesetAssignment,
  ) => LineupScoreResult;
  readonly cacheStats: {
    readonly tournament: LineupAwareFitnessCacheStats;
    readonly lineup: LineupAwareFitnessCacheStats;
    readonly fastLineup: LineupAwareFitnessCacheStats;
  };
}

/** Injectable boundaries for one lineup-aware fitness run. */
export interface LineupAwareFitnessDependencies {
  opponentDataset?: OpponentRosterDataset;
  threatCount?: number;
  resolveMovesetAssignment?: (
    roster: readonly string[],
  ) => RosterMovesetAssignment;
}

/** Creates a cacheable fitness context for one generation run. */
export function createLineupAwareFitnessContext(
  formatId?: BattleFormatId,
  movesetPolicy: LineupMovesetPolicy = 'team-aware',
  dependencies: LineupAwareFitnessDependencies = {},
): LineupAwareFitnessContext {
  const resolvedFormatId = formatId ?? DEFAULT_BATTLE_FORMAT_ID;
  const scoringContext = {
    ...createDefaultLineupScoringContext(
      resolvedFormatId,
      dependencies.threatCount ?? 50,
      movesetPolicy,
    ),
    formatId: resolvedFormatId,
  };
  const lineupScoreCache = new Map<string, LineupScoreResult>();
  const fastLineupScoreCache = new Map<string, LineupScoreResult>();
  const tournamentCache = new Map<string, TournamentEvaluation>();
  let dataset = dependencies.opponentDataset;
  let tournamentHits = 0;
  let tournamentMisses = 0;
  let lineupCacheHits = 0;
  let lineupCacheMisses = 0;
  let fastLineupCacheHits = 0;
  let fastLineupCacheMisses = 0;
  const cacheStats = {
    get tournament(): LineupAwareFitnessCacheStats {
      return {
        hits: tournamentHits,
        misses: tournamentMisses,
        size: tournamentCache.size,
      };
    },
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
    evaluateTournament: (roster, assignment, stage = 'search') => {
      dataset ??= loadOpponentRosters(resolvedFormatId);
      const fixed =
        assignment ??
        resolveRankedDefaultRosterMovesetAssignment(roster, resolvedFormatId);
      const key = JSON.stringify([
        TOURNAMENT_POLICY.version,
        resolvedFormatId,
        dataset.fingerprint,
        stage,
        fixed.fingerprint,
      ]);
      const cached = tournamentCache.get(key);
      if (cached) {
        tournamentHits++;
        return cached;
      }
      tournamentMisses++;
      const result = evaluateTournamentRoster(
        roster,
        fixed,
        dataset,
        scoringContext,
        stage,
      );
      if (tournamentCache.size >= 256)
        tournamentCache.delete(tournamentCache.keys().next().value!);
      tournamentCache.set(key, result);
      return result;
    },
    scoringContext,
    cacheStats,
    resolveMovesetAssignment:
      dependencies.resolveMovesetAssignment ??
      ((roster) => resolveRosterMovesetAssignment(roster, resolvedFormatId)),
    scoreLineup: (lineup, assignment) => {
      const cacheKey = getLineupAwareFitnessCacheKey(
        lineup,
        resolvedFormatId,
        assignment?.fingerprint,
      );
      const cached = lineupScoreCache.get(cacheKey);
      if (cached) {
        lineupCacheHits++;
        return cached;
      }

      lineupCacheMisses++;
      const score = scoreOrderedLineup(
        lineup,
        bindRosterMovesetAssignment(scoringContext, assignment),
        { includeThreatScore: false },
      );
      lineupScoreCache.set(cacheKey, score);
      return score;
    },
    scoreFastLineup: (lineup, assignment) => {
      const cacheKey = getLineupAwareFitnessCacheKey(
        lineup,
        resolvedFormatId,
        assignment?.fingerprint,
      );
      const cached = fastLineupScoreCache.get(cacheKey);
      if (cached) {
        fastLineupCacheHits++;
        return cached;
      }

      fastLineupCacheMisses++;
      const score = scoreFastRosterLineup(
        lineup,
        bindRosterMovesetAssignment(scoringContext, assignment),
      );
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
    mode === 'PlayPokemon' ? 'ranked-default' : 'team-aware',
  ),
): number {
  if (mode === 'PlayPokemon') {
    return context.evaluateTournament(chromosome.team).selection.objectives
      .typical;
  }

  const assignment = context.resolveMovesetAssignment(chromosome.team);
  return buildGblLineupRecommendation(chromosome.team, {
    scoreLineup: (lineup) => context.scoreLineup(lineup, assignment),
  }).score;
}

/** Evaluates a population using the canonical lineup-aware fitness path. */
export function evaluatePopulation(
  population: Chromosome[],
  mode: TournamentMode,
  formatId?: BattleFormatId,
  context: LineupAwareFitnessContext = createLineupAwareFitnessContext(
    formatId,
    mode === 'PlayPokemon' ? 'ranked-default' : 'team-aware',
  ),
): void {
  for (const chromosome of population) {
    if (mode === 'PlayPokemon') {
      const evidence = context.evaluateTournament(chromosome.team);
      chromosome.tournamentSelection = evidence.selection;
      chromosome.fitness = evidence.selection.objectives.typical;
      continue;
    }
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
  assignmentFingerprint: string = 'unassigned',
): string {
  return JSON.stringify([
    LINEUP_AWARE_CACHE_VERSION,
    formatId ?? DEFAULT_BATTLE_FORMAT_ID,
    assignmentFingerprint,
    lineup.lead,
    lineup.switch,
    lineup.closer,
  ]);
}

/** Bind one fixed roster assignment into a scoring context. */
export function bindRosterMovesetAssignment(
  context: LineupScoringContext,
  assignment?: RosterMovesetAssignment,
): LineupScoringContext {
  const scoringFormatId = context.formatId ?? DEFAULT_BATTLE_FORMAT_ID;
  if (assignment && assignment.formatId !== scoringFormatId) {
    throw new Error(
      `Cannot bind ${assignment.formatId} movesets to ${scoringFormatId} scoring.`,
    );
  }
  return assignment ? { ...context, movesetAssignment: assignment } : context;
}
