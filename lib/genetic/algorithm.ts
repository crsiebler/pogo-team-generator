import { DEFAULT_BATTLE_FORMAT_ID } from '@lib/data/battleFormats';
import { getBattleFrontierMasterTeamLegality } from '@lib/data/battleFrontierMasterRules';
import { buildCandidateProfiles } from '@lib/data/candidateProfiles';
import { getMegaMasterTeamLegality } from '@lib/data/megaMasterRules';
import { allMoves } from '@lib/data/moves';
import { getRankedPokemonForFormat } from '@lib/data/pokemon';
import {
  getAutomaticCandidatePokemonNames,
  getCandidateRankingBands,
  getConsistencyRankings,
  getOverallRankings,
  getRoleBasedThreatSpeciesIds,
  getSwitchesRankings,
  MissingRankingDataError,
  speciesIdToRankingName,
} from '@lib/data/rankings';
import {
  countersThreats,
  ensureSimulationDataAvailable,
  getWorstMatchups,
} from '@lib/data/simulations';
import type {
  Chromosome,
  GenerationOptions,
  Pokemon,
  RankedPokemon,
} from '../types';
import {
  initializePopulation,
  initializeAnchorFirstPopulation,
  getBestChromosome,
  hasConverged,
  calculateDiversity,
  cloneChromosome,
} from './chromosome';
import {
  buildGblLineupRecommendation,
  buildPlayPokemonRosterRecommendations,
  createDefaultLineupScoringContext,
  createLineupAwareFitnessContext,
  evaluatePopulation,
  scorePlayPokemonRoster,
} from './fitness';
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
    formatId = DEFAULT_BATTLE_FORMAT_ID,
  } = options;

  const teamSize = mode === 'GBL' ? 3 : 6;
  const fitnessContext = createLineupAwareFitnessContext(formatId);

  ensureSimulationDataAvailable(formatId);

  const candidateNames = getAutomaticCandidatePokemonNames(formatId);
  const availablePokemon = getRankedPokemonForFormat(candidateNames, formatId);
  const profileCandidateNames = new Set(candidateNames);
  const anchorRankingNames: string[] = [];

  for (const anchorSpeciesId of anchorPokemon) {
    const anchorRankingName = speciesIdToRankingName(anchorSpeciesId);
    anchorRankingNames.push(anchorRankingName);
    profileCandidateNames.add(anchorRankingName);
  }

  const profilePokemon = getRankedPokemonForFormat(
    profileCandidateNames,
    formatId,
  );

  // Filter out excluded Pokemon
  const filteredPokemon = availablePokemon.filter(
    (p) => !excludedPokemon.includes(p.speciesId),
  );
  const filteredProfilePokemon = profilePokemon.filter(
    (p) =>
      !excludedPokemon.includes(p.speciesId) ||
      anchorPokemon.includes(p.speciesId),
  );
  const pokemonPool = filteredPokemon.map((p) => p.speciesId);
  const metaThreatPool = getRoleBasedThreatSpeciesIds(100, formatId);
  const candidateProfiles = buildAnchorFirstCandidateProfiles(
    filteredProfilePokemon,
    pokemonPool,
    metaThreatPool.length > 0 ? metaThreatPool : pokemonPool,
    anchorRankingNames,
    anchorPokemon,
    formatId,
  );

  // Validate anchors
  if (anchorPokemon.length > teamSize) {
    throw new Error(
      `Too many anchor Pokémon (${anchorPokemon.length}) for ${mode} mode (max ${teamSize})`,
    );
  }

  // Initialize population
  let population = initializeAnchorFirstPopulation(
    populationSize,
    pokemonPool,
    teamSize,
    {
      anchorPokemon,
      candidateProfiles,
      formatId,
    },
  );

  // Evaluate initial population
  evaluatePopulation(population, mode, formatId, fitnessContext);

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
      formatId,
    });

    // Evaluate new population
    evaluatePopulation(population, mode, formatId, fitnessContext);

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
            formatId,
          );
          evaluatePopulation(population, mode, formatId, fitnessContext);
        } else {
          // Refill population with clones of valid chromosomes
          while (population.length < populationSize) {
            const randomValid =
              population[Math.floor(Math.random() * population.length)];
            population.push(cloneChromosome(randomValid));
          }
          // Re-evaluate the cloned chromosomes
          evaluatePopulation(population, mode, formatId, fitnessContext);
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

  if (formatId === 'battle-frontier-master') {
    const legality = getBattleFrontierMasterTeamLegality(bestOverall.team);

    if (!legality.isLegal) {
      throw new Error(
        'Final Battle Frontier Master team is illegal. This should never happen.',
      );
    }
  }

  if (formatId === 'mega-master-league') {
    const legality = getMegaMasterTeamLegality(bestOverall.team);

    if (!legality.isLegal) {
      throw new Error(
        'Final Mega Master League team is illegal. This should never happen.',
      );
    }
  }

  const lineupContext = createDefaultLineupScoringContext(formatId);

  if (mode === 'GBL') {
    const recommendedLineup = buildGblLineupRecommendation(bestOverall.team, {
      context: lineupContext,
    });

    bestOverall = {
      ...bestOverall,
      fitness:
        recommendedLineup.scoreBreakdown?.score ?? recommendedLineup.score,
      scoreBreakdown: recommendedLineup.scoreBreakdown,
      recommendedLineups: [recommendedLineup],
    };
  } else {
    const rosterScore = scorePlayPokemonRoster(
      bestOverall.team,
      lineupContext,
      { mode: 'full', includeDiagnostics: true, recommendationLimit: 5 },
    );
    const recommendations = buildPlayPokemonRosterRecommendations(
      rosterScore.lineupScores ?? [],
      { limit: 5 },
    );

    bestOverall = {
      ...bestOverall,
      fitness: rosterScore.fitness,
      scoreBreakdown: rosterScore.scoreBreakdown,
      recommendedLineups: recommendations.recommendedLineups,
    };
  }

  return bestOverall;
}

