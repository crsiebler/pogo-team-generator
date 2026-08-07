'use client';

import { useEffect, useState } from 'react';
import { PokemonCard } from '@/components/molecules';
import { ExportButton } from '@/components/molecules/ExportButton/ExportButton';
import type { BattleFormatId } from '@/lib/data/battleFormats';
import type {
  MovesetAcquisitionRequirements,
  Pokemon,
  RosterMovesetAssignment,
  TournamentMode,
} from '@/lib/types';

interface TeamDisplayProps {
  team: string[];
  mode: TournamentMode;
  formatId: BattleFormatId;
  movesetAssignment: RosterMovesetAssignment;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEligibleAcquisitionRequirement(value: unknown): boolean {
  return (
    isUnknownRecord(value) &&
    (value.kind === 'regular' ||
      value.kind === 'elite' ||
      value.kind === 'eventExclusive' ||
      value.kind === 'purified')
  );
}

function isTeamDetailsResponse(
  value: unknown,
  team: readonly string[],
  assignment: RosterMovesetAssignment,
): value is { pokemon: Pokemon[] } {
  if (typeof value !== 'object' || value === null || !('pokemon' in value)) {
    return false;
  }

  return (
    Array.isArray(value.pokemon) &&
    value.pokemon.length === team.length &&
    value.pokemon.every((pokemon, index) => {
      if (!isUnknownRecord(pokemon) || pokemon.speciesId !== team[index]) {
        return false;
      }

      const variant = assignment.variantsBySpeciesId[team[index]!];
      const recommendedMoveset = pokemon.recommendedMoveset;
      if (!variant || !isUnknownRecord(recommendedMoveset)) {
        return false;
      }

      const requirements = recommendedMoveset.acquisitionRequirements;
      return (
        recommendedMoveset.id === variant.id &&
        recommendedMoveset.fastMove === variant.fastMove &&
        recommendedMoveset.chargedMove1 === variant.chargedMove1 &&
        recommendedMoveset.chargedMove2 === variant.chargedMove2 &&
        recommendedMoveset.isDefault === variant.isDefault &&
        isUnknownRecord(requirements) &&
        isEligibleAcquisitionRequirement(requirements.fastMove) &&
        isEligibleAcquisitionRequirement(requirements.chargedMove1) &&
        isEligibleAcquisitionRequirement(requirements.chargedMove2)
      );
    })
  );
}

export function TeamDisplay({
  team,
  mode,
  formatId,
  movesetAssignment,
}: TeamDisplayProps) {
  const [pokemonData, setPokemonData] = useState<Pokemon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch full Pokémon data for the team
    fetch('/api/team-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team, formatId, movesetAssignment }),
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Team details request failed.');
        }

        const data: unknown = await res.json();
        if (!isTeamDetailsResponse(data, team, movesetAssignment)) {
          throw new Error('Team details response is invalid.');
        }

        return data;
      })
      .then((data) => {
        setPokemonData(data.pokemon);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch team details:', err);
        setLoading(false);
      });
  }, [formatId, movesetAssignment, team]);

  if (loading) {
    return (
      <div className="text-center text-sm text-gray-500 sm:text-base dark:text-gray-400">
        Loading team data...
      </div>
    );
  }

  const acquisitionRequirementsBySpeciesId: Record<
    string,
    MovesetAcquisitionRequirements
  > = {};
  pokemonData.forEach((pokemon) => {
    if (pokemon.recommendedMoveset?.acquisitionRequirements) {
      acquisitionRequirementsBySpeciesId[pokemon.speciesId] =
        pokemon.recommendedMoveset.acquisitionRequirements;
    }
  });

  return (
    <div className="space-y-3 sm:space-y-4">
      {pokemonData.map((pokemon, index) => (
        <PokemonCard key={index} pokemon={pokemon} />
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
            disabled={pokemonData.length !== team.length}
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
