import type { BattleFormatId } from '@lib/data/battleFormats';
import { getMoveByMoveId } from '@lib/data/moves';
import {
  getMovesetVariantId,
  selectBestMovesetVariant,
} from '@lib/data/movesetVariants';
import { MovesetVariantSimulationDataError } from '@lib/data/movesetVariantSimulations';
import { getPokemonBySpeciesId } from '@lib/data/pokemon';
import {
  getOptimalMoveset,
  getRoleBasedThreatSpeciesIds,
} from '@lib/data/rankings';
import {
  getActiveMovesetVariants,
  getMatchupResult,
  getMovesetVariantManifestPolicyIdentity,
} from '@lib/data/simulations';
import { calculateEffectiveness } from '../coverage/typeChart';
import type {
  Moveset,
  MovesetAssignmentPolicyIdentity,
  MovesetVariant,
  MovesetVariantId,
  Pokemon,
  RosterMovesetAssignment,
} from '../types';

// Cache for optimal movesets to avoid recomputation
const movesetCache = new Map<string, Moveset>();

/**
 * Get strict recommended moveset from rankings for a Pokemon.
 * Falls back to the Pokemon's first available moves when ranking data is missing.
 */
export function getRecommendedMovesetForPokemon(
  pokemon: Pokemon,
  formatId?: BattleFormatId,
): Moveset {
  const rankedMoves = getOptimalMoveset(pokemon.speciesName, formatId);

  return {
    fastMove: rankedMoves.fastMove || pokemon.fastMoves[0],
    chargedMove1: rankedMoves.chargedMove1 || pokemon.chargedMoves[0],
    chargedMove2:
      rankedMoves.chargedMove2 ||
      pokemon.chargedMoves[1] ||
      pokemon.chargedMoves[0],
  };
}

interface SimulationBackedMovesetDependencies {
  getVariants: (
    speciesId: string,
    formatId: BattleFormatId,
  ) => readonly MovesetVariant[];
  getThreats: (formatId: BattleFormatId) => string[];
  getDefaultMatchupRating: (
    speciesId: string,
    opponentSpeciesId: string,
  ) => number | null;
  getVariantMatchupRating: (
    speciesId: string,
    movesetVariantId: MovesetVariantId,
    opponentSpeciesId: string,
  ) => number | null;
  getRankedDefault?: (pokemon: Pokemon, formatId: BattleFormatId) => Moveset;
}

/** Injectable boundaries for deterministic roster assignment resolution. */
export interface RosterMovesetAssignmentDependencies {
  getPokemon: (speciesId: string) => Pokemon | undefined;
  getManifestPolicyIdentity: (
    formatId: BattleFormatId,
  ) => Readonly<{ schemaVersion: number; policyVersion: string }>;
  getMovesetVariantForTeam: (
    pokemon: Pokemon,
    team: readonly string[],
    formatId: BattleFormatId,
  ) => MovesetVariant;
  getRankedDefault: (pokemon: Pokemon, formatId: BattleFormatId) => Moveset;
}

/** Injectable boundaries for bounded roster assignment enumeration. */
export interface RosterMovesetAssignmentEnumerationDependencies {
  getPokemon: (speciesId: string) => Pokemon | undefined;
  getManifestPolicyIdentity: (
    formatId: BattleFormatId,
  ) => Readonly<{ schemaVersion: number; policyVersion: string }>;
  getActiveVariants: (
    speciesId: string,
    formatId: BattleFormatId,
  ) => readonly MovesetVariant[];
  getRankedDefault: (pokemon: Pokemon, formatId: BattleFormatId) => Moveset;
}

/** Input used to create a validated immutable roster assignment value. */
export interface CreateRosterMovesetAssignmentInput {
  readonly formatId: BattleFormatId;
  readonly policyIdentity: MovesetAssignmentPolicyIdentity;
  readonly variantsBySpeciesId: Readonly<Record<string, MovesetVariant>>;
}

const RANKED_DEFAULT_POLICY_IDENTITY: MovesetAssignmentPolicyIdentity = {
  source: 'ranked-default-fallback',
  schemaVersion: 0,
  policyVersion: 'ranked-default-v1',
};
const MAX_ACTIVE_VARIANTS_PER_SPECIES = 3;
export const MAX_ROSTER_MOVESET_ASSIGNMENTS = 3 ** 6;

