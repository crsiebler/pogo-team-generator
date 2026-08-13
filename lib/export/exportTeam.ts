import { convertSpeciesIdToExportFormat } from './convertSpeciesId';
import type { TeamAcquisitionRequirements } from './types';
import type {
  EligibleMoveAvailability,
  Moveset,
  RosterMovesetAssignment,
} from '@/lib/types';

function formatAcquisitionRequirement(
  moveId: string,
  slot: keyof Moveset,
  availability: EligibleMoveAvailability,
): string | null {
  switch (availability.kind) {
    case 'regular':
      return null;
    case 'elite':
      return `${moveId} (${slot === 'fastMove' ? 'Elite Fast TM' : 'Elite Charged TM'})`;
    case 'eventExclusive':
      return `${moveId} (event-exclusive)`;
    case 'purified':
      return `${moveId} (purified Pokemon required)`;
  }
}

/**
 * Exports exact assigned movesets and informational acquisition requirements.
 *
 * @param team - Canonical species IDs in roster order.
 * @param assignment - The immutable assignment used for optimizer scoring.
 * @param acquisitionRequirementsBySpeciesId - Acquisition metadata for each
 *   assigned roster member.
 * @returns Newline-delimited PvPoke import rows followed by optional comments.
 */
export function exportTeam(
  team: readonly string[],
  assignment: RosterMovesetAssignment,
  acquisitionRequirementsBySpeciesId: TeamAcquisitionRequirements,
): string {
  if (team.length === 0) {
    return '';
  }

  const lines: string[] = [];
  const acquisitionLines: string[] = [];

  team.forEach((speciesId) => {
    const exportName = convertSpeciesIdToExportFormat(speciesId);
    const moveset = assignment.variantsBySpeciesId[speciesId];
    if (!moveset) {
      throw new Error(`Missing assigned moveset for ${speciesId}.`);
    }

    const requirements = acquisitionRequirementsBySpeciesId[speciesId];
    if (!requirements) {
      throw new Error(`Missing acquisition requirements for ${speciesId}.`);
    }

    lines.push(
      `${exportName},${moveset.fastMove},${moveset.chargedMove1},${moveset.chargedMove2}`,
    );

    const specialRequirements = [
      formatAcquisitionRequirement(
        moveset.fastMove,
        'fastMove',
        requirements.fastMove,
      ),
      formatAcquisitionRequirement(
        moveset.chargedMove1,
        'chargedMove1',
        requirements.chargedMove1,
      ),
      formatAcquisitionRequirement(
        moveset.chargedMove2,
        'chargedMove2',
        requirements.chargedMove2,
      ),
    ].filter((requirement): requirement is string => requirement !== null);

    if (specialRequirements.length > 0) {
      acquisitionLines.push(
        `# ${exportName}: ${specialRequirements.join('; ')}`,
      );
    }
  });

  if (acquisitionLines.length > 0) {
    lines.push('# Acquisition requirements', ...acquisitionLines);
  }

  return lines.join('\n');
}
