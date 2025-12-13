import { getDexNumber, validateTeamUniqueness } from '../data/pokemon';
import type { Chromosome, TournamentMode } from '../types';
import { cloneChromosome, getMutableSlots, isAnchorSlot } from './chromosome';

/**
 * Tournament selection - pick best of N random chromosomes
 */
export function tournamentSelection(
  population: Chromosome[],
  tournamentSize: number = 3,
): Chromosome {
  const tournament: Chromosome[] = [];

  for (let i = 0; i < tournamentSize; i++) {
    const randomIndex = Math.floor(Math.random() * population.length);
    tournament.push(population[randomIndex]);
  }

  return tournament.reduce((best, current) =>
    current.fitness > best.fitness ? current : best,
  );
}

/**
 * Single-point crossover - combine two parents
 * Preserves anchors and ensures unique base species
 */
export function crossover(
  parent1: Chromosome,
  parent2: Chromosome,
  mode: TournamentMode,
): Chromosome {
  const teamSize = mode === 'GBL' ? 3 : 6;
  const child = cloneChromosome(parent1);

  // Find mutable slots (non-anchors)
  const mutableSlots = getMutableSlots(child, teamSize);

  if (mutableSlots.length === 0) {
    return child; // All anchors, can't crossover
  }

  // Pick crossover point from mutable slots
  const crossoverPoint =
    mutableSlots[Math.floor(Math.random() * mutableSlots.length)];

  const usedDexNumbers = new Set<number>();

  // Add all anchor Dex numbers to used set
  for (let i = 0; i < teamSize; i++) {
    if (isAnchorSlot(i, child)) {
      const dex = getDexNumber(child.team[i]);
      if (dex) usedDexNumbers.add(dex);
    }
  }

  // Add parent1 Dex numbers before crossover point
  for (const slot of mutableSlots) {
    if (slot < crossoverPoint) {
      const dex = getDexNumber(child.team[slot]);
      if (dex) usedDexNumbers.add(dex);
    }
  }

  // Copy from parent2 after crossover point, avoiding duplicates
  for (const slot of mutableSlots) {
    if (slot >= crossoverPoint) {
      const parent2Species = parent2.team[slot];
      const parent2Dex = getDexNumber(parent2Species);

      if (parent2Dex && !usedDexNumbers.has(parent2Dex)) {
        child.team[slot] = parent2Species;
        usedDexNumbers.add(parent2Dex);
      }
      // If duplicate, keep parent1's species (already set)
    }
  }

  // Final validation - ensure no duplicates
  if (!validateTeamUniqueness(child.team)) {
    // If crossover created duplicates, return parent1 unchanged
    return cloneChromosome(parent1);
  }

  // CRITICAL: Verify anchors are preserved
  for (let i = 0; i < teamSize; i++) {
    if (isAnchorSlot(i, child)) {
      if (child.team[i] !== parent1.team[i]) {
        console.error(
          `CROSSOVER CORRUPTED ANCHOR at index ${i}: Expected ${parent1.team[i]}, got ${child.team[i]}`,
        );
        return cloneChromosome(parent1);
      }
    }
  }

  return child;
}

/**
 * Mutation - randomly swap a non-anchor Pokémon
 * @param pokemonPool Available species pool
 * @param mutationRate Probability of mutation (0.0 to 1.0)
 */
