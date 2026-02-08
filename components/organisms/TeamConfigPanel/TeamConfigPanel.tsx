'use client';

import { useCallback } from 'react';
import clsx from 'clsx';
import { ModeSelector } from '@/components/molecules';
import { TeamGenerator } from '@/components/organisms';
import { TournamentMode, FitnessAlgorithm } from '@/lib/types';

interface TeamConfigPanelProps {
  pokemonList: string[];
  mode: TournamentMode;
  onModeChange: (mode: TournamentMode) => void;
  onAnchorsChange: (anchors: string[]) => void;
  onExclusionsChange: (exclusions: string[]) => void;
  algorithm: FitnessAlgorithm;
  onAlgorithmChange: (algorithm: FitnessAlgorithm) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

export function TeamConfigPanel({
  pokemonList,
  mode,
  onModeChange,
  onAnchorsChange,
  onExclusionsChange,
  algorithm,
  onAlgorithmChange,
  onGenerate,
  isGenerating,
}: TeamConfigPanelProps) {
  const handleAnchorsChange = useCallback(
    (anchors: string[]) => {
      onAnchorsChange(anchors);
    },
    [onAnchorsChange],
  );

  const handleExclusionsChange = useCallback(
    (exclusions: string[]) => {
      onExclusionsChange(exclusions);
    },
    [onExclusionsChange],
  );

  const handleAlgorithmChange = useCallback(
    (algorithm: FitnessAlgorithm) => {
      onAlgorithmChange(algorithm);
    },
    [onAlgorithmChange],
  );

  return (
    <div
      className={clsx(
        'rounded-2xl bg-white p-6 shadow-xl sm:p-8',
        'dark:bg-transparent dark:bg-gradient-to-br dark:from-gray-800 dark:to-gray-900',
      )}
    >
      <h2
        className={clsx(
          'mb-6 text-xl font-bold sm:text-2xl',
          'text-gray-950 dark:text-gray-100',
        )}
      >
        Team Configuration
      </h2>

      {/* Tournament Mode Selection */}
      <div className="mb-6 sm:mb-8">
        <span
          className={clsx(
            'mb-3 block text-sm font-semibold',
            'text-gray-800 dark:text-gray-300',
          )}
        >
          Tournament Format
        </span>
        <ModeSelector mode={mode} onModeChange={onModeChange} />
      </div>

      {/* Anchor Pokémon Input */}
      <TeamGenerator
        key={mode} // Force remount when mode changes to reset state
        mode={mode}
        pokemonList={pokemonList}
        onAnchorsChange={handleAnchorsChange}
        onExclusionsChange={handleExclusionsChange}
        algorithm={algorithm}
        onAlgorithmChange={handleAlgorithmChange}
      />

      {/* Generate Button */}
      <button
        onClick={onGenerate}
        disabled={isGenerating}
        className={clsx(
          'w-full rounded-xl px-6 py-4 text-base font-bold transition-all sm:text-lg',
          isGenerating
            ? 'cursor-not-allowed bg-gray-400 text-gray-200 dark:bg-gray-600 dark:text-gray-400'
            : mode === 'PlayPokemon'
              ? 'bg-blue-600 text-white shadow-lg hover:bg-blue-700 hover:shadow-xl dark:bg-blue-700 dark:hover:bg-blue-800'
              : 'bg-purple-600 text-white shadow-lg hover:bg-purple-700 hover:shadow-xl dark:bg-purple-700 dark:hover:bg-purple-800',
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
  );
}
