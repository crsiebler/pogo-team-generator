'use client';

import { useState, useCallback } from 'react';
import { TeamConfigPanel, ResultsPanel } from '@/components/organisms';
import { TournamentMode, FitnessAlgorithm } from '@/lib/types';

interface TeamManagerProps {
  pokemonList: string[];
}

export function TeamManager({ pokemonList }: TeamManagerProps) {
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

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGeneratedTeam(null);

    try {
      const response = await fetch('/api/generate-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: currentMode,
          anchorPokemon: anchorPokemon.filter(Boolean),
          excludedPokemon: excludedPokemon,
          algorithm: currentAlgorithm,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate team');
      }

      const data = await response.json();
      setGeneratedTeam(data.team);
    } catch (error) {
      console.error('Error generating team:', error);
      alert('Failed to generate team. Please try again.');
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
