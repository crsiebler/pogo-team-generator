import { promises as fs } from 'fs';
import path from 'path';
import { createPvpokeAdapter, RankingCategory, RankingCup } from './adapter';
import { syncConfig } from './config';
import {
  deriveMovesetCandidates,
  type DerivedMovesetCandidateSet,
} from './movesetCandidates';
import {
  MovesData,
  PokemonData,
  RankingEntry,
  RankingsCsv,
  SyncRunOptions,
} from './types';
import { logError } from './utils';
import { logValidationErrors, validateRankingsCsv } from './validation';
import {
  normalizeMoveId,
  resolveSpeciesAlias,
  type SpeciesAliasKind,
} from '@/lib/data/aliases';
import {
  getBattleFormats,
  type BattleFormatId,
} from '@/lib/data/battleFormats';
import { createMoveAvailabilityResolver } from '@/lib/data/moveAvailability';

/** One move-usage value retained from a PvPoke ranking entry. */
export interface RankingMoveUsageEntry {
  moveId: string;
  uses: number | null;
}

/** One unmodified ranking record read from PvPoke source data. */
export interface RankingSourceEntry {
  speciesId: string;
  speciesName: string;
  score: number;
  moveset: string[];
  moves: {
    fastMoves: RankingMoveUsageEntry[];
    chargedMoves: RankingMoveUsageEntry[];
  };
  stats?: {
    atk?: number;
    def?: number;
    hp?: number;
  };
}

/** Source ranking evidence annotated before canonical species deduplication. */
export interface RankingSourceEvidenceEntry extends RankingSourceEntry {
  sourceSpeciesId: string;
  sourceSpeciesName: string;
  canonicalSpeciesId: string;
  speciesAliasKind: SpeciesAliasKind | null;
}

/** Canonical ranking record retaining every source alias record. */
export interface NormalizedRankingSourceEntry extends RankingSourceEntry {
  sourceSpeciesId: string;
  sourceSpeciesName: string;
  canonicalSpeciesId: string;
  speciesAliasKind: SpeciesAliasKind | null;
  sourceEntries: readonly RankingSourceEvidenceEntry[];
}

/** One explicit PvPoke moveset override retained for candidate derivation. */
export interface PvpokeMovesetOverride {
  speciesId: string;
  fastMove?: string;
  chargedMoves?: string[];
  weight?: number;
}

/** Unaggregated category evidence for one supported battle format. */
export interface RankingCategoryEvidence {
  formatId: BattleFormatId;
  cup: RankingCup;
  cp: number;
  category: RankingCategory;
  entries: readonly NormalizedRankingSourceEntry[];
}

/** Explicit moveset overrides for one supported battle format. */
export interface RankingOverrideEvidence {
  formatId: BattleFormatId;
  cup: RankingCup;
  cp: number;
  entries: readonly PvpokeMovesetOverride[];
}

/** Category weights used after per-entry move usage normalization. */
export const RANKING_CATEGORY_WEIGHTS: Readonly<
  Record<RankingCategory, number>
> = {
  overall: 3,
  leads: 2,
  switches: 2,
  closers: 2,
  chargers: 1,
  attackers: 1,
  consistency: 1,
};

/** Usage-only move evidence aggregated across ranking categories. */
export interface AggregatedMoveUsageEvidence {
  readonly moveId: string;
  readonly categoryOccurrenceCount: number;
  readonly weightedNormalizedUse: number;
  readonly overallUse: number | null;
  readonly evidencePriority: 1;
}

/** Exact moveset evidence observed in a ranking category. */
export interface ObservedRankingMovesetEvidence {
  readonly source: 'observed';
  readonly evidencePriority: 0;
  readonly category: RankingCategory;
  readonly categoryWeight: number;
  readonly sourceSpeciesId: string;
  readonly speciesAliasKind: SpeciesAliasKind | null;
  readonly isPreferred: boolean;
  readonly moveset: readonly string[];
}

/** Explicit PvPoke moveset override evidence for one canonical species. */
export interface OverrideRankingMovesetEvidence {
  readonly source: 'override';
  readonly evidencePriority: 0;
  readonly sourceSpeciesId: string;
  readonly fastMove?: string;
  readonly chargedMoves?: readonly string[];
  readonly weight: number | null;
}

/** Preferred exact-format evidence retained ahead of usage-only speculation. */
export type RankingMovesetEvidence =
  | ObservedRankingMovesetEvidence
  | OverrideRankingMovesetEvidence;

