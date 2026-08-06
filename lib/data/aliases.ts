/** Describes why a source species ID aliases a choosable species. */
export type SpeciesAliasKind = 'battle-state' | 'moveset-variant';

/** Canonical species identity plus the source identity and alias provenance. */
export interface SpeciesAliasResolution {
  sourceSpeciesId: string;
  canonicalSpeciesId: string;
  aliasKind: SpeciesAliasKind | null;
}

interface SpeciesAlias {
  canonicalSpeciesId: string;
  kind: SpeciesAliasKind;
}

const SPECIES_ALIASES: Readonly<Record<string, SpeciesAlias>> = {
  morpeko_hangry: {
    canonicalSpeciesId: 'morpeko_full_belly',
    kind: 'battle-state',
  },
  aegislash_blade: {
    canonicalSpeciesId: 'aegislash_shield',
    kind: 'battle-state',
  },
  lanturnw: {
    canonicalSpeciesId: 'lanturn',
    kind: 'moveset-variant',
  },
  cradily_b: {
    canonicalSpeciesId: 'cradily',
    kind: 'moveset-variant',
  },
  golisopodsh: {
    canonicalSpeciesId: 'golisopod',
    kind: 'moveset-variant',
  },
};

const SPECIES_NAME_ALIASES: Readonly<Record<string, string>> = {
  'Morpeko (Hangry)': 'Morpeko (Full Belly)',
  'Aegislash (Blade)': 'Aegislash (Shield)',
};

const MOVE_ID_ALIASES: Readonly<Record<string, string>> = {
  SUPERPOWER: 'SUPER_POWER',
  VISE_GRIP: 'VICE_GRIP',
};

/**
 * Resolve a source species ID without discarding its alias provenance.
 */
export function resolveSpeciesAlias(speciesId: string): SpeciesAliasResolution {
  const alias = SPECIES_ALIASES[speciesId];

  return {
    sourceSpeciesId: speciesId,
    canonicalSpeciesId: alias?.canonicalSpeciesId ?? speciesId,
    aliasKind: alias?.kind ?? null,
  };
}

/**
 * Resolve a species ID to its choosable canonical species ID.
 */
export function normalizeToChoosableSpeciesId(speciesId: string): string {
  return resolveSpeciesAlias(speciesId).canonicalSpeciesId;
}

/**
 * Resolve a display species name to its choosable canonical display name.
 */
export function normalizeToChoosableSpeciesName(speciesName: string): string {
  return SPECIES_NAME_ALIASES[speciesName] ?? speciesName;
}

/**
 * Resolve a known move spelling alias to its canonical move ID.
 */
export function normalizeMoveId(moveId: string): string {
  return MOVE_ID_ALIASES[moveId] ?? moveId;
}

/**
 * Convert a display move name to a canonical move ID.
 */
export function moveNameToMoveId(moveName: string): string {
  const match = moveName.match(/^(.+?)\s*\((.+?)\)$/);
  const parts = match ? [match[1], match[2]] : [moveName];
  const moveId = parts
    .map((part) =>
      part
        .trim()
        .toUpperCase()
        .replace(/'/g, '')
        .replace(/[\s-]+/g, '_'),
    )
    .join('_');

  return normalizeMoveId(moveId);
}
