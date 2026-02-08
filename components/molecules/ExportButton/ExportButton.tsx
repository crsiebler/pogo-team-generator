'use client';

import { useState } from 'react';
import { copyTeamToClipboard, type TeamMovesets } from '@/lib/export';
import { useToast } from '@/lib/hooks/useToast';

interface ExportButtonProps {
  team: string[];
  movesets: TeamMovesets;
  disabled?: boolean;
}

/**
 * Button to copy team export to clipboard
 * Shows success toast when copied
 */
export function ExportButton({
  team,
  movesets,
  disabled = false,
}: ExportButtonProps) {
  const [isCopying, setIsCopying] = useState(false);
  const { showToast } = useToast();

  const handleExport = async () => {
    if (team.length === 0 || disabled) {
      return;
    }

    try {
      setIsCopying(true);
      await copyTeamToClipboard(team, movesets);
      showToast('Team Copied');
    } catch (error) {
      console.error('Failed to copy team to clipboard:', error);
      showToast('Failed to copy team');
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled || isCopying || team.length === 0}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      aria-label="Copy team export to clipboard"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
      {isCopying ? 'Copying...' : 'Copy Team Export'}
    </button>
  );
}