function toDefaultMovesetVariant(moveset: Moveset): MovesetVariant {
  return {
    ...moveset,
    id: getMovesetVariantId(moveset),
    isDefault: true,
  };
}

/** Select a legal moveset using simulations against threats unresolved by teammates. */
export function getSimulationBackedMovesetForTeam(
  pokemon: Pokemon,
  team: readonly string[],
  formatId: BattleFormatId,
  dependencies?: SimulationBackedMovesetDependencies,
): Moveset {
  const selected = getSimulationBackedMovesetVariantForTeam(
    pokemon,
    team,
    formatId,
    dependencies,
  );
  return {
    fastMove: selected.fastMove,
    chargedMove1: selected.chargedMove1,
    chargedMove2: selected.chargedMove2,
  };
}

/** Select a complete simulation-backed moveset variant for one roster member. */
export function getSimulationBackedMovesetVariantForTeam(
  pokemon: Pokemon,
  team: readonly string[],
  formatId: BattleFormatId,
  dependencies?: SimulationBackedMovesetDependencies,
): MovesetVariant {
  const resolvedDependencies: SimulationBackedMovesetDependencies =
    dependencies ?? {
      getVariants: getActiveMovesetVariants,
      getThreats: (selectedFormatId) =>
        getRoleBasedThreatSpeciesIds(50, selectedFormatId),
      getDefaultMatchupRating: (speciesId, opponentSpeciesId) =>
        getMatchupResult(speciesId, opponentSpeciesId, formatId),
      getVariantMatchupRating: (
        speciesId,
        movesetVariantId,
        opponentSpeciesId,
      ) =>
        getMatchupResult(
          speciesId,
          opponentSpeciesId,
          formatId,
          movesetVariantId,
        ),
    };
  let variants: readonly MovesetVariant[];
  try {
    variants = resolvedDependencies.getVariants(pokemon.speciesId, formatId);
  } catch (error) {
    if (
      error instanceof MovesetVariantSimulationDataError &&
      error.code === 'manifest-missing'
    ) {
      const rankedDefault = (
        resolvedDependencies.getRankedDefault ?? getRecommendedMovesetForPokemon
      )(pokemon, formatId);
      return toDefaultMovesetVariant(rankedDefault);
    }
    throw error;
  }
  const defaultVariant = variants.find(({ isDefault }) => isDefault);
  if (!defaultVariant) {
    throw new Error('Active moveset variants must include a manifest default.');
  }
  if (variants.length === 1) {
    return defaultVariant;
  }
  const teammates = team.filter((speciesId) => speciesId !== pokemon.speciesId);
  const unresolvedThreats = resolvedDependencies
    .getThreats(formatId)
    .filter((threat) => {
      return !teammates.some((speciesId) => {
        const rating = resolvedDependencies.getDefaultMatchupRating(
          speciesId,
          threat,
        );
        return rating !== null && rating >= 500;
      });
    });

  if (unresolvedThreats.length === 0) {
    return defaultVariant;
  }

  const selected = selectBestMovesetVariant(
    variants,
    unresolvedThreats,
    (variant, opponentSpeciesId) => {
      return variant.isDefault
        ? resolvedDependencies.getDefaultMatchupRating(
            pokemon.speciesId,
            opponentSpeciesId,
          )
        : resolvedDependencies.getVariantMatchupRating(
            pokemon.speciesId,
            variant.id,
            opponentSpeciesId,
          );
    },
  );

  return selected;
}

