'use client';

import clsx from 'clsx';
import { useTheme } from '@/hooks/useTheme';
import { TournamentMode } from '@/lib/types';

interface ModeSelectorProps {
  mode: TournamentMode;
  onModeChange: (mode: TournamentMode) => void;
}

export function ModeSelector({ mode, onModeChange }: ModeSelectorProps) {
  const { theme } = useTheme();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      <button
        onClick={() => onModeChange('PlayPokemon')}
        className={clsx(
          'rounded-xl border-2 p-4 transition-all',
          mode === 'PlayPokemon'
            ? theme === 'dark'
              ? 'border-blue-600 bg-blue-900/20 text-blue-100'
              : 'border-blue-600 bg-blue-50 text-blue-900'
            : theme === 'dark'
              ? 'border-gray-600 bg-gray-800 text-gray-300 hover:border-blue-400'
              : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400',
        )}
      >
        <div className="mb-1 text-base font-bold sm:text-lg">Play! Pokémon</div>
        <div className="text-xs opacity-75 sm:text-sm">
          6 Pokémon, Open Sheets
        </div>
      </button>
      <button
        onClick={() => onModeChange('GBL')}
        className={clsx(
          'rounded-xl border-2 p-4 transition-all',
          mode === 'GBL'
            ? theme === 'dark'
              ? 'border-purple-600 bg-purple-900/20 text-purple-100'
              : 'border-purple-600 bg-purple-50 text-purple-900'
            : theme === 'dark'
              ? 'border-gray-600 bg-gray-800 text-gray-300 hover:border-purple-400'
              : 'border-gray-300 bg-white text-gray-700 hover:border-purple-400',
        )}
      >
        <div className="mb-1 text-base font-bold sm:text-lg">
          GO Battle League
        </div>
        <div className="text-xs opacity-75 sm:text-sm">3 Pokémon, Blind</div>
      </button>
    </div>
  );
}
