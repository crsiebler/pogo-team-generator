import { exportTeam } from './exportTeam';
import type { TeamAcquisitionRequirements } from './types';
import type { RosterMovesetAssignment } from '@/lib/types';

/**
 * Copies exact assigned movesets and acquisition requirements to the clipboard.
 *
 * @param team - Canonical species IDs in roster order.
 * @param assignment - The immutable assignment used for optimizer scoring.
 * @param acquisitionRequirementsBySpeciesId - Acquisition metadata for each
 *   assigned roster member.
 * @returns Promise that resolves when copied.
 */
export async function copyTeamToClipboard(
  team: readonly string[],
  assignment: RosterMovesetAssignment,
  acquisitionRequirementsBySpeciesId: TeamAcquisitionRequirements,
): Promise<void> {
  const exportString = exportTeam(
    team,
    assignment,
    acquisitionRequirementsBySpeciesId,
  );
  await navigator.clipboard.writeText(exportString);
}
