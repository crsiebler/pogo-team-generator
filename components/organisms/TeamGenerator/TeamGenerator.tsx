'use client';

import { useState, useEffect } from 'react';
import { AutocompleteInput, PokemonTag } from '@/components/molecules';
import { TournamentMode } from '@/lib/types';

interface TeamGeneratorProps {
  mode: TournamentMode;
  pokemonList: string[];
  onAnchorsChange: (anchors: string[]) => void;
  onExclusionsChange: (exclusions: string[]) => void;
}

export function TeamGenerator({
  mode,
  pokemonList,
  onAnchorsChange,
  onExclusionsChange,
}: TeamGeneratorProps) {
  const maxAnchors = mode === 'GBL' ? 3 : 6;
  const [anchorInputs, setAnchorInputs] = useState<string[]>(
    Array(maxAnchors).fill(''),
  );
  const [excludedPokemon, setExcludedPokemon] = useState<string[]>([]);
  const [exclusionInput, setExclusionInput] = useState<string>('');

  // Update parent when anchors change - but only non-empty values
  useEffect(() => {
    const validAnchors = anchorInputs.filter(Boolean);
    onAnchorsChange(validAnchors);
  }, [anchorInputs, onAnchorsChange]);

  // Update parent when exclusions change
  useEffect(() => {
    onExclusionsChange(excludedPokemon);
  }, [excludedPokemon, onExclusionsChange]);

  const handleInputChange = (index: number, value: string) => {
    const newInputs = [...anchorInputs];
    newInputs[index] = value;
    setAnchorInputs(newInputs);
  };

  const handleSuggestionClick = (index: number, suggestion: string) => {
    const newInputs = [...anchorInputs];
    newInputs[index] = suggestion;
    setAnchorInputs(newInputs);
  };

  const handleExclusionInputChange = (value: string) => {
    setExclusionInput(value);
  };

  const handleExclusionSelect = (pokemon: string) => {
    setExclusionInput(pokemon);
    addExclusion();
  };

  const addExclusion = () => {
    if (
      exclusionInput &&
      !excludedPokemon.includes(exclusionInput) &&
      !anchorInputs.includes(exclusionInput) &&
      pokemonList.includes(exclusionInput)
    ) {
      setExcludedPokemon([...excludedPokemon, exclusionInput]);
      setExclusionInput('');
    }
  };

  const removeExclusion = (pokemon: string) => {
    setExcludedPokemon(excludedPokemon.filter((p) => p !== pokemon));
  };

  return (
    <div className="mb-6 sm:mb-8">
      <h3 className="mb-3 block text-sm font-semibold text-gray-700">
        Anchor Pokémon (Optional)
      </h3>
      <p className="mb-4 text-xs text-gray-600 sm:text-sm">
        Select up to {maxAnchors} Pokémon you want to use. The algorithm will
        build a team around them.
      </p>

      <div className="space-y-2 sm:space-y-3">
        {anchorInputs.map((input, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-6 text-xs font-medium text-gray-500 sm:w-8 sm:text-sm">
              #{index + 1}
            </span>
            <div className="flex-1">
              <AutocompleteInput
                value={input}
                onChange={(value) => handleInputChange(index, value)}
                onSelect={(value) => handleSuggestionClick(index, value)}
                suggestions={pokemonList}
                placeholder={`Pokémon ${index + 1}`}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Exclusion Section */}
      <div className="mt-6 border-t pt-6">
        <h3 className="mb-3 block text-sm font-semibold text-gray-700">
          Exclude Pokémon (Optional)
        </h3>
        <p className="mb-4 text-xs text-gray-600 sm:text-sm">
          Exclude specific Pokémon from being selected in generated teams.
        </p>

        <div className="mb-4 flex gap-2">
          <div className="flex-1">
            <AutocompleteInput
              value={exclusionInput}
              onChange={handleExclusionInputChange}
              onSelect={handleExclusionSelect}
              suggestions={pokemonList.filter(
                (p) =>
                  !excludedPokemon.includes(p) && !anchorInputs.includes(p),
              )}
              placeholder="Type to search Pokémon..."
            />
          </div>

          <button
            onClick={addExclusion}
            disabled={
              !exclusionInput ||
              excludedPokemon.includes(exclusionInput) ||
              !pokemonList.includes(exclusionInput)
            }
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 sm:text-base"
          >
            Add
          </button>
        </div>

        {/* Excluded Pokémon Tags */}
        {excludedPokemon.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {excludedPokemon.map((pokemon) => (
              <PokemonTag
                key={pokemon}
                pokemon={pokemon}
                onRemove={() => removeExclusion(pokemon)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
