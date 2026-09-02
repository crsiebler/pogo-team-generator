import {
  rankViableMoves,
  type MoveCandidateSource,
  type MoveMechanicsCandidate,
} from './moveMechanics';
import type {
  AggregatedMoveUsageEvidence,
  AggregatedRankingMoveEvidence,
  ObservedRankingMovesetEvidence,
  OverrideRankingMovesetEvidence,
  RankingMovesetEvidence,
} from './rankings';
import type { BattleFormatId } from '@/lib/data/battleFormats';
import {
  MAX_MOVESET_CANDIDATES,
  type MovesetVariantCandidateEvidence,
} from '@/lib/data/movesetVariantManifest';
import { getMovesetVariantId } from '@/lib/data/movesetVariants';
import type {
  Move,
  MoveAvailability,
  Moveset,
  MovesetVariant,
} from '@/lib/types';

export { MAX_MOVESET_CANDIDATES } from '@/lib/data/movesetVariantManifest';

/** Maximum fast moves retained for evidence-backed substitutions. */
export const MAX_EXPANSION_FAST_MOVES = 2;

/** Maximum charged moves retained for evidence-backed substitutions. */
export const MAX_EXPANSION_CHARGED_MOVES = 4;

/** Availability lookup injected at the sync boundary. */
export type MoveAvailabilityResolver = (
  speciesId: string,
  moveId: string,
  formatId: BattleFormatId,
) => MoveAvailability;

/** Inputs for pure bounded moveset candidate derivation. */
export interface DeriveMovesetCandidatesInput {
  readonly evidence: AggregatedRankingMoveEvidence;
  readonly pokemonTypes: readonly string[];
  readonly moves: readonly Move[];
  readonly getMoveAvailability: MoveAvailabilityResolver;
  /** Fixed fourth move from a valid four-element Mega ranking moveset. */
  readonly additionalChargedMove?: string;
}

/** Deterministic candidates and the bounded move pools used for expansion. */
export interface DerivedMovesetCandidate extends MovesetVariant {
  readonly evidence?: MovesetVariantCandidateEvidence;
}

/** Deterministic candidates and the bounded move pools used for expansion. */
export interface DerivedMovesetCandidateSet {
  readonly formatId: BattleFormatId;
  readonly cup: AggregatedRankingMoveEvidence['cup'];
  readonly cp: number;
  readonly speciesId: string;
  readonly pvpokeScorePrior: number | null;
  /** Fixed Mega move, excluded from selectable variant identity and pools. */
  readonly additionalChargedMove?: string;
  readonly retainedFastMoves: readonly string[];
  readonly retainedChargedMoves: readonly string[];
  readonly rejections: readonly RankedMovesetRejection[];
  readonly candidates: readonly DerivedMovesetCandidate[];
}

/** One unavailable move that caused a preferred ranked moveset rejection. */
export interface RankedMovesetRejection {
  readonly sourceMoveset: Moveset;
  readonly excludedMove: string;
  readonly reason: string;
}

type CandidateKind = 'default' | 'exact' | 'substitution';

interface RankedCandidate {
  readonly variant: MovesetVariant;
  readonly evidence: MovesetVariantCandidateEvidence;
  readonly kind: CandidateKind;
  readonly evidenceWeight: number;
  readonly sourceRank: number;
  readonly moveRank: number;
  readonly stableSourceKey: string;
}

interface RankedMoveCandidate extends MoveMechanicsCandidate {
  readonly usage: AggregatedMoveUsageEvidence | null;
  readonly isDefaultMove: boolean;
}

function toMoveset(moveIds: readonly string[]): Moveset | null {
  if (moveIds.length < 3 || moveIds.length > 4) {
    return null;
  }
  const [fastMove, chargedMove1, chargedMove2] = moveIds;
  if (
    !fastMove ||
    !chargedMove1 ||
    !chargedMove2 ||
    chargedMove1 === chargedMove2
  ) {
    return null;
  }

  return { fastMove, chargedMove1, chargedMove2 };
}

function isMovesetEligible(
  moveset: Moveset,
  evidence: AggregatedRankingMoveEvidence,
  getMoveAvailability: MoveAvailabilityResolver,
): boolean {
  return [moveset.fastMove, moveset.chargedMove1, moveset.chargedMove2].every(
    (moveId) =>
      getMoveAvailability(evidence.speciesId, moveId, evidence.formatId)
        .kind !== 'excluded',
  );
}

