import { calculateEffectiveness } from '../coverage/typeChart';
import {
  validateTeamUniqueness,
  getPokemonBySpeciesId,
  getDexNumber,
} from '../data/pokemon';
import {
  speciesIdToRankingName,
  getAllRankingsForPokemon,
} from '../data/rankings';
import {
  getWorstMatchups,
  countersThreats,
  getMatchupQualityScore,
} from '../data/simulations';
import type { Chromosome, TournamentMode } from '../types';

/**
 * Create a new chromosome with optional anchors
 * @param team Array of speciesIds
 * @param anchors Optional array of indices that are locked (anchor Pokémon)
 * @returns Chromosome object
 */
export function createChromosome(
  team: string[],
  anchors?: number[],
): Chromosome {
  return {
    team,
    anchors: anchors || [],
    fitness: 0,
  };
}

/**
 * Validate chromosome has legal team composition
 * - Correct team size (3 for GBL, 6 for Play! Pokémon)
 * - Unique base species
 * - All speciesIds valid
 */
export function isValidChromosome(
  chromosome: Chromosome,
  mode: TournamentMode,
): boolean {
  const expectedSize = mode === 'GBL' ? 3 : 6;

  if (chromosome.team.length !== expectedSize) {
    return false;
  }

  if (!validateTeamUniqueness(chromosome.team)) {
    return false;
  }

  return true;
}

/**
 * Clone a chromosome
 */
export function cloneChromosome(chromosome: Chromosome): Chromosome {
  return {
    team: [...chromosome.team],
    anchors: chromosome.anchors ? [...chromosome.anchors] : [],
    fitness: chromosome.fitness,
  };
}

/**
 * Check if a slot is an anchor (locked)
 */
export function isAnchorSlot(index: number, chromosome: Chromosome): boolean {
  return chromosome.anchors?.includes(index) || false;
}

/**
 * Get mutable (non-anchor) slot indices
 */
export function getMutableSlots(
  chromosome: Chromosome,
  teamSize: number,
): number[] {
  const allSlots = Array.from({ length: teamSize }, (_, i) => i);
  return allSlots.filter((i) => !isAnchorSlot(i, chromosome));
}

/**
 * Create a random chromosome with anchors using incremental coverage-based selection
 * @param pokemonPool Array of available speciesIds
 * @param teamSize 3 or 6
 * @param anchorPokemon Optional array of speciesIds to lock
 * @returns Random valid chromosome with good type diversity
 */
