'use client';

import { useState, useCallback } from 'react';
import { TeamConfigPanel, ResultsPanel } from '@/components/organisms';
import { useToast } from '@/lib/hooks/useToast';
import { TournamentMode, FitnessAlgorithm } from '@/lib/types';

interface TeamManagerProps {
  pokemonList: string[];
}

export function TeamManager({ pokemonList }: TeamManagerProps) {
  const { showToast } = useToast();
  const [generatedTeam, setGeneratedTeam] = useState<string[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentMode, setCurrentMode] = useState<TournamentMode>('PlayPokemon');
  const [anchorPokemon, setAnchorPokemon] = useState<string[]>([]);
  const [excludedPokemon, setExcludedPokemon] = useState<string[]>([]);
  const [currentAlgorithm, setCurrentAlgorithm] =
    useState<FitnessAlgorithm>('individual');

  const handleModeChange = useCallback((mode: TournamentMode) => {
    setCurrentMode(mode);
    setAnchorPokemon([]);
    setExcludedPokemon([]);
  }, []);

  const handleAnchorsChange = useCallback((anchors: string[]) => {
    setAnchorPokemon(anchors);
  }, []);

  const handleExclusionsChange = useCallback((exclusions: string[]) => {
    setExcludedPokemon(exclusions);
  }, []);

  const handleAlgorithmChange = useCallback((algorithm: FitnessAlgorithm) => {
    setCurrentAlgorithm(algorithm);
  }, []);

  const getBaseSpeciesName = (pokemonName: string): string =>
    pokemonName
      .replace(/\s*\([^)]*\)\s*/g, '')
      .trim()
      .toLowerCase();

  const hasDuplicateBaseSpecies = (pokemon: string[]): boolean => {
    const seenBaseSpecies = new Set<string>();

    for (const name of pokemon) {
      const baseSpecies = getBaseSpeciesName(name);
      if (!baseSpecies) {
        continue;
      }

      if (seenBaseSpecies.has(baseSpecies)) {
        return true;
      }

      seenBaseSpecies.add(baseSpecies);
    }

    return false;
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGeneratedTeam(null);

    try {
      const selectedAnchors = anchorPokemon.filter(Boolean);

      if (hasDuplicateBaseSpecies(selectedAnchors)) {
        throw new Error(
          'Team cannot be generated due to multiple identical species.',
        );
      }

      const response = await fetch('/api/generate-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: currentMode,
          anchorPokemon: selectedAnchors,
          excludedPokemon: excludedPokemon,
          algorithm: currentAlgorithm,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        throw new Error(errorData?.error ?? 'Failed to generate team');
      }

      const data = await response.json();
      setGeneratedTeam(data.team);
    } catch (error) {
      console.error('Error generating team:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to generate team. Please try again.';
      showToast(message, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-2">
      <TeamConfigPanel
        pokemonList={pokemonList}
        mode={currentMode}
        onModeChange={handleModeChange}
        onAnchorsChange={handleAnchorsChange}
        onExclusionsChange={handleExclusionsChange}
        algorithm={currentAlgorithm}
        onAlgorithmChange={handleAlgorithmChange}
        onGenerate={handleGenerate}
        isGenerating={isGenerating}
      />
      <ResultsPanel
        generatedTeam={generatedTeam}
        mode={currentMode}
        isGenerating={isGenerating}
      />
    </div>
  );
}
