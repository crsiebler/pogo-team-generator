import {
  calculateOffensiveCoverage,
  calculateDefensiveCoverage,
  calculateEffectiveness,
} from '../../coverage/typeChart';
import {
  getMoveByMoveId,
  evaluateMoveSynergy,
  calculatePressureScore,
} from '../../data/moves';
import { getPokemonBySpeciesId } from '../../data/pokemon';
import {
  getAllRankingsForPokemon,
  speciesIdToRankingName,
  getMetaThreats,
} from '../../data/rankings';
import {
  calculateTeamCoverage,
  getWeightedTeamWeaknesses,
  getSingleCounterThreats,
  getTopThreats,
  getMatchupQualityScore,
} from '../../data/simulations';
import type { Chromosome, TournamentMode } from '../../types';
import { getOptimalMovesetForTeam } from '../moveset';
import typeEffectiveness from '@/data/type-effectiveness.json';

/**
 * Calculate type coverage score (30% weight)
 * Evaluates offensive and defensive type coverage
 */
function calculateTypeCoverageScore(team: string[]): number {
  const teamPokemon = team
    .map((id) => getPokemonBySpeciesId(id))
    .filter(Boolean);

  if (teamPokemon.length === 0) return 0;

  // Get all charged move types for offensive coverage
  const allMoveTypes = new Set<string>();
  for (const pokemon of teamPokemon) {
    for (const moveId of pokemon!.chargedMoves) {
      const move = getMoveByMoveId(moveId);
      if (move) {
        allMoveTypes.add(move.type);
      }
    }
  }

  // Calculate offensive coverage
  const offensiveCoverage = calculateOffensiveCoverage(
    Array.from(allMoveTypes),
  );
  const offensiveScore = offensiveCoverage.coverageScore / 18; // Normalize to 0-1

  // Calculate defensive coverage
  const teamTypes = teamPokemon.map((p) => p!.types);
  const defensiveCoverage = calculateDefensiveCoverage(teamTypes);
  const defensiveScore = Math.max(0, defensiveCoverage.coverageScore / 10); // Normalize

  // Combined: 40% offensive, 60% defensive - defensive typing is critical
  return offensiveScore * 0.4 + defensiveScore * 0.6;
}

/**
 * Calculate average ranking score (35% weight)
 * Uses all four ranking CSVs with strong penalties for low-ranked Pokemon
 */
function calculateRankingScore(team: string[]): number {
  let totalScore = 0;
  let validCount = 0;

  for (const speciesId of team) {
    const rankingName = speciesIdToRankingName(speciesId);
    const rankings = getAllRankingsForPokemon(rankingName);

    if (rankings.average > 0) {
      let score = rankings.average / 100; // Normalize to 0-1

      // VERY STRONG exponential penalty for non-elite Pokemon
      // Rank 90+: Full score
      // Rank 85-90: -20% penalty
      // Rank 80-85: -40% penalty
      // Rank 75-80: -60% penalty
      // Rank <75: -80% penalty (essentially eliminates from consideration)
      if (rankings.average < 90) {
        if (rankings.average >= 85) {
          score *= 0.8; // -20%
        } else if (rankings.average >= 80) {
          score *= 0.6; // -40%
        } else if (rankings.average >= 75) {
          score *= 0.4; // -60%
        } else {
          score *= 0.2; // -80% - essentially eliminates low-ranked Pokemon
        }
      }

      totalScore += score;
      validCount++;
    }
  }

  if (validCount === 0) return 0;

  return totalScore / validCount;
}

/**
 * Calculate strategy viability score (20% weight)
 * Checks if team can form valid ABA/ABB/ABC lineups
 */
function calculateStrategyScore(team: string[], mode: TournamentMode): number {
  // GBL uses all 3, no lineup flexibility
  if (mode === 'GBL') {
    return evaluateThreeLineup(team);
  }

  // Play! Pokémon: evaluate best 3-from-6 lineup
  return evaluateBestLineup(team);
}

/**
 * Evaluate a 3-Pokémon lineup for strategic patterns
 */
