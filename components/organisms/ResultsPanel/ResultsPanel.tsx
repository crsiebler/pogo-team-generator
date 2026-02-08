'use client';

import { TeamDisplay } from '@/components/organisms';
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
  return (
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
  );
}
