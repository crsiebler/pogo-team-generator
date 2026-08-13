import type { Move } from '../types';
import movesData from '@/data/moves.json';

// Type-safe cast
const allMoves = movesData as Move[];

// Build O(1) lookup map
const movesByMoveId = new Map<string, Move>();

for (const move of allMoves) {
  movesByMoveId.set(move.moveId, move);
}

/**
 * Get move by moveId
 */
export function getMoveByMoveId(moveId: string): Move | undefined {
  return movesByMoveId.get(moveId);
}

/**
 * Get all moves that match a filter
 */
export function filterMoves(predicate: (move: Move) => boolean): Move[] {
  return allMoves.filter(predicate);
}

/**
 * Get all fast moves (have turns property)
 */
export function getFastMoves(): Move[] {
  return filterMoves((m) => m.turns !== undefined);
}

/**
 * Get all charged moves (have energy cost)
 */
export function getChargedMoves(): Move[] {
  return filterMoves((m) => m.energy > 0);
}

/**
 * Check if move is a fast move
 */
export function isFastMove(moveId: string): boolean {
  const move = getMoveByMoveId(moveId);
  return move !== undefined && move.turns !== undefined;
}

/**
 * Calculate turns needed to reach charged move
 * @param fastMoveId The fast move being used
 * @param chargedMoveId The charged move to reach
 * @returns Number of fast moves needed, or 0 if invalid
 */
export function calculateTurnsToCharge(
  fastMoveId: string,
  chargedMoveId: string,
): number {
  const fastMove = getMoveByMoveId(fastMoveId);
  const chargedMove = getMoveByMoveId(chargedMoveId);

  if (
    !fastMove ||
    !chargedMove ||
    !fastMove.energyGain ||
    !chargedMove.energy
  ) {
    return 0;
  }

  return Math.ceil(chargedMove.energy / fastMove.energyGain);
}

/**
 * Calculate seconds to reach charged move
 * @param fastMoveId The fast move being used
 * @param chargedMoveId The charged move to reach
 * @returns Time in seconds, or 0 if invalid
 */
export function calculateTimeToCharge(
  fastMoveId: string,
  chargedMoveId: string,
): number {
  const turns = calculateTurnsToCharge(fastMoveId, chargedMoveId);
  const fastMove = getMoveByMoveId(fastMoveId);

  if (!fastMove || !fastMove.turns) return 0;

  // Each turn is 0.5 seconds
  return turns * fastMove.turns * 0.5;
}

/**
 * Calculate shield pressure score (inverse of time to charge)
 * Higher score = faster charging = more pressure
 */
export function calculatePressureScore(
  fastMoveId: string,
  chargedMoveId: string,
): number {
  const timeToCharge = calculateTimeToCharge(fastMoveId, chargedMoveId);
  if (timeToCharge === 0) return 0;
  return 1 / timeToCharge;
}

/**
 * Check if move has buff/debuff effects
 */
export function hasBuffEffects(moveId: string): boolean {
  const move = getMoveByMoveId(moveId);
  return (
    move !== undefined && move.buffs !== undefined && move.buffs.length > 0
  );
}

/**
 * Get buff details for a move
 */
export function getBuffDetails(moveId: string): {
  stats: readonly number[];
  target: string;
  chance: string;
} | null {
  const move = getMoveByMoveId(moveId);

  if (!move || !hasBuffEffects(moveId)) {
    return null;
  }

  return {
    stats: move.buffs || [],
    target: move.buffTarget || 'opponent',
    chance: move.buffApplyChance || '100%',
  };
}

/**
 * Categorize charged move by energy cost
 */
export function getMoveCategory(
  moveId: string,
): 'spam' | 'general' | 'nuke' | 'unknown' {
  const move = getMoveByMoveId(moveId);

  if (!move || !move.energy) return 'unknown';

  if (move.energy <= 40) return 'spam';
  if (move.energy <= 50) return 'general';
  return 'nuke';
}

/**
 * Calculate damage per energy (DPE) for a move
 */
export function calculateDPE(moveId: string): number {
  const move = getMoveByMoveId(moveId);

  if (!move || !move.energy || move.energy === 0) return 0;

  return move.power / move.energy;
}

/**
 * Get move synergy score for a moveset
 * Best synergy: spam + nuke combination
 */
export function evaluateMoveSynergy(
  chargedMove1: string,
  chargedMove2: string,
): {
  hasSpamNuke: boolean;
  hasBuff: boolean;
  synergyScore: number;
} {
  const move1 = getMoveByMoveId(chargedMove1);
  const move2 = getMoveByMoveId(chargedMove2);

  if (!move1 || !move2) {
    return { hasSpamNuke: false, hasBuff: false, synergyScore: 0 };
  }

  const cat1 = getMoveCategory(chargedMove1);
  const cat2 = getMoveCategory(chargedMove2);

  const hasSpamNuke =
    (cat1 === 'spam' && cat2 === 'nuke') ||
    (cat1 === 'nuke' && cat2 === 'spam');

  const hasBuff = hasBuffEffects(chargedMove1) || hasBuffEffects(chargedMove2);

  // Score: 2 points for spam+nuke, 1 point for buff, 0.5 per different category
  let synergyScore = 0;
  if (hasSpamNuke) synergyScore += 2;
  if (hasBuff) synergyScore += 1;
  if (cat1 !== cat2) synergyScore += 0.5;

  return { hasSpamNuke, hasBuff, synergyScore };
}

/**
 * Get all unique types from a moveset
 */
export function getMovesetTypes(moveIds: string[]): string[] {
  const types = new Set<string>();

  for (const moveId of moveIds) {
    const move = getMoveByMoveId(moveId);
    if (move) {
      types.add(move.type);
    }
  }

  return Array.from(types);
}

export { allMoves };