function evaluateThreeLineup(lineup: string[]): number {
  if (lineup.length !== 3) return 0;

  const [lead, switch_, closer] = lineup.map((id) => getPokemonBySpeciesId(id));

  if (!lead || !switch_ || !closer) return 0;

  let score = 0;

  // Check for ABA pattern (lead and closer similar)
  const leadTypes = new Set(lead.types);
  const closerTypes = new Set(closer.types);
  const sharedTypes = [...leadTypes].filter((t) => closerTypes.has(t));

  if (sharedTypes.length > 0) {
    score += 0.3; // ABA bonus
  }

  // Check for ABB pattern (switch and closer cover lead's weaknesses)
  const switchTypes = new Set(switch_.types);
  const closerHasResist = [...closerTypes].some((t) => switchTypes.has(t));

  if (closerHasResist) {
    score += 0.3; // ABB bonus
  }

  // ABC bonus for diverse typing
  const allTypes = new Set([...lead.types, ...switch_.types, ...closer.types]);
  if (allTypes.size >= 5) {
    score += 0.4; // ABC bonus
  }

  return Math.min(score, 1.0);
}

/**
 * Evaluate best 3-from-6 lineup for Play! Pokémon
 */
function evaluateBestLineup(team: string[]): number {
  if (team.length !== 6) return 0;

  let bestScore = 0;

  // Try different 3-Pokémon combinations
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      for (let k = 0; k < 6; k++) {
        if (i !== j && j !== k && i !== k) {
          const lineup = [team[i], team[j], team[k]];
          const score = evaluateThreeLineup(lineup);
          bestScore = Math.max(bestScore, score);
        }
      }
    }
  }

  return bestScore;
}

/**
 * Calculate meta threat coverage (15% weight)
 * How well team handles top 50 meta Pokémon
 */
function calculateMetaThreatScore(team: string[]): number {
  const metaThreats = getMetaThreats();
  const teamPokemon = team
    .map((id) => getPokemonBySpeciesId(id))
    .filter(Boolean);

  if (teamPokemon.length === 0) return 0;

  let coveredThreats = 0;

  for (const threat of metaThreats.slice(0, 50)) {
    const threatTypes = [threat['Type 1'], threat['Type 2']].filter(
      (t) => t !== 'none',
    );

    // Check if any team member has super effective move against threat
    for (const pokemon of teamPokemon) {
      for (const moveId of pokemon!.chargedMoves) {
        const move = getMoveByMoveId(moveId);
        if (move) {
          const effectiveness = calculateEffectiveness(threatTypes, move.type);
          if (effectiveness >= 1.6) {
            coveredThreats++;
            break;
          }
        }
      }
    }
  }

  return coveredThreats / 50;
}

/**
 * Calculate energy breakpoint score (10% weight)
 * Evaluates move synergy and fast charging using OPTIMAL moves for team
 */
function calculateEnergyScore(team: string[]): number {
  const teamPokemon = team
    .map((id) => getPokemonBySpeciesId(id))
    .filter(Boolean);

  if (teamPokemon.length === 0) return 0;

  let totalSynergy = 0;
  let totalPressure = 0;

  for (const pokemon of teamPokemon) {
    if (!pokemon) continue;

    // Get optimal moveset based on team context
    const optimalMoves = getOptimalMovesetForTeam(pokemon, team);
    const chargedMoves = [
      optimalMoves.chargedMove1,
      optimalMoves.chargedMove2,
    ].filter(Boolean) as string[];

    // Get moveset synergy
    if (chargedMoves.length === 2) {
      const synergy = evaluateMoveSynergy(chargedMoves[0], chargedMoves[1]);
      totalSynergy += synergy.synergyScore / 3.5; // Max synergy is ~3.5
    }

    // Get pressure score (fast charging)
    const fastMove = optimalMoves.fastMove;
    if (fastMove && chargedMoves.length > 0) {
      const pressure = calculatePressureScore(fastMove, chargedMoves[0]);
      totalPressure += Math.min(pressure * 2, 1); // Cap at 1
    }
  }

  const avgSynergy = totalSynergy / teamPokemon.length;
  const avgPressure = totalPressure / teamPokemon.length;

  return avgSynergy * 0.5 + avgPressure * 0.5;
}

/**
 * Calculate surprise factor (GBL bonus, +15%)
 * Rewards off-meta picks and unexpected movesets
 */
function calculateSurpriseFactor(team: string[]): number {
  let surpriseScore = 0;

  for (const speciesId of team) {
    const rankingName = speciesIdToRankingName(speciesId);
    const rankings = getAllRankingsForPokemon(rankingName);

    // Off-meta bonus (score 60-79)
    if (rankings.overall >= 60 && rankings.overall < 80) {
      surpriseScore += 0.3;
    }

    // Spice pick bonus (score < 60)
    if (rankings.overall > 0 && rankings.overall < 60) {
      surpriseScore += 0.5;
    }
  }

  return Math.min(surpriseScore / team.length, 1.0);
}