function buildAnchorFirstCandidateProfiles(
  availablePokemon: readonly Pokemon[],
  pokemonPool: readonly string[],
  coveragePool: readonly string[],
  anchorRankingNames: readonly string[],
  anchorPokemon: readonly string[],
  formatId: NonNullable<GenerationOptions['formatId']>,
): ReturnType<typeof buildCandidateProfiles> {
  const pokemonPoolSet = new Set(pokemonPool);
  const coveragePoolSet = new Set(coveragePool);
  const explicitAnchorSet = new Set(anchorPokemon);
  const speciesIdsByPokemon = new Map(
    availablePokemon.map((pokemon) => [pokemon.speciesName, pokemon.speciesId]),
  );
  const simulationCoverageByPokemon = new Map(
    availablePokemon.map((pokemon) => {
      const relevantOpponents = coveragePool.filter(
        (opponent) => opponent !== pokemon.speciesId,
      );
      const winsAgainst = relevantOpponents.filter((opponent) => {
        return countersThreats(pokemon.speciesId, [opponent], formatId) > 0;
      });
      const lossesAgainst = getWorstMatchups(
        pokemon.speciesId,
        Number.MAX_SAFE_INTEGER,
        formatId,
      )
        .filter((opponent) => coveragePoolSet.has(opponent))
        .slice(0, 5);

      return [
        pokemon.speciesName,
        {
          winsAgainst,
          lossesAgainst,
          checks: winsAgainst,
        },
      ];
    }),
  );

  return buildCandidateProfiles({
    rankingBands: extendRankingBandsWithExplicitAnchors(
      getCandidateRankingBands(formatId),
      getOverallRankings(formatId),
      anchorRankingNames,
    ),
    speciesIdsByPokemon,
    safetyRankings: getRankingSignalMap(() => getSwitchesRankings(formatId)),
    switchRankings: getRankingSignalMap(() => getSwitchesRankings(formatId)),
    consistencyRankings: getRankingSignalMap(() =>
      getConsistencyRankings(formatId),
    ),
    moveTypesByName: new Map(allMoves.map((move) => [move.name, move.type])),
    simulationCoverageByPokemon,
  }).filter((profile) => {
    return (
      profile.speciesId !== null &&
      (pokemonPoolSet.has(profile.speciesId) ||
        explicitAnchorSet.has(profile.speciesId))
    );
  });
}

function extendRankingBandsWithExplicitAnchors(
  rankingBands: ReturnType<typeof getCandidateRankingBands>,
  overallRankings: readonly RankedPokemon[],
  anchorRankingNames: readonly string[],
): ReturnType<typeof getCandidateRankingBands> {
  const assignedPokemon = new Set(
    rankingBands.assignments.map((assignment) => assignment.pokemon),
  );
  const appendedAssignments = anchorRankingNames.flatMap((pokemon) => {
    if (assignedPokemon.has(pokemon)) {
      return [];
    }

    const rankingIndex = overallRankings.findIndex(
      (ranking) => ranking.Pokemon === pokemon,
    );

    if (rankingIndex < 0) {
      return [];
    }

    const ranking = overallRankings[rankingIndex];
    const rank = rankingIndex + 1;

    return [
      {
        pokemon,
        ranking,
        rank,
        rankPercentile: rank / Math.max(overallRankings.length, 1),
        score: ranking.Score,
        band: 'specialists' as const,
      },
    ];
  });

  if (appendedAssignments.length === 0) {
    return rankingBands;
  }

  return {
    ...rankingBands,
    candidateCount: rankingBands.candidateCount + appendedAssignments.length,
    assignments: [...rankingBands.assignments, ...appendedAssignments],
    bands: {
      ...rankingBands.bands,
      specialists: [...rankingBands.bands.specialists, ...appendedAssignments],
    },
  };
}

function getRankingSignalMap(
  loadRankings: () => RankedPokemon[],
): Map<string, { rank: number; score: number }> {
  try {
    return new Map(
      loadRankings().map((ranking, index) => [
        ranking.Pokemon,
        { rank: index + 1, score: ranking.Score },
      ]),
    );
  } catch (error) {
    if (error instanceof MissingRankingDataError) {
      return new Map();
    }

    throw error;
  }
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
