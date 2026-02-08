import { getRankedGreatLeaguePokemon } from '@lib/data/pokemon';
import { getTopRankedPokemonNames } from '@lib/data/rankings';
import type { Chromosome, GenerationOptions } from '../types';
import {
  initializePopulation,
  getBestChromosome,
  hasConverged,
  calculateDiversity,
  cloneChromosome,
} from './chromosome';
import { evaluatePopulation } from './fitness';
import { createNextGeneration, getAdaptiveMutationRate } from './operators';

/**
 * Main genetic algorithm
 * @param options Generation options
 * @returns Best chromosome found
 */
export async function generateTeam(
  options: GenerationOptions,
): Promise<Chromosome> {
  const {
    mode,
    anchorPokemon = [],
    excludedPokemon = [],
    populationSize = 150,
    generations = 75,
    algorithm = 'individual',
  } = options;

  const teamSize = mode === 'GBL' ? 3 : 6;

  // Get available Pokémon pool (only top 150 ranked Pokemon for competitive viability)
  const topRankedNames = getTopRankedPokemonNames(80, 150);
  const availablePokemon = getRankedGreatLeaguePokemon(topRankedNames);

  // Filter out excluded Pokemon
  const filteredPokemon = availablePokemon.filter(
    (p) => !excludedPokemon.includes(p.speciesId),
  );
  const pokemonPool = filteredPokemon.map((p) => p.speciesId);

  // Validate anchors
  if (anchorPokemon.length > teamSize) {
    throw new Error(
      `Too many anchor Pokémon (${anchorPokemon.length}) for ${mode} mode (max ${teamSize})`,
    );
  }

  // Initialize population
  let population = initializePopulation(
    populationSize,
    pokemonPool,
    teamSize,
    anchorPokemon,
  );

  // Evaluate initial population
  evaluatePopulation(population, mode, algorithm);

  let bestOverall = getBestChromosome(population);

  // Validate initial best has anchors
  if (anchorPokemon.length > 0) {
    for (let i = 0; i < anchorPokemon.length; i++) {
      if (bestOverall.team[i] !== anchorPokemon[i]) {
        console.error(
          `❌ Initial best has corrupted anchor ${i}! This is a bug in chromosome creation.`,
        );
        throw new Error(
          `Initial population has no valid chromosomes with anchors preserved`,
        );
      }
    }
  }

  let generationsWithoutImprovement = 0;

  // Evolution loop
  for (let gen = 0; gen < generations; gen++) {
    // Calculate diversity
    const diversity = calculateDiversity(population);

    // Adaptive mutation rate
    const mutationRate = getAdaptiveMutationRate(diversity);

    // Create next generation
    population = createNextGeneration(population, pokemonPool, mode, {
      mutationRate,
      eliteCount: Math.ceil(populationSize * 0.1),
      crossoverRate: 0.8,
    });

    // Evaluate new population
    evaluatePopulation(population, mode, algorithm);

    // CRITICAL: Filter out any chromosomes that lost anchors
    if (anchorPokemon.length > 0) {
      const beforeCount = population.length;
      population = population.filter((chromosome) => {
        for (let i = 0; i < anchorPokemon.length; i++) {
          if (chromosome.team[i] !== anchorPokemon[i]) {
            return false;
          }
        }
        return true;
      });

      if (population.length < beforeCount) {
        console.warn(
          `⚠️ Generation ${gen + 1}: Filtered out ${beforeCount - population.length} chromosomes with corrupted anchors`,
        );

        // If population is empty or too small, recreate valid chromosomes
        if (population.length === 0) {
          console.error(
            '❌ All chromosomes lost anchors! Recreating population...',
          );
          population = initializePopulation(
            populationSize,
            pokemonPool,
            teamSize,
            anchorPokemon,
          );
          evaluatePopulation(population, mode, algorithm);
        } else {
          // Refill population with clones of valid chromosomes
          while (population.length < populationSize) {
            const randomValid =
              population[Math.floor(Math.random() * population.length)];
            population.push(cloneChromosome(randomValid));
          }
          // Re-evaluate the cloned chromosomes
          evaluatePopulation(population, mode, algorithm);
        }
      }
    }

    // Track best
    const currentBest = getBestChromosome(population);

    // Validate currentBest has anchors before comparing
    let currentBestValid = true;
    if (anchorPokemon.length > 0) {
      for (let i = 0; i < anchorPokemon.length; i++) {
        if (currentBest.team[i] !== anchorPokemon[i]) {
          console.error(
            `⚠️ Current best has corrupted anchor ${i}, skipping update`,
          );
          currentBestValid = false;
          break;
        }
      }
    }

    if (currentBestValid && currentBest.fitness > bestOverall.fitness) {
      bestOverall = currentBest;
      generationsWithoutImprovement = 0;
    } else {
      generationsWithoutImprovement++;
    }

    // Early stopping if converged
    if (hasConverged(population) && generationsWithoutImprovement > 10) {
      console.log(`Converged at generation ${gen + 1}`);
      break;
    }

    // Log progress every 10 generations
    if ((gen + 1) % 10 === 0) {
      console.log(
        `Generation ${gen + 1}/${generations} | ` +
          `Best: ${currentBest.fitness.toFixed(4)} | ` +
          `Diversity: ${(diversity * 100).toFixed(1)}%`,
      );
    }
  }

  console.log('=== FINAL BEST TEAM ===');
  console.log('Team:', bestOverall.team);
  console.log('Anchors:', bestOverall.anchors);
  console.log('Fitness:', bestOverall.fitness);

  // FINAL VALIDATION: Ensure anchors are preserved
  if (anchorPokemon.length > 0) {
    for (let i = 0; i < anchorPokemon.length; i++) {
      if (bestOverall.team[i] !== anchorPokemon[i]) {
        console.error(
          `❌ FINAL BEST TEAM HAS CORRUPTED ANCHOR ${i}: Expected ${anchorPokemon[i]}, got ${bestOverall.team[i]}`,
        );
        throw new Error(
          `Final team has corrupted anchors. This should never happen.`,
        );
      }
    }
    console.log('✅ All anchors verified in final team');
  }

  return bestOverall;
}

/**
 * Generate multiple teams and return top N
 * Useful for giving users options
 */
export async function generateMultipleTeams(
  options: GenerationOptions,
  count: number = 5,
): Promise<Chromosome[]> {
  const teams: Chromosome[] = [];

  for (let i = 0; i < count; i++) {
    console.log(`\nGenerating team ${i + 1}/${count}...`);
    const team = await generateTeam(options);
    teams.push(team);
  }

  // Sort by fitness
  return teams.sort((a, b) => b.fitness - a.fitness);
}

/**
 * Quick generate (reduced parameters for faster results)
 */
export async function quickGenerateTeam(
  options: GenerationOptions,
): Promise<Chromosome> {
  return generateTeam({
    ...options,
    populationSize: 50,
    generations: 30,
  });
}