/**
 * Calculate consistency (Play! Pokémon bonus, +10%)
 * Rewards generalist Pokémon that handle many matchups
 */
function calculateConsistency(team: string[]): number {
  let consistencyScore = 0;

  for (const speciesId of team) {
    const rankingName = speciesIdToRankingName(speciesId);
    const rankings = getAllRankingsForPokemon(rankingName);

    // High average across all roles = consistent
    if (rankings.average >= 85) {
      consistencyScore += 1.0;
    } else if (rankings.average >= 75) {
      consistencyScore += 0.5;
    }
  }

  return consistencyScore / team.length;
}

/**
 * Calculate anchor synergy bonus
 * Rewards teams that support anchor Pokémon by covering weaknesses AND threatening their counters
 */
function calculateAnchorSynergy(
  team: string[],
  anchorIndices: number[],
): number {
  if (anchorIndices.length === 0) return 0;

  const anchors = anchorIndices
    .map((i) => getPokemonBySpeciesId(team[i]))
    .filter(Boolean);
  const nonAnchors = team
    .map((id, i) =>
      anchorIndices.includes(i) ? null : getPokemonBySpeciesId(id),
    )
    .filter(Boolean);

  if (anchors.length === 0 || nonAnchors.length === 0) return 0;

  let synergyScore = 0;

  // For each anchor, evaluate defensive and offensive support
  for (const anchor of anchors) {
    const weaknesses = new Set<string>();

    // Find anchor's weaknesses (types that hit it super-effectively)
    for (const type of Object.keys(typeEffectiveness)) {
      const effectiveness = calculateEffectiveness(anchor!.types, type);
      if (effectiveness >= 1.6) {
        weaknesses.add(type);
      }
    }

    // Defensive synergy: Check if non-anchors resist anchor's weaknesses
    let defensiveCoverage = 0;
    for (const weakness of weaknesses) {
      for (const nonAnchor of nonAnchors) {
        const resists =
          calculateEffectiveness(nonAnchor!.types, weakness) <= 0.625;
        if (resists) {
          defensiveCoverage++;
          break;
        }
      }
    }

    const defensiveScore =
      weaknesses.size > 0 ? defensiveCoverage / weaknesses.size : 0;

    // Offensive synergy: Check if non-anchors can hit anchor's threats super-effectively
    let offensiveCoverage = 0;
    let totalChecks = 0;
    for (const weakness of weaknesses) {
      totalChecks++;
      for (const nonAnchor of nonAnchors) {
        // Check if non-anchor has moves that hit this weakness type super-effectively
        for (const moveId of nonAnchor!.chargedMoves) {
          const move = getMoveByMoveId(moveId);
          if (move) {
            // Get effectiveness of move against Pokemon of the weakness type
            // (e.g., if anchor weak to fire, does non-anchor have water moves?)
            const moveEffectiveness = calculateEffectiveness(
              [weakness],
              move.type,
            );
            if (moveEffectiveness >= 1.6) {
              offensiveCoverage++;
              break;
            }
          }
        }
      }
    }

    const offensiveScore =
      totalChecks > 0 ? offensiveCoverage / totalChecks : 0;

    // Combined: 60% defensive, 40% offensive
    synergyScore += defensiveScore * 0.6 + offensiveScore * 0.4;
  }

  return synergyScore / anchors.length;
}

/**
 * Calculate type diversity bonus
 * Penalizes teams with too many of the same type
 */
function calculateTypeDiversity(team: string[]): number {
  const teamPokemon = team
    .map((id) => getPokemonBySpeciesId(id))
    .filter(Boolean);

  if (teamPokemon.length === 0) return 0;

  const typeCount = new Map<string, number>();

  // Count each type occurrence
  for (const pokemon of teamPokemon) {
    for (const type of pokemon!.types) {
      typeCount.set(type, (typeCount.get(type) || 0) + 1);
    }
  }

  // Calculate diversity score - penalize duplicate types heavily
  let diversityScore = 1.0;

  for (const [, count] of typeCount.entries()) {
    if (count >= 4) {
      diversityScore -= 1.0; // Devastating - 4+ of same type is never acceptable
    } else if (count === 3) {
      diversityScore -= 0.7; // Very heavy penalty - 3 of same type is extremely rare
    } else if (count === 2) {
      diversityScore -= 0.2; // Consistent penalty for 2 of any type
    }
  }

  return Math.max(0, diversityScore);
}

