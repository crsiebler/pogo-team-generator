import { getPokemonBySpeciesId } from '@/lib/data/pokemon';
import { getAssignedMovesetDetails } from '@/lib/genetic/moveset';
import type { PokemonWithMoves, RosterMovesetAssignment } from '@/lib/types';

/** A scored assignment could not be projected into a complete team. */
export class TeamDetailsProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TeamDetailsProjectionError';
  }
}

/** Project every assigned species into ordered display-ready detail records. */
export function getTeamDetails(
  team: readonly string[],
  assignment: RosterMovesetAssignment,
): PokemonWithMoves[] {
  if (team.length === 0 || new Set(team).size !== team.length) {
    throw new TeamDetailsProjectionError(
      'Team details require a non-empty team with unique species.',
    );
  }

  const teamSpeciesIds = [...team].toSorted();
  const assignmentSpeciesIds = Object.keys(
    assignment.variantsBySpeciesId,
  ).toSorted();
  const authoritySpeciesIds = Object.keys(
    assignment.authorityBySpeciesId,
  ).toSorted();
  if (
    !sameSpeciesIds(teamSpeciesIds, assignmentSpeciesIds) ||
    !sameSpeciesIds(teamSpeciesIds, authoritySpeciesIds)
  ) {
    throw new TeamDetailsProjectionError(
      'Scored moveset assignment species do not match the requested team.',
    );
  }

  return team.map((speciesId) => {
    const pokemon = getPokemonBySpeciesId(speciesId);
    if (!pokemon || pokemon.speciesId !== speciesId) {
      throw new TeamDetailsProjectionError(
        `Team details are unavailable for ${speciesId}.`,
      );
    }

    const recommendedMoveset = getAssignedMovesetDetails(
      assignment,
      pokemon.speciesId,
    );
    const assignedVariant = assignment.variantsBySpeciesId[speciesId];
    if (
      !assignedVariant ||
      recommendedMoveset.fastMove !== assignedVariant.fastMove ||
      recommendedMoveset.chargedMove1 !== assignedVariant.chargedMove1 ||
      recommendedMoveset.chargedMove2 !== assignedVariant.chargedMove2 ||
      recommendedMoveset.id !== assignedVariant.id ||
      recommendedMoveset.isDefault !== assignedVariant.isDefault ||
      recommendedMoveset.additionalChargedMove !==
        assignedVariant.additionalChargedMove ||
      recommendedMoveset.megaLevel !== assignedVariant.megaLevel ||
      recommendedMoveset.authority !==
        assignment.authorityBySpeciesId[speciesId]
    ) {
      throw new TeamDetailsProjectionError(
        `Assigned moveset details do not match ${speciesId}.`,
      );
    }

    return { ...pokemon, recommendedMoveset };
  });
}

function sameSpeciesIds(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((speciesId, index) => speciesId === right[index])
  );
}
