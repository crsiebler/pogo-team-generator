import { enumeratePlayPokemonLineups } from './lineupEnumeration';
import type { LineupScoringContext } from './lineupScoring';
import { scoreMatchupRating } from './matchupScoring';
import { evaluateRosterFlexibility } from './rosterFlexibility';
import { evaluateTournamentCoverage } from './tournamentCoverage';
import type { OpponentRosterDataset } from '@/lib/data/opponentRosters';
import { getAssignedMovesetVariantId } from '@/lib/genetic/moveset';
import { TOURNAMENT_POLICY } from '@/lib/genetic/paretoSelection';
import type {
  OrderedLineup,
  RosterMovesetAssignment,
  TournamentSelection,
} from '@/lib/types';

/** A fixed friendly order, evaluated before the opposing trio is revealed. */
export interface TournamentPlan {
  readonly lineup: OrderedLineup;
  readonly trioId: string;
  readonly qualityByRoster: readonly number[];
  readonly typical: number;
  readonly lowerTail: number;
}

/** Selection evidence plus bounded plan diagnostics for one fixed assignment. */
export interface TournamentEvaluation {
  readonly selection: TournamentSelection;
  readonly plans: readonly TournamentPlan[];
  readonly rosterQualities: readonly number[];
  readonly marginalValue: Readonly<Record<string, number>>;
}

/** Offline sensitivity overrides; production uses the versioned default policy. */
export interface TournamentEvaluationPolicy {
  readonly tailFraction: number;
  readonly viablePlanQuality: number;
}

