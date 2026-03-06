import { calculateFitness as calculateFitnessIndividual } from './individual';
import { calculateFitness as calculateFitnessTeamSynergy } from './teamSynergy';
import type { BattleFormatId } from '@/lib/data/battleFormats';
import type { FitnessAlgorithm, Chromosome, TournamentMode } from '@/lib/types';

export type { FitnessAlgorithm } from '@/lib/types';

export {
  calculateFitness as calculateFitnessIndividual,
  evaluatePopulation as evaluatePopulationIndividual,
} from './individual';

export { calculateFitness as calculateFitnessTeamSynergy } from './teamSynergy';

type FitnessFunction = (
  chromosome: Chromosome,
  mode: TournamentMode,
  formatId?: BattleFormatId,
) => number;

/**
 * Get the appropriate fitness function based on algorithm selection
 */
export function getFitnessFunction(
  algorithm: FitnessAlgorithm,
): FitnessFunction {
  return algorithm === 'teamSynergy'
    ? calculateFitnessTeamSynergy
    : calculateFitnessIndividual;
}

/**
 * Evaluate population using specified algorithm
 */
export function evaluatePopulation(
  population: Chromosome[],
  mode: TournamentMode,
  algorithm: FitnessAlgorithm = 'individual',
  formatId?: BattleFormatId,
): void {
  const fitnessFunction = getFitnessFunction(algorithm);
  for (const chromosome of population) {
    chromosome.fitness = fitnessFunction(chromosome, mode, formatId);
  }
}