/** Create a deeply immutable assignment with canonical deterministic identity. */
export function createRosterMovesetAssignment(
  input: CreateRosterMovesetAssignmentInput,
): RosterMovesetAssignment {
  const policyIdentity = Object.freeze({ ...input.policyIdentity });
  const sortedVariants = Object.entries(input.variantsBySpeciesId).toSorted(
    ([firstSpeciesId], [secondSpeciesId]) =>
      firstSpeciesId.localeCompare(secondSpeciesId),
  );
  const variantsBySpeciesId = Object.freeze(
    Object.fromEntries(
      sortedVariants.map(([speciesId, variant]) => [
        speciesId,
        Object.freeze({ ...variant }),
      ]),
    ),
  );
  const fingerprint = JSON.stringify([
    'roster-moveset-assignment-v1',
    input.formatId,
    policyIdentity.source,
    policyIdentity.schemaVersion,
    policyIdentity.policyVersion,
    ...sortedVariants.map(([speciesId, variant]) => [
      speciesId,
      variant.id,
      variant.fastMove,
      variant.chargedMove1,
      variant.chargedMove2,
      variant.isDefault,
    ]),
  ]);

  return Object.freeze({
    formatId: input.formatId,
    policyIdentity,
    variantsBySpeciesId,
    fingerprint,
  });
}

/** Resolve every roster member once against one manifest policy authority. */
export function resolveRosterMovesetAssignment(
  roster: readonly string[],
  formatId: BattleFormatId,
  dependencies: RosterMovesetAssignmentDependencies = {
    getPokemon: getPokemonBySpeciesId,
    getManifestPolicyIdentity: getMovesetVariantManifestPolicyIdentity,
    getMovesetVariantForTeam: getSimulationBackedMovesetVariantForTeam,
    getRankedDefault: getRecommendedMovesetForPokemon,
  },
): RosterMovesetAssignment {
  let policyIdentity: MovesetAssignmentPolicyIdentity;
  try {
    policyIdentity = {
      source: 'manifest',
      ...dependencies.getManifestPolicyIdentity(formatId),
    };
  } catch (error) {
    if (
      error instanceof MovesetVariantSimulationDataError &&
      error.code === 'manifest-missing'
    ) {
      policyIdentity = RANKED_DEFAULT_POLICY_IDENTITY;
    } else {
      throw error;
    }
  }

  const variantsBySpeciesId: Record<string, MovesetVariant> = {};
  for (const requestedSpeciesId of roster) {
    const pokemon = dependencies.getPokemon(requestedSpeciesId);
    if (!pokemon) {
      throw new Error(
        `Cannot resolve a moveset assignment for unknown Pokemon ${requestedSpeciesId}.`,
      );
    }
    if (variantsBySpeciesId[pokemon.speciesId]) {
      throw new Error(
        `Cannot resolve duplicate roster species ${pokemon.speciesId}.`,
      );
    }

    variantsBySpeciesId[pokemon.speciesId] =
      policyIdentity.source === 'manifest'
        ? dependencies.getMovesetVariantForTeam(pokemon, roster, formatId)
        : toDefaultMovesetVariant(
            dependencies.getRankedDefault(pokemon, formatId),
          );
  }

  return createRosterMovesetAssignment({
    formatId,
    policyIdentity,
    variantsBySpeciesId,
  });
}

