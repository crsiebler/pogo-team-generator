'use client';

import { useEffect, useState } from 'react';
import { PokemonCard } from '@/components/molecules';
import { ExportButton } from '@/components/molecules/ExportButton/ExportButton';
import type { BattleFormatId } from '@/lib/data/battleFormats';
import type { TeamMovesets } from '@/lib/export';
import type { Pokemon, TournamentMode } from '@/lib/types';

interface TeamDisplayProps {
  team: string[];
  mode: TournamentMode;
  formatId: BattleFormatId;
  battleFrontierMasterPointsByPokemonName?: Record<string, number>;
}

export function TeamDisplay({
  team,
  mode,
  formatId,
  battleFrontierMasterPointsByPokemonName = {},
}: TeamDisplayProps) {
  const [pokemonData, setPokemonData] = useState<Pokemon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch full Pokémon data for the team
    fetch('/api/team-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team, formatId }),
    })
      .then((res) => res.json())
      .then((data) => {
        setPokemonData(data.pokemon);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch team details:', err);
        setLoading(false);
      });
  }, [formatId, team]);

  if (loading) {
    return (
      <div className="text-center text-sm text-gray-500 sm:text-base dark:text-gray-400">
        Loading team data...
      </div>
    );
  }

  // Build movesets from pokemon data
  const movesets: TeamMovesets = {};
  pokemonData.forEach((pokemon) => {
    if (pokemon.recommendedMoveset) {
      movesets[pokemon.speciesId] = {
        fastMove: pokemon.recommendedMoveset.fastMove,
        chargedMove1: pokemon.recommendedMoveset.chargedMove1,
        chargedMove2: pokemon.recommendedMoveset.chargedMove2,
      };
    }
  });

  const battleFrontierMasterTeamPoints = pokemonData.reduce(
    (totalPoints, pokemon) => {
      return (
        totalPoints +
        (battleFrontierMasterPointsByPokemonName[pokemon.speciesName] ?? 0)
      );
    },
    0,
  );

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
          <ExportButton team={team} movesets={movesets} />
        </div>
        <ul className="space-y-1 text-xs text-blue-800 sm:text-sm dark:text-blue-200">
          <li>
            • This team is optimized for{' '}
            {mode === 'GBL' ? 'GO Battle League' : 'Play! Pokémon'} format
          </li>
          {formatId === 'battle-frontier-master' ? (
            <li>
              • Current Battle Frontier Master point usage:{' '}
              {battleFrontierMasterTeamPoints} / 11 points
            </li>
          ) : null}
          <li>• Check type coverage and adjust movesets as needed</li>
        </ul>
      </div>
    </div>
  );
}
