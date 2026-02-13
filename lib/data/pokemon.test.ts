import { describe, expect, it } from 'vitest';
import { speciesNameToId } from './pokemon';

describe('speciesNameToId', () => {
  it('resolves duplicate species names to the first occurrence', () => {
    expect(speciesNameToId('Cradily')).toBe('cradily');
  });

  it('resolves non-duplicate species names normally', () => {
    expect(speciesNameToId('Cradily (Shadow)')).toBe('cradily_shadow');
  });
});