/** Deterministic ranking evidence for one species and battle format. */
export interface AggregatedRankingMoveEvidence {
  readonly formatId: BattleFormatId;
  readonly cup: RankingCup;
  readonly cp: number;
  readonly speciesId: string;
  readonly movesetEvidence: readonly RankingMovesetEvidence[];
  readonly fastMoves: readonly AggregatedMoveUsageEvidence[];
  readonly chargedMoves: readonly AggregatedMoveUsageEvidence[];
}

/** Ranking CSV output plus source evidence needed by later sync phases. */
export interface RankingSyncResult {
  rankings: RankingsCsv;
  categoryEvidence: readonly RankingCategoryEvidence[];
  overrideEvidence: readonly RankingOverrideEvidence[];
  aggregatedEvidence: readonly AggregatedRankingMoveEvidence[];
  candidateSets: readonly DerivedMovesetCandidateSet[];
}

interface NormalizedMoveUsage {
  readonly moveId: string;
  readonly rawUse: number | null;
  readonly normalizedUse: number;
}

interface MoveUsageContribution {
  readonly category: RankingCategory;
  readonly weightedNormalizedUse: number;
}

interface MutableAggregatedRankingMoveEvidence {
  readonly formatId: BattleFormatId;
  readonly cup: RankingCup;
  readonly cp: number;
  readonly speciesId: string;
  readonly movesetEvidence: RankingMovesetEvidence[];
  readonly fastMoveContributions: Map<string, MoveUsageContribution[]>;
  readonly chargedMoveContributions: Map<string, MoveUsageContribution[]>;
  readonly fastMoveOverallUses: Map<string, Array<number | null>>;
  readonly chargedMoveOverallUses: Map<string, Array<number | null>>;
}

function normalizeMoveUsageEntries(
  entries: readonly RankingMoveUsageEntry[],
): NormalizedMoveUsage[] {
  const usesByMoveId = new Map<string, Array<number | null>>();

  for (const entry of entries) {
    const moveId = normalizeMoveId(entry.moveId);
    const uses = usesByMoveId.get(moveId) ?? [];
    uses.push(entry.uses);
    usesByMoveId.set(moveId, uses);
  }

  const groupedUses = Array.from(usesByMoveId.entries())
    .map(([moveId, uses]) => {
      const numericUses = uses
        .filter((use): use is number => use !== null)
        .sort((left, right) => left - right);
      return {
        moveId,
        rawUse:
          numericUses.length === 0
            ? null
            : numericUses.reduce((sum, use) => sum + use, 0),
      };
    })
    .sort((left, right) => left.moveId.localeCompare(right.moveId));
  const totalPositiveUse = groupedUses.reduce((sum, { rawUse }) => {
    return sum + (rawUse !== null && rawUse > 0 ? rawUse : 0);
  }, 0);

  return groupedUses.map(({ moveId, rawUse }) => {
    return {
      moveId,
      rawUse,
      normalizedUse:
        rawUse !== null && rawUse > 0 && totalPositiveUse > 0
          ? rawUse / totalPositiveUse
          : 0,
    };
  });
}

function addMoveUsage(
  group: MutableAggregatedRankingMoveEvidence,
  category: RankingCategory,
  entries: readonly RankingMoveUsageEntry[],
  slot: 'fast' | 'charged',
): void {
  const contributions =
    slot === 'fast'
      ? group.fastMoveContributions
      : group.chargedMoveContributions;
  const overallUses =
    slot === 'fast' ? group.fastMoveOverallUses : group.chargedMoveOverallUses;

  for (const usage of normalizeMoveUsageEntries(entries)) {
    if (category === 'overall') {
      const moveOverallUses = overallUses.get(usage.moveId) ?? [];
      moveOverallUses.push(usage.rawUse);
      overallUses.set(usage.moveId, moveOverallUses);
    }

    if (usage.normalizedUse <= 0) {
      continue;
    }

    const moveContributions = contributions.get(usage.moveId) ?? [];
    moveContributions.push({
      category,
      weightedNormalizedUse:
        usage.normalizedUse * RANKING_CATEGORY_WEIGHTS[category],
    });
    contributions.set(usage.moveId, moveContributions);
  }
}

function resolveOverallUse(
  values: Array<number | null> | undefined,
): number | null {
  if (!values) {
    return null;
  }

  const numericValues = values
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  return numericValues.length === 0
    ? null
    : numericValues.reduce((sum, value) => sum + value, 0);
}

