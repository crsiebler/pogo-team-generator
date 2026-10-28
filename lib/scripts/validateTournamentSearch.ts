import { readFileSync, writeFileSync } from 'node:fs';
import type { BattleFormatId } from '@/lib/data/battleFormats';
import { loadOpponentRosters } from '@/lib/data/opponentRosters';
import {
  generateTeam,
  type TournamentSearchExperiment,
} from '@/lib/genetic/algorithm';
import { createDefaultLineupScoringContext } from '@/lib/genetic/fitness/lineupScoring';
import { evaluateTournamentRoster } from '@/lib/genetic/fitness/opponentRosterEvaluation';
import { resolveRankedDefaultRosterMovesetAssignment } from '@/lib/genetic/moveset';
import {
  compareTournamentFinalists,
  rankParetoPopulation,
  TOURNAMENT_POLICY,
  TOURNAMENT_OBJECTIVE_KEYS,
  tournamentIdentity,
} from '@/lib/genetic/paretoSelection';
import type { Chromosome, TournamentMode } from '@/lib/types';

interface BaselineRun {
  formatId: BattleFormatId;
  mode: TournamentMode;
  seed: number;
  populationSize: number;
  generations: number;
  elapsedMs: number;
  rss: number;
  matchupCalls?: Readonly<Record<string, number>>;
  result: Chromosome;
}

