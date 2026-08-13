import { normalizeMoveId, normalizeToChoosableSpeciesId } from './aliases';
import { getBattleFormatById, type BattleFormatId } from './battleFormats';
import { getPokemonBySpeciesId } from './pokemon';
import type { MoveAvailability, Moveset } from '@/lib/types';

type LegacyMovePair = readonly [speciesId: string, moveId: string];

/** Pokemon fields required to classify move acquisition availability. */
export interface MoveAvailabilityPokemon {
  readonly speciesId: string;
  readonly fastMoves: readonly string[];
  readonly chargedMoves: readonly string[];
  readonly eliteMoves?: readonly string[];
  readonly legacyMoves?: readonly string[];
  readonly level25CP?: number;
}

/** Availability lookup bound to one Pokemon data snapshot. */
export type MoveAvailabilityLookup = (
  speciesId: string,
  moveId: string,
  formatId: BattleFormatId,
) => MoveAvailability;

type PokemonAvailabilityLookup = (
  speciesId: string,
) => MoveAvailabilityPokemon | undefined;

const APPROVED_LEGACY_MOVE_PAIRS = [
  ['mewtwo', 'COUNTER'],
  ['mewtwo_mega_x', 'COUNTER'],
  ['mewtwo_mega_y', 'COUNTER'],
  ['dialga_origin', 'ROAR_OF_TIME'],
  ['palkia_origin', 'SPACIAL_REND'],
  ['kyurem_black', 'FREEZE_SHOCK'],
  ['kyurem_white', 'ICE_BURN'],
  ['zacian_crowned_sword', 'BEHEMOTH_BLADE'],
  ['zamazenta_crowned_shield', 'BEHEMOTH_BASH'],
] as const satisfies readonly LegacyMovePair[];

/** Return whether a canonical species-move pair has approved legacy access. */
export function isApprovedLegacyMove(
  speciesId: string,
  moveId: string,
): boolean {
  return APPROVED_LEGACY_MOVE_PAIRS.some(
    ([approvedSpeciesId, approvedMoveId]) =>
      speciesId === approvedSpeciesId && moveId === approvedMoveId,
  );
}

/** Availability classifications for every move slot in a moveset. */
export type MovesetAvailability = Readonly<{
  [Slot in keyof Moveset]: MoveAvailability;
}>;

function classifyMoveAvailability(
  speciesId: string,
  moveId: string,
  formatId: BattleFormatId,
  getPokemon: PokemonAvailabilityLookup,
): MoveAvailability {
  const canonicalMoveId = normalizeMoveId(moveId.toUpperCase());

  if (canonicalMoveId === 'FRUSTRATION') {
    return {
      kind: 'excluded',
      reason: 'Frustration is not an eligible moveset move.',
    };
  }

  const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
  const pokemon = getPokemon(canonicalSpeciesId);

  if (canonicalMoveId === 'RETURN') {
    if (
      speciesId.endsWith('_shadow') ||
      canonicalSpeciesId.endsWith('_shadow')
    ) {
      return {
        kind: 'excluded',
        reason: 'Return requires a purified non-shadow Pokemon.',
      };
    }

    if (!pokemon) {
      return {
        kind: 'excluded',
        reason: `Return requires checked-in Pokemon data for ${canonicalSpeciesId}.`,
      };
    }

    if (!getPokemon(`${canonicalSpeciesId}_shadow`)) {
      return {
        kind: 'excluded',
        reason: `Return requires a checked-in shadow variation for ${canonicalSpeciesId}.`,
      };
    }

    const format = getBattleFormatById(formatId);
    if (!format) {
      return {
        kind: 'excluded',
        reason: `Return cannot be evaluated for unsupported format ${formatId}.`,
      };
    }

    const level25CP = pokemon.level25CP;
    if (
      level25CP === undefined ||
      !Number.isFinite(level25CP) ||
      level25CP < 0
    ) {
      return {
        kind: 'excluded',
        reason: `Return requires a valid purified level-25 CP floor for ${canonicalSpeciesId}.`,
      };
    }

    if (level25CP > format.cp) {
      return {
        kind: 'excluded',
        reason: `Purified ${canonicalSpeciesId} has a level-25 CP floor above ${format.cp}.`,
      };
    }

    return { kind: 'purified' };
  }

  if (!pokemon) {
    return {
      kind: 'excluded',
      reason: `No checked-in Pokemon data exists for ${canonicalSpeciesId}.`,
    };
  }

  if (pokemon.eliteMoves?.includes(canonicalMoveId)) {
    return { kind: 'elite' };
  }

  if (pokemon.legacyMoves?.includes(canonicalMoveId)) {
    if (isApprovedLegacyMove(canonicalSpeciesId, canonicalMoveId)) {
      return { kind: 'eventExclusive' };
    }

    return {
      kind: 'excluded',
      reason: `${canonicalMoveId} does not have an approved legacy policy for ${canonicalSpeciesId}.`,
    };
  }

  if (
    pokemon.fastMoves.includes(canonicalMoveId) ||
    pokemon.chargedMoves.includes(canonicalMoveId)
  ) {
    return { kind: 'regular' };
  }

  return {
    kind: 'excluded',
    reason: `${canonicalMoveId} is unavailable for ${canonicalSpeciesId}.`,
  };
}

/** Classify one move's acquisition availability for a species and format. */
export function getMoveAvailability(
  speciesId: string,
  moveId: string,
  formatId: BattleFormatId,
): MoveAvailability {
  return classifyMoveAvailability(
    speciesId,
    moveId,
    formatId,
    getPokemonBySpeciesId,
  );
}

/** Bind move availability policy to a deterministic Pokemon data snapshot. */
export function createMoveAvailabilityResolver(
  pokemonData: readonly MoveAvailabilityPokemon[],
): MoveAvailabilityLookup {
  const pokemonBySpeciesId = new Map(
    pokemonData.map((pokemon) => [pokemon.speciesId, pokemon]),
  );
  return (speciesId, moveId, formatId) =>
    classifyMoveAvailability(
      speciesId,
      moveId,
      formatId,
      (candidateSpeciesId) => pokemonBySpeciesId.get(candidateSpeciesId),
    );
}

/** Classify every move slot in a complete moveset. */
export function getMovesetAvailability(
  speciesId: string,
  moveset: Moveset,
  formatId: BattleFormatId,
): MovesetAvailability {
  return {
    fastMove: getMoveAvailability(speciesId, moveset.fastMove, formatId),
    chargedMove1: getMoveAvailability(
      speciesId,
      moveset.chargedMove1,
      formatId,
    ),
    chargedMove2: getMoveAvailability(
      speciesId,
      moveset.chargedMove2,
      formatId,
    ),
  };
}
