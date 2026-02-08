import { exportTeam } from './exportTeam';
import type { TeamMovesets } from './types';

/**
 * Copy team export to clipboard
 * @param team - Array of speciesIds
 * @param movesets - Object mapping speciesId to moveset
 * @returns Promise that resolves when copied
 */
export async function copyTeamToClipboard(
  team: string[],
  movesets: TeamMovesets,
): Promise<void> {
  const exportString = exportTeam(team, movesets);
  await navigator.clipboard.writeText(exportString);
}
