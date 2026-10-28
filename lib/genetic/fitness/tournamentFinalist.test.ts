import { describe, expect, it, vi } from 'vitest';
import { rerankRosterFinalists } from './finalistReranking';
import type { TournamentEvaluation } from './opponentRosterEvaluation';
import { createNormalizedScoreBreakdown } from './scoreBreakdown';
import { createRosterMovesetAssignment } from '@/lib/genetic/moveset';
import type { RosterMovesetAssignment, TournamentSelection } from '@/lib/types';

const team = ['a', 'b', 'c', 'd', 'e', 'f'];
function assignment(index: number): RosterMovesetAssignment {
  return createRosterMovesetAssignment({
    formatId: 'great-league',
    authorityBySpeciesId: Object.fromEntries(
      team.map((id) => [
        id,
        { source: 'manifest', schemaVersion: 1, policyVersion: 'test' },
      ]),
    ),
    variantsBySpeciesId: Object.fromEntries(
      team.map((id) => [
        id,
        {
          id: `fast_${index}--charge_a--charge_b`,
          fastMove: `FAST_${index}`,
          chargedMove1: 'CHARGE_A',
          chargedMove2: 'CHARGE_B',
          isDefault: index === 0,
        },
      ]),
    ),
  });
}
function evaluation(
  value: number,
  stage: TournamentSelection['stage'],
): TournamentEvaluation {
  return {
    selection: {
      policyVersion: 'test',
      datasetFingerprint: 'shared',
      stage,
      source: 'synthetic',
      status: 'complete',
      objectives: {
        typical: value,
        lowerTail: value,
        flexibility: value,
        independence: value,
        coverage: value,
        redundancy: value,
      },
      missingCells: 0,
      evaluatedRosters: 16,
      limitations: [],
    },
    plans: [],
    rosterQualities: [],
    marginalValue: {},
  };
}

describe('tournament finalist authority', () => {
  it('retains a Pareto-superior variant that the old scalar prefilter and diagnostics would reject', () => {
    const assignments = Array.from({ length: 20 }, (_, i) => assignment(i));
    const robust = assignments[19];
    const getMatchupRating = vi.fn(() => 900);
    const result = rerankRosterFinalists([{ team, fitness: 1 }], {
      topThreats: ['enemy'],
      fullMetaThreats: ['enemy'],
      getAssignments: () => assignments,
      getMatchupRating,
      getCanonicalRosterKey: (roster) => roster.join('|'),
      evaluateTournament: (_, fixed, stage) =>
        evaluation(fixed.fingerprint === robust.fingerprint ? 0.8 : 0.4, stage),
      scoreAssignment: (_, fixed) => {
        const score = fixed.fingerprint === robust.fingerprint ? 0.01 : 1;
        return {
          roster: team,
          fitness: score,
          scoreBreakdown: createNormalizedScoreBreakdown({
            synergy: score,
            coverage: score,
            safety: score,
            consistency: score,
            bulk: score,
            defensiveRatio: score,
            offensiveRatio: score,
            role: score,
          }),
          evaluatedLineupCount: 120,
          metrics: {
            viableLineupCount: 1,
            topLineupQuality: score,
            topNLineupDepth: score,
            dominatingMatchupRate: 0,
            overwhelmingLossRate: 0,
            singleAnswerRisks: [],
            viableLeadDiversity: 1,
            benchUtilitySummary: [],
          },
        };
      },
    });
    expect(result.assignment).toBe(robust);
    expect(result.score.fitness).toBe(0.8);
    expect(result.score.scoreBreakdown.score).toBe(0.8);
    expect(result.score.scoreBreakdown.scoreBasis).toBe('tournament-typical');
    expect(result.stats.fullScoreCount).toBe(12);
    expect(getMatchupRating).not.toHaveBeenCalled();
  });
});