function getRankedMovesetRejections(
  source: ObservedRankingMovesetEvidence | null,
  moveset: Moveset | null,
  evidence: AggregatedRankingMoveEvidence,
  getMoveAvailability: MoveAvailabilityResolver,
): RankedMovesetRejection[] {
  if (!moveset || source?.speciesAliasKind === 'battle-state') {
    return [];
  }

  return [moveset.fastMove, moveset.chargedMove1, moveset.chargedMove2].flatMap(
    (moveId): RankedMovesetRejection[] => {
      const availability = getMoveAvailability(
        evidence.speciesId,
        moveId,
        evidence.formatId,
      );
      return availability.kind === 'excluded'
        ? [
            {
              sourceMoveset: moveset,
              excludedMove: moveId,
              reason: availability.reason,
            },
          ]
        : [];
    },
  );
}

function compareUsageEvidence(
  left: AggregatedMoveUsageEvidence | null,
  right: AggregatedMoveUsageEvidence | null,
): number {
  return (
    (right?.weightedNormalizedUse ?? Number.NEGATIVE_INFINITY) -
      (left?.weightedNormalizedUse ?? Number.NEGATIVE_INFINITY) ||
    (right?.categoryOccurrenceCount ?? Number.NEGATIVE_INFINITY) -
      (left?.categoryOccurrenceCount ?? Number.NEGATIVE_INFINITY) ||
    (right?.overallUse ?? Number.NEGATIVE_INFINITY) -
      (left?.overallUse ?? Number.NEGATIVE_INFINITY)
  );
}

function compareRankedMoves(
  left: RankedMoveCandidate,
  right: RankedMoveCandidate,
): number {
  return (
    Number(right.isDefaultMove) - Number(left.isDefaultMove) ||
    getMoveSourceRank(left.source) - getMoveSourceRank(right.source) ||
    compareUsageEvidence(left.usage, right.usage) ||
    left.moveId.localeCompare(right.moveId)
  );
}

function getMoveSourceRank(source: MoveCandidateSource): number {
  switch (source) {
    case 'override':
      return 0;
    case 'observed':
      return 1;
    case 'usage':
      return 2;
  }
}

function getStrongestMoveSources(
  movesetEvidence: readonly RankingMovesetEvidence[],
  slot: 'fast' | 'charged',
): Map<string, MoveCandidateSource> {
  const sources = new Map<string, MoveCandidateSource>();
  const addSource = (moveId: string, source: MoveCandidateSource): void => {
    const existing = sources.get(moveId);
    if (!existing || getMoveSourceRank(source) < getMoveSourceRank(existing)) {
      sources.set(moveId, source);
    }
  };

  for (const evidence of movesetEvidence) {
    if (evidence.source === 'override') {
      if (slot === 'fast' && evidence.fastMove) {
        addSource(evidence.fastMove, 'override');
      }
      if (slot === 'charged') {
        for (const moveId of (evidence.chargedMoves ?? []).slice(0, 2)) {
          addSource(moveId, 'override');
        }
      }
      continue;
    }

    if (evidence.speciesAliasKind === 'battle-state') {
      continue;
    }

    const moves =
      slot === 'fast'
        ? evidence.moveset.slice(0, 1)
        : evidence.moveset.slice(1, 3);
    for (const moveId of moves) {
      addSource(moveId, 'observed');
    }
  }

  return sources;
}

