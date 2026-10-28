import { cloneChromosome, getMutableSlots } from './chromosome';
import type { LineupAwareFitnessContext } from './fitness';
import { evaluateTournamentCoverage } from './fitness/tournamentCoverage';
import { compareTournamentFinalists } from './paretoSelection';
import { isTeamLegalForFormat } from './teamLegality';
import type { BattleFormatId } from '@/lib/data/battleFormats';
import { getDexNumber } from '@/lib/data/pokemon';
import type { Chromosome } from '@/lib/types';

/** Repairs low-contribution slots using shared-counter coverage and plan evidence. */
export function targetRosterMutation(
  chromosome: Chromosome,
  pool: readonly string[],
  context: LineupAwareFitnessContext,
  formatId: BattleFormatId,
): Chromosome {
  const mutable = getMutableSlots(chromosome, 6);
  if (!mutable.length) return cloneChromosome(chromosome);
  const evidence = context.evaluateTournament(chromosome.team);
  const slot = mutable.toSorted(
    (a, b) =>
      (evidence.marginalValue[chromosome.team[a]] ?? 0) -
        (evidence.marginalValue[chromosome.team[b]] ?? 0) || a - b,
  )[0];
  const retained = chromosome.team.filter((_, i) => i !== slot);
  const usedDex = new Set(retained.map(getDexNumber));
  const candidates = pool.filter(
    (id) =>
      id !== chromosome.team[slot] &&
      !usedDex.has(getDexNumber(id)) &&
      isTeamLegalForFormat([...retained, id], formatId),
  );
  const shortlisted = candidates
    .map((id) => ({
      id,
      audit: evaluateTournamentCoverage(
        [...retained, id],
        undefined,
        context.scoringContext,
      ),
    }))
    .filter(({ audit }) => audit.missingCells === 0)
    .sort(
      (a, b) =>
        b.audit.coverage - a.audit.coverage ||
        b.audit.redundancy - a.audit.redundancy ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 3);
  const alternatives = shortlisted.map(({ id }) => {
    const child = cloneChromosome(chromosome);
    child.team[slot] = id;
    child.tournamentSelection = context.evaluateTournament(
      child.team,
    ).selection;
    child.fitness = child.tournamentSelection.objectives.typical;
    return child;
  });
  return (
    alternatives.sort(compareTournamentFinalists)[0] ??
    cloneChromosome(chromosome)
  );
}