function seedRandom(seed: number): void {
  let state = seed >>> 0;
  Math.random = (): number =>
    (state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 0x100000000;
}

const baselinePath = process.argv[2] ?? 'build/tmp/tournament-baseline.json';
const outputPath = process.argv[3] ?? 'build/tmp/tournament-validation-v4.json';
// This is a local capture from the pre-change generator, never runtime input.
const baselines = JSON.parse(
  readFileSync(baselinePath, 'utf8'),
) as BaselineRun[];
if (
  !Array.isArray(baselines) ||
  baselines.some(
    (run) =>
      !Array.isArray(run.result?.team) ||
      !Number.isFinite(run.seed) ||
      !Number.isFinite(run.elapsedMs),
  )
)
  throw new Error('Expected the captured seeded baseline runs.');
const originalRandom = Math.random;
const report: Record<string, unknown>[] = [];
try {
  for (const baseline of baselines) {
    seedRandom(baseline.seed);
    const options = {
      formatId: baseline.formatId,
      mode: baseline.mode,
      populationSize: baseline.populationSize,
      generations: baseline.generations,
    };
    const started = performance.now();
    const result = await generateTeam(options);
    const elapsedMs = performance.now() - started;
    if (baseline.mode === 'GBL') {
      report.push({
        formatId: baseline.formatId,
        mode: baseline.mode,
        seed: baseline.seed,
        elapsedMs,
        baselineElapsedMs: baseline.elapsedMs,
        preserved:
          JSON.stringify(result.team) ===
            JSON.stringify(baseline.result.team) &&
          result.fitness === baseline.result.fitness,
      });
      continue;
    }
    const dataset = loadOpponentRosters(baseline.formatId);
    const context = createDefaultLineupScoringContext(
      baseline.formatId,
      100,
      'ranked-default',
    );
    const candidates = [
      ...new Map(
        [
          ...(baseline.result.defaultScoredFinalists ?? []),
          ...(result.defaultScoredFinalists ?? []),
          baseline.result,
          result,
        ].map((candidate) => [
          JSON.stringify(candidate.team.toSorted()),
          candidate,
        ]),
      ).values(),
    ];
    const evaluate = (
      candidate: Chromosome,
      stage: 'selection' | 'held-out',
      tailFraction: number = TOURNAMENT_POLICY.tailFraction,
    ): ReturnType<typeof evaluateTournamentRoster> =>
      evaluateTournamentRoster(
        candidate.team,
        candidate.movesetAssignment ??
          resolveRankedDefaultRosterMovesetAssignment(
            candidate.team,
            baseline.formatId,
          ),
        dataset,
        context,
        stage,
        { ...TOURNAMENT_POLICY, tailFraction },
      );
    // Sensitivity uses SELECTION data only. Policies remain fixed before the
    // held-out results are computed below; no test scores feed selection.
    const sensitivity: Record<string, unknown>[] = [];
    const scoredCandidates = candidates.map((candidate) => ({
      ...candidate,
      tournamentSelection: evaluate(candidate, 'selection').selection,
    }));
    // Unlike the evolutionary seam below, this removes the objective from
    // every comparator in a fixed candidate-bank final-selection experiment.
    const finalistObjectiveAblations = TOURNAMENT_OBJECTIVE_KEYS.map(
      (omitObjective) => {
        const projected = scoredCandidates.map((candidate) => ({
          ...candidate,
          tournamentSelection: {
            ...candidate.tournamentSelection,
            objectives: {
              ...candidate.tournamentSelection.objectives,
              [omitObjective]: 0,
            },
          },
        }));
        const selected = projected.toSorted(compareTournamentFinalists)[0];
        return {
          omitObjective,
          team: selected.team,
          measuredObjectives: evaluate(selected, 'selection').selection
            .objectives,
        };
      },
    );
    for (const tailFraction of [0.15, 0.25, 0.4]) {
      const scored = candidates.map((candidate) => ({
        ...candidate,
        tournamentSelection: evaluate(candidate, 'selection', tailFraction)
          .selection,
      }));
      for (const band of [0.01, 0.025, 0.05]) {
        const selected = scored.toSorted((a, b) =>
          compareTournamentFinalists(a, b, band),
        )[0];
        sensitivity.push({
          tailFraction,
          band,
          team: selected.team,
          objectives: selected.tournamentSelection.objectives,
        });
      }
    }
    const ranks = rankParetoPopulation(result.defaultScoredFinalists ?? []);
    const ablations: Record<string, unknown>[] = [];
    if (baseline.formatId === 'play-pokemon') {
      const experiments: TournamentSearchExperiment[] = [
        { disableTargetedMutation: true },
        ...TOURNAMENT_OBJECTIVE_KEYS.map((omitObjective) => ({
          omitObjective,
        })),
      ];
      for (const experiment of experiments) {
        seedRandom(baseline.seed);
        const start = performance.now();
        const ablated = await generateTeam(options, experiment);
        ablations.push({
          experiment,
          scope: experiment.omitObjective
            ? 'evolutionary population/archive only; mutation and final selection retain the full policy'
            : 'targeted mutation disabled throughout search',
          elapsedMs: performance.now() - start,
          team: ablated.team,
          selection: ablated.tournamentSelection,
          finalists: ablated.finalistRerankingStats?.finalistCount,
        });
      }
    }
    const selectionBaseline = evaluate(baseline.result, 'selection');
    const selectionNew = evaluate(result, 'selection');
    const heldOutBaseline = evaluate(baseline.result, 'held-out');
    const heldOutNew = evaluate(result, 'held-out');
    const alternativeCorpus = {
      ...dataset,
      rosters: dataset.rosters
        .filter((r) => r.partition === 'selection')
        .filter((_, i) => i % 2 === 0),
    };
    const compositionSensitivity = [baseline.result, result].map(
      (candidate) =>
        evaluateTournamentRoster(
          candidate.team,
          candidate.movesetAssignment,
          alternativeCorpus,
          context,
          'selection',
        ).selection.objectives,
    );
    report.push({
      formatId: baseline.formatId,
      mode: baseline.mode,
      seed: baseline.seed,
      budget: options,
      baselineElapsedMs: baseline.elapsedMs,
      elapsedMs,
      baselineRss: baseline.rss,
      baselineMatchupCalls: baseline.matchupCalls,
      rss: process.memoryUsage().rss,
      baselineTeam: baseline.result.team,
      team: result.team,
      fingerprint: dataset.fingerprint,
      scenarioIds: {
        selection: dataset.rosters
          .filter((roster) => roster.partition === 'selection')
          .map((roster) => roster.id)
          .sort(),
        heldOut: dataset.rosters
          .filter((roster) => roster.partition === 'held-out')
          .map((roster) => roster.id)
          .sort(),
      },
      source: 'synthetic',
      finalistCount: result.finalistRerankingStats?.finalistCount,
      searchStats: result.tournamentSearchStats,
      finalistStats: result.finalistRerankingStats,
      baselineFinalistStats: baseline.result.finalistRerankingStats,
      nondominatedCount: [...ranks.values()].filter((rank) => rank.front === 0)
        .length,
      selectionBaseline: {
        selection: selectionBaseline.selection,
        perOpponent: selectionBaseline.rosterQualities,
      },
      selectionNew: {
        selection: selectionNew.selection,
        perOpponent: selectionNew.rosterQualities,
      },
      heldOutBaseline: {
        selection: heldOutBaseline.selection,
        perOpponent: heldOutBaseline.rosterQualities,
      },
      heldOutNew: {
        selection: heldOutNew.selection,
        perOpponent: heldOutNew.rosterQualities,
      },
      baselineDiagnostics: baseline.result.scoreBreakdown?.components,
      diagnostics: result.scoreBreakdown?.components,
      baselineThreat: baseline.result.scoreBreakdown?.threatScore?.score,
      threat: result.scoreBreakdown?.threatScore?.score,
      sensitivity,
      finalistObjectiveAblations,
      compositionSensitivity,
      ablations,
      identity: tournamentIdentity(result),
    });
    writeFileSync(
      outputPath,
      JSON.stringify({ policy: TOURNAMENT_POLICY, report }, null, 2),
    );
  }
  writeFileSync(
    outputPath,
    JSON.stringify({ policy: TOURNAMENT_POLICY, report }, null, 2),
  );
  console.log(
    JSON.stringify(
      report.map((run) => ({
        formatId: run.formatId,
        mode: run.mode,
        elapsedMs: run.elapsedMs,
        preserved: run.preserved,
      })),
      null,
      2,
    ),
  );
} finally {
  Math.random = originalRandom;
}