/** Evaluates all friendly plans against a frozen shared opponent corpus. */
export function evaluateTournamentRoster(
  roster: readonly string[],
  assignment: RosterMovesetAssignment | undefined,
  dataset: OpponentRosterDataset,
  context: LineupScoringContext,
  stage: TournamentSelection['stage'] = 'search',
  policy: TournamentEvaluationPolicy = TOURNAMENT_POLICY,
): TournamentEvaluation {
  if (
    !(policy.tailFraction > 0 && policy.tailFraction <= 1) ||
    !(policy.viablePlanQuality >= 0 && policy.viablePlanQuality <= 1)
  )
    throw new Error('Tournament evaluation policy bounds are invalid.');
  if (
    dataset.formatId !== context.formatId ||
    (assignment && assignment.formatId !== dataset.formatId)
  )
    throw new Error(
      'Tournament scenario format must match scoring and moveset evidence.',
    );
  const team = [...roster].sort();
  if (
    assignment &&
    JSON.stringify(Object.keys(assignment.variantsBySpeciesId).sort()) !==
      JSON.stringify(team)
  )
    throw new Error(
      'Tournament moveset assignment must match the complete roster.',
    );
  const lineups = enumeratePlayPokemonLineups(team);
  const opponents = dataset.rosters
    .filter(
      (r) => r.partition === (stage === 'held-out' ? 'held-out' : 'selection'),
    )
    .toSorted(
      (a, b) =>
        Number(b.source === 'curated') - Number(a.source === 'curated') ||
        a.id.localeCompare(b.id),
    )
    .slice(
      0,
      stage === 'search'
        ? TOURNAMENT_POLICY.searchRosterCount
        : stage === 'selection'
          ? TOURNAMENT_POLICY.selectionRosterCount
          : TOURNAMENT_POLICY.heldOutRosterCount,
    );
  const coverage = evaluateTournamentCoverage(team, assignment, context);
  let missingCells = coverage.missingCells;
  const profiles = team.map(() => [] as number[]);
  const qualities = lineups.map(() => [] as number[]);
  for (const opponent of opponents) {
    const enemies = [...opponent.species].sort();
    const cells = team.map((species, member) =>
      enemies.map((enemy) => {
        const values = ([0, 1, 2] as const).map((shields) => {
          const rating =
            context.getShieldScenarioMatchupRating?.(
              species,
              enemy,
              shields,
              getAssignedMovesetVariantId(assignment, species),
            ) ?? null;
          if (
            rating === null ||
            !Number.isFinite(rating) ||
            rating < 0 ||
            rating > 1000
          ) {
            missingCells++;
            return null;
          }
          return scoreMatchupRating(rating);
        });
        if (values.every((v): v is number => v !== null))
          profiles[member].push(Math.min(...values));
        return values;
      }),
    );
    if (missingCells > 0) continue;
    // Search samples six cyclic orders with every species in every role.
    // Final selection uses every ordered opposing trio on a larger corpus.
    const orders: number[][] =
      stage === 'search'
        ? enemies.map((_, i) => [i, (i + 1) % 6, (i + 3) % 6])
        : enumeratePlayPokemonLineups(enemies).map((order) => [
            enemies.indexOf(order.lead),
            enemies.indexOf(order.switch),
            enemies.indexOf(order.closer),
          ]);
    // Role/order permutations share a trio's six possible distinct matchings.
    // At most 20 friendly × 20 enemy trios × 3 shields per opponent roster.
    const answerFloors = new Map<number, number>();
    lineups.forEach((lineup, index) => {
      const lead = team.indexOf(lineup.lead),
        pivot = team.indexOf(lineup.switch),
        closer = team.indexOf(lineup.closer);
      const states: number[] = [];
      const friendlyMask = (1 << lead) | (1 << pivot) | (1 << closer);
      for (const [a, b, c] of orders)
        for (let shields = 0; shields < 3; shields++) {
          const value = (member: number, enemy: number): number =>
            cells[member][enemy][shields]!;
          const leadQuality = value(lead, a);
          const stay =
            (leadQuality +
              Math.min(
                value(pivot, b) + value(closer, c),
                value(pivot, c) + value(closer, b),
              )) /
            3;
          // Static reassignment proxy: the opponent chooses the worse counter-
          // switch; the closer must still handle the retained original lead.
          const recovery =
            Math.min(
              value(pivot, b) + value(closer, a) + value(lead, c),
              value(pivot, c) + value(closer, a) + value(lead, b),
            ) / 3;
          // Each friendly member can supply only one simultaneous answer.
          // Use the best bottleneck over the six one-to-one matchings, so a
          // lone generalist cannot protect two partners from a counter pair.
          const enemyMask = (1 << a) | (1 << b) | (1 << c);
          const answerKey = (friendlyMask * 64 + enemyMask) * 3 + shields;
          let answerFloor = answerFloors.get(answerKey);
          if (answerFloor === undefined) {
            answerFloor = Math.max(
              Math.min(value(lead, a), value(pivot, b), value(closer, c)),
              Math.min(value(lead, a), value(pivot, c), value(closer, b)),
              Math.min(value(lead, b), value(pivot, a), value(closer, c)),
              Math.min(value(lead, b), value(pivot, c), value(closer, a)),
              Math.min(value(lead, c), value(pivot, a), value(closer, b)),
              Math.min(value(lead, c), value(pivot, b), value(closer, a)),
            );
            answerFloors.set(answerKey, answerFloor);
          }
          states.push(
            Math.min(
              answerFloor,
              leadQuality < 0.5 ? Math.max(stay, recovery) : stay,
            ),
          );
        }
      // Choose a friendly plan only AFTER its hidden-enemy uncertainty is
      // aggregated; never average the winning friendly plan per enemy trio.
      qualities[index].push(lowerTailMean(states, policy.tailFraction));
    });
  }
  const complete =
    missingCells === 0 &&
    opponents.length > 0 &&
    coverage.audit.threatCount > 0;
  const plans: TournamentPlan[] = complete
    ? lineups.map((lineup, index) => ({
        lineup,
        trioId: [lineup.lead, lineup.switch, lineup.closer].sort().join('|'),
        qualityByRoster: qualities[index],
        typical: mean(qualities[index]),
        lowerTail: lowerTailMean(qualities[index], policy.tailFraction),
      }))
    : [];
  const rosterQualities = complete
    ? opponents.map((_, i) =>
        Math.max(...plans.map((plan) => plan.qualityByRoster[i])),
      )
    : [];
  const flexibility = complete
    ? mean(
        opponents.map(
          (_, index) =>
            new Set(
              plans
                .filter(
                  (plan) =>
                    plan.qualityByRoster[index] >= policy.viablePlanQuality,
                )
                .map((plan) => plan.trioId),
            ).size / 20,
        ),
      )
    : 0;
  const structure = evaluateRosterFlexibility(
    team,
    plans,
    rosterQualities,
    complete ? profiles : team.map(() => []),
  );
  return {
    selection: {
      policyVersion: `${TOURNAMENT_POLICY.version}:${policy.tailFraction}:${policy.viablePlanQuality}`,
      datasetFingerprint: `${dataset.fingerprint}:${coverage.fingerprint}`,
      stage,
      source: opponents.every((r) => r.source === 'synthetic')
        ? 'synthetic'
        : opponents.every((r) => r.source === 'curated')
          ? 'curated'
          : 'mixed',
      objectives: {
        coverage: coverage.coverage,
        redundancy: coverage.redundancy,
        typical: mean(rosterQualities),
        lowerTail: lowerTailMean(rosterQualities, policy.tailFraction),
        flexibility,
        independence: structure.independence,
      },
      coverageAudit: coverage.audit,
      evaluatedRosters: complete ? opponents.length : 0,
      missingCells,
      status: complete ? 'complete' : 'insufficient',
      limitations: [
        'Static equal-shield matchup approximation; no battle win probability, energy/HP carryover, switch lock, or behavioral deterrence.',
        ...(opponents.some((r) => r.adapted)
          ? [
              'Published enemy movesets are adapted to synchronized ranked defaults; these scenarios are not exact tournament replays.',
            ]
          : []),
        ...(opponents.some((r) => r.source === 'synthetic')
          ? [
              'Synthetic opponent compositions; tournament representativeness is unverified.',
            ]
          : []),
        ...(!complete
          ? [
              'Complete 0/1/2-shield evidence is required for a common comparison corpus.',
            ]
          : []),
      ],
    },
    plans,
    rosterQualities,
    marginalValue: structure.marginalValue,
  };
}

/** Mean of the worst policy-defined fraction, with at least one observation. */
export function lowerTailMean(
  values: readonly number[],
  fraction: number = TOURNAMENT_POLICY.tailFraction,
): number {
  if (!values.length) return 0;
  return mean(
    values
      .toSorted((a, b) => a - b)
      .slice(0, Math.max(1, Math.ceil(values.length * fraction))),
  );
}

function mean(values: readonly number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}