function aggregateMoveUsage(
  contributionsByMoveId: ReadonlyMap<string, MoveUsageContribution[]>,
  overallUsesByMoveId: ReadonlyMap<string, Array<number | null>>,
): AggregatedMoveUsageEvidence[] {
  return Array.from(contributionsByMoveId.entries())
    .map(([moveId, contributions]): AggregatedMoveUsageEvidence => {
      const sortedContributions = [...contributions].sort((left, right) => {
        return (
          left.category.localeCompare(right.category) ||
          left.weightedNormalizedUse - right.weightedNormalizedUse
        );
      });
      const weightedNormalizedUse = sortedContributions.reduce(
        (sum, contribution) => sum + contribution.weightedNormalizedUse,
        0,
      );

      return {
        moveId,
        categoryOccurrenceCount: new Set(
          sortedContributions.map(({ category }) => category),
        ).size,
        weightedNormalizedUse:
          Math.round(weightedNormalizedUse * 1_000_000_000_000) /
          1_000_000_000_000,
        overallUse: resolveOverallUse(overallUsesByMoveId.get(moveId)),
        evidencePriority: 1,
      };
    })
    .sort((left, right) => {
      return (
        right.weightedNormalizedUse - left.weightedNormalizedUse ||
        right.categoryOccurrenceCount - left.categoryOccurrenceCount ||
        (right.overallUse ?? Number.NEGATIVE_INFINITY) -
          (left.overallUse ?? Number.NEGATIVE_INFINITY) ||
        left.moveId.localeCompare(right.moveId)
      );
    });
}

