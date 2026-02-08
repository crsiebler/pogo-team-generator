/**
 * Convert speciesId to export format
 * Appends '-shadow' suffix for shadow Pokemon
 * @param speciesId - The species ID (e.g., 'scizor', 'scizor_shadow')
 * @returns Formatted species name for export
 */
export function convertSpeciesIdToExportFormat(speciesId: string): string {
  if (speciesId.includes('_shadow')) {
    return `${speciesId}-shadow`;
  }
  return speciesId;
}
