import { describe, it, expect } from 'vitest';
import { convertSpeciesIdToExportFormat } from './convertSpeciesId';

describe('convertSpeciesIdToExportFormat', () => {
  it('should return normal speciesId unchanged', () => {
    expect(convertSpeciesIdToExportFormat('altaria')).toBe('altaria');
    expect(convertSpeciesIdToExportFormat('scizor')).toBe('scizor');
    expect(convertSpeciesIdToExportFormat('empoleon')).toBe('empoleon');
  });

  it('should append -shadow suffix for shadow Pokemon', () => {
    expect(convertSpeciesIdToExportFormat('scizor_shadow')).toBe(
      'scizor_shadow-shadow',
    );
    expect(convertSpeciesIdToExportFormat('marowak_shadow')).toBe(
      'marowak_shadow-shadow',
    );
    expect(convertSpeciesIdToExportFormat('giratina_altered_shadow')).toBe(
      'giratina_altered_shadow-shadow',
    );
  });

  it('should return alolan forms unchanged', () => {
    expect(convertSpeciesIdToExportFormat('sandslash_alolan')).toBe(
      'sandslash_alolan',
    );
    expect(convertSpeciesIdToExportFormat('marowak_alolan')).toBe(
      'marowak_alolan',
    );
  });

  it('should append -shadow suffix for shadow alolan Pokemon', () => {
    expect(convertSpeciesIdToExportFormat('sandslash_alolan_shadow')).toBe(
      'sandslash_alolan_shadow-shadow',
    );
    expect(convertSpeciesIdToExportFormat('marowak_alolan_shadow')).toBe(
      'marowak_alolan_shadow-shadow',
    );
  });

  it('should handle other form variants', () => {
    expect(convertSpeciesIdToExportFormat('morpeko_full_belly')).toBe(
      'morpeko_full_belly',
    );
    expect(convertSpeciesIdToExportFormat('giratina_altered')).toBe(
      'giratina_altered',
    );
  });
});