/** Enumerate the bounded Cartesian product of active variants for one roster. */
export function enumerateRosterMovesetAssignments(
  roster: readonly string[],
  formatId: BattleFormatId,
  dependencies: RosterMovesetAssignmentEnumerationDependencies = {
    getPokemon: getPokemonBySpeciesId,
    getManifestPolicyIdentity: getMovesetVariantManifestPolicyIdentity,
    getActiveVariants: getActiveMovesetVariants,
    getRankedDefault: getRecommendedMovesetForPokemon,
  },
): readonly RosterMovesetAssignment[] {
  let manifestPolicy: Readonly<{
    schemaVersion: number;
    policyVersion: string;
  }>;
  try {
    manifestPolicy = dependencies.getManifestPolicyIdentity(formatId);
  } catch (error) {
    if (
      error instanceof MovesetVariantSimulationDataError &&
      error.code === 'manifest-missing'
    ) {
      return [
        createRankedDefaultRosterAssignment(roster, formatId, dependencies),
      ];
    }
    throw error;
  }

  const pokemon = roster.map((speciesId) => {
    const entry = dependencies.getPokemon(speciesId);
    if (!entry) {
      throw new Error(
        `Cannot enumerate moveset assignments for unknown Pokemon ${speciesId}.`,
      );
    }
    return entry;
  });
  const canonicalSpeciesIds = pokemon.map(({ speciesId }) => speciesId);
  if (new Set(canonicalSpeciesIds).size !== canonicalSpeciesIds.length) {
    throw new Error(
      'Cannot enumerate assignments for duplicate roster species.',
    );
  }

  const variantsByRosterSlot = pokemon.map(({ speciesId }) => {
    const variants = [
      ...dependencies.getActiveVariants(speciesId, formatId),
    ].toSorted((first, second) => {
      if (first.isDefault !== second.isDefault) {
        return first.isDefault ? -1 : 1;
      }
      return first.id.localeCompare(second.id);
    });
    if (
      variants.length === 0 ||
      variants.length > MAX_ACTIVE_VARIANTS_PER_SPECIES ||
      variants.filter(({ isDefault }) => isDefault).length !== 1 ||
      new Set(variants.map(({ id }) => id)).size !== variants.length
    ) {
      throw new Error(
        `Active moveset variants for ${speciesId} must contain one default and at most three unique variants.`,
      );
    }
    return variants;
  });

  const assignmentCount = variantsByRosterSlot.reduce(
    (count, variants) => count * variants.length,
    1,
  );
  if (assignmentCount > MAX_ROSTER_MOVESET_ASSIGNMENTS) {
    throw new Error(
      `Roster moveset assignments exceed the ${MAX_ROSTER_MOVESET_ASSIGNMENTS} candidate limit.`,
    );
  }

  let assignments: Array<Record<string, MovesetVariant>> = [{}];
  variantsByRosterSlot.forEach((variants, index) => {
    const speciesId = canonicalSpeciesIds[index];
    assignments = assignments.flatMap((assignment) =>
      variants.map((variant) => ({ ...assignment, [speciesId]: variant })),
    );
  });

  return assignments.map((variantsBySpeciesId) =>
    createRosterMovesetAssignment({
      formatId,
      policyIdentity: { source: 'manifest', ...manifestPolicy },
      variantsBySpeciesId,
    }),
  );
}

function createRankedDefaultRosterAssignment(
  roster: readonly string[],
  formatId: BattleFormatId,
  dependencies: Pick<
    RosterMovesetAssignmentEnumerationDependencies,
    'getPokemon' | 'getRankedDefault'
  >,
): RosterMovesetAssignment {
  const variantsBySpeciesId: Record<string, MovesetVariant> = {};
  for (const requestedSpeciesId of roster) {
    const pokemon = dependencies.getPokemon(requestedSpeciesId);
    if (!pokemon) {
      throw new Error(
        `Cannot enumerate moveset assignments for unknown Pokemon ${requestedSpeciesId}.`,
      );
    }
    if (variantsBySpeciesId[pokemon.speciesId]) {
      throw new Error(
        `Cannot enumerate duplicate roster species ${pokemon.speciesId}.`,
      );
    }
    variantsBySpeciesId[pokemon.speciesId] = toDefaultMovesetVariant(
      dependencies.getRankedDefault(pokemon, formatId),
    );
  }

  return createRosterMovesetAssignment({
    formatId,
    policyIdentity: RANKED_DEFAULT_POLICY_IDENTITY,
    variantsBySpeciesId,
  });
}

/** Return the simulation qualifier for one member of a fixed assignment. */
export function getAssignedMovesetVariantId(
  assignment: RosterMovesetAssignment | undefined,
  speciesId: string,
): MovesetVariantId | undefined {
  if (!assignment) {
    return undefined;
  }
  const variant = assignment.variantsBySpeciesId[speciesId];
  if (!variant) {
    throw new Error(`Bound roster moveset assignment is missing ${speciesId}.`);
  }

  return assignment.policyIdentity.source === 'manifest'
    ? variant.id
    : undefined;
}

/**
 * Analyze team's defensive weaknesses
 * Returns map of type -> count of Pokemon weak to it
 */
