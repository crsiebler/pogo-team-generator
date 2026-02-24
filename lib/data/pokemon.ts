import type { Pokemon } from '../types';
import pokemonData from '@/data/pokemon.json';

// Type-safe cast
const allPokemon = pokemonData as Pokemon[];

const NON_CHOOSABLE_FORM_ALIASES: Record<string, string> = {
  morpeko_hangry: 'morpeko_full_belly',
  aegislash_blade: 'aegislash_shield',
  lanturnw: 'lanturn',
  cradily_b: 'cradily',
  golisopodsh: 'golisopod',
};

const NON_CHOOSABLE_DISPLAY_NAME_ALIASES: Record<string, string> = {
  'Morpeko (Hangry)': 'Morpeko (Full Belly)',
  'Aegislash (Blade)': 'Aegislash (Shield)',
};

/**
 * Normalize a Pokemon identifier/display name into a comparison-safe key.
 */
function normalizePokemonKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Build O(1) lookup maps
const pokemonBySpeciesId = new Map<string, Pokemon>();
const pokemonByDex = new Map<number, Pokemon>();
const pokemonBySpeciesName = new Map<string, Pokemon>();
const pokemonByNormalizedSpeciesName = new Map<string, Pokemon>();

for (const pokemon of allPokemon) {
  const cleanedPokemon = {
    ...pokemon,
    types: pokemon.types.filter((t) => t !== 'none'),
  };
  pokemonBySpeciesId.set(pokemon.speciesId, cleanedPokemon);
  pokemonByDex.set(pokemon.dex, cleanedPokemon);
  if (!pokemonBySpeciesName.has(pokemon.speciesName)) {
    pokemonBySpeciesName.set(pokemon.speciesName, cleanedPokemon);
  }
  pokemonByNormalizedSpeciesName.set(
    normalizePokemonKey(pokemon.speciesName),
    cleanedPokemon,
  );
}

/**
 * Get Pokémon by speciesId
 */
export function getPokemonBySpeciesId(speciesId: string): Pokemon | undefined {
  return pokemonBySpeciesId.get(speciesId);
}

/**
 * Get Pokémon by Pokédex number
 */
export function getPokemonByDex(dex: number): Pokemon | undefined {
  return pokemonByDex.get(dex);
}

/**
 * Get Pokémon by species name (e.g., "Scizor (Shadow)")
 */
export function getPokemonBySpeciesName(
  speciesName: string,
): Pokemon | undefined {
  return pokemonBySpeciesName.get(speciesName);
}

/**
 * Convert species name to speciesId
 * @example "Scizor (Shadow)" → "scizor_shadow"
 */
export function speciesNameToId(speciesName: string): string | undefined {
  const pokemon = pokemonBySpeciesName.get(speciesName);
  return pokemon?.speciesId;
}

/**
 * Resolve a speciesId to a choosable form speciesId.
 * Non-choosable battle-state forms are mapped to their selectable form.
 */
export function normalizeToChoosableSpeciesId(speciesId: string): string {
  return NON_CHOOSABLE_FORM_ALIASES[speciesId] ?? speciesId;
}

/**
 * Resolve a display species name to a choosable form display name.
 */
export function normalizeToChoosableSpeciesName(speciesName: string): string {
  return NON_CHOOSABLE_DISPLAY_NAME_ALIASES[speciesName] ?? speciesName;
}

/**
 * Convert any display species name to a choosable speciesId.
 */
export function speciesNameToChoosableId(
  speciesName: string,
): string | undefined {
  const canonicalName = normalizeToChoosableSpeciesName(speciesName);
  const exactMatch = pokemonBySpeciesName.get(canonicalName);
  if (exactMatch) {
    return normalizeToChoosableSpeciesId(exactMatch.speciesId);
  }

  const normalizedMatch = pokemonByNormalizedSpeciesName.get(
    normalizePokemonKey(canonicalName),
  );
  if (!normalizedMatch) {
    return undefined;
  }

  return normalizeToChoosableSpeciesId(normalizedMatch.speciesId);
}

/**
 * Convert a speciesId to canonical display name from Pokemon data.
 */
export function speciesIdToSpeciesName(speciesId: string): string {
  const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
  const pokemon = pokemonBySpeciesId.get(canonicalSpeciesId);
  return pokemon?.speciesName ?? speciesId;
}

/**
 * Get all Pokémon that match a filter
 */
