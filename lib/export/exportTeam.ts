import { convertSpeciesIdToExportFormat } from './convertSpeciesId';
import type { TeamMovesets } from './types';

/**
 * Export team to import format
 * Format: speciesName,fastMove,chargedMove1,chargedMove2
 * @param team - Array of speciesIds
 * @param movesets - Object mapping speciesId to moveset
 * @returns Newline-delimited string for import
 */
export function exportTeam(team: string[], movesets: TeamMovesets): string {
  if (team.length === 0) {
    return '';
  }

  const lines = team.map((speciesId) => {
    const exportName = convertSpeciesIdToExportFormat(speciesId);
    const moveset = movesets[speciesId] || {
      fastMove: null,
      chargedMove1: null,
      chargedMove2: null,
    };

    const fastMove = moveset.fastMove || '';
    const chargedMove1 = moveset.chargedMove1 || '';
    const chargedMove2 = moveset.chargedMove2 || '';

    return `${exportName},${fastMove},${chargedMove1},${chargedMove2}`;
  });

  return lines.join('\n');
}
