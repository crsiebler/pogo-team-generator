import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import {
  getPokemonBySpeciesId,
  isShadow,
  normalizeToChoosableSpeciesId,
} from '@/lib/data/pokemon';
import { getRankedSpeciesIds } from '@/lib/data/rankings';

export const BATTLE_FRONTIER_MASTER_MAX_POINTS = 11;
export const BATTLE_FRONTIER_MASTER_MAX_FIVE_POINT_POKEMON = 1;
export const BATTLE_FRONTIER_MASTER_MAX_MEGAS = 1;

export type BattleFrontierMasterLegalityViolation =
  | 'points-cap'
  | 'five-point-limit'
  | 'mega-limit';

export interface BattleFrontierMasterTeamLegality {
  isLegal: boolean;
  totalPoints: number;
  fivePointPokemonCount: number;
  megaCount: number;
  violations: BattleFrontierMasterLegalityViolation[];
}

interface BattleFrontierMasterRulesData {
  pointsBySpeciesId: ReadonlyMap<string, number>;
  inheritingShadowSpeciesIds: ReadonlySet<string>;
}

let cachedRulesData: BattleFrontierMasterRulesData | null = null;

/**
 * Load and cache the active Battle Frontier Master point table.
 */
function getBattleFrontierMasterRulesData(): BattleFrontierMasterRulesData {
  if (cachedRulesData) {
    return cachedRulesData;
  }

  const filePath = `${process.cwd()}/data/battle-frontier-master-points.csv`;
  const fileContent = readFileSync(filePath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    cast: (value, context) => {
      if (context.column === 'points') {
        return Number(value);
      }

      return value;
    },
  }) as Array<{
    speciesId: string;
    points: number;
  }>;

  const pointsBySpeciesId = new Map<string, number>();

  for (const record of records) {
    pointsBySpeciesId.set(record.speciesId, record.points);
  }

  const rankedSpeciesIds = getRankedSpeciesIds('battle-frontier-master');
  const inheritingShadowSpeciesIds = new Set<string>();

  for (const speciesId of rankedSpeciesIds) {
    if (!isShadow(speciesId)) {
      continue;
    }

    const shadowPokemon = getPokemonBySpeciesId(speciesId);
    if (!shadowPokemon) {
      continue;
    }

    const baseSpeciesId = speciesId.replace(/_shadow$/, '');
    if (!pointsBySpeciesId.has(baseSpeciesId)) {
      continue;
    }

    inheritingShadowSpeciesIds.add(speciesId);
  }

  cachedRulesData = {
    pointsBySpeciesId,
    inheritingShadowSpeciesIds,
  };

  return cachedRulesData;
}

/**
 * Resolve the Battle Frontier Master point value for a species id.
 */
export function getBattleFrontierMasterPointsForSpecies(
  speciesId: string,
): number {
  const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
  const { pointsBySpeciesId, inheritingShadowSpeciesIds } =
    getBattleFrontierMasterRulesData();
  const exactPoints = pointsBySpeciesId.get(canonicalSpeciesId);

  if (exactPoints !== undefined) {
    return exactPoints;
  }

  if (inheritingShadowSpeciesIds.has(canonicalSpeciesId)) {
    const baseSpeciesId = canonicalSpeciesId.replace(/_shadow$/, '');
    return pointsBySpeciesId.get(baseSpeciesId) ?? 0;
  }

  return 0;
}

/**
 * Check whether a species counts as a Mega Pokemon.
 */
export function isBattleFrontierMasterMegaSpecies(speciesId: string): boolean {
  const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
  const pokemon = getPokemonBySpeciesId(canonicalSpeciesId);

  return pokemon?.tags?.includes('mega') ?? false;
}

/**
 * Evaluate whether a team satisfies Battle Frontier Master point and Mega rules.
 */
export function getBattleFrontierMasterTeamLegality(
  team: string[],
): BattleFrontierMasterTeamLegality {
  const totalPoints = team.reduce((sum, speciesId) => {
    return sum + getBattleFrontierMasterPointsForSpecies(speciesId);
  }, 0);
  const fivePointPokemonCount = team.filter(
    (speciesId) => getBattleFrontierMasterPointsForSpecies(speciesId) === 5,
  ).length;
  const megaCount = team.filter((speciesId) =>
    isBattleFrontierMasterMegaSpecies(speciesId),
  ).length;
  const violations: BattleFrontierMasterLegalityViolation[] = [];

  if (totalPoints > BATTLE_FRONTIER_MASTER_MAX_POINTS) {
    violations.push('points-cap');
  }

  if (fivePointPokemonCount > BATTLE_FRONTIER_MASTER_MAX_FIVE_POINT_POKEMON) {
    violations.push('five-point-limit');
  }

  if (megaCount > BATTLE_FRONTIER_MASTER_MAX_MEGAS) {
    violations.push('mega-limit');
  }

  return {
    isLegal: violations.length === 0,
    totalPoints,
    fivePointPokemonCount,
    megaCount,
    violations,
  };
}
