import { MissingRankingDataError } from '@/lib/data/rankings';
import type { LineupScoringContext } from '@/lib/genetic/fitness/lineupScoring';
import type { RankedPokemon } from '@/lib/types';

const unavailableConsistencyContexts = new WeakSet<LineupScoringContext>();

/** Normalizes format-specific defense × HP against the ranked pool's 90th percentile. */
export function createBulkScoreLookup(
  rankings: readonly Pick<RankedPokemon, 'Pokemon' | 'Defense' | 'Stamina'>[],
): ReadonlyMap<string, number> {
  const entries = rankings.flatMap((ranking) => {
    const bulk = ranking.Defense * ranking.Stamina;
    return Number.isFinite(bulk) && ranking.Defense > 0 && ranking.Stamina > 0
      ? [{ name: ranking.Pokemon, bulk }]
      : [];
  });
  const values = entries.map(({ bulk }) => bulk).sort((a, b) => a - b);
  const reference = values[Math.ceil(values.length * 0.9) - 1];
  if (reference === undefined) return new Map();

  return new Map(
    entries.map(({ name, bulk }) => [name, clamp01(bulk / reference)]),
  );
}

/** Uses battle-stat bulk when supplied, with a base-stat approximation otherwise. */
export function calculateTeamBulk(
  speciesIds: readonly string[],
  context: LineupScoringContext,
): number {
  return average(
    speciesIds.map((speciesId) => {
      const rankedBulk = context.getBulkScore?.(speciesId);
      if (rankedBulk !== undefined && Number.isFinite(rankedBulk)) {
        return clamp01(rankedBulk);
      }
      const pokemon = context.getPokemon(speciesId);
      if (!pokemon) return 0.5;
      const { atk, def, hp } = pokemon.baseStats;
      if (![atk, def, hp].every((stat) => Number.isFinite(stat) && stat > 0))
        return 0.5;
      return clamp01(((def * hp) / atk - 50) / 250);
    }),
  );
}

/** Supplements matchup recovery with PvPoke's Switches category safety signal. */
export function calculateTeamSafety(
  speciesIds: readonly string[],
  context: LineupScoringContext,
  matchupSafety: number,
): number {
  const scores = speciesIds
    .map((speciesId) => context.getRoleScore(speciesId, 'switch'))
    .filter((score) => Number.isFinite(score) && score > 0)
    .map(normalizeRankingScore);
  return scores.length > 0
    ? clamp01(matchupSafety * 0.8 + average(scores) * 0.2)
    : clamp01(matchupSafety);
}

/** Prefers consistency exports while retaining moveset and simulation reliability evidence. */
export function calculateTeamConsistency(
  speciesIds: readonly string[],
  context: LineupScoringContext,
  fallback: (speciesId: string) => number,
): number {
  return average(
    speciesIds.map((speciesId) => {
      const proxy = fallback(speciesId);
      if (
        !context.getRankingCategoryScore ||
        unavailableConsistencyContexts.has(context)
      )
        return proxy;
      try {
        const ranking = context.getRankingCategoryScore(
          speciesId,
          'consistency',
        );
        return Number.isFinite(ranking) && ranking > 0
          ? clamp01(normalizeRankingScore(ranking) * 0.7 + proxy * 0.3)
          : proxy;
      } catch (error) {
        if (!(error instanceof MissingRankingDataError)) throw error;
        unavailableConsistencyContexts.add(context);
        return proxy;
      }
    }),
  );
}

function normalizeRankingScore(score: number): number {
  return clamp01(score > 1 ? score / 100 : score);
}

function average(values: readonly number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0.5;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
