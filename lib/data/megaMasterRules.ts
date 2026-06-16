import {
  getPokemonBySpeciesId,
  normalizeToChoosableSpeciesId,
} from './pokemon';

export const MEGA_MASTER_MAX_MEGAS = 1;

export type MegaMasterLegalityViolation = 'mega-limit';

export interface MegaMasterTeamLegality {
  isLegal: boolean;
  megaCount: number;
  violations: MegaMasterLegalityViolation[];
}

/**
 * Check whether a species counts as a Mega Pokemon.
 */
export function isMegaMasterMegaSpecies(speciesId: string): boolean {
  const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
  const pokemon = getPokemonBySpeciesId(canonicalSpeciesId);

  return pokemon?.tags?.includes('mega') ?? false;
}

/**
 * Evaluate whether a Mega Master League team satisfies the one-Mega rule.
 */
export function getMegaMasterTeamLegality(
  team: readonly string[],
): MegaMasterTeamLegality {
  const megaCount = team.filter((speciesId) =>
    isMegaMasterMegaSpecies(speciesId),
  ).length;
  const violations: MegaMasterLegalityViolation[] = [];

  if (megaCount > MEGA_MASTER_MAX_MEGAS) {
    violations.push('mega-limit');
  }

  return {
    isLegal: violations.length === 0,
    megaCount,
    violations,
  };
}