function compareMovesetEvidence(
  left: RankingMovesetEvidence,
  right: RankingMovesetEvidence,
): number {
  const sourceDifference = left.source.localeCompare(right.source);
  if (sourceDifference !== 0) {
    return left.source === 'override' ? -1 : 1;
  }

  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

/**
 * Normalize and aggregate format-scoped ranking move evidence deterministically.
 */
export function aggregateRankingMoveEvidence(
  categoryEvidence: readonly RankingCategoryEvidence[],
  overrideEvidence: readonly RankingOverrideEvidence[],
): AggregatedRankingMoveEvidence[] {
  const groups = new Map<string, MutableAggregatedRankingMoveEvidence>();
  const getGroup = (
    formatId: BattleFormatId,
    cup: RankingCup,
    cp: number,
    speciesId: string,
  ): MutableAggregatedRankingMoveEvidence => {
    const key = `${formatId}|${speciesId}`;
    const existing = groups.get(key);
    if (existing) {
      return existing;
    }

    const group: MutableAggregatedRankingMoveEvidence = {
      formatId,
      cup,
      cp,
      speciesId,
      movesetEvidence: [],
      fastMoveContributions: new Map(),
      chargedMoveContributions: new Map(),
      fastMoveOverallUses: new Map(),
      chargedMoveOverallUses: new Map(),
    };
    groups.set(key, group);
    return group;
  };

  const sortedCategoryEvidence = [...categoryEvidence].sort((left, right) => {
    return (
      left.formatId.localeCompare(right.formatId) ||
      left.category.localeCompare(right.category)
    );
  });
  for (const evidence of sortedCategoryEvidence) {
    const sortedEntries = [...evidence.entries].sort((left, right) => {
      return left.speciesId.localeCompare(right.speciesId);
    });
    for (const entry of sortedEntries) {
      const group = getGroup(
        evidence.formatId,
        evidence.cup,
        evidence.cp,
        entry.canonicalSpeciesId,
      );
      addMoveUsage(group, evidence.category, entry.moves.fastMoves, 'fast');
      addMoveUsage(
        group,
        evidence.category,
        entry.moves.chargedMoves,
        'charged',
      );

      for (const [sourceIndex, sourceEntry] of entry.sourceEntries.entries()) {
        group.movesetEvidence.push({
          source: 'observed',
          evidencePriority: 0,
          category: evidence.category,
          categoryWeight: RANKING_CATEGORY_WEIGHTS[evidence.category],
          sourceSpeciesId: sourceEntry.sourceSpeciesId,
          speciesAliasKind: sourceEntry.speciesAliasKind,
          isPreferred: sourceIndex === 0,
          moveset: sourceEntry.moveset.map(normalizeMoveId),
        });
      }
    }
  }

  const sortedOverrideEvidence = [...overrideEvidence].sort((left, right) => {
    return left.formatId.localeCompare(right.formatId);
  });
  for (const evidence of sortedOverrideEvidence) {
    for (const override of evidence.entries) {
      const alias = resolveSpeciesAlias(override.speciesId);
      const group = getGroup(
        evidence.formatId,
        evidence.cup,
        evidence.cp,
        alias.canonicalSpeciesId,
      );
      group.movesetEvidence.push({
        source: 'override',
        evidencePriority: 0,
        sourceSpeciesId: alias.sourceSpeciesId,
        ...(override.fastMove === undefined
          ? {}
          : { fastMove: normalizeMoveId(override.fastMove) }),
        ...(override.chargedMoves === undefined
          ? {}
          : { chargedMoves: override.chargedMoves.map(normalizeMoveId) }),
        weight: override.weight ?? null,
      });
    }
  }

  return Array.from(groups.values())
    .map((group): AggregatedRankingMoveEvidence => {
      return {
        formatId: group.formatId,
        cup: group.cup,
        cp: group.cp,
        speciesId: group.speciesId,
        movesetEvidence: [...group.movesetEvidence].sort(
          compareMovesetEvidence,
        ),
        fastMoves: aggregateMoveUsage(
          group.fastMoveContributions,
          group.fastMoveOverallUses,
        ),
        chargedMoves: aggregateMoveUsage(
          group.chargedMoveContributions,
          group.chargedMoveOverallUses,
        ),
      };
    })
    .sort((left, right) => {
      return (
        left.formatId.localeCompare(right.formatId) ||
        left.speciesId.localeCompare(right.speciesId)
      );
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateMoveUsageEntries(
  value: unknown,
  context: string,
  entryIndex: number,
  field: 'fastMoves' | 'chargedMoves',
): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `[sync-rankings] Invalid ${context} ranking source entry ${entryIndex}: moves.${field} must be an array`,
    );
  }

  value.forEach((usage, usageIndex) => {
    if (!isRecord(usage)) {
      throw new Error(
        `[sync-rankings] Invalid ${context} ranking source entry ${entryIndex}: moves.${field}[${usageIndex}] must be an object`,
      );
    }
    if (typeof usage.moveId !== 'string') {
      throw new Error(
        `[sync-rankings] Invalid ${context} ranking source entry ${entryIndex}: moves.${field}[${usageIndex}].moveId must be a string`,
      );
    }
    if (
      usage.uses !== null &&
      (typeof usage.uses !== 'number' ||
        !Number.isFinite(usage.uses) ||
        usage.uses < 0)
    ) {
      throw new Error(
        `[sync-rankings] Invalid ${context} ranking source entry ${entryIndex}: moves.${field}[${usageIndex}].uses must be a non-negative finite number or null`,
      );
    }
  });
}

/**
 * Validate parsed PvPoke ranking JSON before exposing typed source evidence.
 */
export function parseRankingSourceEntries(
  data: unknown,
  context: string,
): RankingSourceEntry[] {
  if (!Array.isArray(data)) {
    throw new Error(
      `[sync-rankings] Invalid ${context} ranking source: expected an array`,
    );
  }

  data.forEach((entry, entryIndex) => {
    if (!isRecord(entry)) {
      throw new Error(
        `[sync-rankings] Invalid ${context} ranking source entry ${entryIndex}: expected an object`,
      );
    }
    if (typeof entry.speciesId !== 'string') {
      throw new Error(
        `[sync-rankings] Invalid ${context} ranking source entry ${entryIndex}: speciesId must be a string`,
      );
    }
    if (typeof entry.speciesName !== 'string') {
      throw new Error(
        `[sync-rankings] Invalid ${context} ranking source entry ${entryIndex}: speciesName must be a string`,
      );
    }
    if (typeof entry.score !== 'number' || !Number.isFinite(entry.score)) {
      throw new Error(
        `[sync-rankings] Invalid ${context} ranking source entry ${entryIndex}: score must be a finite number`,
      );
    }
    if (
      !Array.isArray(entry.moveset) ||
      entry.moveset.some((moveId) => typeof moveId !== 'string')
    ) {
      throw new Error(
        `[sync-rankings] Invalid ${context} ranking source entry ${entryIndex}: moveset must contain strings`,
      );
    }
    if (entry.moveset.length > 3) {
      throw new Error(
        `[sync-rankings] Invalid ${context} ranking source entry ${entryIndex}: moveset must contain at most three strings`,
      );
    }
    if (!isRecord(entry.moves)) {
      throw new Error(
        `[sync-rankings] Invalid ${context} ranking source entry ${entryIndex}: moves must be an object`,
      );
    }

    validateMoveUsageEntries(
      entry.moves.fastMoves,
      context,
      entryIndex,
      'fastMoves',
    );
    validateMoveUsageEntries(
      entry.moves.chargedMoves,
      context,
      entryIndex,
      'chargedMoves',
    );
  });

  return data as RankingSourceEntry[];
}

/**
 * Validate parsed PvPoke moveset overrides before exposing typed evidence.
 */
export function parseMovesetOverrides(
  data: unknown,
  context: string,
): PvpokeMovesetOverride[] {
  if (!Array.isArray(data)) {
    throw new Error(
      `[sync-rankings] Invalid ${context} moveset overrides: expected an array`,
    );
  }

  data.forEach((override, overrideIndex) => {
    const prefix = `[sync-rankings] Invalid ${context} moveset override ${overrideIndex}`;
    if (!isRecord(override)) {
      throw new Error(`${prefix}: expected an object`);
    }
    if (typeof override.speciesId !== 'string') {
      throw new Error(`${prefix}: speciesId must be a string`);
    }
    if (
      override.fastMove !== undefined &&
      typeof override.fastMove !== 'string'
    ) {
      throw new Error(`${prefix}: fastMove must be a string if present`);
    }
    if (
      override.chargedMoves !== undefined &&
      (!Array.isArray(override.chargedMoves) ||
        override.chargedMoves.some((moveId) => typeof moveId !== 'string'))
    ) {
      throw new Error(`${prefix}: chargedMoves must contain strings`);
    }
    if (
      override.chargedMoves !== undefined &&
      override.chargedMoves.length !== 2
    ) {
      throw new Error(
        `${prefix}: chargedMoves must contain exactly two strings`,
      );
    }
    if (
      override.weight !== undefined &&
      (typeof override.weight !== 'number' || !Number.isFinite(override.weight))
    ) {
      throw new Error(`${prefix}: weight must be a finite number if present`);
    }
  });

  return data as PvpokeMovesetOverride[];
}

function compareRankingSourceEntries(
  left: RankingSourceEntry,
  right: RankingSourceEntry,
): number {
  const scoreDifference = right.score - left.score;
  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const leftIsAlias = resolveSpeciesAlias(left.speciesId).aliasKind !== null;
  const rightIsAlias = resolveSpeciesAlias(right.speciesId).aliasKind !== null;
  if (leftIsAlias !== rightIsAlias) {
    return leftIsAlias ? 1 : -1;
  }

  const toStableKey = (entry: RankingSourceEntry): string => {
    return [
      entry.speciesId,
      entry.speciesName,
      entry.moveset.join(','),
      entry.moves.fastMoves
        .map(({ moveId, uses }) => `${moveId}:${uses}`)
        .join(','),
      entry.moves.chargedMoves
        .map(({ moveId, uses }) => `${moveId}:${uses}`)
        .join(','),
      entry.stats?.atk ?? '',
      entry.stats?.def ?? '',
      entry.stats?.hp ?? '',
    ].join('|');
  };

  return toStableKey(left).localeCompare(toStableKey(right));
}

/**
 * Canonicalize and deterministically deduplicate rankings while retaining
 * source-form evidence.
 */
export function normalizeRankingSourceEntries(
  entries: RankingSourceEntry[],
): NormalizedRankingSourceEntry[] {
  const bySpeciesId = new Map<string, NormalizedRankingSourceEntry>();

  for (const entry of entries) {
    const alias = resolveSpeciesAlias(entry.speciesId);
    const canonicalSpeciesId = alias.canonicalSpeciesId;
    const existing = bySpeciesId.get(canonicalSpeciesId);
    const evidenceEntry: RankingSourceEvidenceEntry = {
      ...entry,
      sourceSpeciesId: alias.sourceSpeciesId,
      sourceSpeciesName: entry.speciesName,
      canonicalSpeciesId,
      speciesAliasKind: alias.aliasKind,
    };
    const sourceEntries = [
      ...(existing?.sourceEntries ?? []),
      evidenceEntry,
    ].sort(compareRankingSourceEntries);
    const preferredEntry = sourceEntries[0];
    const preferredAlias = resolveSpeciesAlias(preferredEntry.speciesId);
    const normalizedEntry: NormalizedRankingSourceEntry = {
      ...preferredEntry,
      speciesId: canonicalSpeciesId,
      canonicalSpeciesId,
      sourceSpeciesId: preferredAlias.sourceSpeciesId,
      sourceSpeciesName: preferredEntry.speciesName,
      speciesAliasKind: preferredAlias.aliasKind,
      sourceEntries,
    };

    bySpeciesId.set(canonicalSpeciesId, normalizedEntry);
  }

  return Array.from(bySpeciesId.values()).sort((left, right) => {
    return (
      right.score - left.score || left.speciesId.localeCompare(right.speciesId)
    );
  });
}

interface RankingSyncDependencies {
  createAdapter: (sourcePath: string) => {
    readRankingJson(
      category: RankingCategory,
      leagueCp: number,
      cup?: RankingCup,
    ): Promise<unknown>;
    readMovesetOverridesJson<T>(
      leagueCp: number,
      cup?: RankingCup,
    ): Promise<T[]>;
  };
  readFile: (filePath: string) => Promise<string>;
  mkdir: (directoryPath: string) => Promise<void>;
  writeFile: (filePath: string, content: string) => Promise<void>;
}

const RANKING_CATEGORIES: RankingCategory[] = [
  'overall',
  'leads',
  'switches',
  'closers',
  'chargers',
  'attackers',
  'consistency',
];

const RANKING_HEADER =
  'Pokemon,Score,Dex,Type 1,Type 2,Attack,Defense,Stamina,Stat Product,Level,CP,Fast Move,Charged Move 1,Charged Move 2,Charged Move 1 Count,Charged Move 2 Count,Buddy Distance,Charged Move Cost';

const defaultDependencies: RankingSyncDependencies = {
  createAdapter: (sourcePath: string) => createPvpokeAdapter({ sourcePath }),
  readFile: async (filePath: string) => {
    return fs.readFile(filePath, 'utf-8');
  },
  mkdir: async (directoryPath: string) => {
    await fs.mkdir(directoryPath, { recursive: true });
  },
  writeFile: async (filePath: string, content: string) => {
    await fs.writeFile(filePath, content, 'utf-8');
  },
};

function getMoveByIdOrThrow(
  moveId: string,
  moveById: Map<string, MovesData>,
  speciesId: string,
): MovesData {
  const normalizedMoveId = normalizeMoveId(moveId);
  const move = moveById.get(normalizedMoveId);
  if (!move) {
    throw new Error(
      `[sync-rankings] Missing move '${moveId}' for '${speciesId}'`,
    );
  }

  return move;
}

function normalizeType(type: string | undefined): string {
  if (!type || type.trim().length === 0) {
    return 'none';
  }

  return type;
}

function calculateBattleStats(
  pokemon: PokemonData,
  level: number,
  atkIv: number,
  defIv: number,
  hpIv: number,
  rankingStats: RankingSourceEntry['stats'],
): { attack: number; defense: number; stamina: number; cp: number } {
  const fallbackCpm = level <= 1 ? 0.094 : Math.sqrt(level / 109.5);
  const derivedCpm =
    typeof rankingStats?.atk === 'number' && rankingStats.atk > 0
      ? rankingStats.atk / (pokemon.baseStats.atk + atkIv)
      : fallbackCpm;

  const attack = derivedCpm * (pokemon.baseStats.atk + atkIv);
  const defense = derivedCpm * (pokemon.baseStats.def + defIv);
  const stamina = Math.max(
    Math.floor(derivedCpm * (pokemon.baseStats.hp + hpIv)),
    10,
  );

  const cp = Math.floor(
    ((pokemon.baseStats.atk + atkIv) *
      Math.sqrt(pokemon.baseStats.def + defIv) *
      Math.sqrt(pokemon.baseStats.hp + hpIv) *
      Math.pow(derivedCpm, 2)) /
      10,
  );

  return {
    attack: Math.round(attack * 10) / 10,
    defense: Math.round(defense * 10) / 10,
    stamina,
    cp,
  };
}

function convertRankingEntryToCsvRow(
  ranking: RankingSourceEntry,
  pokemonBySpeciesId: Map<string, PokemonData>,
  moveById: Map<string, MovesData>,
  leagueCp: number,
): RankingEntry {
  const pokemon = pokemonBySpeciesId.get(ranking.speciesId);
  if (!pokemon) {
    throw new Error(
      `[sync-rankings] Missing pokemon '${ranking.speciesId}' in gamemaster data`,
    );
  }

  const defaultIvs = getDefaultIvsForLeagueCp(pokemon, leagueCp);
  if (!defaultIvs || defaultIvs.length < 4) {
    throw new Error(
      `[sync-rankings] Missing cp${leagueCp} default IVs for '${ranking.speciesId}'`,
    );
  }

  const [level, atkIv, defIv, hpIv] = defaultIvs;
  const battleStats = calculateBattleStats(
    pokemon,
    level,
    atkIv,
    defIv,
    hpIv,
    ranking.stats,
  );

  const [fastMoveId, chargedMove1Id, chargedMove2Id] = ranking.moveset;
  if (!fastMoveId || !chargedMove1Id) {
    throw new Error(
      `[sync-rankings] Invalid moveset for '${ranking.speciesId}'`,
    );
  }

  const fastMove = getMoveByIdOrThrow(fastMoveId, moveById, ranking.speciesId);
  const chargedMove1 = getMoveByIdOrThrow(
    chargedMove1Id,
    moveById,
    ranking.speciesId,
  );

  if (fastMove.energyGain <= 0) {
    throw new Error(
      `[sync-rankings] Fast move '${fastMove.moveId}' has invalid energy gain`,
    );
  }

  const chargedMove2 = chargedMove2Id
    ? getMoveByIdOrThrow(chargedMove2Id, moveById, ranking.speciesId)
    : undefined;
  const chargedMove1Count = Math.ceil(
    chargedMove1.energy / fastMove.energyGain,
  );
  const chargedMove2Count = chargedMove2
    ? Math.ceil(chargedMove2.energy / fastMove.energyGain)
    : 0;

  return {
    Pokemon: pokemon.speciesName,
    Score: ranking.score,
    Dex: pokemon.dex,
    'Type 1': normalizeType(pokemon.types[0]),
    'Type 2': normalizeType(pokemon.types[1]),
    Attack: battleStats.attack,
    Defense: battleStats.defense,
    Stamina: battleStats.stamina,
    'Stat Product': Math.round(
      battleStats.attack * battleStats.defense * battleStats.stamina,
    ),
    Level: level,
    CP: battleStats.cp,
    'Fast Move': fastMove.name,
    'Charged Move 1': chargedMove1.name,
    'Charged Move 2': chargedMove2?.name ?? '',
    'Charged Move 1 Count': chargedMove1Count,
    'Charged Move 2 Count': chargedMove2Count,
    'Buddy Distance': pokemon.buddyDistance,
    'Charged Move Cost': pokemon.thirdMoveCost,
  };
}

function getDefaultIvsForLeagueCp(
  pokemon: PokemonData,
  leagueCp: number,
): number[] | undefined {
  if (leagueCp <= 500) {
    return pokemon.defaultIVs.cp500;
  }

  if (leagueCp <= 1500) {
    return pokemon.defaultIVs.cp1500;
  }

  return pokemon.defaultIVs.cp2500;
}

function convertEntriesToCsv(entries: RankingEntry[]): string {
  const rows = entries.map((entry) => {
    return [
      entry.Pokemon,
      entry.Score,
      entry.Dex,
      entry['Type 1'],
      entry['Type 2'],
      entry.Attack,
      entry.Defense,
      entry.Stamina,
      entry['Stat Product'],
      entry.Level,
      entry.CP,
      entry['Fast Move'],
      entry['Charged Move 1'],
      entry['Charged Move 2'],
      entry['Charged Move 1 Count'],
      entry['Charged Move 2 Count'],
      entry['Buddy Distance'],
      entry['Charged Move Cost'],
    ].join(',');
  });

  return `${[RANKING_HEADER, ...rows].join('\n')}\n`;
}

/**
 * Check whether a rankings conversion failure should be treated as skippable.
 */
function isSkippableMissingPokemonError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith('[sync-rankings] Missing pokemon ')
  );
}