function buildRankedMoveCandidates(
  evidence: AggregatedRankingMoveEvidence,
  slot: 'fast' | 'charged',
  defaultMoveset: Moveset | null,
  getMoveAvailability: MoveAvailabilityResolver,
  additionalChargedMove?: string,
): RankedMoveCandidate[] {
  const usageEntries =
    slot === 'fast' ? evidence.fastMoves : evidence.chargedMoves;
  const usageByMoveId = new Map(
    usageEntries.map((usage) => [usage.moveId, usage]),
  );
  const sourceByMoveId = getStrongestMoveSources(
    evidence.movesetEvidence,
    slot,
  );
  const battleStateMoveIds = new Set(
    evidence.movesetEvidence.flatMap((source): readonly string[] => {
      if (
        source.source !== 'observed' ||
        source.speciesAliasKind !== 'battle-state'
      ) {
        return [];
      }
      return slot === 'fast'
        ? source.moveset.slice(0, 1)
        : source.moveset.slice(1, 3);
    }),
  );

  for (const usage of usageEntries) {
    if (
      !sourceByMoveId.has(usage.moveId) &&
      !battleStateMoveIds.has(usage.moveId)
    ) {
      sourceByMoveId.set(usage.moveId, 'usage');
    }
  }

  return Array.from(sourceByMoveId.entries())
    .filter(([moveId]) => moveId !== additionalChargedMove)
    .filter(
      ([moveId]) =>
        getMoveAvailability(evidence.speciesId, moveId, evidence.formatId)
          .kind !== 'excluded',
    )
    .map(([moveId, source]): RankedMoveCandidate => {
      const isDefaultMove =
        defaultMoveset !== null &&
        (slot === 'fast'
          ? defaultMoveset.fastMove === moveId
          : defaultMoveset.chargedMove1 === moveId ||
            defaultMoveset.chargedMove2 === moveId);
      return {
        moveId,
        source,
        usage: usageByMoveId.get(moveId) ?? null,
        isDefaultMove,
      };
    })
    .sort(compareRankedMoves);
}

function createVariant(moveset: Moveset, isDefault: boolean): MovesetVariant {
  return {
    id: getMovesetVariantId(moveset),
    isDefault,
    ...moveset,
  };
}

function createRankedCandidate(
  moveset: Moveset,
  kind: CandidateKind,
  evidenceWeight: number,
  sourceRank: number,
  moveRank: number,
  stableSourceKey: string,
  evidence: Omit<MovesetVariantCandidateEvidence, 'sourceVariantIds'> & {
    readonly sourceVariantIds?: readonly MovesetVariant['id'][];
  },
): RankedCandidate {
  const variant = createVariant(moveset, kind === 'default');
  return {
    variant,
    evidence: {
      ...evidence,
      sourceVariantIds: evidence.sourceVariantIds ?? [variant.id],
    },
    kind,
    evidenceWeight,
    sourceRank,
    moveRank,
    stableSourceKey,
  };
}

function getCandidateKindRank(kind: CandidateKind): number {
  switch (kind) {
    case 'default':
      return 0;
    case 'exact':
      return 1;
    case 'substitution':
      return 2;
  }
}

function compareRankedCandidates(
  left: RankedCandidate,
  right: RankedCandidate,
): number {
  return (
    getCandidateKindRank(left.kind) - getCandidateKindRank(right.kind) ||
    left.sourceRank - right.sourceRank ||
    right.evidenceWeight - left.evidenceWeight ||
    left.moveRank - right.moveRank ||
    Number(right.variant.isDefault) - Number(left.variant.isDefault) ||
    left.variant.id.localeCompare(right.variant.id) ||
    left.stableSourceKey.localeCompare(right.stableSourceKey)
  );
}

function getPreferredOverallEvidence(
  evidence: AggregatedRankingMoveEvidence,
): ObservedRankingMovesetEvidence | null {
  return (
    [...evidence.movesetEvidence]
      .filter(
        (entry): entry is ObservedRankingMovesetEvidence =>
          entry.source === 'observed' &&
          entry.category === 'overall' &&
          entry.isPreferred,
      )
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      )[0] ?? null
  );
}

function createObservedCandidate(
  source: ObservedRankingMovesetEvidence,
  defaultSource: ObservedRankingMovesetEvidence | null,
): RankedCandidate | null {
  const moveset = toMoveset(source.moveset);
  if (!moveset) {
    return null;
  }

  const isDefault = source === defaultSource;
  return createRankedCandidate(
    moveset,
    isDefault ? 'default' : 'exact',
    source.categoryWeight,
    1,
    0,
    JSON.stringify(source),
    {
      kind: isDefault ? 'preferred' : 'observed',
      sourceCategories: [source.category],
    },
  );
}

function createOverrideMoveset(
  source: OverrideRankingMovesetEvidence,
  baseline: Moveset | null,
): Moveset | null {
  const fastMove = source.fastMove ?? baseline?.fastMove;
  const chargedMoves =
    source.chargedMoves ??
    (baseline ? [baseline.chargedMove1, baseline.chargedMove2] : undefined);
  if (!fastMove || !chargedMoves) {
    return null;
  }

  return toMoveset([fastMove, ...chargedMoves]);
}