function analyzeTeamWeaknesses(team: string[]): Map<string, number> {
  const teamPokemon = team
    .map((id) => getPokemonBySpeciesId(id))
    .filter(Boolean);

  const weaknessCounts = new Map<string, number>();
  const allTypes = [
    'normal',
    'fire',
    'water',
    'electric',
    'grass',
    'ice',
    'fighting',
    'poison',
    'ground',
    'flying',
    'psychic',
    'bug',
    'rock',
    'ghost',
    'dragon',
    'dark',
    'steel',
    'fairy',
  ];

  for (const pokemon of teamPokemon) {
    if (!pokemon) continue;

    for (const type of allTypes) {
      const effectiveness = calculateEffectiveness(pokemon.types, type);
      if (effectiveness >= 1.6) {
        weaknessCounts.set(type, (weaknessCounts.get(type) || 0) + 1);
      }
    }
  }

  return weaknessCounts;
}

/**
 * Score a move based on how well it covers team weaknesses and Pokemon's own weaknesses
 * Factors in STAB, coverage needs, existing team moves, energy efficiency, and buff/debuff effects
 */
function scoreMoveForCoverage(
  moveId: string,
  teamWeaknesses: Map<string, number>,
  pokemonTypes: string[],
  pokemonWeaknesses: Set<string>,
  existingTeamMoveTypes: Map<string, number>,
  isRankedMove: boolean,
): number {
  const move = getMoveByMoveId(moveId);
  if (!move) return 0;

  let score = 0;
  const pokemonTypeSet = new Set(pokemonTypes.filter((t) => t !== 'none'));

  // EXTREMELY STRONG bonus for ranked moves (simulation-tested, covers mirrors)
  if (isRankedMove) {
    score += 2.0; // Ranked moves are battle-proven and should rarely be overridden
  }

  // STAB bonus - consistent damage multiplier
  if (pokemonTypeSet.has(move.type)) {
    score += 0.6;
  }

  // DAMAGE PER ENERGY (DPE) - Primary efficiency metric for PvP
  const dpe = move.power / move.energy;

  // Excellent DPE (≥1.7): Shadow Ball, Body Slam, Rock Slide
  if (dpe >= 1.7) {
    score += 0.7;
  }
  // Good DPE (1.5-1.7): Ice Beam, Psychic, Surf, Crunch
  else if (dpe >= 1.5) {
    score += 0.5;
  }
  // Decent DPE (1.3-1.5): Night Slash, Aqua Tail, Foul Play
  else if (dpe >= 1.3) {
    score += 0.3;
  }
  // Poor DPE (<1.3): Most expensive nukes without self-debuffs
  else {
    score -= 0.2;
  }

  // Heavy penalty for extremely expensive moves (70+ energy) - impractical in Play! Pokémon
  // These are almost always shielded and rarely land
  if (move.energy >= 70) {
    score -= 1.5; // Massive penalty - should only be used if ranked
  }

  // Self-debuffing nukes have drawback (Brave Bird, Close Combat, Draco Meteor)
  // Slight penalty, but high DPE can still justify their use
  const hasSelfDebuff = move.buffs?.some(
    (buff) => buff < 0 && move.buffTarget === 'self',
  );
  if (hasSelfDebuff) {
    score -= 0.1; // Small penalty for the drawback, but DPE bonus can outweigh it
  }

  // Opponent debuffs are meta-defining (Rock Tomb, Icy Wind, Acid Spray)
  const hasOpponentDebuff = move.buffs?.some(
    (buff) => buff < 0 && move.buffTarget === 'opponent',
  );
  if (hasOpponentDebuff) {
    score += 0.6; // Can flip losing matchups
  }

  // Self buffs (Rage Fist, Power-Up Punch)
  const hasSelfBuff = move.buffs?.some(
    (buff) => buff > 0 && move.buffTarget === 'self',
  );
  if (hasSelfBuff) {
    score += 0.4;
  }

  // Penalty for move types already heavily represented on team
  const existingCount = existingTeamMoveTypes.get(move.type) || 0;
  if (existingCount >= 3) {
    score -= 0.8; // Heavy penalty for 3+ of same move type
  } else if (existingCount >= 2) {
    score -= 0.4; // Moderate penalty for 2 of same move type
  }

  // Check if move hits team weaknesses super-effectively
  for (const [type, count] of teamWeaknesses.entries()) {
    const effectiveness = calculateEffectiveness([type], move.type);
    if (effectiveness >= 1.6) {
      score += 0.2 * count; // Reduced from 0.3 - coverage is good but not primary
    }
  }

  // Bonus if move hits Pokemon's own weaknesses (covers counters)
  for (const weakness of pokemonWeaknesses) {
    const effectiveness = calculateEffectiveness([weakness], move.type);
    if (effectiveness >= 1.6) {
      score += 0.3; // Reduced from 0.4 - nice to have but not critical
      break;
    }
  }

  return score;
}

