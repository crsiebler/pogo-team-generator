import typeEffectivenessData from '@/data/type-effectiveness.json';
import { calculateEffectiveness } from '@/lib/coverage/typeChart';
import type {
  Move,
  MoveEffectTarget,
  MoveStatStages,
  TypeChart,
} from '@/lib/types';

/** Ranking provenance for one move considered for candidate expansion. */
export type MoveCandidateSource = 'override' | 'observed' | 'usage';

/** One move candidate and the strongest evidence that selected it. */
export interface MoveMechanicsCandidate {
  readonly moveId: string;
  readonly source: MoveCandidateSource;
}

/** Shared battle mechanics used to compare move candidates. */
export interface BaseMoveMechanicsEvidence extends MoveMechanicsCandidate {
  readonly type: string;
  readonly hasStab: boolean;
  readonly superEffectiveAgainst: readonly string[];
}

/** Fast-move mechanics used to filter simulation candidates. */
export interface FastMoveMechanicsEvidence extends BaseMoveMechanicsEvidence {
  readonly dpt: number;
  readonly ept: number;
  readonly turns: number;
}

/** First charged-move timing for one retained fast move. */
export interface FirstChargePacing {
  readonly fastMoveId: string;
  readonly moveCount: number;
  readonly turns: number;
}

/** Expected stat-stage effect after accounting for application chance. */
export interface ExpectedMoveStatusEffect {
  readonly target: Exclude<MoveEffectTarget, 'both'>;
  readonly chance: number;
  readonly attackStageDelta: number;
  readonly defenseStageDelta: number;
  readonly expectedAttackStageDelta: number;
  readonly expectedDefenseStageDelta: number;
}

/** Charged-move mechanics used to filter simulation candidates. */
export interface ChargedMoveMechanicsEvidence extends BaseMoveMechanicsEvidence {
  readonly power: number;
  readonly dpe: number;
  readonly energy: number;
  readonly firstChargePacing: readonly FirstChargePacing[];
  readonly expectedStatusEffects: readonly ExpectedMoveStatusEffect[];
}

/** Audit record for a speculative move removed by strict domination. */
export interface DominatedMoveRejection {
  readonly moveId: string;
  readonly slot: 'fast' | 'charged';
  readonly dominatedByMoveId: string;
}

/** Inputs needed to derive and filter move battle mechanics. */
export interface RankViableMovesInput {
  readonly pokemonTypes: readonly string[];
  readonly moves: readonly Move[];
  readonly fastMoveCandidates: readonly MoveMechanicsCandidate[];
  readonly chargedMoveCandidates: readonly MoveMechanicsCandidate[];
}

/** Viable move evidence and deterministic domination rejections. */
export interface RankedMoveMechanicsResult {
  readonly fastMoves: readonly FastMoveMechanicsEvidence[];
  readonly chargedMoves: readonly ChargedMoveMechanicsEvidence[];
  readonly rejectedMoves: readonly DominatedMoveRejection[];
}

const typeChart = typeEffectivenessData as TypeChart;

function roundMechanic(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}

function getMoveOrThrow(
  moveById: ReadonlyMap<string, Move>,
  moveId: string,
): Move {
  const move = moveById.get(moveId);
  if (!move) {
    throw new Error(`[move-mechanics] Missing move '${moveId}'`);
  }
  return move;
}

function getCoverageTypes(moveType: string): string[] {
  return Object.keys(typeChart)
    .filter(
      (defenderType) => calculateEffectiveness([defenderType], moveType) >= 1.6,
    )
    .sort((left, right) => left.localeCompare(right));
}

function hasStab(moveType: string, pokemonTypes: readonly string[]): boolean {
  const normalizedMoveType = moveType.toLowerCase();
  return pokemonTypes.some(
    (pokemonType) => pokemonType.toLowerCase() === normalizedMoveType,
  );
}

function buildBaseEvidence(
  candidate: MoveMechanicsCandidate,
  move: Move,
  pokemonTypes: readonly string[],
): BaseMoveMechanicsEvidence {
  return {
    ...candidate,
    type: move.type,
    hasStab: hasStab(move.type, pokemonTypes),
    superEffectiveAgainst: getCoverageTypes(move.type),
  };
}

