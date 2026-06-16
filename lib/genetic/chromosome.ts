import type { BattleFormatId } from '@lib/data/battleFormats';
import type { CandidateProfile } from '@lib/data/candidateProfiles';
import { rankAnchorCompanionPairs } from '@lib/data/companionPairRanking';
import type { RankedAnchorCompanionPair } from '@lib/data/companionPairRanking';
import {
  validateTeamUniqueness,
  getPokemonBySpeciesId,
  getDexNumber,
} from '@lib/data/pokemon';
import {
  getAllRankingsForPokemon,
  speciesIdToRankingName,
} from '@lib/data/rankings';
import {
  getWorstMatchups,
  countersThreats,
  getMatchupQualityScore,
} from '@lib/data/simulations';
import { calculateEffectiveness } from '../coverage/typeChart';
import type { Chromosome, TournamentMode } from '../types';
import { getBattleFrontierMasterTeamLegality } from '@/lib/data/battleFrontierMasterRules';
import { getMegaMasterTeamLegality } from '@/lib/data/megaMasterRules';

export interface AnchorFirstPopulationOptions {
  anchorPokemon?: string[];
  candidateProfiles?: readonly CandidateProfile[];
  randomPopulation?: readonly Chromosome[];
  formatId?: BattleFormatId;
  rankPairs?: (
    anchor: CandidateProfile,
    candidates: readonly CandidateProfile[],
  ) => RankedAnchorCompanionPair[];
}

const ANCHOR_FIRST_RANDOM_FRACTION = 0.25;

function shouldEnforceBattleFrontierMasterLegality(
  formatId?: BattleFormatId,
): boolean {
  return formatId === 'battle-frontier-master';
}

function shouldEnforceMegaMasterLegality(formatId?: BattleFormatId): boolean {
  return formatId === 'mega-master-league';
}

function isLegalBattleFrontierMasterCandidate(
  currentTeam: string[],
  candidateSpeciesId: string,
): boolean {
  const partialTeam = currentTeam.filter(Boolean);

  return getBattleFrontierMasterTeamLegality([
    ...partialTeam,
    candidateSpeciesId,
  ]).isLegal;
}

