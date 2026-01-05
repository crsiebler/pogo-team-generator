'use client';

import { useState, useCallback } from 'react';
import clsx from 'clsx';
import TeamDisplay from '@/components/TeamDisplay';
import TeamGenerator from '@/components/TeamGenerator';
import { TournamentMode } from '@/lib/types';

interface HomePageProps {
  pokemonList: string[];
}

export function HomePage({ pokemonList }: HomePageProps) {
  const [mode, setMode] = useState<TournamentMode>('PlayPokemon');
  const [anchorPokemon, setAnchorPokemon] = useState<string[]>([]);
  const [excludedPokemon, setExcludedPokemon] = useState<string[]>([]);
  const [generatedTeam, setGeneratedTeam] = useState<string[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleModeChange = (newMode: TournamentMode) => {
    setMode(newMode);
    setGeneratedTeam(null);
    setAnchorPokemon([]);
    setExcludedPokemon([]);
  };

  const handleAnchorsChange = useCallback((anchors: string[]) => {
    setAnchorPokemon(anchors);
  }, []);

  const handleExclusionsChange = useCallback((exclusions: string[]) => {
    setExcludedPokemon(exclusions);
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGeneratedTeam(null);

    try {
      const response = await fetch('/api/generate-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          anchorPokemon: anchorPokemon.filter(Boolean),
          excludedPokemon: excludedPokemon,
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
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <header className="mb-8 text-center sm:mb-12">
        <h1 className="mb-4 text-3xl font-bold text-gray-900 sm:text-4xl lg:text-5xl">
          Pokémon GO PvP Team Generator
        </h1>
        <p className="text-base text-gray-600 sm:text-lg lg:text-xl">
          Generate optimized teams for competitive PvP using genetic algorithms
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-2">
        {/* Configuration Panel */}
        <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          <h2 className="mb-6 text-xl font-bold text-gray-900 sm:text-2xl">
            Team Configuration
          </h2>

          {/* Tournament Mode Selection */}
          <div className="mb-6 sm:mb-8">
            <span className="mb-3 block text-sm font-semibold text-gray-700">
              Tournament Format
            </span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <button
                onClick={() => handleModeChange('PlayPokemon')}
                className={clsx(
                  'rounded-xl border-2 p-4 transition-all',
                  mode === 'PlayPokemon'
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400',
                )}
              >
                <div className="mb-1 text-base font-bold sm:text-lg">
                  Play! Pokémon
                </div>
                <div className="text-xs opacity-75 sm:text-sm">
                  6 Pokémon, Open Sheets
                </div>
              </button>
              <button
                onClick={() => handleModeChange('GBL')}
                className={clsx(
                  'rounded-xl border-2 p-4 transition-all',
                  mode === 'GBL'
                    ? 'border-purple-600 bg-purple-50 text-purple-900'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-purple-400',
                )}
              >
                <div className="mb-1 text-base font-bold sm:text-lg">
                  GO Battle League
                </div>
                <div className="text-xs opacity-75 sm:text-sm">
                  3 Pokémon, Blind
                </div>
              </button>
            </div>
          </div>

          {/* Anchor Pokémon Input */}
          <TeamGenerator
            mode={mode}
            pokemonList={pokemonList}
            onAnchorsChange={handleAnchorsChange}
            onExclusionsChange={handleExclusionsChange}
          />

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={clsx(
              'w-full rounded-xl px-6 py-4 text-base font-bold transition-all sm:text-lg',
              isGenerating
                ? 'cursor-not-allowed bg-gray-400 text-gray-200'
                : mode === 'PlayPokemon'
                  ? 'bg-blue-600 text-white shadow-lg hover:bg-blue-700 hover:shadow-xl'
                  : 'bg-purple-600 text-white shadow-lg hover:bg-purple-700 hover:shadow-xl',
            )}
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-3">
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Generating Team...
              </span>
            ) : (
              'Generate Optimized Team'
            )}
          </button>
        </div>

        {/* Results Panel */}
        <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          <h2 className="mb-6 text-xl font-bold text-gray-900 sm:text-2xl">
            Generated Team
          </h2>

          {!generatedTeam && !isGenerating && (
            <div className="flex h-64 items-center justify-center text-gray-400 sm:h-96">
              <div className="text-center">
                <svg
                  className="mx-auto mb-4 h-16 w-16 opacity-50 sm:h-24 sm:w-24"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-base font-medium sm:text-lg">
                  No team generated yet
                </p>
                <p className="mt-2 text-xs sm:text-sm">
                  Configure your settings and click Generate
                </p>
              </div>
            </div>
          )}

          {isGenerating && (
            <div className="flex h-64 items-center justify-center sm:h-96">
              <div className="text-center">
                <svg
                  className="mx-auto mb-4 h-12 w-12 animate-spin text-blue-600 sm:h-16 sm:w-16"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <p className="text-base font-medium text-gray-700 sm:text-lg">
                  Running genetic algorithm...
                </p>
                <p className="mt-2 text-xs text-gray-500 sm:text-sm">
                  This may take 10-30 seconds
                </p>
              </div>
            </div>
          )}

          {generatedTeam && <TeamDisplay team={generatedTeam} mode={mode} />}
        </div>
      </div>
    </main>
  );
}
