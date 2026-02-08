'use client';

import clsx from 'clsx';
import { TeamDisplay } from '@/components/organisms';
import { useTheme } from '@/hooks/useTheme';
import { TournamentMode } from '@/lib/types';

interface ResultsPanelProps {
  generatedTeam: string[] | null;
  mode: TournamentMode;
  isGenerating: boolean;
}

export function ResultsPanel({
  generatedTeam,
  mode,
  isGenerating,
}: ResultsPanelProps) {
  const { theme } = useTheme();
  return (
    <div
      className={clsx(
        'rounded-2xl p-6 shadow-xl backdrop-blur-sm sm:p-8',
        theme === 'dark'
          ? 'bg-gradient-to-br from-gray-800/90 to-gray-900/90'
          : 'bg-opacity-5 bg-white',
      )}
    >
      <h2
        className={clsx(
          'mb-6 text-xl font-bold sm:text-2xl',
          theme === 'dark' ? 'text-gray-100' : 'text-gray-950',
        )}
      >
        Generated Team
      </h2>

      {!generatedTeam && !isGenerating && (
        <div
          className={clsx(
            'flex h-64 items-center justify-center sm:h-96',
            theme === 'dark' ? 'text-gray-500' : 'text-gray-600',
          )}
        >
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
              className="mx-auto mb-4 h-12 w-12 animate-spin text-blue-600 sm:h-16 sm:w-16 dark:text-blue-400"
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
            <p
              className={clsx(
                'text-base font-medium sm:text-lg',
                theme === 'dark' ? 'text-gray-300' : 'text-gray-900',
              )}
            >
              Running genetic algorithm...
            </p>
            <p
              className={clsx(
                'mt-2 text-xs sm:text-sm',
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600',
              )}
            >
              This may take 10-30 seconds
            </p>
          </div>
        </div>
      )}

      {generatedTeam && <TeamDisplay team={generatedTeam} mode={mode} />}
    </div>
  );
}