export function mutate(
  chromosome: Chromosome,
  pokemonPool: string[],
  mutationRate: number,
  mode: TournamentMode,
): Chromosome {
  if (Math.random() > mutationRate) {
    return chromosome; // No mutation
  }

  const teamSize = mode === 'GBL' ? 3 : 6;
  const mutated = cloneChromosome(chromosome);

  // Find mutable slots
  const mutableSlots = getMutableSlots(mutated, teamSize);

  if (mutableSlots.length === 0) {
    return mutated; // All anchors, can't mutate
  }

  // Pick random mutable slot
  const slotToMutate =
    mutableSlots[Math.floor(Math.random() * mutableSlots.length)];

  // Find species not in team (by Dex number)
  const usedDexNumbers = new Set(
    mutated.team
      .map((s) => getDexNumber(s))
      .filter((dex): dex is number => dex !== undefined),
  );

  const availablePool = pokemonPool.filter((s) => {
    const dex = getDexNumber(s);
    return dex && !usedDexNumbers.has(dex);
  });

  if (availablePool.length === 0) {
    return mutated; // No alternatives available
  }

  // Replace with random species from pool
  const newSpecies =
    availablePool[Math.floor(Math.random() * availablePool.length)];

  mutated.team[slotToMutate] = newSpecies;

  // Final validation - ensure no duplicates
  if (!validateTeamUniqueness(mutated.team)) {
    // If mutation created duplicates, return original
    return chromosome;
  }

  // CRITICAL: Verify anchors are preserved
  for (let i = 0; i < teamSize; i++) {
    if (isAnchorSlot(i, mutated)) {
      if (mutated.team[i] !== chromosome.team[i]) {
        console.error(
          `MUTATION CORRUPTED ANCHOR at index ${i}: Expected ${chromosome.team[i]}, got ${mutated.team[i]}`,
        );
        return chromosome;
      }
    }
  }

  return mutated;
}

/**
 * Elitism - carry forward top N chromosomes unchanged
 */
export function selectElites(
  population: Chromosome[],
  eliteCount: number,
): Chromosome[] {
  const sorted = [...population].sort((a, b) => b.fitness - a.fitness);
  return sorted.slice(0, eliteCount).map(cloneChromosome);
}

/**
 * Create new generation
 */
export function createNextGeneration(
  population: Chromosome[],
  pokemonPool: string[],
  mode: TournamentMode,
  options: {
    eliteCount?: number;
    crossoverRate?: number;
    mutationRate?: number;
  } = {},
): Chromosome[] {
  const {
    eliteCount = Math.ceil(population.length * 0.1),
    crossoverRate = 0.8,
    mutationRate = 0.2,
  } = options;

  const nextGeneration: Chromosome[] = [];

  // 1. Keep elites
  const elites = selectElites(population, eliteCount);
  nextGeneration.push(...elites);

  //2. Fill rest with crossover + mutation
  while (nextGeneration.length < population.length) {
    const parent1 = tournamentSelection(population);
    const parent2 = tournamentSelection(population);

    let child: Chromosome;

    if (Math.random() < crossoverRate) {
      child = crossover(parent1, parent2, mode);
    } else {
      child = cloneChromosome(parent1);
    }

    child = mutate(child, pokemonPool, mutationRate, mode);

    // CRITICAL: Validate child preserves anchors from parent1
    if (parent1.anchors && parent1.anchors.length > 0) {
      let anchorCorrupted = false;
      for (const anchorIndex of parent1.anchors) {
        if (child.team[anchorIndex] !== parent1.team[anchorIndex]) {
          console.error(
            `❌ NEXT_GEN CORRUPTED ANCHOR ${anchorIndex}: Expected ${parent1.team[anchorIndex]}, got ${child.team[anchorIndex]}`,
          );
          anchorCorrupted = true;
          break;
        }
      }
      // If anchor corrupted, use parent1 instead
      if (anchorCorrupted) {
        child = cloneChromosome(parent1);
      }
    }

    nextGeneration.push(child);
  }

  return nextGeneration;
}

/**
 * Adaptive mutation rate - increase if diversity is low
 */
export function getAdaptiveMutationRate(
  diversity: number,
  baseMutationRate: number = 0.2,
): number {
  // If diversity < 0.3, increase mutation
  if (diversity < 0.3) {
    return Math.min(baseMutationRate * 2, 0.5);
  }

  // If diversity > 0.7, decrease mutation
  if (diversity > 0.7) {
    return Math.max(baseMutationRate * 0.5, 0.05);
  }

  return baseMutationRate;
}