export function createRandomChromosome(
  pokemonPool: string[],
  teamSize: number,
  anchorPokemon?: string[],
): Chromosome {
  const team: string[] = Array(teamSize).fill('');
  const anchors: number[] = [];
  const usedDexNumbers = new Set<number>();
  const usedTypes = new Map<string, number>(); // Track type frequency

  // Place anchors first
  if (anchorPokemon && anchorPokemon.length > 0) {
    for (let i = 0; i < Math.min(anchorPokemon.length, teamSize); i++) {
      team[i] = anchorPokemon[i];
      anchors.push(i);
      const dex = getDexNumber(anchorPokemon[i]);
      if (dex) usedDexNumbers.add(dex);

      // Track anchor types
      const anchorData = getPokemonBySpeciesId(anchorPokemon[i]);
      if (anchorData) {
        for (const type of anchorData.types) {
          usedTypes.set(type, (usedTypes.get(type) || 0) + 1);
        }
      }
    }
  }

  // Fill remaining slots INCREMENTALLY - evaluate type diversity after each selection
  const mutableSlots = getMutableSlots({ team, anchors, fitness: 0 }, teamSize);

  for (const slotIndex of mutableSlots) {
    let attempts = 0;
    let selectedSpecies: string | null = null;
    let bestDiversityScore = -1;

    // For the first Pokemon (when team is empty and no anchors), use pure randomness for variety
    // Otherwise, try multiple candidates and pick the one with best type diversity
    const isFirstPokemon = slotIndex === 0 && anchors.length === 0;
    const candidateCount = isFirstPokemon
      ? 1
      : Math.min(20, pokemonPool.length);

    for (let i = 0; i < candidateCount && attempts < 100; i++) {
      const candidateSpecies =
        pokemonPool[Math.floor(Math.random() * pokemonPool.length)];
      const candidateDex = getDexNumber(candidateSpecies);

      // Skip if duplicate Dex number
      if (!candidateDex || usedDexNumbers.has(candidateDex)) {
        attempts++;
        continue;
      }

      // Get candidate's types
      const candidatePokemon = getPokemonBySpeciesId(candidateSpecies);
      if (!candidatePokemon) {
        attempts++;
        continue;
      }

      // Calculate type diversity score - prefer types we don't have yet
      let diversityScore = 10; // Base score

      for (const type of candidatePokemon.types) {
        const currentCount = usedTypes.get(type) || 0;
        // Heavily penalize if we already have 2+ of this type
        if (currentCount >= 2) {
          diversityScore -= 5;
        } else if (currentCount === 1) {
          diversityScore -= 2;
        } else {
          // Bonus for new type
          diversityScore += 3;
        }
      }

      // Stat balance consideration - count attack-weighted Pokemon so far
      const { atk, def, hp } = candidatePokemon.baseStats;
      const bulkRatio = (def + hp) / atk;

      let attackWeightedCount = 0;
      let bulkyCount = 0;

      // Count existing team stats
      for (let j = 0; j < slotIndex; j++) {
        if (team[j]) {
          const existingPokemon = getPokemonBySpeciesId(team[j]);
          if (existingPokemon) {
            const existingBulkRatio =
              (existingPokemon.baseStats.def + existingPokemon.baseStats.hp) /
              existingPokemon.baseStats.atk;
            if (existingBulkRatio < 1.8) {
              attackWeightedCount++;
            } else if (existingBulkRatio >= 2.5) {
              bulkyCount++;
            }
          }
        }
      }

      // Adjust score based on team balance needs
      if (bulkRatio < 1.8) {
        // This is an attack-weighted Pokemon
        if (attackWeightedCount >= 2) {
          diversityScore -= 4; // Penalize if we already have 2+ glass cannons
        }

        // Prefer shadow for attack-weighted
        const isShadow = candidateSpecies.includes('_shadow');
        if (isShadow) {
          diversityScore += 2; // Bonus for shadow on glass cannon
        }
      } else if (bulkRatio >= 2.5) {
        // This is a bulky Pokemon
        if (bulkyCount === 0 && slotIndex > 0) {
          diversityScore += 3; // Bonus if we don't have a tank yet
        }
      }

      // Check for stacked weaknesses - avoid Pokemon that share weaknesses with existing team
      const candidateWeaknesses = new Set<string>();

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
        const effectiveness = calculateEffectiveness(
          type,
          candidatePokemon.types,
        );
        if (effectiveness >= 1.6) {
          candidateWeaknesses.add(type);
        }
      }

      // Check how many existing team members share these weaknesses
      let sharedWeaknessCount = 0;
      for (let j = 0; j < slotIndex; j++) {
        if (team[j]) {
          const existingPokemon = getPokemonBySpeciesId(team[j]);
          if (existingPokemon) {
            for (const weakness of candidateWeaknesses) {
              const existingEffectiveness = calculateEffectiveness(
                weakness,
                existingPokemon.types,
              );
              if (existingEffectiveness >= 1.6) {
                sharedWeaknessCount++;
              }
            }
          }
        }
      }

      // Heavily penalize stacked weaknesses
      if (sharedWeaknessCount >= 3) {
        diversityScore -= 6; // Very bad - would create triple weakness
      } else if (sharedWeaknessCount >= 2) {
        diversityScore -= 3; // Bad - double stacked weakness
      } else if (sharedWeaknessCount === 1) {
        diversityScore -= 1; // Minor penalty for one shared weakness
      }

      // SIMULATION-BASED SCORING: Reward Pokemon that counter existing team's worst matchups
      // HEAVILY prioritize countering highly-ranked threats
      if (slotIndex > 0 && !isFirstPokemon) {
        const candidateName = speciesIdToRankingName(candidateSpecies);

        // Collect all worst matchups from existing team members with RANKING WEIGHTS
        const teamThreats = new Map<string, number>(); // threat -> weight based on rank

        for (let j = 0; j < slotIndex; j++) {
          if (team[j]) {
            const memberName = speciesIdToRankingName(team[j]);
            const worstMatchups = getWorstMatchups(memberName, 5); // Top 5 worst for each member

            for (const threat of worstMatchups) {
              // Get threat's ranking and calculate weight
              const threatRankings = getAllRankingsForPokemon(threat);
              const threatScore = threatRankings.overall;

              // Exponential weight based on ranking
              // Rank 95+: weight 15 (CRITICAL to counter top meta)
              // Rank 90-95: weight 12
              // Rank 85-90: weight 10
              // Rank 80-85: weight 7
              // Rank 75-80: weight 5
              // Rank <75: weight 3
              let weight = 3;
              if (threatScore >= 95) {
                weight = 15; // Top tier - MUST have answer
              } else if (threatScore >= 90) {
                weight = 12;
              } else if (threatScore >= 85) {
                weight = 10;
              } else if (threatScore >= 80) {
                weight = 7;
              } else if (threatScore >= 75) {
                weight = 5;
              }

              // Track highest weight for each threat
              const currentWeight = teamThreats.get(threat) || 0;
              if (weight > currentWeight) {
                teamThreats.set(threat, weight);
              }
            }
          }
        }

        // Calculate weighted bonus for countering threats
        let weightedCounterBonus = 0;
        for (const [threat, weight] of teamThreats.entries()) {
          if (countersThreats(candidateName, [threat]) > 0) {
            weightedCounterBonus += weight; // Add full weight if candidate beats this threat
          }
        }

        diversityScore += weightedCounterBonus; // Weighted bonus (much higher for top meta)

        // Additional bonus for overall matchup quality (consistency)
        const qualityScore = getMatchupQualityScore(candidateName);
        // Scale from 0.5 (neutral) to bonus/penalty
        // 0.6 quality = +2, 0.4 quality = -2
        diversityScore += (qualityScore - 0.5) * 20; // High weight for quality
      }

      // Pick candidate with best diversity score
      if (diversityScore > bestDiversityScore) {
        bestDiversityScore = diversityScore;
        selectedSpecies = candidateSpecies;
      }

      attempts++;
    }

    // If no good candidate found, fall back to random unique selection
    if (!selectedSpecies) {
      let fallbackAttempts = 0;
      do {
        selectedSpecies =
          pokemonPool[Math.floor(Math.random() * pokemonPool.length)];
        const selectedDex = getDexNumber(selectedSpecies);
        fallbackAttempts++;

        if (fallbackAttempts > 1000) {
          throw new Error(
            `Failed to find unique Pokemon after 1000 attempts. Pool size: ${pokemonPool.length}, Used: ${usedDexNumbers.size}`,
          );
        }

        if (selectedDex && !usedDexNumbers.has(selectedDex)) {
          break;
        }
      } while (true);
    }

    // Add selected Pokemon to team
    team[slotIndex] = selectedSpecies;
    const selectedDex = getDexNumber(selectedSpecies);
    if (selectedDex) usedDexNumbers.add(selectedDex);

    // Update type frequency
    const selectedPokemon = getPokemonBySpeciesId(selectedSpecies);
    if (selectedPokemon) {
      for (const type of selectedPokemon.types) {
        usedTypes.set(type, (usedTypes.get(type) || 0) + 1);
      }
    }
  }

  // Validate the final team
  const finalTeam = { team, anchors, fitness: 0 };

  // CRITICAL: Verify anchors are still in the team
  if (anchorPokemon && anchorPokemon.length > 0) {
    console.log('Final team created:', team);
    console.log('Anchor indices:', anchors);
    for (let i = 0; i < anchorPokemon.length; i++) {
      if (team[i] !== anchorPokemon[i]) {
        console.error(
          `❌ ANCHOR LOST: Expected ${anchorPokemon[i]} at index ${i}, got ${team[i]}`,
        );
      } else {
        console.log(`✓ Anchor ${i} preserved: ${anchorPokemon[i]}`);
      }
    }
  }

  return finalTeam;
}