function createOverrideCandidate(
  source: OverrideRankingMovesetEvidence,
  baseline: Moveset | null,
  evidence: AggregatedRankingMoveEvidence,
  getMoveAvailability: MoveAvailabilityResolver,
): RankedCandidate | null {
  const moveset = createOverrideMoveset(source, baseline);
  if (!moveset || !isMovesetEligible(moveset, evidence, getMoveAvailability)) {
    return null;
  }

  return createRankedCandidate(
    moveset,
    'exact',
    source.weight ?? 0,
    0,
    0,
    JSON.stringify(source),
    {
      kind: 'override',
      sourceCategories: [],
    },
  );
}

function addSingleMoveSubstitutions(
  candidates: RankedCandidate[],
  anchor: RankedCandidate,
  retainedFastMoves: readonly string[],
  retainedChargedMoves: readonly string[],
): void {
  const moveset = anchor.variant;
  retainedFastMoves.forEach((fastMove, moveRank) => {
    if (fastMove === moveset.fastMove) {
      return;
    }
    candidates.push(
      createRankedCandidate(
        {
          fastMove,
          chargedMove1: moveset.chargedMove1,
          chargedMove2: moveset.chargedMove2,
        },
        'substitution',
        anchor.evidenceWeight,
        anchor.sourceRank,
        moveRank,
        `${anchor.variant.id}|fast|${fastMove}`,
        {
          kind: 'substitution',
          sourceCategories: anchor.evidence.sourceCategories,
          sourceVariantIds: [anchor.variant.id],
        },
      ),
    );
  });

  retainedChargedMoves.forEach((chargedMove, moveRank) => {
    if (
      chargedMove !== moveset.chargedMove1 &&
      chargedMove !== moveset.chargedMove2
    ) {
      candidates.push(
        createRankedCandidate(
          {
            fastMove: moveset.fastMove,
            chargedMove1: chargedMove,
            chargedMove2: moveset.chargedMove2,
          },
          'substitution',
          anchor.evidenceWeight,
          anchor.sourceRank,
          moveRank,
          `${anchor.variant.id}|charged1|${chargedMove}`,
          {
            kind: 'substitution',
            sourceCategories: anchor.evidence.sourceCategories,
            sourceVariantIds: [anchor.variant.id],
          },
        ),
      );
      candidates.push(
        createRankedCandidate(
          {
            fastMove: moveset.fastMove,
            chargedMove1: moveset.chargedMove1,
            chargedMove2: chargedMove,
          },
          'substitution',
          anchor.evidenceWeight,
          anchor.sourceRank,
          moveRank,
          `${anchor.variant.id}|charged2|${chargedMove}`,
          {
            kind: 'substitution',
            sourceCategories: anchor.evidence.sourceCategories,
            sourceVariantIds: [anchor.variant.id],
          },
        ),
      );
    }
  });
}

function deduplicateCandidates(
  candidates: readonly RankedCandidate[],
): RankedCandidate[] {
  const byId = new Map<string, RankedCandidate>();
  for (const candidate of [...candidates].sort(compareRankedCandidates)) {
    if (!byId.has(candidate.variant.id)) {
      byId.set(candidate.variant.id, candidate);
    }
  }
  return Array.from(byId.values()).sort(compareRankedCandidates);
}

function getEvidenceAdditionalChargedMove(
  evidence: AggregatedRankingMoveEvidence,
): string | undefined {
  const additionalMoveIds = new Set(
    evidence.movesetEvidence.flatMap((source) => {
      if (source.source === 'observed') {
        if (source.moveset.length !== 4) {
          return [];
        }
        const moveId = source.moveset[3];
        return moveId ? [moveId] : [];
      }

      if (source.chargedMoves?.length !== 3) {
        return [];
      }
      const moveId = source.chargedMoves[2];
      return moveId ? [moveId] : [];
    }),
  );

  if (additionalMoveIds.size > 1) {
    throw new Error(
      `[sync-candidates] ${evidence.formatId}/${evidence.speciesId} has conflicting additional charged moves: ${Array.from(additionalMoveIds).sort().join(', ')}`,
    );
  }

  return Array.from(additionalMoveIds)[0];
}

/**
 * Derive bounded exact and single-substitution moveset candidates from ranking
 * evidence without generating a full legal movepool product.
 */