function buildFastMoveEvidence(
  candidate: MoveMechanicsCandidate,
  move: Move,
  pokemonTypes: readonly string[],
): FastMoveMechanicsEvidence {
  if (!move.turns || move.turns <= 0 || move.energyGain <= 0) {
    throw new Error(
      `[move-mechanics] Fast move '${move.moveId}' requires positive turns and energy gain`,
    );
  }

  return {
    ...buildBaseEvidence(candidate, move, pokemonTypes),
    dpt: roundMechanic(move.power / move.turns),
    ept: roundMechanic(move.energyGain / move.turns),
    turns: move.turns,
  };
}

function createExpectedStatusEffect(
  target: Exclude<MoveEffectTarget, 'both'>,
  stages: MoveStatStages,
  chance: number,
): ExpectedMoveStatusEffect {
  const [attackStageDelta, defenseStageDelta] = stages;
  return {
    target,
    chance,
    attackStageDelta,
    defenseStageDelta,
    expectedAttackStageDelta: roundMechanic(attackStageDelta * chance),
    expectedDefenseStageDelta: roundMechanic(defenseStageDelta * chance),
  };
}

function getExpectedStatusEffects(move: Move): ExpectedMoveStatusEffect[] {
  if (!move.buffs && !move.buffsSelf && !move.buffsOpponent) {
    return [];
  }

  const chance = Number(move.buffApplyChance ?? '1');
  if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
    throw new Error(
      `[move-mechanics] Move '${move.moveId}' has invalid status chance`,
    );
  }

  if (move.buffTarget === 'both') {
    if (!move.buffsSelf || !move.buffsOpponent) {
      throw new Error(
        `[move-mechanics] Move '${move.moveId}' has contradictory status fields`,
      );
    }
    return [
      createExpectedStatusEffect('self', move.buffsSelf, chance),
      createExpectedStatusEffect('opponent', move.buffsOpponent, chance),
    ];
  }

  if (!move.buffTarget || !move.buffs || move.buffsSelf || move.buffsOpponent) {
    throw new Error(
      `[move-mechanics] Move '${move.moveId}' has contradictory status fields`,
    );
  }
  return [createExpectedStatusEffect(move.buffTarget, move.buffs, chance)];
}

function buildChargedMoveEvidence(
  candidate: MoveMechanicsCandidate,
  move: Move,
  pokemonTypes: readonly string[],
  fastMoves: readonly FastMoveMechanicsEvidence[],
  moveById: ReadonlyMap<string, Move>,
): ChargedMoveMechanicsEvidence {
  if (move.energy <= 0) {
    throw new Error(
      `[move-mechanics] Charged move '${move.moveId}' requires positive energy`,
    );
  }

  return {
    ...buildBaseEvidence(candidate, move, pokemonTypes),
    power: move.power,
    dpe: roundMechanic(move.power / move.energy),
    energy: move.energy,
    firstChargePacing: fastMoves.map((fastMove) => {
      const fastMoveData = getMoveOrThrow(moveById, fastMove.moveId);
      const moveCount = Math.ceil(move.energy / fastMoveData.energyGain);
      return {
        fastMoveId: fastMove.moveId,
        moveCount,
        turns: moveCount * fastMove.turns,
      };
    }),
    expectedStatusEffects: getExpectedStatusEffects(move),
  };
}

function isSuperset(
  possibleSuperset: readonly string[],
  values: readonly string[],
): boolean {
  const possibleValues = new Set(possibleSuperset);
  return values.every((value) => possibleValues.has(value));
}