/**
 * Calculate stat balance score
 * Rewards teams with a good mix of bulky and offensive Pokémon
 */
function calculateStatBalance(team: string[]): number {
  const teamPokemon = team
    .map((id) => getPokemonBySpeciesId(id))
    .filter(Boolean);

  if (teamPokemon.length === 0) return 0;

  let bulkyCount = 0;
  let balancedCount = 0;
  let attackCount = 0;

  for (const pokemon of teamPokemon) {
    const { atk, def, hp } = pokemon!.baseStats;

    // Calculate bulk ratio: (def + hp) / atk
    const bulkRatio = (def + hp) / atk;

    // Classify Pokemon by stat distribution
    if (bulkRatio >= 2.5) {
      bulkyCount++; // High bulk (e.g., Clodsire, Bastiodon)
    } else if (bulkRatio >= 1.8) {
      balancedCount++; // Balanced (e.g., Azumarill, Medicham)
    } else {
      attackCount++; // Attack-weighted (e.g., Scizor, Primeape)
    }
  }

  // Ideal distribution: 1-2 bulky, 2-4 balanced, 1-2 attack
  // Calculate score based on how close we are to ideal
  let score = 1.0;

  // Heavily penalize teams with too many attack-weighted Pokemon
  if (attackCount > 3) {
    score -= 0.6; // INCREASED: Very heavy penalty for >3 glass cannons
  } else if (attackCount > 2) {
    score -= 0.3; // INCREASED: Moderate penalty for >2 glass cannons
  }

  // STRONG penalty for having 2 glass cannons (frailty risk)
  if (attackCount >= 2) {
    score -= 0.2; // Additional penalty - prefer max 1 glass cannon
  }

  // Penalize teams with no bulk at all
  if (bulkyCount === 0 && balancedCount <= 1) {
    score -= 0.5; // INCREASED: Team too frail
  }

  // Strong bonus for having at least one true tank
  if (bulkyCount >= 1) {
    score += 0.25; // INCREASED from 0.2
  }

  // Additional bonus for having 2+ tanks
  if (bulkyCount >= 2) {
    score += 0.2; // INCREASED from 0.15
  }

  // Strong bonus for good balance (generalists)
  if (balancedCount >= 3) {
    score += 0.25; // INCREASED from 0.2
  } else if (balancedCount >= 2) {
    score += 0.15; // INCREASED from 0.1
  }

  // Ideal team composition bonus: 1-2 damage dealers, rest are tanks/generalists
  if (attackCount >= 1 && attackCount <= 2 && bulkyCount + balancedCount >= 4) {
    score += 0.3; // INCREASED bonus for ideal composition (prefer fewer glass cannons)
  }

  return Math.max(0, score);
}

/**
 * Calculate move coverage score
 * Rewards Pokemon with STAB moves and coverage moves that hit their weaknesses
 * Penalizes mono-type movesets that get hard-walled
 */
