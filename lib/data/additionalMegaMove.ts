import { getMoveByMoveId } from './moves';
import { getPokemonBySpeciesId } from './pokemon';
import type { Move, Pokemon } from '@/lib/types';

/** Pokemon fields used to resolve a fixed additional charged move. */
export type AdditionalChargedMovePokemon = Pick<
  Pokemon,
  'tags' | 'extraChargedMoves'
>;

/** Move lookup used by additional charged move resolution. */
export type AdditionalChargedMoveLookup = (moveId: string) => Move | undefined;

/**
 * Resolve the fixed additional charged move for one eligible Mega form.
 *
 * The synchronized data is authoritative: a form must be Mega-tagged, have
 * exactly one additional move reference, and reference a Mega move.
 */
export function resolveAdditionalChargedMove(
  pokemon: AdditionalChargedMovePokemon | undefined,
  getMove: AdditionalChargedMoveLookup = getMoveByMoveId,
): string | undefined {
  if (!pokemon?.tags?.includes('mega')) {
    return undefined;
  }

  const extraChargedMoves = pokemon.extraChargedMoves;
  if (
    !Array.isArray(extraChargedMoves) ||
    extraChargedMoves.length !== 1 ||
    typeof extraChargedMoves[0] !== 'string'
  ) {
    return undefined;
  }

  const moveId = extraChargedMoves[0];
  const move = getMove(moveId);
  return move?.isMegaMove === true ? moveId : undefined;
}

/** Return whether a synchronized form is eligible for an additional move. */
export function isEligibleForAdditionalChargedMove(
  pokemon: AdditionalChargedMovePokemon | undefined,
  getMove: AdditionalChargedMoveLookup = getMoveByMoveId,
): boolean {
  return resolveAdditionalChargedMove(pokemon, getMove) !== undefined;
}

/** Resolve a synchronized form's fixed additional charged move by species ID. */
export function getAdditionalChargedMove(
  speciesId: string,
): string | undefined {
  return resolveAdditionalChargedMove(
    getPokemonBySpeciesId(speciesId),
    getMoveByMoveId,
  );
}