function isFastMoveDominatedBy(
  candidate: FastMoveMechanicsEvidence,
  alternative: FastMoveMechanicsEvidence,
): boolean {
  if (
    candidate.moveId === alternative.moveId ||
    candidate.type !== alternative.type ||
    (candidate.hasStab && !alternative.hasStab) ||
    !isSuperset(
      alternative.superEffectiveAgainst,
      candidate.superEffectiveAgainst,
    )
  ) {
    return false;
  }

  const noWorse =
    alternative.dpt >= candidate.dpt &&
    alternative.ept >= candidate.ept &&
    alternative.turns <= candidate.turns;
  const strictlyBetter =
    alternative.dpt > candidate.dpt ||
    alternative.ept > candidate.ept ||
    alternative.turns < candidate.turns ||
    (!candidate.hasStab && alternative.hasStab);
  return noWorse && strictlyBetter;
}

function hasNoSlowerPacing(
  candidate: ChargedMoveMechanicsEvidence,
  alternative: ChargedMoveMechanicsEvidence,
): boolean {
  const candidateTurns = new Map(
    candidate.firstChargePacing.map(({ fastMoveId, turns }) => [
      fastMoveId,
      turns,
    ]),
  );
  return alternative.firstChargePacing.every(
    ({ fastMoveId, turns }) => turns <= (candidateTurns.get(fastMoveId) ?? 0),
  );
}

function isChargedMoveDominatedBy(
  candidate: ChargedMoveMechanicsEvidence,
  alternative: ChargedMoveMechanicsEvidence,
): boolean {
  if (
    candidate.moveId === alternative.moveId ||
    candidate.type !== alternative.type ||
    (candidate.hasStab && !alternative.hasStab) ||
    JSON.stringify(candidate.expectedStatusEffects) !==
      JSON.stringify(alternative.expectedStatusEffects) ||
    !isSuperset(
      alternative.superEffectiveAgainst,
      candidate.superEffectiveAgainst,
    )
  ) {
    return false;
  }

  const noWorse =
    alternative.power >= candidate.power &&
    alternative.dpe >= candidate.dpe &&
    alternative.energy <= candidate.energy &&
    hasNoSlowerPacing(candidate, alternative);
  const strictlyBetter =
    alternative.power > candidate.power ||
    alternative.dpe > candidate.dpe ||
    alternative.energy < candidate.energy ||
    (!candidate.hasStab && alternative.hasStab);
  return noWorse && strictlyBetter;
}

/**
 * Build move-mechanics evidence and reject only strictly dominated usage-only
 * candidates. Observed and override moves remain available for simulation.
 */
export function rankViableMoves(
  input: RankViableMovesInput,
): RankedMoveMechanicsResult {
  const moveById = new Map(input.moves.map((move) => [move.moveId, move]));
  const allFastMoves = input.fastMoveCandidates.map((candidate) => {
    return buildFastMoveEvidence(
      candidate,
      getMoveOrThrow(moveById, candidate.moveId),
      input.pokemonTypes,
    );
  });
  const rejectedMoves: DominatedMoveRejection[] = [];
  const fastMoves = allFastMoves.filter((candidate) => {
    if (candidate.source !== 'usage') {
      return true;
    }
    const dominator = allFastMoves.find((alternative) =>
      isFastMoveDominatedBy(candidate, alternative),
    );
    if (!dominator) {
      return true;
    }
    rejectedMoves.push({
      moveId: candidate.moveId,
      slot: 'fast',
      dominatedByMoveId: dominator.moveId,
    });
    return false;
  });

  const allChargedMoves = input.chargedMoveCandidates.map((candidate) => {
    return buildChargedMoveEvidence(
      candidate,
      getMoveOrThrow(moveById, candidate.moveId),
      input.pokemonTypes,
      fastMoves,
      moveById,
    );
  });
  const chargedMoves = allChargedMoves.filter((candidate) => {
    if (candidate.source !== 'usage') {
      return true;
    }
    const dominator = allChargedMoves.find((alternative) =>
      isChargedMoveDominatedBy(candidate, alternative),
    );
    if (!dominator) {
      return true;
    }
    rejectedMoves.push({
      moveId: candidate.moveId,
      slot: 'charged',
      dominatedByMoveId: dominator.moveId,
    });
    return false;
  });

  return { fastMoves, chargedMoves, rejectedMoves };
}