/**
 * Extract base species from speciesId
 * (Duplicate of pokemon.ts for standalone use)
 */
function getBaseSpecies(speciesId: string): string {
  return speciesId.split('_')[0];
}

/**
 * Initialize population with random chromosomes
 */
export function initializePopulation(
  populationSize: number,
  pokemonPool: string[],
  teamSize: number,
  anchorPokemon?: string[],
): Chromosome[] {
  const population: Chromosome[] = [];

  for (let i = 0; i < populationSize; i++) {
    population.push(
      createRandomChromosome(pokemonPool, teamSize, anchorPokemon),
    );
  }

  return population;
}

/**
 * Sort population by fitness (descending)
 */
export function sortByFitness(population: Chromosome[]): Chromosome[] {
  return [...population].sort((a, b) => b.fitness - a.fitness);
}

/**
 * Get best chromosome from population
 */
export function getBestChromosome(population: Chromosome[]): Chromosome {
  return sortByFitness(population)[0];
}

/**
 * Get worst chromosome from population
 */
export function getWorstChromosome(population: Chromosome[]): Chromosome {
  return sortByFitness(population)[population.length - 1];
}

/**
 * Calculate population diversity (unique teams)
 */
export function calculateDiversity(population: Chromosome[]): number {
  const uniqueTeams = new Set(
    population.map((c) => [...c.team].sort().join(',')),
  );
  return uniqueTeams.size / population.length;
}

/**
 * Check if population has converged
 * Returns true if top 30% have similar fitness
 */
export function hasConverged(
  population: Chromosome[],
  threshold: number = 0.01,
): boolean {
  const sorted = sortByFitness(population);
  const topCount = Math.ceil(population.length * 0.3);
  const topPopulation = sorted.slice(0, topCount);

  if (topPopulation.length === 0) return true;

  const maxFitness = topPopulation[0].fitness;
  const minFitness = topPopulation[topPopulation.length - 1].fitness;

  const range = maxFitness - minFitness;
  return range < threshold;
}