function isLegalMegaMasterCandidate(
  currentTeam: string[],
  candidateSpeciesId: string,
): boolean {
  const partialTeam = currentTeam.filter(Boolean);

  return getMegaMasterTeamLegality([...partialTeam, candidateSpeciesId])
    .isLegal;
}

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
  formatId?: BattleFormatId,
): Chromosome {
  const enforceBattleFrontierMasterLegality =
    shouldEnforceBattleFrontierMasterLegality(formatId);
  const enforceMegaMasterLegality = shouldEnforceMegaMasterLegality(formatId);
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

      if (
        enforceBattleFrontierMasterLegality &&
        !isLegalBattleFrontierMasterCandidate(team, candidateSpecies)
      ) {
        attempts++;
        continue;
      }

      if (
        enforceMegaMasterLegality &&
        !isLegalMegaMasterCandidate(team, candidateSpecies)
      ) {
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
          candidatePokemon.types,
          type,
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
                existingPokemon.types,
                weakness,
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
        const candidateSpeciesId = candidateSpecies;

        // Collect all worst matchups from existing team members with RANKING WEIGHTS
        const teamThreats = new Map<string, number>(); // threat -> weight based on rank

        for (let j = 0; j < slotIndex; j++) {
          if (team[j]) {
            const memberSpeciesId = team[j];
            const worstMatchups = getWorstMatchups(
              memberSpeciesId,
              5,
              formatId,
            ); // Top 5 worst for each member

            for (const threat of worstMatchups) {
              // Get threat's ranking and calculate weight
              const threatRankings = getAllRankingsForPokemon(
                speciesIdToRankingName(threat),
                formatId,
              );
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
          if (countersThreats(candidateSpeciesId, [threat], formatId) > 0) {
            weightedCounterBonus += weight; // Add full weight if candidate beats this threat
          }
        }

        diversityScore += weightedCounterBonus; // Weighted bonus (much higher for top meta)

        // Additional bonus for overall matchup quality (consistency)
        const qualityScore = getMatchupQualityScore(
          candidateSpeciesId,
          formatId,
        );
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
      const fallbackCandidates = pokemonPool.filter((candidate) => {
        const candidateDex = getDexNumber(candidate);

        if (!candidateDex || usedDexNumbers.has(candidateDex)) {
          return false;
        }

        if (
          enforceBattleFrontierMasterLegality &&
          !isLegalBattleFrontierMasterCandidate(team, candidate)
        ) {
          return false;
        }

        if (
          enforceMegaMasterLegality &&
          !isLegalMegaMasterCandidate(team, candidate)
        ) {
          return false;
        }

        return true;
      });

      if (fallbackCandidates.length === 0) {
        throw new Error(
          `Failed to find a legal unique Pokemon. Pool size: ${pokemonPool.length}, Used: ${usedDexNumbers.size}`,
        );
      }

      selectedSpecies =
        fallbackCandidates[
          Math.floor(Math.random() * fallbackCandidates.length)
        ];
    }

    // At this point selectedSpecies is guaranteed to be non-null
    if (!selectedSpecies) {
      throw new Error('Failed to select a Pokemon for the team');
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

  if (enforceBattleFrontierMasterLegality) {
    const legality = getBattleFrontierMasterTeamLegality(team);

    if (!legality.isLegal) {
      throw new Error(
        `Failed to create a legal Battle Frontier Master team: ${legality.violations.join(', ')}`,
      );
    }
  }

  if (enforceMegaMasterLegality) {
    const legality = getMegaMasterTeamLegality(team);

    if (!legality.isLegal) {
      throw new Error(
        `Failed to create a legal Mega Master League team: ${legality.violations.join(', ')}`,
      );
    }
  }

  return finalTeam;
}

/**
 * Initialize population with random chromosomes
 */
export function initializePopulation(
  populationSize: number,
  pokemonPool: string[],
  teamSize: number,
  anchorPokemon?: string[],
  formatId?: BattleFormatId,
): Chromosome[] {
  const population: Chromosome[] = [];

  for (let i = 0; i < populationSize; i++) {
    population.push(
      createRandomChromosome(pokemonPool, teamSize, anchorPokemon, formatId),
    );
  }

  return population;
}

/**
 * Initialize a GA population with ranked anchor-first seeds followed by a
 * bounded random diversity slice.
 */
export function initializeAnchorFirstPopulation(
  populationSize: number,
  pokemonPool: string[],
  teamSize: number,
  options: AnchorFirstPopulationOptions = {},
): Chromosome[] {
  const candidateProfiles = options.candidateProfiles ?? [];
  const explicitAnchors = options.anchorPokemon ?? [];
  const randomReserve = Math.ceil(
    populationSize * ANCHOR_FIRST_RANDOM_FRACTION,
  );
  const seedLimit =
    populationSize > 0 && candidateProfiles.length > 0
      ? Math.max(1, populationSize - randomReserve)
      : 0;
  const seededChromosomes = buildAnchorFirstSeeds(
    candidateProfiles,
    pokemonPool,
    teamSize,
    seedLimit,
    explicitAnchors,
    options.formatId,
    options.rankPairs ?? rankAnchorCompanionPairs,
  );
  const randomNeeded = Math.max(0, populationSize - seededChromosomes.length);
  const randomPopulation =
    options.randomPopulation ??
    initializePopulation(
      randomNeeded,
      pokemonPool,
      teamSize,
      explicitAnchors,
      options.formatId,
    );

  return [...seededChromosomes, ...randomPopulation].slice(0, populationSize);
}

function buildAnchorFirstSeeds(
  candidateProfiles: readonly CandidateProfile[],
  pokemonPool: readonly string[],
  teamSize: number,
  seedLimit: number,
  explicitAnchors: readonly string[],
  formatId: BattleFormatId | undefined,
  rankPairs: (
    anchor: CandidateProfile,
    candidates: readonly CandidateProfile[],
  ) => RankedAnchorCompanionPair[],
): Chromosome[] {
  if (seedLimit === 0 || candidateProfiles.length === 0) {
    return [];
  }

  const eligibleProfiles = candidateProfiles.filter((candidate) => {
    const speciesId = getProfileSpeciesId(candidate);
    return (
      speciesId !== null &&
      (pokemonPool.includes(speciesId) || explicitAnchors.includes(speciesId))
    );
  });
  const anchors = selectAnchorProfiles(eligibleProfiles, explicitAnchors);
  const teams: Chromosome[] = [];
  const seenTeams = new Set<string>();

  for (const anchor of anchors) {
    if (teams.length >= seedLimit) break;

    const rankedPairs = rankPairs(
      getPairRankingAnchor(anchor, explicitAnchors),
      eligibleProfiles,
    );

    for (const rankedPair of rankedPairs) {
      if (teams.length >= seedLimit) break;
      if (
        !isAllowedAnchorFirstCompanion(rankedPair.companion, explicitAnchors)
      ) {
        continue;
      }

      const team = expandAnchorPair(
        rankedPair.anchor,
        rankedPair.companion,
        eligibleProfiles,
        teamSize,
        explicitAnchors,
      );
      const teamKey = getAnchorFirstTeamKey(team, explicitAnchors.length);

      if (
        team.length === teamSize &&
        !seenTeams.has(teamKey) &&
        isValidAnchorFirstSeed(team, formatId)
      ) {
        seenTeams.add(teamKey);
        teams.push(
          createChromosome(
            team,
            explicitAnchors.map((_, index) => index),
          ),
        );
      }
    }
  }

  return teams;
}

function isValidAnchorFirstSeed(
  team: readonly string[],
  formatId: BattleFormatId | undefined,
): boolean {
  if (!validateTeamUniqueness([...team])) {
    return false;
  }

  if (
    shouldEnforceBattleFrontierMasterLegality(formatId) &&
    !getBattleFrontierMasterTeamLegality([...team]).isLegal
  ) {
    return false;
  }

  if (
    shouldEnforceMegaMasterLegality(formatId) &&
    !getMegaMasterTeamLegality(team).isLegal
  ) {
    return false;
  }

  return true;
}

function selectAnchorProfiles(
  profiles: readonly CandidateProfile[],
  explicitAnchors: readonly string[],
): CandidateProfile[] {
  const explicitAnchorProfiles = explicitAnchors
    .map((speciesId) => {
      return profiles.find(
        (profile) => getProfileSpeciesId(profile) === speciesId,
      );
    })
    .filter((profile): profile is CandidateProfile => Boolean(profile));
  const automaticAnchors = profiles
    .filter((profile) => {
      return (
        profile.band !== 'specialists' &&
        (profile.band === 'eliteAnchors' || profile.band === 'preferredAnchors')
      );
    })
    .sort(compareProfiles);

  return dedupeProfiles([...explicitAnchorProfiles, ...automaticAnchors]);
}

function expandAnchorPair(
  anchor: CandidateProfile,
  companion: CandidateProfile,
  profiles: readonly CandidateProfile[],
  teamSize: number,
  explicitAnchors: readonly string[],
): string[] {
  const team = uniqueSpeciesIds([
    ...explicitAnchors,
    getProfileSpeciesId(anchor),
    getProfileSpeciesId(companion),
  ]).slice(0, teamSize);

  while (team.length < teamSize) {
    const nextProfile = profiles
      .filter((profile) => {
        const speciesId = getProfileSpeciesId(profile);
        return (
          speciesId !== null &&
          !team.includes(speciesId) &&
          (profile.band !== 'specialists' ||
            explicitAnchors.includes(speciesId))
        );
      })
      .sort((first, second) => {
        return compareExpansionProfiles(
          first,
          second,
          team,
          [anchor, companion],
          profiles,
        );
      })[0];

    const nextSpeciesId = nextProfile ? getProfileSpeciesId(nextProfile) : null;

    if (!nextSpeciesId) break;
    team.push(nextSpeciesId);
  }

  return team;
}

function getAnchorFirstTeamKey(
  team: readonly string[],
  explicitAnchorCount: number,
): string {
  const fixedAnchors = team.slice(0, explicitAnchorCount);
  const flexibleMembers = team.slice(explicitAnchorCount).sort();

  return [...fixedAnchors, ...flexibleMembers].join('|');
}

function compareExpansionProfiles(
  first: CandidateProfile,
  second: CandidateProfile,
  team: readonly string[],
  coreProfiles: readonly CandidateProfile[],
  profiles: readonly CandidateProfile[],
): number {
  const firstScore = scoreExpansionProfile(first, team, coreProfiles, profiles);
  const secondScore = scoreExpansionProfile(
    second,
    team,
    coreProfiles,
    profiles,
  );

  return secondScore - firstScore || compareProfiles(first, second);
}

function scoreExpansionProfile(
  candidate: CandidateProfile,
  team: readonly string[],
  coreProfiles: readonly CandidateProfile[],
  profiles: readonly CandidateProfile[],
): number {
  const unresolvedLosses = getRemainingCoreLosses(coreProfiles, team, profiles);
  const originalCoreLosses = new Set(
    coreProfiles.flatMap((profile) => profile.simulationCoverage.lossesAgainst),
  );
  const coverageTargets =
    unresolvedLosses.size > 0 ? unresolvedLosses : originalCoreLosses;
  const coverageScore = candidate.simulationCoverage.winsAgainst.filter((win) =>
    coverageTargets.has(win),
  ).length;
  const checkingScore = candidate.simulationCoverage.checks.filter((check) =>
    coverageTargets.has(check),
  ).length;
  const broadCoverageScore = new Set([
    ...candidate.simulationCoverage.winsAgainst,
    ...candidate.simulationCoverage.checks,
  ]).size;
  const lineupQualityScore = getExpansionLineupQualityScore(candidate);
  const duplicatePenalty = team.includes(getProfileSpeciesId(candidate) ?? '')
    ? 10
    : 0;

  return (
    candidate.score / 100 +
    (1 - candidate.rankPercentile) * 0.25 +
    lineupQualityScore +
    coverageScore * 2 +
    checkingScore +
    broadCoverageScore * 0.05 -
    duplicatePenalty
  );
}

function getExpansionLineupQualityScore(candidate: CandidateProfile): number {
  const signalScores = [
    candidate.safety,
    candidate.switch,
    candidate.consistency,
  ].flatMap((signal) => (signal.available ? [signal.score / 100] : []));
  const bulkScore =
    candidate.bulk === null ? null : Math.min(candidate.bulk / 120, 1);
  const availableScores =
    bulkScore === null ? signalScores : [...signalScores, bulkScore];

  if (availableScores.length === 0) {
    return 0;
  }

  return (
    availableScores.reduce((total, score) => total + score, 0) /
    availableScores.length
  );
}

function getPairRankingAnchor(
  anchor: CandidateProfile,
  explicitAnchors: readonly string[],
): CandidateProfile {
  const speciesId = getProfileSpeciesId(anchor);

  if (anchor.band !== 'specialists' || !speciesId) {
    return anchor;
  }

  if (!explicitAnchors.includes(speciesId)) {
    return anchor;
  }

  return { ...anchor, band: 'preferredAnchors' };
}

function isAllowedAnchorFirstCompanion(
  companion: CandidateProfile,
  explicitAnchors: readonly string[],
): boolean {
  const speciesId = getProfileSpeciesId(companion);

  return (
    speciesId !== null &&
    (companion.band !== 'specialists' || explicitAnchors.includes(speciesId))
  );
}

function getRemainingCoreLosses(
  coreProfiles: readonly CandidateProfile[],
  team: readonly string[],
  profiles: readonly CandidateProfile[],
): Set<string> {
  const remainingLosses = new Set(
    coreProfiles.flatMap((profile) => profile.simulationCoverage.lossesAgainst),
  );

  for (const teamMember of team) {
    const profile = profiles.find(
      (candidate) => getProfileSpeciesId(candidate) === teamMember,
    );

    if (!profile) continue;

    for (const coveredThreat of [
      ...profile.simulationCoverage.winsAgainst,
      ...profile.simulationCoverage.checks,
    ]) {
      remainingLosses.delete(coveredThreat);
    }
  }

  return remainingLosses;
}

function compareProfiles(
  first: CandidateProfile,
  second: CandidateProfile,
): number {
  return (
    bandPriority(second.band) - bandPriority(first.band) ||
    second.score - first.score ||
    first.rank - second.rank ||
    (getProfileSpeciesId(first) ?? first.pokemon).localeCompare(
      getProfileSpeciesId(second) ?? second.pokemon,
    )
  );
}

function bandPriority(band: CandidateProfile['band']): number {
  switch (band) {
    case 'eliteAnchors':
      return 5;
    case 'preferredAnchors':
      return 4;
    case 'normalCompanions':
      return 3;
    case 'flexibleCompanions':
      return 2;
    case 'specialists':
      return 1;
  }
}

function dedupeProfiles(
  profiles: readonly CandidateProfile[],
): CandidateProfile[] {
  const seen = new Set<string>();
  const deduped: CandidateProfile[] = [];

  for (const profile of profiles) {
    const speciesId = getProfileSpeciesId(profile);
    if (!speciesId || seen.has(speciesId)) continue;
    seen.add(speciesId);
    deduped.push(profile);
  }

  return deduped;
}

function uniqueSpeciesIds(values: Array<string | null>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function getProfileSpeciesId(profile: CandidateProfile): string | null {
  return profile.speciesId ?? null;
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