function calculateMoveCoverage(team: string[]): number {
  const teamPokemon = team
    .map((id) => getPokemonBySpeciesId(id))
    .filter(Boolean);

  if (teamPokemon.length === 0) return 0;

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

  let totalCoverageScore = 0;

  for (const pokemon of teamPokemon) {
    if (!pokemon) continue;

    // Get optimal moveset based on team context
    const optimalMoves = getOptimalMovesetForTeam(pokemon, team);
    const chargedMoves = [
      optimalMoves.chargedMove1,
      optimalMoves.chargedMove2,
    ].filter(Boolean) as string[];

    if (chargedMoves.length === 0) continue;

    const pokemonTypes = new Set(pokemon.types.filter((t) => t !== 'none'));

    // Find Pokemon's weaknesses (types that hit it super-effectively)
    const weaknesses = new Set<string>();
    for (const type of allTypes) {
      const effectiveness = calculateEffectiveness(pokemon.types, type);
      if (effectiveness >= 1.6) {
        weaknesses.add(type);
      }
    }

    // Analyze moves
    const moves = chargedMoves
      .map((moveId) => getMoveByMoveId(moveId))
      .filter(Boolean);

    const moveTypes = new Set<string>();
    let stabMoveCount = 0;
    let coverageMoveCount = 0;
    let weaknessCoverageMoves = 0;

    for (const move of moves) {
      if (!move) continue;

      moveTypes.add(move.type);

      // Check if STAB
      if (pokemonTypes.has(move.type)) {
        stabMoveCount++;
      } else {
        coverageMoveCount++;

        // Check if this coverage move hits any of the Pokemon's weaknesses super-effectively
        // e.g., Dusknoir (Ghost) weak to Dark/Ghost, Dynamic Punch (Fighting) hits Dark super-effectively
        for (const weakness of weaknesses) {
          const moveEffectiveness = calculateEffectiveness(
            [weakness],
            move.type,
          );
          if (moveEffectiveness >= 1.6) {
            weaknessCoverageMoves++;
            break; // Count each move only once even if it hits multiple weaknesses
          }
        }
      }
    }

    let coverageScore = 0;

    // STAB is important - reward having at least one STAB move
    if (stabMoveCount >= 1) {
      coverageScore += 0.4; // Strong bonus for STAB presence
    }

    // Additional small bonus for having 2 STAB moves (less ideal but not penalized)
    if (stabMoveCount === 2) {
      coverageScore += 0.1;
    }

    // Heavy penalty for mono-type moveset when types match Pokemon (all STAB, no flexibility)
    if (moveTypes.size === 1 && stabMoveCount === moves.length) {
      coverageScore -= 0.7; // Very heavy penalty - gets completely walled
    }

    // Reward diverse move types
    if (moveTypes.size >= 2) {
      coverageScore += 0.3; // Good type diversity
    }

    // Reward coverage moves (non-STAB)
    if (coverageMoveCount >= 2) {
      coverageScore += 0.4; // Excellent - full coverage moveset
    } else if (coverageMoveCount === 1) {
      coverageScore += 0.2; // Good - at least one coverage option
    }

    // BIG BONUS: Coverage moves that hit the Pokemon's weaknesses
    // e.g., Dusknoir with Dynamic Punch to hit Dark types
    if (weaknessCoverageMoves >= 2) {
      coverageScore += 0.7; // Exceptional - both moves cover weaknesses
    } else if (weaknessCoverageMoves === 1) {
      coverageScore += 0.5; // Excellent - one move covers a weakness
    }

    // Ideal pattern bonus: STAB + weakness coverage
    if (stabMoveCount >= 1 && weaknessCoverageMoves >= 1) {
      coverageScore += 0.3; // Perfect balance - reliable damage + answers to counters
    }

    totalCoverageScore += Math.max(0, coverageScore);
  }

  return totalCoverageScore / teamPokemon.length;
}

/**
 * Calculate shadow preference bonus
 * Rewards shadow forms for attack-weighted Pokémon
 */
function calculateShadowPreference(team: string[]): number {
  const teamPokemon = team
    .map((id) => getPokemonBySpeciesId(id))
    .filter(Boolean);

  if (teamPokemon.length === 0) return 0;

  let score = 0;

  for (const pokemon of teamPokemon) {
    const { atk, def, hp } = pokemon!.baseStats;
    const bulkRatio = (def + hp) / atk;
    const isShadow = pokemon!.speciesId.includes('_shadow');

    // For attack-weighted Pokemon (bulkRatio < 1.8), prefer shadow
    if (bulkRatio < 1.8) {
      if (isShadow) {
        score += 0.15; // Bonus for shadow on glass cannon
      } else {
        // Check if shadow variant exists in pool
        const shadowId = pokemon!.speciesId.includes('_shadow')
          ? pokemon!.speciesId
          : pokemon!.speciesId + '_shadow';
        const shadowVariant = getPokemonBySpeciesId(shadowId);

        // Small penalty if shadow exists but wasn't chosen
        if (shadowVariant && shadowVariant.tags?.includes('shadow')) {
          score -= 0.05;
        }
      }
    }

    // For bulky Pokemon (bulkRatio >= 2.5), prefer non-shadow
    if (bulkRatio >= 2.5 && isShadow) {
      score -= 0.05; // Slight penalty for shadow on tank
    }
  }

  return score / teamPokemon.length;
}

/**
 * Calculate type synergy score
 * Penalizes teams with stacked weaknesses (multiple Pokemon weak to same type)
 * Rewards complementary typing where teammates cover each other's weaknesses
 */