export function filterPokemon(
  predicate: (pokemon: Pokemon) => boolean,
): Pokemon[] {
  return allPokemon.filter(predicate);
}

/**
 * Get all available Pokémon (released only)
 */
export function getAvailablePokemon(): Pokemon[] {
  return filterPokemon((p) => p.released);
}

/**
 * Extract base species from a speciesId (removes shadow/form suffixes)
 * @example "marowak_alolan_shadow" → "marowak"
 */
export function getBaseSpecies(speciesId: string): string {
  return speciesId.split('_')[0];
}

/**
 * Get the Dex number for a speciesId
 * This is the true identifier for species uniqueness (scizor and scizor_shadow share dex 212)
 */
export function getDexNumber(speciesId: string): number | undefined {
  const pokemon = getPokemonBySpeciesId(speciesId);
  return pokemon?.dex;
}

/**
 * Check if two speciesIds are the same base species (share the same Dex number)
 * Used for team validation (can't have marowak and marowak_alolan, or scizor and scizor_shadow)
 */
export function isSameBaseSpecies(
  speciesId1: string,
  speciesId2: string,
): boolean {
  const dex1 = getDexNumber(speciesId1);
  const dex2 = getDexNumber(speciesId2);
  if (!dex1 || !dex2) return false;
  return dex1 === dex2;
}

/**
 * Validate team has unique base species (unique Dex numbers)
 * @returns true if valid, false if duplicate Dex numbers found
 */
export function validateTeamUniqueness(team: string[]): boolean {
  const dexNumbers = team
    .map(getDexNumber)
    .filter((dex): dex is number => dex !== undefined);
  const uniqueDex = new Set(dexNumbers);
  return uniqueDex.size === dexNumbers.length;
}

/**
 * Get all Pokémon with Great League (CP 1500) IVs
 */
export function getGreatLeaguePokemon(): Pokemon[] {
  return filterPokemon((p) => p.defaultIVs.cp1500 !== undefined && p.released);
}

/**
 * Get only Pokémon that appear in rankings (viable for Great League)
 * This filters out Pokemon like Smeargle that can't reach competitive CP
 */
export function getRankedGreatLeaguePokemon(
  rankedNames: Set<string>,
): Pokemon[] {
  return filterPokemon(
    (p) =>
      p.released &&
      p.defaultIVs.cp1500 !== undefined &&
      rankedNames.has(p.speciesName),
  );
}

/**
 * Calculate stat product for a Pokémon at CP 1500
 */
export function calculateStatProduct(pokemon: Pokemon): number {
  const ivs = pokemon.defaultIVs.cp1500;
  if (!ivs) return 0;

  const [level, atkIV, defIV, hpIV] = ivs;
  const cpMultiplier = getCPMultiplier(level);

  const attack = (pokemon.baseStats.atk + atkIV) * cpMultiplier;
  const defense = (pokemon.baseStats.def + defIV) * cpMultiplier;
  const stamina = Math.floor((pokemon.baseStats.hp + hpIV) * cpMultiplier);

  return attack * defense * stamina;
}

/**
 * Get CP multiplier for a given level
 * Simplified version - in production, use full lookup table
 */
function getCPMultiplier(level: number): number {
  // Approximate formula for demonstration
  // Real implementation should use Niantic's official table
  return Math.sqrt(level / 100 + 0.5);
}

/**
 * Check if Pokémon is shadow form
 */
export function isShadow(speciesId: string): boolean {
  return speciesId.includes('_shadow');
}

/**
 * Check if Pokémon is XL (requires XL candy)
 * Pokémon that need level > 40 for CP 1500 require XL candy
 */
export function requiresXLCandy(pokemon: Pokemon): boolean {
  const ivs = pokemon.defaultIVs.cp1500;
  if (!ivs) return false;
  const [level] = ivs;
  return level > 40;
}

/**
 * Get resource cost summary for a Pokémon
 */
export function getResourceCost(pokemon: Pokemon): {
  buddyDistance: number;
  thirdMoveCost: number;
  requiresXL: boolean;
  isShadow: boolean;
} {
  return {
    buddyDistance: pokemon.buddyDistance,
    thirdMoveCost: pokemon.thirdMoveCost,
    requiresXL: requiresXLCandy(pokemon),
    isShadow: isShadow(pokemon.speciesId),
  };
}

export { allPokemon };
