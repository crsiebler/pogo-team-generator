/**
 * Data validation utilities for sync module
 * Validates JSON and CSV data against expected schemas and performs cross-validation
 */

import { PokemonData, MovesData, RankingEntry } from './types';

/**
 * Normalize Pokemon identifiers to a comparison-safe key.
 */
function normalizePokemonKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Validates Pokemon JSON data structure
 * @param data - Parsed JSON data
 * @returns Validation result with errors if any
 */
export function validatePokemonJson(data: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    errors.push('Pokemon data must be an array');
    return { valid: false, errors };
  }

  data.forEach((pokemon, index) => {
    if (typeof pokemon !== 'object' || pokemon === null) {
      errors.push(`Pokemon at index ${index} must be an object`);
      return;
    }

    const p = pokemon as Partial<PokemonData>;

    if (typeof p.dex !== 'number')
      errors.push(`Pokemon ${index}: dex must be number`);
    if (typeof p.speciesName !== 'string')
      errors.push(`Pokemon ${index}: speciesName must be string`);
    if (typeof p.speciesId !== 'string')
      errors.push(`Pokemon ${index}: speciesId must be string`);

    if (!p.baseStats || typeof p.baseStats !== 'object') {
      errors.push(`Pokemon ${index}: baseStats must be object`);
    } else {
      const bs = p.baseStats as { atk?: unknown; def?: unknown; hp?: unknown };
      if (typeof bs.atk !== 'number')
        errors.push(`Pokemon ${index}: baseStats.atk must be number`);
      if (typeof bs.def !== 'number')
        errors.push(`Pokemon ${index}: baseStats.def must be number`);
      if (typeof bs.hp !== 'number')
        errors.push(`Pokemon ${index}: baseStats.hp must be number`);
    }

    if (!Array.isArray(p.types)) {
      errors.push(`Pokemon ${index}: types must be array`);
    } else if (p.types.some((t) => typeof t !== 'string')) {
      errors.push(`Pokemon ${index}: types must contain strings`);
    }

    if (!Array.isArray(p.fastMoves)) {
      errors.push(`Pokemon ${index}: fastMoves must be array`);
    } else if (p.fastMoves.some((m) => typeof m !== 'string')) {
      errors.push(`Pokemon ${index}: fastMoves must contain strings`);
    }

    if (!Array.isArray(p.chargedMoves)) {
      errors.push(`Pokemon ${index}: chargedMoves must be array`);
    } else if (p.chargedMoves.some((m) => typeof m !== 'string')) {
      errors.push(`Pokemon ${index}: chargedMoves must contain strings`);
    }

    if (typeof p.released !== 'boolean')
      errors.push(`Pokemon ${index}: released must be boolean`);
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Validates Moves JSON data structure
 * @param data - Parsed JSON data
 * @returns Validation result with errors if any
 */
export function validateMovesJson(data: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    errors.push('Moves data must be an array');
    return { valid: false, errors };
  }

  data.forEach((move, index) => {
    if (typeof move !== 'object' || move === null) {
      errors.push(`Move at index ${index} must be an object`);
      return;
    }

    const m = move as Partial<MovesData>;

    if (typeof m.moveId !== 'string')
      errors.push(`Move ${index}: moveId must be string`);
    if (typeof m.name !== 'string')
      errors.push(`Move ${index}: name must be string`);
    if (typeof m.type !== 'string')
      errors.push(`Move ${index}: type must be string`);
    if (typeof m.power !== 'number')
      errors.push(`Move ${index}: power must be number`);
    if (typeof m.energy !== 'number')
      errors.push(`Move ${index}: energy must be number`);
    if (typeof m.energyGain !== 'number')
      errors.push(`Move ${index}: energyGain must be number`);
    if (typeof m.cooldown !== 'number')
      errors.push(`Move ${index}: cooldown must be number`);
    if (m.archetype !== undefined && typeof m.archetype !== 'string')
      errors.push(`Move ${index}: archetype must be string if present`);
    if (typeof m.turns !== 'number')
      errors.push(`Move ${index}: turns must be number`);
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Validates rankings CSV data
 * @param csvText - Raw CSV text
 * @returns Validation result with errors if any
 */
export function validateRankingsCsv(csvText: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    errors.push('CSV must have at least header and one data row');
    return { valid: false, errors };
  }

  const headers = lines[0].split(',');
  const expectedHeaders = [
    'Pokemon',
    'Score',
    'Dex',
    'Type 1',
    'Type 2',
    'Attack',
    'Defense',
    'Stamina',
    'Stat Product',
    'Level',
    'CP',
    'Fast Move',
    'Charged Move 1',
    'Charged Move 2',
    'Charged Move 1 Count',
    'Charged Move 2 Count',
    'Buddy Distance',
    'Charged Move Cost',
  ];

  if (headers.length !== expectedHeaders.length) {
    errors.push(
      `Expected ${expectedHeaders.length} headers, got ${headers.length}`,
    );
  }

  expectedHeaders.forEach((expected, i) => {
    if (headers[i] !== expected) {
      errors.push(`Header ${i}: expected '${expected}', got '${headers[i]}'`);
    }
  });

  // Validate data rows
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    if (row.length !== headers.length) {
      errors.push(
        `Row ${i}: expected ${headers.length} columns, got ${row.length}`,
      );
      continue;
    }

    // Check numeric fields
    const numericFields = [
      'Score',
      'Dex',
      'Attack',
      'Defense',
      'Stamina',
      'Stat Product',
      'Level',
      'CP',
      'Charged Move 1 Count',
      'Charged Move 2 Count',
      'Buddy Distance',
      'Charged Move Cost',
    ];
    numericFields.forEach((field) => {
      const headerIdx = headers.indexOf(field);
      if (headerIdx >= 0) {
        const value = parseFloat(row[headerIdx]);
        if (isNaN(value)) {
          errors.push(
            `Row ${i}, ${field}: must be numeric, got '${row[headerIdx]}'`,
          );
        }
      }
    });

    // Check string fields (Charged Move 2 is optional)
    const stringFields = [
      'Pokemon',
      'Type 1',
      'Type 2',
      'Fast Move',
      'Charged Move 1',
    ];
    stringFields.forEach((field) => {
      const idx = headers.indexOf(field);
      if (idx >= 0 && !row[idx]) {
        errors.push(`Row ${i}, ${field}: cannot be empty`);
      }
    });

    // Charged Move 2 can be empty
    const chargedMove2Idx = headers.indexOf('Charged Move 2');
    if (
      chargedMove2Idx >= 0 &&
      row[chargedMove2Idx] &&
      !row[chargedMove2Idx].trim()
    ) {
      errors.push(`Row ${i}, Charged Move 2: cannot be empty if present`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates simulation CSV data
 * @param csvText - Raw CSV text
 * @returns Validation result with errors if any
 */
export function validateSimulationsCsv(csvText: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    errors.push('Simulation CSV must have at least header and one data row');
    return { valid: false, errors };
  }

  const headers = lines[0].split(',');
  const expectedHeaders = [
    'Pokemon',
    'Battle Rating',
    'Energy Remaining',
    'HP Remaining',
  ];

  if (headers.length !== expectedHeaders.length) {
    errors.push(
      `Expected ${expectedHeaders.length} headers, got ${headers.length}`,
    );
  }

  expectedHeaders.forEach((expected, i) => {
    if (headers[i] !== expected) {
      errors.push(`Header ${i}: expected '${expected}', got '${headers[i]}'`);
    }
  });

  // Validate data rows
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    if (row.length !== headers.length) {
      errors.push(
        `Row ${i}: expected ${headers.length} columns, got ${row.length}`,
      );
      continue;
    }

    // Check string fields
    const stringFields = ['Pokemon'];
    stringFields.forEach((field) => {
      const idx = headers.indexOf(field);
      if (idx >= 0 && !row[idx]) {
        errors.push(`Row ${i}, ${field}: cannot be empty`);
      }
    });

    // Check numeric fields
    const numericFields = ['Battle Rating', 'Energy Remaining', 'HP Remaining'];
    numericFields.forEach((field) => {
      const idx = headers.indexOf(field);
      if (idx >= 0) {
        const value = parseFloat(row[idx]);
        if (isNaN(value)) {
          errors.push(`Row ${i}, ${field}: must be numeric, got '${row[idx]}'`);
        }
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Cross-validates rankings against Pokemon data
 * @param rankings - Parsed rankings data
 * @param pokemonData - Pokemon JSON data
 * @returns Validation result with errors if any
 */
export function crossValidateRankingsVsPokemon(
  rankings: RankingEntry[],
  pokemonData: PokemonData[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const pokemonBySpeciesId = new Map<string, PokemonData>();
  const pokemonBySpeciesName = new Map<string, PokemonData>();

  pokemonData.forEach((pokemon) => {
    const speciesIdKey = normalizePokemonKey(pokemon.speciesId);
    const speciesNameKey = normalizePokemonKey(pokemon.speciesName);

    if (!pokemonBySpeciesId.has(speciesIdKey)) {
      pokemonBySpeciesId.set(speciesIdKey, pokemon);
    }

    if (!pokemonBySpeciesName.has(speciesNameKey)) {
      pokemonBySpeciesName.set(speciesNameKey, pokemon);
    }
  });

  rankings.forEach((ranking, index) => {
    const rankingKey = normalizePokemonKey(ranking.Pokemon);
    const pokemon =
      pokemonBySpeciesName.get(rankingKey) ||
      pokemonBySpeciesId.get(rankingKey);

    if (!pokemon) {
      errors.push(
        `Ranking ${index}: Pokemon '${ranking.Pokemon}' not found in Pokemon data`,
      );
    } else {
      // Check if types match
      if (pokemon.types[0] !== ranking['Type 1']) {
        errors.push(`Ranking ${index}: Type 1 mismatch for ${ranking.Pokemon}`);
      }
      if ((pokemon.types[1] || 'none') !== ranking['Type 2']) {
        errors.push(`Ranking ${index}: Type 2 mismatch for ${ranking.Pokemon}`);
      }
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Logs validation failures with context
 * @param context - Context for the validation
 * @param errors - List of validation errors
 */
export function logValidationErrors(context: string, errors: string[]): void {
  if (errors.length === 0) {
    console.log(`✓ ${context} validation passed`);
  } else {
    console.error(`✗ ${context} validation failed:`);
    errors.forEach((error) => console.error(`  - ${error}`));
  }
}