/**
 * Calculate pacing score for a charged move based on fast move energy generation
 * Lower is better (fewer fast moves needed)
 */
function calculatePacingScore(
  chargedMoveId: string,
  fastMoveEnergy: number,
): number {
  const move = getMoveByMoveId(chargedMoveId);
  if (!move || fastMoveEnergy === 0) return 0;

  // Calculate turns needed to charge
  const turnsToCharge = Math.ceil(move.energy / fastMoveEnergy);

  // Prefer faster pacing (4-5 fast moves is ideal, like Ice Punch on Sandslash)
  // Penalize slower pacing (7+ fast moves)
  if (turnsToCharge <= 5) {
    return 0.3; // Fast pacing bonus
  } else if (turnsToCharge === 6) {
    return 0.1; // Acceptable pacing
  } else if (turnsToCharge >= 7) {
    return -0.2; // Slow pacing penalty
  }

  return 0;
}

/**
 * Get optimal moveset for a Pokemon based on team context
 * Uses ranked moveset as baseline, only deviates if coverage significantly improves
 */
export function getOptimalMovesetForTeam(
  pokemon: Pokemon,
  team: string[],
  formatId?: BattleFormatId,
): Moveset {
  // Create cache key based on Pokemon + team composition
  // CRITICAL: Copy array before sorting to avoid mutation!
  const cacheKey = `${formatId ?? 'default'}:${pokemon.speciesId}:${[...team].sort().join(',')}`;

  if (movesetCache.has(cacheKey)) {
    return movesetCache.get(cacheKey)!;
  }

  // Get ranked moveset as baseline
  const rankedMoves = getOptimalMoveset(pokemon.speciesName, formatId);

  // Analyze team weaknesses
  const teamWeaknesses = analyzeTeamWeaknesses(team);

  // Count existing move types on team (to avoid duplication)
  const existingTeamMoveTypes = new Map<string, number>();
  for (const speciesId of team) {
    if (speciesId === pokemon.speciesId) continue; // Don't count current Pokemon

    const teammate = getPokemonBySpeciesId(speciesId);
    if (!teammate) continue;

    // Get teammate's optimal moveset
    const teammateMoves = getOptimalMoveset(teammate.speciesName, formatId);
    for (const moveId of [
      teammateMoves.chargedMove1,
      teammateMoves.chargedMove2,
    ]) {
      if (!moveId) continue;
      const move = getMoveByMoveId(moveId);
      if (move) {
        existingTeamMoveTypes.set(
          move.type,
          (existingTeamMoveTypes.get(move.type) || 0) + 1,
        );
      }
    }
  }

  // Find Pokemon's own weaknesses
  const pokemonWeaknesses = new Set<string>();
  const allTypes = [
    'normal',
    'fire',
    'water',
    'electric',
    'grass',
    'ice',
    'fighting',
    'poison',
    'ground',
    'flying',
    'psychic',
    'bug',
    'rock',
    'ghost',
    'dragon',
    'dark',
    'steel',
    'fairy',
  ];

  for (const type of allTypes) {
    const effectiveness = calculateEffectiveness(pokemon.types, type);
    if (effectiveness >= 1.6) {
      pokemonWeaknesses.add(type);
    }
  }

  // Get ranked fast move for energy generation calculations
  const fastMove = rankedMoves.fastMove || pokemon.fastMoves[0];
  const fastMoveObj = getMoveByMoveId(fastMove);
  const fastMoveEnergy = fastMoveObj?.energyGain || 0;

  // Score all charged moves
  const chargedScores = pokemon.chargedMoves.map((moveId) => {
    const isRankedMove =
      moveId === rankedMoves.chargedMove1 ||
      moveId === rankedMoves.chargedMove2;

    // Base score from coverage
    let totalScore = scoreMoveForCoverage(
      moveId,
      teamWeaknesses,
      pokemon.types,
      pokemonWeaknesses,
      existingTeamMoveTypes,
      isRankedMove,
    );

    // Add pacing bonus based on fast move synergy
    totalScore += calculatePacingScore(moveId, fastMoveEnergy);

    return {
      moveId,
      score: totalScore,
      isRanked: isRankedMove,
    };
  });

  // Sort by score
  chargedScores.sort((a, b) => b.score - a.score);

  // Pick top 2, but ensure good spam + nuke synergy if possible
  let chargedMove1 = chargedScores[0]?.moveId || pokemon.chargedMoves[0];
  let chargedMove2 = chargedScores[1]?.moveId || pokemon.chargedMoves[1];

  const move1 = getMoveByMoveId(chargedMove1);
  const move2 = getMoveByMoveId(chargedMove2);

  // Ensure good bait + closer pairing
  // Ideal: One cheap bait (≤45) + one harder hitter (50-65) or self-debuff nuke
  if (move1 && move2) {
    const bothExpensive = move1.energy > 55 && move2.energy > 55;
    const bothCheap = move1.energy <= 45 && move2.energy <= 45;

    // If both expensive, find a cheap bait move for shield pressure
    if (bothExpensive) {
      const baitMove = chargedScores.slice(0, 4).find((m) => {
        const mv = getMoveByMoveId(m.moveId);
        return mv && mv.energy <= 45;
      });

      if (baitMove) {
        chargedMove2 = baitMove.moveId;
      }
    }

    // If both cheap, find a harder hitter for closing power
    // Prioritize self-debuff nukes (Brave Bird, Close Combat) over regular nukes
    if (bothCheap) {
      const closerMove = chargedScores.slice(0, 4).find((m) => {
        const mv = getMoveByMoveId(m.moveId);
        if (!mv) return false;

        // Self-debuff nuke is ideal (high DPE despite energy cost)
        const hasSelfDebuff = mv.buffs?.some(
          (buff) => buff < 0 && mv.buffTarget === 'self',
        );
        if (hasSelfDebuff) return true;

        // Otherwise, any harder hitter (50+ energy with good DPE ≥1.5)
        const dpe = mv.power / mv.energy;
        return mv.energy >= 50 && dpe >= 1.5;
      });

      if (closerMove) {
        chargedMove2 = closerMove.moveId;
      }
    }
  }

  // CRITICAL: Check for mono-type coverage (all 3 moves same type)
  // This is terrible for PvP - no coverage against resistances
  const move1Obj = getMoveByMoveId(chargedMove1);
  const move2Obj = getMoveByMoveId(chargedMove2);

  if (
    move1Obj &&
    move2Obj &&
    fastMoveObj &&
    move1Obj.type === move2Obj.type &&
    move2Obj.type === fastMoveObj.type
  ) {
    // Mono-type coverage detected - force at least one ranked charged move
    // Try to use both ranked moves first
    const rankedMove1 = rankedMoves.chargedMove1
      ? getMoveByMoveId(rankedMoves.chargedMove1)
      : null;
    const rankedMove2 = rankedMoves.chargedMove2
      ? getMoveByMoveId(rankedMoves.chargedMove2)
      : null;

    // If ranked moves break mono-type, use them
    if (rankedMove1 && rankedMove2) {
      const ranked1Type = rankedMove1.type;
      const ranked2Type = rankedMove2.type;
      const fastType = fastMoveObj.type;

      // Check if ranked moves give us coverage
      if (ranked1Type !== fastType || ranked2Type !== fastType) {
        chargedMove1 = rankedMoves.chargedMove1!;
        chargedMove2 = rankedMoves.chargedMove2!;
      }
    }
  }

  const moveset = {
    fastMove,
    chargedMove1: chargedMove1,
    chargedMove2: chargedMove2,
  };

  // Cache the result
  movesetCache.set(cacheKey, moveset);

  return moveset;
}

/**
 * Clear the moveset cache (useful for testing or when team composition changes)
 */
export function clearMovesetCache(): void {
  movesetCache.clear();
}
