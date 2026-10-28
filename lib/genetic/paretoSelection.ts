import type { Chromosome, TournamentObjectives } from '@/lib/types';

export const TOURNAMENT_OBJECTIVE_KEYS = [
  'coverage',
  'redundancy',
  'typical',
  'lowerTail',
  'flexibility',
  'independence',
] as const;
export const TOURNAMENT_POLICY = {
  version: 'roster-plans-v4',
  opponentCandidateCount: 120,
  tailFraction: 0.25,
  equivalenceBand: 0.025,
  viablePlanQuality: 0.5,
  searchRosterCount: 8,
  selectionRosterCount: 16,
  heldOutRosterCount: 8,
} as const;

/** Canonical selection identity, including a fixed assignment when present. */
export function tournamentIdentity(candidate: Chromosome): string {
  return JSON.stringify([
    candidate.team.toSorted(),
    candidate.movesetAssignment?.fingerprint ?? 'default',
  ]);
}

/** Missing or invalid evidence never receives dominance credit. */
export function hasTournamentEvidence(candidate: Chromosome): boolean {
  const selection = candidate.tournamentSelection;
  return (
    selection?.status === 'complete' &&
    selection.evaluatedRosters > 0 &&
    TOURNAMENT_OBJECTIVE_KEYS.every(
      (key) =>
        Number.isFinite(selection.objectives[key]) &&
        selection.objectives[key] >= 0 &&
        selection.objectives[key] <= 1,
    )
  );
}

/** Whether every objective is at least as good and one is strictly better. */
export function dominates(
  first: TournamentObjectives,
  second: TournamentObjectives,
): boolean {
  return (
    TOURNAMENT_OBJECTIVE_KEYS.every((key) => first[key] >= second[key]) &&
    TOURNAMENT_OBJECTIVE_KEYS.some((key) => first[key] > second[key])
  );
}

function assertComparable(population: readonly Chromosome[]): void {
  const identities = new Set(
    population.flatMap((candidate) => {
      const s = candidate.tournamentSelection;
      return s
        ? [JSON.stringify([s.policyVersion, s.datasetFingerprint, s.stage])]
        : [];
    }),
  );
  if (identities.size > 1)
    throw new Error('Tournament comparison requires shared scenario evidence.');
}

/** Front number and crowding distance are selection bookkeeping, not fitness. */
export interface ParetoRank {
  readonly front: number;
  readonly distance: number;
}

/** Nondominated sorting with normalized crowding distance and stable ties. */
export function rankParetoPopulation(
  population: readonly Chromosome[],
): Map<Chromosome, ParetoRank> {
  assertComparable(population);
  const ranked = new Map<Chromosome, ParetoRank>();
  const valid = population
    .filter(hasTournamentEvidence)
    .toSorted((a, b) =>
      tournamentIdentity(a).localeCompare(tournamentIdentity(b)),
    );
  const dominated = valid.map(() => [] as number[]);
  const counts = valid.map(() => 0);
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const a = valid[i].tournamentSelection!.objectives;
      const b = valid[j].tournamentSelection!.objectives;
      if (dominates(a, b)) {
        dominated[i].push(j);
        counts[j]++;
      } else if (dominates(b, a)) {
        dominated[j].push(i);
        counts[i]++;
      }
    }
  }
  let front = counts.flatMap((count, i) => (count === 0 ? [i] : []));
  let frontNumber = 0;
  while (front.length) {
    const distances = new Map(front.map((i) => [i, 0]));
    for (const key of TOURNAMENT_OBJECTIVE_KEYS) {
      const sorted = front.toSorted(
        (a, b) =>
          valid[a].tournamentSelection!.objectives[key] -
            valid[b].tournamentSelection!.objectives[key] || a - b,
      );
      const value = (i: number): number =>
        valid[i].tournamentSelection!.objectives[key];
      const range = value(sorted.at(-1)!) - value(sorted[0]);
      if (range === 0) continue;
      distances.set(sorted[0], Infinity);
      distances.set(sorted.at(-1)!, Infinity);
      for (let j = 1; j < sorted.length - 1; j++)
        distances.set(
          sorted[j],
          distances.get(sorted[j])! +
            (value(sorted[j + 1]) - value(sorted[j - 1])) / range,
        );
    }
    const next: number[] = [];
    for (const i of front) {
      ranked.set(valid[i], { front: frontNumber, distance: distances.get(i)! });
      for (const j of dominated[i]) {
        if (--counts[j] === 0) next.push(j);
      }
    }
    front = next;
    frontNumber++;
  }
  for (const candidate of population)
    if (!ranked.has(candidate))
      ranked.set(candidate, { front: Infinity, distance: 0 });
  return ranked;
}

/** Compares precomputed ranks without consulting scalar fitness. */
export function compareParetoRanks(
  a: Chromosome,
  b: Chromosome,
  ranks: ReadonlyMap<Chromosome, ParetoRank>,
): number {
  const first = ranks.get(a)!;
  const second = ranks.get(b)!;
  return (
    (first.front === second.front ? 0 : first.front - second.front) ||
    (first.distance === second.distance
      ? 0
      : second.distance - first.distance) ||
    tournamentIdentity(a).localeCompare(tournamentIdentity(b))
  );
}

/** Selects nondominated fronts with deterministic objective-space diversity. */
export function selectParetoPopulation(
  population: readonly Chromosome[],
  limit: number,
): Chromosome[] {
  const byIdentity = new Map<string, Chromosome>();
  for (const candidate of population) {
    const id = tournamentIdentity(candidate);
    const previous = byIdentity.get(id);
    if (!previous || compareTournamentFinalists(candidate, previous) < 0)
      byIdentity.set(id, candidate);
  }
  const unique = [...byIdentity.values()];
  const ranks = rankParetoPopulation(unique);
  return unique
    .sort((a, b) => compareParetoRanks(a, b, ranks))
    .slice(0, Math.max(0, limit));
}

/** Orders finalists using fixed robustness bands, then flexibility/redundancy. */
export function compareTournamentFinalists(
  a: Chromosome,
  b: Chromosome,
  equivalenceBand: number = TOURNAMENT_POLICY.equivalenceBand,
): number {
  if (!(equivalenceBand > 0 && equivalenceBand <= 1))
    throw new Error('Tournament equivalence band must be within (0, 1].');
  assertComparable([a, b]);
  const aValid = hasTournamentEvidence(a);
  const bValid = hasTournamentEvidence(b);
  if (aValid !== bValid) return aValid ? -1 : 1;
  if (aValid && bValid) {
    const first = a.tournamentSelection!.objectives;
    const second = b.tournamentSelection!.objectives;
    // Fixed bins are transitive; pairwise epsilon comparisons are not.
    const band = (value: number): number =>
      Math.floor((value + 1e-12) / equivalenceBand);
    const comparison =
      band(second.coverage) - band(first.coverage) ||
      band(second.redundancy) - band(first.redundancy) ||
      band(second.lowerTail) - band(first.lowerTail) ||
      second.flexibility - first.flexibility ||
      second.independence - first.independence ||
      second.coverage - first.coverage ||
      second.redundancy - first.redundancy ||
      second.lowerTail - first.lowerTail ||
      second.typical - first.typical;
    if (comparison) return comparison;
  }
  return tournamentIdentity(a).localeCompare(tournamentIdentity(b));
}
