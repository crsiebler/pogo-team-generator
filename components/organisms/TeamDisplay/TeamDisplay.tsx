'use client';

import { PokemonCard } from '@/components/molecules';
import { ExportButton } from '@/components/molecules/ExportButton/ExportButton';
import type {
  MovesetAcquisitionRequirements,
  PokemonWithMoves,
  RosterMovesetAssignment,
  TournamentMode,
} from '@/lib/types';

interface TeamDisplayProps {
  team: string[];
  mode: TournamentMode;
  movesetAssignment: RosterMovesetAssignment;
  pokemon: PokemonWithMoves[];
}

export function TeamDisplay({
  team,
  mode,
  movesetAssignment,
  pokemon,
}: TeamDisplayProps) {
  const acquisitionRequirementsBySpeciesId: Record<
    string,
    MovesetAcquisitionRequirements
  > = {};
  pokemon.forEach((pokemonDetails) => {
    acquisitionRequirementsBySpeciesId[pokemonDetails.speciesId] =
      pokemonDetails.recommendedMoveset.acquisitionRequirements;
  });

  return (
    <div className="space-y-3 sm:space-y-4">
      {pokemon.map((pokemonDetails) => (
        <PokemonCard key={pokemonDetails.speciesId} pokemon={pokemonDetails} />
      ))}

      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:mt-6 sm:p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-bold text-blue-900 dark:text-blue-100">
            💡 Team Notes
          </h4>
          <ExportButton
            team={team}
            movesetAssignment={movesetAssignment}
            acquisitionRequirementsBySpeciesId={
              acquisitionRequirementsBySpeciesId
            }
            disabled={pokemon.length !== team.length}
          />
        </div>
        <ul className="space-y-1 text-xs text-blue-800 sm:text-sm dark:text-blue-200">
          <li>
            • This team is optimized for{' '}
            {mode === 'GBL' ? 'GO Battle League' : 'Play! Pokémon'} format
          </li>
          <li>• Check type coverage and adjust movesets as needed</li>
        </ul>
      </div>
    </div>
  );
}