/**
 * Sync rankings CSV data from local PvPoke ranking JSON files.
 */
export async function scrapeRankings(
  options: SyncRunOptions = {},
  dependencies: Partial<RankingSyncDependencies> = {},
): Promise<RankingSyncResult> {
  const sourcePath = options.sourcePath;
  if (!sourcePath) {
    throw new Error(
      '[sync-rankings] Missing sourcePath for local rankings synchronization',
    );
  }

  const resolvedDependencies: RankingSyncDependencies = {
    ...defaultDependencies,
    ...dependencies,
  };

  try {
    const allRankings: RankingsCsv = [];
    const categoryEvidence: RankingCategoryEvidence[] = [];
    const overrideEvidence: RankingOverrideEvidence[] = [];

    const pokemonDataPath = path.join(syncConfig.outputDir, 'pokemon.json');
    const movesDataPath = path.join(syncConfig.outputDir, 'moves.json');
    const pokemonData = JSON.parse(
      await resolvedDependencies.readFile(pokemonDataPath),
    ) as PokemonData[];
    const movesData = JSON.parse(
      await resolvedDependencies.readFile(movesDataPath),
    ) as MovesData[];

    const pokemonBySpeciesId = new Map<string, PokemonData>();
    pokemonData.forEach((pokemon) => {
      pokemonBySpeciesId.set(pokemon.speciesId, pokemon);
    });

    const moveById = new Map<string, MovesData>();
    movesData.forEach((move) => {
      moveById.set(move.moveId, move);
    });

    const adapter = resolvedDependencies.createAdapter(sourcePath);
    const rankingFormats = getBattleFormats().map((format) => {
      return {
        formatId: format.id,
        cup: format.cup,
        cp: format.cp,
      };
    });

    for (const format of rankingFormats) {
      const overrideSource = await adapter.readMovesetOverridesJson<unknown>(
        format.cp,
        format.cup,
      );
      const overrides = parseMovesetOverrides(
        overrideSource,
        `cp${format.cp} ${format.cup}`,
      );
      overrideEvidence.push({
        formatId: format.formatId,
        cup: format.cup,
        cp: format.cp,
        entries: overrides,
      });

      for (const category of RANKING_CATEGORIES) {
        console.log(
          `[sync-rankings] Syncing cp${format.cp} ${format.cup} ${category} rankings from local JSON`,
        );

        const sourceRankings = parseRankingSourceEntries(
          await adapter.readRankingJson(category, format.cp, format.cup),
          `cp${format.cp} ${format.cup} ${category}`,
        );

        const normalizedRankings =
          normalizeRankingSourceEntries(sourceRankings);
        categoryEvidence.push({
          formatId: format.formatId,
          cup: format.cup,
          cp: format.cp,
          category,
          entries: normalizedRankings,
        });

        const convertedEntries: RankingEntry[] = [];

        for (const ranking of normalizedRankings) {
          try {
            convertedEntries.push(
              convertRankingEntryToCsvRow(
                ranking,
                pokemonBySpeciesId,
                moveById,
                format.cp,
              ),
            );
          } catch (error) {
            if (!isSkippableMissingPokemonError(error)) {
              throw error;
            }

            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.warn(`${errorMessage}; skipping ranking entry`);
          }
        }

        const csvText = convertEntriesToCsv(convertedEntries);
        const validation = validateRankingsCsv(csvText);
        logValidationErrors(
          `cp${format.cp} ${format.cup} ${category} rankings CSV`,
          validation.errors,
        );

        if (!validation.valid) {
          throw new Error(
            `cp${format.cp} ${format.cup} ${category} rankings CSV validation failed: ${validation.errors.join(', ')}`,
          );
        }

        const outputFilePath = path.join(
          syncConfig.outputDir,
          'rankings',
          `cp${format.cp}`,
          format.cup,
          `${category}_rankings.csv`,
        );
        await resolvedDependencies.mkdir(path.dirname(outputFilePath));
        await resolvedDependencies.writeFile(outputFilePath, csvText);

        console.log(
          `[sync-rankings] Synced ${convertedEntries.length} ${category} ranking entries to ${outputFilePath}`,
        );

        allRankings.push(...convertedEntries);
      }
    }

    console.log(
      `[sync-rankings] Successfully synced and validated ${allRankings.length} total ranking entries`,
    );
    const aggregatedEvidence = aggregateRankingMoveEvidence(
      categoryEvidence,
      overrideEvidence,
    );
    const getMoveAvailability = createMoveAvailabilityResolver(pokemonData);
    const candidateSets = aggregatedEvidence.flatMap((evidence) => {
      const pokemon = pokemonBySpeciesId.get(evidence.speciesId);
      return pokemon
        ? [
            deriveMovesetCandidates({
              evidence,
              pokemonTypes: pokemon.types,
              moves: movesData,
              getMoveAvailability,
            }),
          ]
        : [];
    });
    return {
      rankings: allRankings,
      categoryEvidence,
      overrideEvidence,
      aggregatedEvidence,
      candidateSets,
    };
  } catch (error) {
    logError(error as Error, 'sync-rankings', {
      sourcePath,
      categories: RANKING_CATEGORIES,
    });
    throw error;
  }
}
