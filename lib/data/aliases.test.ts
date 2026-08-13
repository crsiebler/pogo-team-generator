import { describe, expect, it } from 'vitest';
import {
  moveNameToMoveId,
  normalizeMoveId,
  normalizeToChoosableSpeciesId,
  normalizeToChoosableSpeciesName,
  resolveSpeciesAlias,
  type SpeciesAliasKind,
} from './aliases';

describe('species alias normalization', () => {
  const aliases: Array<{
    source: string;
    canonical: string;
    kind: SpeciesAliasKind;
  }> = [
    {
      source: 'morpeko_hangry',
      canonical: 'morpeko_full_belly',
      kind: 'battle-state',
    },
    {
      source: 'aegislash_blade',
      canonical: 'aegislash_shield',
      kind: 'battle-state',
    },
    {
      source: 'lanturnw',
      canonical: 'lanturn',
      kind: 'moveset-variant',
    },
    {
      source: 'cradily_b',
      canonical: 'cradily',
      kind: 'moveset-variant',
    },
    {
      source: 'golisopodsh',
      canonical: 'golisopod',
      kind: 'moveset-variant',
    },
  ];

  it.each(aliases)('normalizes $source deterministically', (alias) => {
    expect(resolveSpeciesAlias(alias.source)).toEqual({
      sourceSpeciesId: alias.source,
      canonicalSpeciesId: alias.canonical,
      aliasKind: alias.kind,
    });
    expect(normalizeToChoosableSpeciesId(alias.source)).toBe(alias.canonical);
    expect(normalizeToChoosableSpeciesId(alias.canonical)).toBe(
      alias.canonical,
    );
  });

  it('retains unknown species ids without alias provenance', () => {
    expect(resolveSpeciesAlias('azumarill')).toEqual({
      sourceSpeciesId: 'azumarill',
      canonicalSpeciesId: 'azumarill',
      aliasKind: null,
    });
  });

  it.each([
    ['Morpeko (Hangry)', 'Morpeko (Full Belly)'],
    ['Aegislash (Blade)', 'Aegislash (Shield)'],
    ['Azumarill', 'Azumarill'],
  ])('normalizes display name %s', (source, canonical) => {
    expect(normalizeToChoosableSpeciesName(source)).toBe(canonical);
  });
});

describe('move alias normalization', () => {
  it.each([
    ['SUPERPOWER', 'SUPER_POWER'],
    ['VISE_GRIP', 'VICE_GRIP'],
    ['SHADOW_BALL', 'SHADOW_BALL'],
  ])('normalizes move id %s', (source, canonical) => {
    expect(normalizeMoveId(source)).toBe(canonical);
    expect(normalizeMoveId(canonical)).toBe(canonical);
  });

  it.each([
    ['Superpower', 'SUPER_POWER'],
    ['Vise Grip', 'VICE_GRIP'],
    ['Weather Ball (Fire)', 'WEATHER_BALL_FIRE'],
    ["Nature's Madness", 'NATURES_MADNESS'],
  ])('normalizes move name %s', (source, canonical) => {
    expect(moveNameToMoveId(source)).toBe(canonical);
  });

  it('does not conflate stateful-form moves', () => {
    expect(normalizeMoveId('AURA_WHEEL_DARK')).toBe('AURA_WHEEL_DARK');
    expect(normalizeMoveId('AEGISLASH_CHARGE_PSYCHO_CUT')).toBe(
      'AEGISLASH_CHARGE_PSYCHO_CUT',
    );
  });
});