function calculateTypeSynergy(team: string[]): number {
  const teamPokemon = team
    .map((id) => getPokemonBySpeciesId(id))
    .filter(Boolean);

  if (teamPokemon.length === 0) return 0;

  // Map each type to count of Pokemon weak to it
  const weaknessCounts = new Map<string, number>();

  // Also track which Pokemon have which weaknesses
  const pokemonWeaknesses: string[][] = [];

  // Identify all weaknesses for each Pokemon
  for (const pokemon of teamPokemon) {
    const weaknesses = new Set<string>();

    // Check effectiveness of all types against this Pokemon
    for (const type of [
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
    ]) {
      const effectiveness = calculateEffectiveness(pokemon!.types, type);
      if (effectiveness >= 1.6) {
        weaknesses.add(type);
        weaknessCounts.set(type, (weaknessCounts.get(type) || 0) + 1);
      }
    }

    pokemonWeaknesses.push(Array.from(weaknesses));
  }

  let synergyScore = 1.0;

  // Penalize stacked weaknesses (CRITICAL for team diversity)
  for (const [, count] of weaknessCounts.entries()) {
    if (count >= 4) {
      synergyScore -= 0.6; // Devastating - 4+ Pokemon weak to same type
    } else if (count === 3) {
      synergyScore -= 0.4; // Very bad - 3 Pokemon weak to same type
    } else if (count === 2) {
      synergyScore -= 0.2; // Significant penalty - 2 Pokemon share weakness (e.g., Azumarill + Togekiss both weak to electric/poison)
    }
  }

  // Reward coverage - check if teammates resist each other's weaknesses
  let coverageBonus = 0;
  const totalWeaknessChecks = pokemonWeaknesses.length;

  for (let i = 0; i < pokemonWeaknesses.length; i++) {
    const weaknesses = pokemonWeaknesses[i];
    let coveredCount = 0;

    // Check if other teammates resist these weaknesses
    for (const weakness of weaknesses) {
      for (let j = 0; j < teamPokemon.length; j++) {
        if (i !== j) {
          const teammate = teamPokemon[j];
          const resistanceEffectiveness = calculateEffectiveness(
            teammate!.types,
            weakness,
          );

          // If teammate resists this weakness (0.625 or less)
          if (resistanceEffectiveness <= 0.625) {
            coveredCount++;
            break; // Only count once per weakness
          }
        }
      }
    }

    // Calculate coverage ratio for this Pokemon
    if (weaknesses.length > 0) {
      coverageBonus += coveredCount / weaknesses.length;
    }
  }

  // Normalize coverage bonus
  if (totalWeaknessChecks > 0) {
    synergyScore += (coverageBonus / totalWeaknessChecks) * 0.3;
  }

  return Math.max(0, synergyScore);
}

/**
 * Calculate simulation-based matchup coverage (CRITICAL for competitive viability)
 * Uses battle simulation data to evaluate team performance against meta threats
 */
function calculateSimulationCoverage(team: string[]): number {
  const teamNames = team.map((id) => speciesIdToRankingName(id));

  // Get top 50 threats from simulation data (now sorted by ranking)
  const topThreats = getTopThreats(50);

  // Calculate what % of threats the team can beat
  const coverageRatio = calculateTeamCoverage(team, topThreats);

  // Find threats that beat the entire team with RANKING WEIGHTS
  const weightedWeaknesses = getWeightedTeamWeaknesses(team);

  // Find threats that only ONE team member can beat (single point of failure)
  const singleCounters = getSingleCounterThreats(team, 50);

  // Calculate average matchup quality for the team
  // Prefer Pokemon with high mean/median battle ratings (generally win more matchups)
  let totalMatchupQuality = 0;
  let pokemonWithData = 0;

  for (const pokemonName of teamNames) {
    const qualityScore = getMatchupQualityScore(pokemonName);
    // Only count if we have simulation data (score != 0.5 which is default)
    if (qualityScore !== 0.5) {
      totalMatchupQuality += qualityScore;
      pokemonWithData++;
    }
  }

  const avgMatchupQuality =
    pokemonWithData > 0 ? totalMatchupQuality / pokemonWithData : 0.5;

  // Base score from coverage ratio (40% weight)
  let score = coverageRatio * 0.4;

  // Add matchup quality bonus (60% weight - consistency is critical!)
  // Penalizes glass cannons and rewards bulky consistent performers
  // Scale from 0.5 (neutral) to bonus/penalty
  // 0.5 = no change, >0.5 = bonus, <0.5 = penalty
  score += (avgMatchupQuality - 0.5) * 2.5; // Increased multiplier: 0.6 quality = +0.25 bonus

  // DEVASTATING WEIGHTED penalty for team weaknesses
  // Each team-wide weakness is penalized based on the rank of the threatening Pokemon
  // Top tier meta threats (95+ rank): -1.5 penalty (3.0 weight × 0.5 base)
  // High tier (90-95): -1.25 penalty
  // Upper tier (85-90): -1.0 penalty
  // Mid tier (80-85): -0.75 penalty
  // Lower tier (75-80): -0.5 penalty
  // Off-meta (<75): -0.25 penalty
  for (const { weight } of weightedWeaknesses) {
    score -= weight * 0.5; // Base penalty multiplied by ranking weight
  }

  // SIGNIFICANT penalty for single-point-of-failure threats
  // If only ONE Pokemon can beat a top threat, team is fragile
  // Top tier (95+): -0.75 penalty (1.5 weight × 0.5 base)
  // High tier (90-95): -0.6 penalty
  // Upper tier (85-90): -0.5 penalty
  // Mid tier (80-85): -0.35 penalty
  // Lower tier (75-80): -0.25 penalty
  for (const { weight } of singleCounters) {
    score -= weight * 0.5; // Penalty for lack of redundancy
  }

  return Math.max(0, score);
}

