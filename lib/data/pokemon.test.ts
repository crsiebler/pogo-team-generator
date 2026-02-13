import { describe, expect, it } from 'vitest';
import { speciesNameToId, validateTeamUniqueness } from './pokemon';

describe('speciesNameToId', () => {
  it('resolves duplicate species names to the first occurrence', () => {
    expect(speciesNameToId('Cradily')).toBe('cradily');
  });

  it('resolves non-duplicate species names normally', () => {
    expect(speciesNameToId('Cradily (Shadow)')).toBe('cradily_shadow');
  });
});

describe('validateTeamUniqueness', () => {
  it('rejects mixed variants of the same species', () => {
    expect(
      validateTeamUniqueness(['marowak', 'marowak_alolan', 'azumarill']),
    ).toBe(false);
  });

  it('accepts teams with unique species', () => {
    expect(validateTeamUniqueness(['marowak', 'azumarill', 'registeel'])).toBe(
      true,
    );
  });
});