export function deriveMovesetCandidates(
  input: DeriveMovesetCandidatesInput,
): DerivedMovesetCandidateSet {
  const { evidence, getMoveAvailability } = input;
  const evidenceAdditionalChargedMove =
    getEvidenceAdditionalChargedMove(evidence);
  if (
    input.additionalChargedMove !== undefined &&
    evidenceAdditionalChargedMove !== undefined &&
    input.additionalChargedMove !== evidenceAdditionalChargedMove
  ) {
    throw new Error(
      `[sync-candidates] ${evidence.formatId}/${evidence.speciesId} additional charged move metadata does not match ranking evidence`,
    );
  }
  const additionalChargedMove =
    input.additionalChargedMove ?? evidenceAdditionalChargedMove;
  const defaultSource = getPreferredOverallEvidence(evidence);
  const defaultMoveset = defaultSource
    ? toMoveset(defaultSource.moveset)
    : null;
  const rejections = getRankedMovesetRejections(
    defaultSource,
    defaultMoveset,
    evidence,
    getMoveAvailability,
  );
  const fastMoveCandidates = buildRankedMoveCandidates(
    evidence,
    'fast',
    defaultMoveset,
    getMoveAvailability,
    additionalChargedMove,
  );
  const chargedMoveCandidates = buildRankedMoveCandidates(
    evidence,
    'charged',
    defaultMoveset,
    getMoveAvailability,
    additionalChargedMove,
  );
  const mechanics = rankViableMoves({
    pokemonTypes: input.pokemonTypes,
    moves: [...input.moves].sort((left, right) =>
      left.moveId.localeCompare(right.moveId),
    ),
    fastMoveCandidates,
    chargedMoveCandidates,
  });
  const viableFastMoveIds = new Set(
    mechanics.fastMoves.map(({ moveId }) => moveId),
  );
  const viableChargedMoveIds = new Set(
    mechanics.chargedMoves.map(({ moveId }) => moveId),
  );
  const retainedFastMoves = fastMoveCandidates
    .filter(({ moveId }) => viableFastMoveIds.has(moveId))
    .slice(0, MAX_EXPANSION_FAST_MOVES)
    .map(({ moveId }) => moveId);
  const retainedChargedMoves = chargedMoveCandidates
    .filter(({ moveId }) => viableChargedMoveIds.has(moveId))
    .slice(0, MAX_EXPANSION_CHARGED_MOVES)
    .map(({ moveId }) => moveId);
  const exactCandidates: RankedCandidate[] = [];
  const observedAnchors: RankedCandidate[] = [];

  for (const source of [...evidence.movesetEvidence].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  )) {
    if (
      source.source === 'observed' &&
      source.speciesAliasKind === 'battle-state'
    ) {
      continue;
    }
    const candidate =
      source.source === 'observed'
        ? createObservedCandidate(source, defaultSource)
        : createOverrideCandidate(
            source,
            defaultMoveset,
            evidence,
            getMoveAvailability,
          );
    if (!candidate) {
      continue;
    }
    if (source.source === 'observed') {
      observedAnchors.push(candidate);
    }
    if (isMovesetEligible(candidate.variant, evidence, getMoveAvailability)) {
      exactCandidates.push(candidate);
    }
  }

  const allCandidates = [...exactCandidates];
  for (const anchor of deduplicateCandidates(observedAnchors)) {
    addSingleMoveSubstitutions(
      allCandidates,
      anchor,
      retainedFastMoves,
      retainedChargedMoves,
    );
  }

  const rankedCandidates = deduplicateCandidates(
    allCandidates.filter(({ variant }) =>
      isMovesetEligible(variant, evidence, getMoveAvailability),
    ),
  ).slice(0, MAX_MOVESET_CANDIDATES);
  const defaultVariantId =
    rankedCandidates.find(({ variant }) => variant.isDefault)?.variant.id ??
    rankedCandidates[0]?.variant.id;

  return {
    formatId: evidence.formatId,
    cup: evidence.cup,
    cp: evidence.cp,
    speciesId: evidence.speciesId,
    pvpokeScorePrior: evidence.pvpokeScorePrior,
    ...(additionalChargedMove ? { additionalChargedMove } : {}),
    retainedFastMoves,
    retainedChargedMoves,
    rejections,
    candidates: rankedCandidates.map(({ variant, evidence }) => ({
      ...variant,
      isDefault: variant.id === defaultVariantId,
      evidence,
    })),
  };
}
