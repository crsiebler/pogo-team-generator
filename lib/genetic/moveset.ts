import { calculateEffectiveness } from '../coverage/typeChart';
import { getMoveByMoveId } from '../data/moves';
import { getPokemonBySpeciesId } from '../data/pokemon';
import { getOptimalMoveset } from '../data/rankings';
import type { Pokemon } from '../types';

// Cache for optimal movesets to avoid recomputation
const movesetCache = new Map<
  string,
  {
    fastMove: string;
    chargedMove1: string;
    chargedMove2: string;
  }
>();

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
      const effectiveness = calculateEffectiveness(type, pokemon.types);
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
    const effectiveness = calculateEffectiveness(move.type, [type]);
    if (effectiveness >= 1.6) {
      score += 0.2 * count; // Reduced from 0.3 - coverage is good but not primary
    }
  }

  // Bonus if move hits Pokemon's own weaknesses (covers counters)
  for (const weakness of pokemonWeaknesses) {
    const effectiveness = calculateEffectiveness(move.type, [weakness]);
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
): {
  fastMove: string;
  chargedMove1: string;
  chargedMove2: string;
} {
  // Create cache key based on Pokemon + team composition
  // CRITICAL: Copy array before sorting to avoid mutation!
  const cacheKey = `${pokemon.speciesId}:${[...team].sort().join(',')}`;

  if (movesetCache.has(cacheKey)) {
    return movesetCache.get(cacheKey)!;
  }

  // Get ranked moveset as baseline
  const rankedMoves = getOptimalMoveset(pokemon.speciesName);

  // Analyze team weaknesses
  const teamWeaknesses = analyzeTeamWeaknesses(team);

  // Count existing move types on team (to avoid duplication)
  const existingTeamMoveTypes = new Map<string, number>();
  for (const speciesId of team) {
    if (speciesId === pokemon.speciesId) continue; // Don't count current Pokemon

    const teammate = getPokemonBySpeciesId(speciesId);
    if (!teammate) continue;

    // Get teammate's optimal moveset
    const teammateMoves = getOptimalMoveset(teammate.speciesName);
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
    const effectiveness = calculateEffectiveness(type, pokemon.types);
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