/**
 * Main fitness function
 * Combines all scoring components with mode-specific adjustments
 */
export function calculateFitness(
  chromosome: Chromosome,
  mode: TournamentMode,
): number {
  const { team, anchors } = chromosome;

  // Base fitness components - simulation coverage is now dominant
  const typeCoverage = calculateTypeCoverageScore(team) * 0.05;
  const avgRanking = calculateRankingScore(team) * 0.21; // Reduced to make room for stat balance
  const strategyViability = calculateStrategyScore(team, mode) * 0.03;
  const metaThreatCoverage = calculateMetaThreatScore(team) * 0.02;
  const energyBreakpoints = calculateEnergyScore(team) * 0.02;

  // Type diversity bonus (penalize teams with too many of same type)
  const typeDiversity = calculateTypeDiversity(team) * 0.07;

  // Type synergy (penalize stacked weaknesses, reward coverage)
  const typeSynergy = calculateTypeSynergy(team) * 0.08;

  // Move coverage (penalize mono-type movesets, reward diverse moves)
  const moveCoverage = calculateMoveCoverage(team) * 0.08;

  // Stat balance (bulk vs attack distribution) - INCREASED for team survivability
  const statBalance = calculateStatBalance(team) * 0.15; // UP from 0.1

  // Shadow preference (shadow for glass cannons)
  const shadowPreference = calculateShadowPreference(team) * 0.02;

  // SIMULATION COVERAGE - MOST IMPORTANT: Real matchup data beats theory
  // Now includes single-counter penalties for fragile coverage
  // With 6 team weaknesses at -0.5 each = -3.0, this becomes -0.9 overall penalty (30% * 3.0)
  // Plus single-counter penalties for lack of redundancy
  const simulationCoverage = calculateSimulationCoverage(team) * 0.3; // DOMINANT factor!

  let fitness =
    typeCoverage +
    avgRanking +
    strategyViability +
    metaThreatCoverage +
    energyBreakpoints +
    typeDiversity +
    typeSynergy +
    moveCoverage +
    statBalance +
    shadowPreference +
    simulationCoverage;

  // Mode-specific adjustments
  if (mode === 'GBL') {
    const surpriseFactor = calculateSurpriseFactor(team) * 0.15;
    fitness += surpriseFactor;
  }

  if (mode === 'PlayPokemon') {
    const consistency = calculateConsistency(team) * 0.1;
    fitness += consistency;
  }

  // Anchor synergy bonus (SIGNIFICANTLY increased when anchors present)
  if (anchors && anchors.length > 0) {
    // When anchors are present, make synergy the dominant factor
    const anchorSynergy = calculateAnchorSynergy(team, anchors) * 0.5;
    fitness += anchorSynergy;
  }

  return fitness;
}

/**
 * Calculate fitness for entire population
 */
export function evaluatePopulation(
  population: Chromosome[],
  mode: TournamentMode,
): void {
  for (const chromosome of population) {
    chromosome.fitness = calculateFitness(chromosome, mode);
  }
}
